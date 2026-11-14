import type {
  FindingCategory,
  FindingImpact,
  IncompleteCheck,
  ScanFinding,
  ScanResult,
} from '../types/scan';
import { LIMITS } from './limits';
import type { ValidationResult } from './settings';

const IMPACTS: readonly FindingImpact[] = [
  'critical',
  'serious',
  'moderate',
  'minor',
  'unknown',
  'needsReview',
];
const CATEGORIES: readonly FindingCategory[] = [
  'images',
  'controls',
  'contrast',
  'document',
  'structure',
  'other',
];

function isBoundedString(v: unknown, min: number, max: number): v is string {
  return typeof v === 'string' && v.length >= min && v.length <= max;
}

/**
 * Runtime validation of a scan finding crossing any boundary (UI -> background
 * for enrichment today; injected scanner -> background in Phase 2). Page
 * derived strings are accepted but must respect hard size caps; anything else
 * is rejected rather than sanitized silently.
 */
export function validateScanFinding(input: unknown): ValidationResult<ScanFinding> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'Finding must be an object.' };
  }
  const raw = input as Record<string, unknown>;

  if (!isBoundedString(raw.id, 1, LIMITS.findingIdMax)) {
    return { ok: false, error: 'Finding id is missing or out of bounds.' };
  }
  if (!isBoundedString(raw.ruleId, 1, LIMITS.ruleIdMax)) {
    return { ok: false, error: 'Finding ruleId is missing or out of bounds.' };
  }
  if (typeof raw.impact !== 'string' || !IMPACTS.includes(raw.impact as FindingImpact)) {
    return { ok: false, error: 'Finding impact is invalid.' };
  }
  if (typeof raw.category !== 'string' || !CATEGORIES.includes(raw.category as FindingCategory)) {
    return { ok: false, error: 'Finding category is invalid.' };
  }
  if (!isBoundedString(raw.title, 1, LIMITS.titleMax)) {
    return { ok: false, error: 'Finding title is missing or too long.' };
  }
  if (typeof raw.summary !== 'string' || raw.summary.length > LIMITS.summaryMax) {
    return { ok: false, error: 'Finding summary is missing or too long.' };
  }
  if (
    !Array.isArray(raw.wcagTags) ||
    raw.wcagTags.length > LIMITS.wcagTagsMax ||
    raw.wcagTags.some((t) => !isBoundedString(t, 1, LIMITS.wcagTagMax))
  ) {
    return { ok: false, error: 'Finding WCAG tags are invalid.' };
  }
  if (typeof raw.selector !== 'string' || raw.selector.length > LIMITS.selectorMax) {
    return { ok: false, error: 'Finding selector is missing or too long.' };
  }
  if (raw.snippet !== null && (typeof raw.snippet !== 'string' || raw.snippet.length > LIMITS.snippetMax)) {
    return { ok: false, error: 'Finding snippet is invalid or too long.' };
  }
  if (
    raw.helpUrl !== null &&
    (typeof raw.helpUrl !== 'string' ||
      raw.helpUrl.length > LIMITS.helpUrlMax ||
      !raw.helpUrl.startsWith('https://'))
  ) {
    return { ok: false, error: 'Finding helpUrl must be an https URL or null.' };
  }
  if (typeof raw.needsReview !== 'boolean') {
    return { ok: false, error: 'Finding needsReview must be a boolean.' };
  }

  return {
    ok: true,
    value: {
      id: raw.id,
      ruleId: raw.ruleId,
      impact: raw.impact as FindingImpact,
      category: raw.category as FindingCategory,
      title: raw.title,
      summary: raw.summary,
      wcagTags: raw.wcagTags as string[],
      selector: raw.selector,
      snippet: raw.snippet as string | null,
      helpUrl: raw.helpUrl as string | null,
      needsReview: raw.needsReview,
    },
  };
}

