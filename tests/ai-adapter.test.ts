import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompatibleChatProvider, buildCompletionsUrl } from '../src/ai/compatible-provider';
import { AiError } from '../src/ai/provider';
import { buildEnrichmentPrompt } from '../src/ai/prompt';
import type { ScanFinding } from '../src/shared/types/scan';

const KEY = 'sk-test-key-abcdef';

function finding(overrides: Partial<ScanFinding> = {}): ScanFinding {
  return {
    id: 'f1',
    ruleId: 'image-alt',
    impact: 'critical',
    category: 'images',
    title: 'Image missing alternative text',
    summary: 'An img element has no alt attribute.',
    wcagTags: ['wcag2a', '1.1.1'],
    selector: 'img:nth-of-type(2)',
    snippet: '<img src="hero.jpg">',
    helpUrl: null,
    needsReview: false,
    ...overrides,
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function completionsBody(content: string): unknown {
  return { choices: [{ message: { role: 'assistant', content } }] };
}

const CONFIG = { baseUrl: 'https://api.example.com/v1', modelId: 'gpt-4o-mini', apiKey: KEY, timeoutMs: 500 };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildCompletionsUrl', () => {
  it('appends /chat/completions to a base URL and tolerates a trailing slash', () => {
    expect(buildCompletionsUrl('https://api.example.com/v1')).toBe(
      'https://api.example.com/v1/chat/completions',
    );
    expect(buildCompletionsUrl('https://api.example.com/v1/')).toBe(
      'https://api.example.com/v1/chat/completions',
    );
  });

  it('leaves a URL that already ends in /chat/completions untouched', () => {
    expect(buildCompletionsUrl('https://api.example.com/v1/chat/completions')).toBe(
      'https://api.example.com/v1/chat/completions',
    );
  });
});

describe('prompt builder', () => {
  it('labels evidence as untrusted and keeps payloads bounded', () => {
    const prompt = buildEnrichmentPrompt([finding()]);
    expect(prompt.system).toMatch(/ONLY a JSON array/i);
    expect(prompt.system).toMatch(/ignore/i);
    expect(prompt.user).toMatch(/untrusted data/i);
    expect(prompt.user).toContain('"findingId":"f1"');
    expect(prompt.user.length).toBeLessThan(60000);
  });

  it('shrinks evidence when the payload would exceed the cap', () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      finding({ id: `f${i}`, summary: 'x'.repeat(500), snippet: 'y'.repeat(500) }),
    );
    const prompt = buildEnrichmentPrompt(many);
    expect(JSON.stringify(prompt).length).toBeLessThan(200000);
  });
});

describe('CompatibleChatProvider', () => {
  it('sends the documented request shape and returns validated enrichment', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        completionsBody(
          JSON.stringify([
            {
              findingId: 'f1',
              explanation: 'The image has no text alternative.',
              whyItMatters: 'Screen reader users cannot tell what it shows.',
              suggestedFix: 'Add a descriptive alt attribute.',
              codeSnippet: '<img src="hero.jpg" alt="Team hiking at sunrise">',
            },
          ]),
        ),
      ),
    );
    const provider = new CompatibleChatProvider(fetchMock as unknown as typeof fetch);
    const out = await provider.enrich([finding()], CONFIG);

    expect(out).toHaveLength(1);
    expect(out[0]?.suggestedFix).toMatch(/alt attribute/);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].content).toContain('f1');
  });

  it('parses fenced/JSON-wrapped model output', async () => {
    const fenced = '```json\n' + JSON.stringify([
      { findingId: 'f1', explanation: 'e', whyItMatters: 'w', suggestedFix: 's' },
    ]) + '\n```';
    const provider = new CompatibleChatProvider(
      vi.fn().mockResolvedValue(jsonResponse(completionsBody(fenced))) as unknown as typeof fetch,
    );
    const out = await provider.enrich([finding()], CONFIG);
    expect(out[0]?.findingId).toBe('f1');
  });

  it('rejects unknown or oversized output but keeps the failure typed', async () => {
    const badIds = new CompatibleChatProvider(
      vi.fn().mockResolvedValue(
        jsonResponse(completionsBody(JSON.stringify([{ findingId: 'nope', explanation: 'e', whyItMatters: 'w', suggestedFix: 's' }]))),
      ) as unknown as typeof fetch,
    );
    await expect(badIds.enrich([finding()], CONFIG)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });

    const tooLong = new CompatibleChatProvider(
      vi.fn().mockResolvedValue(
        jsonResponse(
          completionsBody(
            JSON.stringify([{ findingId: 'f1', explanation: 'x'.repeat(3000), whyItMatters: 'w', suggestedFix: 's' }]),
          ),
        ),
      ) as unknown as typeof fetch,
    );
    await expect(tooLong.enrich([finding()], CONFIG)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('maps HTTP errors to typed AiError without leaking the key', async () => {
    for (const status of [401, 403, 429, 500]) {
      const provider = new CompatibleChatProvider(
        vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, status)) as unknown as typeof fetch,
      );
      const err = await provider.enrich([finding()], CONFIG).catch((e) => e);
      expect(err).toBeInstanceOf(AiError);
      expect((err as AiError).code).toBe('HTTP');
      expect((err as AiError).status).toBe(status);
      expect(err.message).not.toContain(KEY);
    }
  });

  it('maps network failures and timeouts to typed codes', async () => {
    const offline = new CompatibleChatProvider(
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch,
    );
    await expect(offline.enrich([finding()], CONFIG)).rejects.toMatchObject({ code: 'NETWORK' });

    const slowFetch = vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const provider = new CompatibleChatProvider(slowFetch as unknown as typeof fetch);
    await expect(
      provider.enrich([finding()], { ...CONFIG, timeoutMs: 20 }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('honours external cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    const slowFetch = vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const provider = new CompatibleChatProvider(slowFetch as unknown as typeof fetch);
    await expect(
      provider.enrich([finding()], { ...CONFIG, signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'NETWORK' });
  });
});
