import type { ErrorCode } from '../shared/types/messages';
import type { KeyPreference, SettingsSnapshot, StoredSettings } from '../shared/types/settings';
import type { SettingsStore } from '../storage/settings-store';
import {
  validateAiConsent,
  validateApiKey,
  validateEndpointUrl,
  validateModelId,
  type ValidationResult,
} from '../shared/validation/settings';

/** Error type carrying an ExtError code through service boundaries. */
export class ExtServiceError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'ExtServiceError';
    this.code = code;
  }
}

function unwrap<T>(result: ValidationResult<T>): T {
  if (!result.ok) throw new ExtServiceError('INVALID_SETTINGS', result.error);
  return result.value;
}

/**
 * Settings + key lifecycle for the background service worker.
 *
 * Key handling follows the plan's privacy rules:
 * - 'device' keys go to chrome.storage.local ONLY after the user explicitly
 *   chooses that option (storage.local is not encrypted secret storage).
 * - 'session' keys are held in this service's memory only. Best-effort: an MV3
 *   service worker can be restarted by the browser, which drops the key.
 * - Keys are never included in snapshots or responses — only a hasKey boolean.
 */
export class SettingsService {
  private sessionApiKey: string | null = null;

  constructor(private readonly store: SettingsStore) {}

  async getSnapshot(): Promise<SettingsSnapshot> {
    const stored = await this.store.load();
    const deviceKey = await this.store.loadDeviceApiKey();
    return {
      ...stored,
      hasKey: this.sessionApiKey !== null || deviceKey !== null,
    };
  }

  async saveSettings(input: {
    endpointUrl: unknown;
    modelId: unknown;
    aiConsent: unknown;
  }): Promise<SettingsSnapshot> {
    const endpointUrl = unwrap(validateEndpointUrl(input.endpointUrl));
    const modelId = unwrap(validateModelId(input.modelId));
    const aiConsent = unwrap(validateAiConsent(input.aiConsent));

    // Consent to send page-derived evidence only makes sense with a real
    // destination; require both endpoint and model before it can be enabled.
    if (aiConsent && (endpointUrl === null || modelId === null)) {
      throw new ExtServiceError(
        'INVALID_SETTINGS',
        'Set an AI endpoint and model before enabling AI analysis.',
      );
    }

    const current = await this.store.load();
    const next: StoredSettings = {
      ...current,
      endpointUrl,
      modelId,
      aiConsent: aiConsent && endpointUrl !== null && modelId !== null,
    };
    await this.store.save(next);
    return this.getSnapshot();
  }

  async setApiKey(key: unknown, preference: unknown): Promise<SettingsSnapshot> {
    const checked = validateApiKey(key);
    if (!checked.ok) throw new ExtServiceError('INVALID_API_KEY', checked.error);
    if (preference !== 'session' && preference !== 'device') {
      throw new ExtServiceError('INVALID_API_KEY', 'Key storage preference must be session or device.');
    }

    if (preference === 'device') {
      await this.store.saveDeviceApiKey(checked.value);
      await this.updateKeyPreference('device');
    } else {
      this.sessionApiKey = checked.value;
      await this.updateKeyPreference('session');
    }
    return this.getSnapshot();
  }

  async clearApiKey(): Promise<SettingsSnapshot> {
    this.sessionApiKey = null;
    await this.store.clearDeviceApiKey();
    await this.updateKeyPreference('none');
    return this.getSnapshot();
  }

  /** Internal accessor for Phase 3 AI calls. Never exposed through messages. */
  getActiveKey(): string | null {
    return this.sessionApiKey;
  }

  /**
   * Resolve the key to use for an AI request: session key first, then the
   * explicit opt-in device key. Never called from the message boundary.
   */
  async resolveApiKey(): Promise<{ key: string; preference: KeyPreference } | null> {
    if (this.sessionApiKey !== null) {
      return { key: this.sessionApiKey, preference: 'session' };
    }
    const deviceKey = await this.store.loadDeviceApiKey();
    if (deviceKey !== null) {
      return { key: deviceKey, preference: 'device' };
    }
    return null;
  }

  private async updateKeyPreference(preference: KeyPreference): Promise<void> {
    const current = await this.store.load();
    await this.store.save({ ...current, keyPreference: preference });
  }
}
