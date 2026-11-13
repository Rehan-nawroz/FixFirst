/**
 * Hard size limits enforced at every boundary. Kept small on purpose: payloads
 * and outputs must stay bounded no matter what a page or a provider returns.
 */
export const LIMITS = {
  endpointUrlMax: 2048,
  modelIdMax: 200,
  apiKeyMax: 4096,
  /** Finding/AI-output limits. */
  findingIdMax: 128,
  explanationMax: 2000,
  whyItMattersMax: 2000,
  suggestedFixMax: 2000,
  codeSnippetMax: 4000,
  cautionMax: 1000,
  enrichedFindingsMax: 100,
  /** Scan evidence limits (Phase 2 uses these when sanitizing axe output). */
  selectorMax: 300,
  snippetMax: 500,
  summaryMax: 500,
  scanFindingsMax: 500,
  scanIncompleteMax: 200,
} as const;
