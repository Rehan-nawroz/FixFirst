import { describe, expect, it, vi } from 'vitest';
import { AiService } from '../src/background/ai-service';
import { SettingsService } from '../src/background/settings-service';
import { createSettingsStore, createMemoryStorage } from '../src/storage/settings-store';
import { AiError } from '../src/ai/provider';
import type { AiProvider, AiProviderConfig } from '../src/ai/provider';
import type { EnrichedFinding } from '../src/shared/types/ai';

const FINDING = {
  id: 'f1',
  ruleId: 'image-alt',
  impact: 'critical',
  category: 'images',
  title: 'Image missing alternative text',
  summary: 'An img element has no alt attribute.',
  wcagTags: ['wcag2a'],
  selector: 'img',
  snippet: null,
  helpUrl: null,
  needsReview: false,
};

const ENRICHMENT: EnrichedFinding = {
  findingId: 'f1',
  explanation: 'e',
  whyItMatters: 'w',
  suggestedFix: 's',
};

function makeDeps(opts?: {
  contains?: boolean;
  provider?: AiProvider;
}): { service: SettingsService; ai: AiService; provider: AiProvider } {
  const settingsService = new SettingsService(createSettingsStore(createMemoryStorage()));
  const provider: AiProvider =
    opts?.provider ??
    ({
      name: 'fake',
      enrich: vi.fn().mockResolvedValue([ENRICHMENT]),
    } as unknown as AiProvider);
  const ai = new AiService(settingsService, createSettingsStore(createMemoryStorage()), provider, {
    contains: vi.fn().mockResolvedValue(opts?.contains ?? true),
  });
  return { service: settingsService, ai, provider };
}

async function configured(svc: SettingsService): Promise<void> {
  await svc.saveSettings({
    endpointUrl: 'https://api.example.com/v1',
    modelId: 'gpt-4o-mini',
    aiConsent: true,
  });
  await svc.setApiKey('sk-test-key-abcdef', 'device');
}

describe('AiService.enrichFindings', () => {
  it('refuses to run without endpoint, consent, or key', async () => {
    const { service, ai } = makeDeps();
    await expect(ai.enrichFindings([FINDING])).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' });

    await service.saveSettings({
      endpointUrl: 'https://api.example.com/v1',
      modelId: 'gpt-4o-mini',
      aiConsent: false,
    });
    await expect(ai.enrichFindings([FINDING])).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });

    await service.saveSettings({
      endpointUrl: 'https://api.example.com/v1',
      modelId: 'gpt-4o-mini',
      aiConsent: true,
    });
    await expect(ai.enrichFindings([FINDING])).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' });
  });

  it('validates findings and enforces the per-request cap', async () => {
    const { service, ai } = makeDeps();
    await configured(service);
    await expect(ai.enrichFindings([{ ...FINDING, impact: 'nope' }])).rejects.toMatchObject({
      code: 'BAD_MESSAGE',
    });
    await expect(ai.enrichFindings('not-an-array')).rejects.toMatchObject({ code: 'BAD_MESSAGE' });
  });

  it('rejects when the endpoint origin permission was not granted', async () => {
    const { service, ai } = makeDeps({ contains: false });
    await configured(service);
    await expect(ai.enrichFindings([FINDING])).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
    });
  });

  it('enriches with the resolved key and typed provider errors', async () => {
    const { service, ai, provider } = makeDeps();
    await configured(service);
    const out = await ai.enrichFindings([FINDING]);
    expect(out).toEqual([ENRICHMENT]);
    const enrich = (provider as { enrich: (f: readonly unknown[], c: AiProviderConfig) => Promise<EnrichedFinding[]> }).enrich;
    const config = (enrich as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as AiProviderConfig;
    expect(config.apiKey).toBe('sk-test-key-abcdef'); // device key resolved
    expect(config.baseUrl).toBe('https://api.example.com/v1');

    const failing = makeDeps({
      provider: {
        name: 'fake',
        enrich: vi.fn().mockRejectedValue(new AiError('TIMEOUT', 'The AI endpoint took too long to respond.')),
      } as unknown as AiProvider,
    });
    await configured(failing.service);
    await expect(failing.ai.enrichFindings([FINDING])).rejects.toMatchObject({ code: 'AI_TIMEOUT' });

    const httpFail = makeDeps({
      provider: {
        name: 'fake',
        enrich: vi.fn().mockRejectedValue(new AiError('HTTP', 'The AI endpoint rejected the request (HTTP 401).', 401)),
      } as unknown as AiProvider,
    });
    await configured(httpFail.service);
    await expect(httpFail.ai.enrichFindings([FINDING])).rejects.toMatchObject({
      code: 'AI_REQUEST_FAILED',
    });
  });
});
