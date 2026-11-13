import type { ErrorCode } from '../shared/types/messages';

export type StatusTone = 'info' | 'success' | 'error';
export interface StatusState {
  tone: StatusTone;
  text: string;
}

/** Friendly copy for known error codes; unknown codes get a safe default. */
const ERROR_COPY: Partial<Record<ErrorCode, string>> = {
  BAD_MESSAGE: 'The extension sent an invalid internal message. Please reload the panel.',
  INVALID_SETTINGS: 'Some settings are invalid. Check the fields and try again.',
  INVALID_API_KEY: 'That API key looks invalid. Check it and try again.',
  STORAGE_ERROR: 'Could not save settings on this device.',
  SCANNER_UNAVAILABLE:
    'The local page scanner is not in this build yet — it ships in Phase 2 of the build plan.',
  UNSUPPORTED_PAGE:
    'This page cannot be scanned (browser pages like chrome:// and the extension store are off-limits).',
  PERMISSION_DENIED: 'Access to this page was not granted. Click Analyze again to allow it.',
  AI_NOT_CONFIGURED: 'Add an AI endpoint and model in Settings to use AI suggestions.',
  CONSENT_REQUIRED: 'Allow sending finding evidence to your AI endpoint before using AI analysis.',
  INTERNAL: 'Something went wrong. Please try again.',
};

export function copyForError(code: ErrorCode, fallback: string): string {
  return ERROR_COPY[code] ?? fallback;
}
