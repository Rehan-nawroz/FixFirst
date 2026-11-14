import axe from 'axe-core';
import type { ScanFinding, ScanResult, FindingCategory, FindingImpact } from '../shared/types/scan';
import { newId, truncate } from '../shared/util';
import { LIMITS } from '../shared/validation/limits';

/** WCAG tags evaluated by the MVP scanner. */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const;

const IMPACTS: readonly FindingImpact[] = ['critical', 'serious', 'moderate', 'minor', 'unknown'];

function impact(value: string | null | undefined): FindingImpact {
  return IMPACTS.includes(value as FindingImpact) ? (value as FindingImpact) : 'unknown';
}

export function categoryForRule(ruleId: string): FindingCategory {
  if (/image|alt|svg|canvas/.test(ruleId)) return 'images';
  if (/button|label|name|input|link|select|form|control/.test(ruleId)) return 'controls';
  if (/contrast|color/.test(ruleId)) return 'contrast';
  if (/html-has-lang|document-title|meta-viewport|valid-lang/.test(ruleId)) return 'document';
  if (/heading|landmark|list|table|aria|region|listitem/.test(ruleId)) return 'structure';
  return 'other';
}

/**
 * Produce a tiny, inert element excerpt from axe's raw `html` string. Never
 * preserve value, text, URLs, event handlers, style, classes, data attributes,
 * or nested markup. DOMParser does not execute parsed scripts.
 */
export function safeElementExcerpt(rawHtml: string | undefined): string | null {
  if (!rawHtml) return null;
  try {
    const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
    const el = doc.body.firstElementChild;
    if (!el) return null;
    const tag = el.tagName.toLowerCase();
    if (!/^[a-z][a-z0-9-]{0,30}$/.test(tag)) return null;
    const safeAttrs = ['role', 'type'];
    const attrs = safeAttrs
      .map((name) => {
        const value = el.getAttribute(name);
        if (value === null || !/^[a-z0-9 _-]{1,40}$/i.test(value)) return null;
        return `${name}="${value}"`;
      })
      .filter((v): v is string => v !== null);
    return truncate(`<${tag}${attrs.length ? ` ${attrs.join(' ')}` : ''}>`, LIMITS.snippetMax);
  } catch {
    return null;
  }
}

function targetSelector(target: readonly unknown[] | undefined): string {
  if (!Array.isArray(target) || target.length === 0) return '';
  // axe may represent shadow-DOM selectors as structured objects. Serialize a
  // bounded diagnostic form rather than assuming a simple CSS string.
  const first = target[0];
  let value: string;
  try {
    value = typeof first === 'string' ? first : JSON.stringify(first);
  } catch {
    value = '[complex selector]';
  }
  return truncate(value || '[complex selector]', LIMITS.selectorMax);
}

function initialSummary(ruleId: string, description: string, selector: string): string {
  const generic = description.trim() || `The page has an accessibility issue covered by the “${ruleId}” rule.`;
  return truncate(selector ? `${generic} Affected element: ${selector}` : generic, LIMITS.summaryMax);
}

/** Convert axe-core's local results into a bounded, serializable ScanResult. */
export async function runAxeScan(doc: Document = document): Promise<ScanResult> {
  const startedAt = new Date().toISOString();
  const axeResults = await axe.run(doc, {
    runOnly: { type: 'tag', values: [...WCAG_TAGS] },
    resultTypes: ['violations', 'incomplete'],
  });

  const findings: ScanFinding[] = [];
  for (const violation of axeResults.violations) {
    for (let index = 0; index < violation.nodes.length; index += 1) {
      if (findings.length >= LIMITS.scanFindingsMax) break;
      const node = violation.nodes[index];
      if (!node) continue;
      const selector = targetSelector(node.target);
      findings.push({
        id: `${violation.id}:${index}`,
        ruleId: truncate(violation.id, LIMITS.ruleIdMax),
        impact: impact(violation.impact),
        category: categoryForRule(violation.id),
        title: truncate(violation.help || violation.id, LIMITS.titleMax),
        summary: initialSummary(violation.id, violation.description, selector),
        wcagTags: violation.tags.slice(0, LIMITS.wcagTagsMax).map((tag) => truncate(tag, LIMITS.wcagTagMax)),
        selector,
        snippet: safeElementExcerpt(node.html),
        helpUrl: violation.helpUrl?.startsWith('https://')
          ? truncate(violation.helpUrl, LIMITS.helpUrlMax)
          : null,
        needsReview: false,
      });
    }
    if (findings.length >= LIMITS.scanFindingsMax) break;
  }

  const incomplete = axeResults.incomplete
    .flatMap((rule) =>
      rule.nodes.map((node, index) => ({
        id: `${rule.id}:incomplete:${index}`,
        ruleId: truncate(rule.id, LIMITS.ruleIdMax),
        reason: truncate(rule.help || rule.description || 'This check needs manual review.', LIMITS.summaryMax),
        selector: node.target?.length ? targetSelector(node.target) : null,
      })),
    )
    .slice(0, LIMITS.scanIncompleteMax);

  const counts: ScanResult['summary']['counts'] = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
    unknown: 0,
    needsReview: 0,
  };
  for (const finding of findings) counts[finding.impact] += 1;

  const location = new URL(doc.location.href);
  return {
    scanId: newId(),
    startedAt,
    pageOrigin: location.origin,
    pageTitle: doc.title ? truncate(doc.title, 200) : null,
    summary: { counts, needsReviewCount: incomplete.length },
    findings,
    incomplete,
    engineVersion: axe.version,
  };
}

export default async function scanCurrentDocument(): Promise<ScanResult> {
  return runAxeScan(document);
}
