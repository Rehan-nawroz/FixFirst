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
  /** Scan evidence limits (sanitizing axe output in Phase 2). */
  selectorMax: 300,
  snippetMax: 500,
  summaryMax: 500,
  titleMax: 200,
  ruleIdMax: 64,
  wcagTagsMax: 12,
  wcagTagMax: 32,
  helpUrlMax: 2048,
  scanFindingsMax: 500,
  scanIncompleteMax: 200,
  /** AI request limits (BYOK enrichment, Phase 3). */
  aiMaxFindingsPerRequest: 50,
  promptPayloadMax: 60000,
  aiTimeoutDefaultMs: 60000,
  aiResponseMaxChars: 200000,
} as const;
