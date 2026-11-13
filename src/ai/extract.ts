/** Thrown when the provider's response cannot be turned into valid enrichment. */
export class AiResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiResponseError';
  }
}

/**
 * Extract a JSON array from model output. Tolerates markdown code fences and
 * surrounding prose (compatible endpoints vary), but everything still has to
 * pass schema validation afterwards — extraction success is not trust.
 */
export function extractJsonArray(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to bracket slicing
  }
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start === -1 || end <= start) {
    throw new AiResponseError('No JSON array found in AI response.');
  }
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    throw new AiResponseError('AI response JSON is malformed.');
  }
}
