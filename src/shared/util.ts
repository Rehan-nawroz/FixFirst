import { LIMITS } from './validation/limits';
import type { EnrichedFinding } from './types/ai';
import type { ExtResponse } from './types/messages';

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max - 1) + '\u2026';
}

/** True when the response carries key-bearing settings (key itself is never sent). */
export function responseHasSettings(res: ExtResponse): res is Extract<ExtResponse, { settings: unknown }> {
  return res.ok && 'settings' in res;
}

/** Helper for Phase 3 callers: build a bounded enrichment from strings. */
export function boundedEnrichment(input: EnrichedFinding): EnrichedFinding {
  const out: EnrichedFinding = {
    findingId: truncate(input.findingId, LIMITS.findingIdMax),
    explanation: truncate(input.explanation, LIMITS.explanationMax),
    whyItMatters: truncate(input.whyItMatters, LIMITS.whyItMattersMax),
    suggestedFix: truncate(input.suggestedFix, LIMITS.suggestedFixMax),
  };
  if (input.codeSnippet !== undefined) out.codeSnippet = truncate(input.codeSnippet, LIMITS.codeSnippetMax);
  if (input.caution !== undefined) out.caution = truncate(input.caution, LIMITS.cautionMax);
  return out;
}
