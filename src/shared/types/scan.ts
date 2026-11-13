/**
 * Scan-result contracts for the deterministic (axe-core based) local scan.
 * Phase 1 defines and validates these; Phase 2 (T11–T19) produces them.
 * Never persist raw page DOM — findings carry bounded, sanitized evidence only.
 */

export type FindingImpact =
  | 'critical'
  | 'serious'
  | 'moderate'
  | 'minor'
  | 'unknown'
  | 'needsReview';

export type FindingCategory =
  | 'images'
  | 'controls'
  | 'contrast'
  | 'document'
  | 'structure'
  | 'other';

export interface ScanFinding {
  /** Stable local ID for this finding within the scan (not a page-derived value). */
  id: string;
  /** axe rule ID, e.g. "image-alt". */
  ruleId: string;
  impact: FindingImpact;
  category: FindingCategory;
  /** Plain-English title derived from trusted rule metadata, not page content. */
  title: string;
  /** Short summary of what was detected; may quote bounded page text. */
  summary: string;
  /** WCAG tags/criteria reported by the engine, e.g. ["wcag2a", "1.1.1"]. */
  wcagTags: string[];
  /** Bounded CSS selector for the affected element. */
  selector: string;
  /** Bounded, sanitized HTML excerpt (attributes redacted) when relevant. */
  snippet: string | null;
  /** helpUrl from trusted axe metadata — never page-supplied. */
  helpUrl: string | null;
  /** True when the check needs human interaction to confirm. */
  needsReview: boolean;
}

/** A check the engine could not conclusively evaluate (e.g. contrast). */
export interface IncompleteCheck {
  id: string;
  ruleId: string;
  reason: string;
  selector: string | null;
}

export interface ScanSummary {
  counts: Record<FindingImpact, number>;
  needsReviewCount: number;
}

export interface ScanResult {
  scanId: string;
  startedAt: string;
  /** Origin only — no path, query, or hash. */
  pageOrigin: string;
  /** Page title may contain page-derived text; render as text only. */
  pageTitle: string | null;
  summary: ScanSummary;
  findings: ScanFinding[];
  incomplete: IncompleteCheck[];
  engineVersion: string;
}
