import { LIMITS } from './limits';

/** Result of validating untrusted input at a boundary. */
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function fail(error: string): ValidationResult<never> {
  return { ok: false, error };
}

const HOSTNAME_LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Validate a user-entered AI endpoint base URL.
 * - HTTPS required in production; plain http allowed only for localhost dev.
 * - No credentials in the URL, no query/hash (stripped), bounded length.
 * - Empty input normalizes to null (no endpoint configured).
 */
export function validateEndpointUrl(input: unknown): ValidationResult<string | null> {
  if (input === null) return { ok: true, value: null };
  if (typeof input !== 'string') return fail('Endpoint URL must be text.');

  const trimmed = input.trim();
  if (trimmed === '') return { ok: true, value: null };
  if (trimmed.length > LIMITS.endpointUrlMax) {
    return fail(`Endpoint URL must be at most ${LIMITS.endpointUrlMax} characters.`);
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return fail('Endpoint URL must be a valid absolute URL, e.g. https://api.example.com/v1');
  }

  const isLocal =
    HOSTNAME_LOCAL.has(url.hostname) ||
    HOSTNAME_LOCAL.has(url.hostname.replace(/^\[|\]$/g, ''));
  if (url.protocol === 'http:' && !isLocal) {
    return fail('Endpoint must use HTTPS (plain http is only allowed for localhost).');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return fail('Endpoint must be an https:// URL.');
  }
  if (url.username !== '' || url.password !== '') {
    return fail('Endpoint URL must not contain a username or password.');
  }

  // Strip query and hash: an API base URL has no business carrying either.
  url.search = '';
  url.hash = '';
  return { ok: true, value: url.href };
}

/**
 * Validate a user-entered model identifier. Empty input normalizes to null.
 * Allowed characters cover common provider formats (gpt-4o, claude-3-5-sonnet,
 * openai/gpt-oss-20b, @cf/... ) — permissive but bounded.
 */
export function validateModelId(input: unknown): ValidationResult<string | null> {
  if (input === null) return { ok: true, value: null };
  if (typeof input !== 'string') return fail('Model ID must be text.');

  const trimmed = input.trim();
  if (trimmed === '') return { ok: true, value: null };
  if (trimmed.length > LIMITS.modelIdMax) {
    return fail(`Model ID must be at most ${LIMITS.modelIdMax} characters.`);
  }
  for (const ch of trimmed) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return fail('Model ID must not contain control characters.');
  }
  if (/\s/.test(trimmed)) return fail('Model ID must not contain whitespace.');
  if (!/^[A-Za-z0-9@][A-Za-z0-9._:/@-]*$/.test(trimmed)) {
    return fail('Model ID contains characters that are not allowed.');
  }
  return { ok: true, value: trimmed };
}

/** Validate an explicit boolean consent flag. */
export function validateAiConsent(input: unknown): ValidationResult<boolean> {
  if (typeof input !== 'boolean') return fail('Consent must be true or false.');
  return { ok: true, value: input };
}

/**
 * Validate a user-supplied API key: bounded length, no control characters or
 * whitespace. The key is never echoed back or logged by any caller.
 */
export function validateApiKey(input: unknown): ValidationResult<string> {
  if (typeof input !== 'string' || input.trim() === '') {
    return fail('API key must be non-empty text.');
  }
  const trimmed = input.trim();
  if (trimmed.length > LIMITS.apiKeyMax) {
    return fail(`API key must be at most ${LIMITS.apiKeyMax} characters.`);
  }
  if (/\s/.test(trimmed)) return fail('API key must not contain whitespace or line breaks.');
  for (const ch of trimmed) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return fail('API key contains control characters.');
  }
  return { ok: true, value: trimmed };
}
