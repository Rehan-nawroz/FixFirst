import type { EnrichedFinding } from '../types/ai';
import type { ValidationResult } from './settings';
import { LIMITS } from './limits';

const STRING_FIELDS: Array<{
  key: 'explanation' | 'whyItMatters' | 'suggestedFix' | 'codeSnippet' | 'caution';
  max: number;
  optional: boolean;
}> = [
  { key: 'explanation', max: LIMITS.explanationMax, optional: false },
  { key: 'whyItMatters', max: LIMITS.whyItMattersMax, optional: false },
  { key: 'suggestedFix', max: LIMITS.suggestedFixMax, optional: false },
  { key: 'codeSnippet', max: LIMITS.codeSnippetMax, optional: true },
  { key: 'caution', max: LIMITS.cautionMax, optional: true },
];

/**
 * Runtime validation of a single AI-enriched finding. Model output is treated
 * as untrusted: structure, lengths, and finding IDs are all checked. Renderers
 * must still treat every string as plain text (never HTML).
 */
export function validateEnrichedFinding(input: unknown): ValidationResult<EnrichedFinding> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'Enriched finding must be an object.' };
  }
  const raw = input as Record<string, unknown>;
  if (typeof raw.findingId !== 'string' || raw.findingId === '') {
    return { ok: false, error: 'Enriched finding must have a findingId.' };
  }
  if (raw.findingId.length > LIMITS.findingIdMax) {
    return { ok: false, error: 'findingId is too long.' };
  }
  const value: EnrichedFinding = {
    findingId: raw.findingId,
    explanation: '',
    whyItMatters: '',
    suggestedFix: '',
  };
  let filledRequired = 0;
  for (const field of STRING_FIELDS) {
    const v = raw[field.key];
    if (v === undefined || v === null) {
      if (!field.optional) {
        return { ok: false, error: `Enriched finding must include ${field.key}.` };
      }
      continue;
    }
    if (typeof v !== 'string') {
      return { ok: false, error: `${field.key} must be text.` };
    }
    if (v.length > field.max) {
      return { ok: false, error: `${field.key} exceeds the size limit.` };
    }
    if (!field.optional) filledRequired += 1;
    if (v === '' && field.optional) continue;
    switch (field.key) {
      case 'explanation':
        value.explanation = v;
        break;
      case 'whyItMatters':
        value.whyItMatters = v;
        break;
      case 'suggestedFix':
        value.suggestedFix = v;
        break;
      case 'codeSnippet':
        value.codeSnippet = v;
        break;
      case 'caution':
        value.caution = v;
        break;
    }
  }
  if (filledRequired < 3) {
    return { ok: false, error: 'Enriched finding must include explanation, whyItMatters, and suggestedFix.' };
  }
  return { ok: true, value };
}

/**
 * Validate a full enrichment response against the findings that were sent.
 * Unknown or missing IDs make the whole response invalid — callers then keep
 * the local scan results untouched.
 */
export function validateAiEnrichment(
  input: unknown,
  expectedIds: readonly string[],
): ValidationResult<EnrichedFinding[]> {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'AI enrichment must be an array.' };
  }
  if (input.length > LIMITS.enrichedFindingsMax) {
    return { ok: false, error: 'AI enrichment exceeds the size limit.' };
  }
  const expected = new Set(expectedIds);
  const seen = new Set<string>();
  const out: EnrichedFinding[] = [];
  for (const item of input) {
    const checked = validateEnrichedFinding(item);
    if (!checked.ok) return checked;
    if (!expected.has(checked.value.findingId)) {
      return { ok: false, error: `Unknown findingId: ${checked.value.findingId.slice(0, 64)}` };
    }
    if (seen.has(checked.value.findingId)) {
      return { ok: false, error: 'Duplicate findingId in AI enrichment.' };
    }
    seen.add(checked.value.findingId);
    out.push(checked.value);
  }
  return { ok: true, value: out };
}
