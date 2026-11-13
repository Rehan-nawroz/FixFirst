import { describe, expect, it } from 'vitest';
import { SettingsService, ExtServiceError } from '../src/background/settings-service';
import { createSettingsStore, createMemoryStorage } from '../src/storage/settings-store';
import { SETTINGS_DEFAULTS } from '../src/shared/types/settings';

function makeService(): SettingsService {
  return new SettingsService(createSettingsStore(createMemoryStorage()));
}

describe('SettingsService', () => {
  it('starts with defaults and no key', async () => {
    const s = await makeService().getSnapshot();
    expect(s).toEqual({ ...SETTINGS_DEFAULTS, hasKey: false });
  });

  it('saves valid settings and reports snapshot without key material', async () => {
    const svc = makeService();
    const snap = await svc.saveSettings({
      endpointUrl: 'https://api.example.com/v1',
      modelId: 'gpt-4o-mini',
      aiConsent: false,
    });
    expect(snap.endpointUrl).toBe('https://api.example.com/v1');
    expect(snap.modelId).toBe('gpt-4o-mini');
    expect(snap.hasKey).toBe(false);
    expect(JSON.stringify(snap)).not.toMatch(/sk-/i);
  });

  it('blocks consent without endpoint and model', async () => {
    const svc = makeService();
    await expect(
      svc.saveSettings({ endpointUrl: null, modelId: null, aiConsent: true }),
    ).rejects.toMatchObject({ code: 'INVALID_SETTINGS' });
    // Consent is allowed once both are set.
    const snap = await svc.saveSettings({
      endpointUrl: 'https://api.example.com/v1',
      modelId: 'm',
      aiConsent: true,
    });
    expect(snap.aiConsent).toBe(true);
  });

  it('rejects invalid endpoint URLs, models, and keys', async () => {
    const svc = makeService();
    await expect(
      svc.saveSettings({ endpointUrl: 'http://evil.example.com', modelId: null, aiConsent: false }),
    ).rejects.toBeInstanceOf(ExtServiceError);
    await expect(svc.setApiKey('bad key with spaces', 'device')).rejects.toMatchObject({
      code: 'INVALID_API_KEY',
    });
    await expect(svc.setApiKey('sk-abc', 'cloud')).rejects.toBeInstanceOf(ExtServiceError);
  });

  it('tracks session vs device key lifecycle without echoing keys', async () => {
    const svc = makeService();
    const sessionSnap = await svc.setApiKey('sk-session', 'session');
    expect(sessionSnap.hasKey).toBe(true);
    expect(sessionSnap.keyPreference).toBe('session');
    expect(JSON.stringify(sessionSnap)).not.toContain('sk-session');

    const deviceSnap = await svc.setApiKey('sk-device', 'device');
    expect(deviceSnap.keyPreference).toBe('device');
    // Device key is stored, session key was replaced in memory only.
    expect(JSON.stringify(deviceSnap)).not.toContain('sk-device');

    const cleared = await svc.clearApiKey();
    expect(cleared.hasKey).toBe(false);
    expect(cleared.keyPreference).toBe('none');
  });
});
