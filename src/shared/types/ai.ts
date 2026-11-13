/**
 * AI enrichment contracts (BYOK, Phase 3 implementation T20–T27).
 * Phase 1 defines the shape and runtime validation so the UI, background, and
 * message boundary already agree on what AI output looks like.
 */
export interface EnrichedFinding {
  /** Must match a finding ID from the local scan. */
  findingId: string;
  /** Plain-English explanation of what the issue is. */
  explanation: string;
  /** Why the issue matters for real users. */
  whyItMatters: string;
  /** Human-readable suggested fix (never executed, never auto-applied). */
  suggestedFix: string;
  /** Optional example code snippet — always rendered as text. */
  codeSnippet?: string;
  /** Optional "verify manually" caveat text. */
  caution?: string;
}
