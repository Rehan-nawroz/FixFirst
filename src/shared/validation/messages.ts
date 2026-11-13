import type { ExtRequest } from '../types/messages';
import type { ValidationResult } from './settings';
import { LIMITS } from './limits';

function requestIdOk(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

/**
 * Runtime validation for every message crossing the extension boundary.
 * Unknown shapes are rejected with a plain reason; nothing is trusted.
 */
export function validateExtRequest(input: unknown): ValidationResult<ExtRequest> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'Message must be an object.' };
  }
  const raw = input as Record<string, unknown>;
  if (typeof raw.type !== 'string') {
    return { ok: false, error: 'Message must have a type.' };
  }
  if (!requestIdOk(raw.requestId)) {
    return { ok: false, error: 'Message must have a requestId.' };
  }
  const requestId: string = raw.requestId;

  switch (raw.type) {
    case 'PING':
      return { ok: true, value: { type: 'PING', requestId } };
    case 'GET_SETTINGS':
      return { ok: true, value: { type: 'GET_SETTINGS', requestId } };
    case 'CLEAR_API_KEY':
      return { ok: true, value: { type: 'CLEAR_API_KEY', requestId } };
    case 'SCAN_ACTIVE_TAB':
      return { ok: true, value: { type: 'SCAN_ACTIVE_TAB', requestId } };
    case 'SAVE_SETTINGS': {
      const endpointRaw = raw.endpointUrl;
      const modelRaw = raw.modelId;
      if (endpointRaw !== null && typeof endpointRaw !== 'string') {
        return { ok: false, error: 'SAVE_SETTINGS has invalid fields.' };
      }
      if (modelRaw !== null && typeof modelRaw !== 'string') {
        return { ok: false, error: 'SAVE_SETTINGS has invalid fields.' };
      }
      if (typeof raw.aiConsent !== 'boolean') {
        return { ok: false, error: 'SAVE_SETTINGS has invalid fields.' };
      }
      const endpointUrl =
        typeof endpointRaw === 'string' ? endpointRaw.slice(0, LIMITS.endpointUrlMax) : null;
      const modelId = typeof modelRaw === 'string' ? modelRaw.slice(0, LIMITS.modelIdMax) : null;
      return {
        ok: true,
        value: { type: 'SAVE_SETTINGS', requestId, endpointUrl, modelId, aiConsent: raw.aiConsent },
      };
    }
    case 'SET_API_KEY': {
      if (typeof raw.key !== 'string' || (raw.preference !== 'session' && raw.preference !== 'device')) {
        return { ok: false, error: 'SET_API_KEY has invalid fields.' };
      }
      return {
        ok: true,
        value: { type: 'SET_API_KEY', requestId, key: raw.key.slice(0, LIMITS.apiKeyMax), preference: raw.preference },
      };
    }
    default:
      return { ok: false, error: `Unknown message type: ${String(raw.type)}` };
  }
}
