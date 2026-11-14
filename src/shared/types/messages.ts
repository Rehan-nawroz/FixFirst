/**
 * Core message contracts shared by the side panel (UI), the background service
 * worker, and (later) the injected scanner. Everything crossing a context
 * boundary goes through these types and is runtime-validated on arrival.
 */
import type { SettingsSnapshot } from './settings';
import type { ScanResult } from './scan';
import type { EnrichedFinding } from './ai';

/** Error codes every boundary can return. UI maps codes to helpful copy. */
export type ErrorCode =
  | 'BAD_MESSAGE'
  | 'INVALID_SETTINGS'
  | 'INVALID_API_KEY'
  | 'STORAGE_ERROR'
  | 'SCANNER_UNAVAILABLE'
  | 'SCAN_FAILED'
  | 'UNSUPPORTED_PAGE'
  | 'PERMISSION_DENIED'
  | 'AI_NOT_CONFIGURED'
  | 'CONSENT_REQUIRED'
  | 'AI_REQUEST_FAILED'
  | 'AI_RESPONSE_INVALID'
  | 'AI_TIMEOUT'
  | 'INTERNAL';

export interface ExtError {
  code: ErrorCode;
  message: string;
}

export type ExtRequest =
  | { type: 'PING'; requestId: string }
  | { type: 'GET_SETTINGS'; requestId: string }
  | {
      type: 'SAVE_SETTINGS';
      requestId: string;
      endpointUrl: string | null;
      modelId: string | null;
      aiConsent: boolean;
    }
  | { type: 'SET_API_KEY'; requestId: string; key: string; preference: 'session' | 'device' }
  | { type: 'CLEAR_API_KEY'; requestId: string }
  | { type: 'SCAN_ACTIVE_TAB'; requestId: string }
  | { type: 'ENRICH_FINDINGS'; requestId: string; findings: unknown[] };

/**
 * Responses. Only `GET_SETTINGS`/`SAVE_SETTINGS`/`SET_API_KEY`/`CLEAR_API_KEY`
 * carry a settings snapshot. Key material is NEVER included in any response.
 */
export type ExtResponse =
  | { ok: true; requestId: string }
  | { ok: true; requestId: string; settings: SettingsSnapshot }
  | { ok: true; requestId: string; scan: ScanResult }
  | { ok: true; requestId: string; enrichments: EnrichedFinding[] }
  | { ok: false; requestId: string | null; error: ExtError };
