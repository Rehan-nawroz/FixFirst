import { validateEndpointUrl } from '../shared/validation/settings';

/**
 * Origin-safety helpers for the BYOK endpoint (plan T21/T02).
 * Host permissions are requested per-origin at runtime, never granted
 * broadly; only https endpoints get an origin pattern.
 */

export function originPatternFor(endpointUrl: string): string | null {
  const checked = validateEndpointUrl(endpointUrl);
  if (!checked.ok || checked.value === null) return null;
  try {
    const url = new URL(checked.value);
    if (url.protocol !== 'https:') return null; // localhost/dev handled via CORS
    return `${url.origin}/*`;
  } catch {
    return null;
  }
}

/** Origin-only string for display (never path/query/hash). */
export function describeEndpoint(endpointUrl: string): string | null {
  const checked = validateEndpointUrl(endpointUrl);
  if (!checked.ok || checked.value === null) return null;
  try {
    return new URL(checked.value).origin;
  } catch {
    return null;
  }
}

export type PermissionOutcome = 'granted' | 'already-granted' | 'denied' | 'not-needed' | 'invalid';

/**
 * Ask the browser to grant access to the endpoint's origin, from a user-gesture
 * context (side panel click). http/localhost endpoints need no host permission
 * (their servers must send permissive CORS headers for the SW fetch to work).
 */
export async function ensureEndpointPermission(
  endpointUrl: string | null,
): Promise<PermissionOutcome> {
  if (!endpointUrl) return 'not-needed';
  const pattern = originPatternFor(endpointUrl);
  if (!pattern) return 'not-needed';
  if (typeof chrome === 'undefined' || !chrome.permissions) return 'not-needed'; // test env
  try {
    const already = await chrome.permissions.contains({ origins: [pattern] });
    if (already) return 'already-granted';
    const granted = await chrome.permissions.request({ origins: [pattern] });
    return granted ? 'granted' : 'denied';
  } catch {
    return 'invalid';
  }
}
