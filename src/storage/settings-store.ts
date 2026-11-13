import { SETTINGS_DEFAULTS } from '../shared/types/settings';
import type { KeyPreference, StoredSettings } from '../shared/types/settings';

/**
 * Minimal storage abstraction so the same settings code runs against
 * chrome.storage.local in the extension and an in-memory map in unit tests.
 * No secrets are ever written here except the explicitly opt-in device key.
 */
export interface KeyValueStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export function createMemoryStorage(): KeyValueStorage {
  const map = new Map<string, unknown>();
  return {
    async get(key) {
      const out: Record<string, unknown> = {};
      if (map.has(key)) out[key] = map.get(key);
      return out;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) map.set(k, v);
    },
    async remove(key) {
      map.delete(key);
    },
  };
}

export function createChromeLocalStorage(): KeyValueStorage {
  return {
    async get(key) {
      const res = await chrome.storage.local.get(key);
      return res as Record<string, unknown>;
    },
    async set(items) {
      await chrome.storage.local.set(items);
    },
    async remove(key) {
      await chrome.storage.local.remove(key);
    },
  };
}

const SETTINGS_KEY = 'fixfirst.settings.v1';
const DEVICE_KEY_ENTRY = 'fixfirst.apiKey.device.v1';

export interface SettingsStore {
  load(): Promise<StoredSettings>;
  save(next: StoredSettings): Promise<void>;
  loadDeviceApiKey(): Promise<string | null>;
  saveDeviceApiKey(key: string): Promise<void>;
  clearDeviceApiKey(): Promise<void>;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asKeyPreference(value: unknown): KeyPreference {
  return value === 'session' || value === 'device' || value === 'none' ? value : 'none';
}

/** Defensive read: malformed stored data falls back to defaults, never throws. */
function coerceSettings(raw: unknown): StoredSettings {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ...SETTINGS_DEFAULTS };
  const rec = raw as Record<string, unknown>;
  return {
    endpointUrl: asString(rec.endpointUrl),
    modelId: asString(rec.modelId),
    aiConsent: rec.aiConsent === true,
    keyPreference: asKeyPreference(rec.keyPreference),
  };
}

export function createSettingsStore(storage: KeyValueStorage): SettingsStore {
  return {
    async load() {
      const res = await storage.get(SETTINGS_KEY);
      return coerceSettings(res[SETTINGS_KEY]);
    },
    async save(next) {
      await storage.set({ [SETTINGS_KEY]: next });
    },
    async loadDeviceApiKey() {
      const res = await storage.get(DEVICE_KEY_ENTRY);
      const v = res[DEVICE_KEY_ENTRY];
      return typeof v === 'string' && v !== '' ? v : null;
    },
    async saveDeviceApiKey(key) {
      await storage.set({ [DEVICE_KEY_ENTRY]: key });
    },
    async clearDeviceApiKey() {
      await storage.remove(DEVICE_KEY_ENTRY);
    },
  };
}
