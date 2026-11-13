import { describe, expect, it } from 'vitest';
import { createMemoryStorage, createSettingsStore } from '../src/storage/settings-store';
import { SETTINGS_DEFAULTS } from '../src/shared/types/settings';

describe('settings store', () => {
  it('returns defaults when nothing is stored', async () => {
    const store = createSettingsStore(createMemoryStorage());
    expect(await store.load()).toEqual(SETTINGS_DEFAULTS);
    expect(await store.loadDeviceApiKey()).toBeNull();
  });

  it('round-trips settings and device key', async () => {
    const store = createSettingsStore(createMemoryStorage());
    await store.save({ ...SETTINGS_DEFAULTS, endpointUrl: 'https://api.example.com/v1', aiConsent: true });
    await store.saveDeviceApiKey('sk-secret');
    expect((await store.load()).endpointUrl).toBe('https://api.example.com/v1');
    expect(await store.loadDeviceApiKey()).toBe('sk-secret');
    await store.clearDeviceApiKey();
    expect(await store.loadDeviceApiKey()).toBeNull();
  });

  it('falls back to defaults on malformed stored data', async () => {
    const storage = createMemoryStorage();
    await storage.set({ 'fixfirst.settings.v1': { endpointUrl: 42, aiConsent: 'yes', keyPreference: 'wat' } });
    const store = createSettingsStore(storage);
    const loaded = await store.load();
    expect(loaded).toEqual({ ...SETTINGS_DEFAULTS, endpointUrl: null });
  });
});
