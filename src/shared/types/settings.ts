/** How the user wants their API key stored. See plan T07/T27. */
export type KeyPreference = 'none' | 'session' | 'device';

/** Non-secret settings persisted in chrome.storage.local. */
export interface StoredSettings {
  /** HTTPS base URL of the user's OpenAI-compatible endpoint, or null. */
  endpointUrl: string | null;
  /** Model identifier the user wants the endpoint to run, or null. */
  modelId: string | null;
  /** Explicit consent that finding evidence may be sent to the endpoint. */
  aiConsent: boolean;
  /** Where the user chose to keep their key (updated by SET/CLEAR_API_KEY). */
  keyPreference: KeyPreference;
}

/**
 * What the UI is allowed to see: the stored settings plus a boolean for "a key
 * is available" — never the key itself.
 */
export interface SettingsSnapshot extends StoredSettings {
  hasKey: boolean;
}

export const SETTINGS_DEFAULTS: StoredSettings = {
  endpointUrl: null,
  modelId: null,
  aiConsent: false,
  keyPreference: 'none',
};