/** Validate a complete scan result returned by the injected scanner. */
export function validateScanResult(input: unknown): ValidationResult<ScanResult> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'Scan result must be an object.' };
  }
  const raw = input as Record<string, unknown>;
  if (!isBoundedString(raw.scanId, 1, 128)) return { ok: false, error: 'Scan id is invalid.' };
  if (typeof raw.startedAt !== 'string' || Number.isNaN(Date.parse(raw.startedAt))) {
    return { ok: false, error: 'Scan timestamp is invalid.' };
  }
  if (typeof raw.pageOrigin !== 'string') return { ok: false, error: 'Page origin is invalid.' };
  let pageOrigin: string;
  try {
    const parsed = new URL(raw.pageOrigin);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== raw.pageOrigin) {
      return { ok: false, error: 'Page origin must be an http(s) origin only.' };
    }
    pageOrigin = parsed.origin;
  } catch {
    return { ok: false, error: 'Page origin is invalid.' };
  }
  if (raw.pageTitle !== null && (typeof raw.pageTitle !== 'string' || raw.pageTitle.length > 200)) {
    return { ok: false, error: 'Page title is invalid or too long.' };
  }
  if (typeof raw.engineVersion !== 'string' || raw.engineVersion.length > 64) {
    return { ok: false, error: 'Scanner engine version is invalid.' };
  }
  if (!Array.isArray(raw.findings) || raw.findings.length > LIMITS.scanFindingsMax) {
    return { ok: false, error: 'Scan findings are invalid or exceed the limit.' };
  }
  const findings: ScanFinding[] = [];
  for (const candidate of raw.findings) {
    const finding = validateScanFinding(candidate);
    if (!finding.ok) return { ok: false, error: finding.error };
    findings.push(finding.value);
  }
  if (!Array.isArray(raw.incomplete) || raw.incomplete.length > LIMITS.scanIncompleteMax) {
    return { ok: false, error: 'Incomplete checks are invalid or exceed the limit.' };
  }
  const incomplete: IncompleteCheck[] = [];
  for (const candidate of raw.incomplete) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      return { ok: false, error: 'Incomplete check is invalid.' };
    }
    const check = candidate as Record<string, unknown>;
    if (!isBoundedString(check.id, 1, 128) || !isBoundedString(check.ruleId, 1, LIMITS.ruleIdMax)) {
      return { ok: false, error: 'Incomplete check id/rule is invalid.' };
    }
    if (typeof check.reason !== 'string' || check.reason.length > LIMITS.summaryMax) {
      return { ok: false, error: 'Incomplete check reason is invalid.' };
    }
    if (check.selector !== null && (typeof check.selector !== 'string' || check.selector.length > LIMITS.selectorMax)) {
      return { ok: false, error: 'Incomplete check selector is invalid.' };
    }
    incomplete.push({ id: check.id, ruleId: check.ruleId, reason: check.reason, selector: check.selector as string | null });
  }
  if (typeof raw.summary !== 'object' || raw.summary === null || Array.isArray(raw.summary)) {
    return { ok: false, error: 'Scan summary is invalid.' };
  }
  const summary = raw.summary as Record<string, unknown>;
  if (typeof summary.counts !== 'object' || summary.counts === null || Array.isArray(summary.counts)) {
    return { ok: false, error: 'Scan counts are invalid.' };
  }
  const counts = summary.counts as Record<string, unknown>;
  for (const key of IMPACTS) {
    if (typeof counts[key] !== 'number' || !Number.isInteger(counts[key]) || counts[key] < 0 || counts[key] > LIMITS.scanFindingsMax) {
      return { ok: false, error: 'Scan counts are invalid.' };
    }
  }
  if (typeof summary.needsReviewCount !== 'number' || !Number.isInteger(summary.needsReviewCount) || summary.needsReviewCount < 0 || summary.needsReviewCount > LIMITS.scanIncompleteMax) {
    return { ok: false, error: 'Manual-review count is invalid.' };
  }
  return {
    ok: true,
    value: {
      scanId: raw.scanId,
      startedAt: raw.startedAt,
      pageOrigin,
      pageTitle: raw.pageTitle as string | null,
      summary: {
        counts: counts as ScanResult['summary']['counts'],
        needsReviewCount: summary.needsReviewCount,
      },
      findings,
      incomplete,
      engineVersion: raw.engineVersion,
    },
  };
}
