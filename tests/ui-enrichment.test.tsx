import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../src/components/App';
import type { ExtClient } from '../src/shared/messaging/client';
import type { ExtRequest, ExtResponse } from '../src/shared/types/messages';
import type { ScanFinding } from '../src/shared/types/scan';

const FINDING: ScanFinding = {
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

const ENRICHMENT = {
  findingId: 'f1',
  explanation: 'The image has no text alternative.',
  whyItMatters: 'Screen reader users get no information.',
  suggestedFix: 'Add a descriptive alt attribute.',
  codeSnippet: '<img src="hero.jpg" alt="Team at sunrise">',
  caution: 'Verify the alt text matches the image content.',
};

function fakeClient(respond: (message: ExtRequest) => ExtResponse): { client: ExtClient; calls: ExtRequest[] } {
  const calls: ExtRequest[] = [];
  return {
    calls,
    client: {
      request: vi.fn(async (message) => {
        calls.push(message);
        return respond(message);
      }),
    },
  };
}

const SETTINGS_ON = {
  endpointUrl: 'https://api.example.com/v1',
  modelId: 'gpt-4o-mini',
  aiConsent: true,
  keyPreference: 'device' as const,
  hasKey: true,
};

const SETTINGS_OFF = { ...SETTINGS_ON, aiConsent: false };

describe('AI enrichment flow (Phase 3)', () => {
  it('hides the AI action until findings exist and explains why', () => {
    const { client } = fakeClient((m) =>
      m.type === 'GET_SETTINGS' ? { ok: true, requestId: m.requestId, settings: SETTINGS_ON } : { ok: true, requestId: m.requestId },
    );
    render(<App client={client} />);
    expect(screen.queryByRole('button', { name: /explain with ai/i })).not.toBeInTheDocument();
    expect(screen.getByText(/page scanner ships in Phase 2/i)).toBeInTheDocument();
  });

  it('sends findings for enrichment and renders AI suggestions', async () => {
    const { client, calls } = fakeClient((m) =>
      m.type === 'GET_SETTINGS'
        ? { ok: true, requestId: m.requestId, settings: SETTINGS_ON }
        : m.type === 'ENRICH_FINDINGS'
          ? { ok: true, requestId: m.requestId, enrichments: [ENRICHMENT] }
          : { ok: true, requestId: m.requestId },
    );
    render(<App client={client} initialFindings={[FINDING]} />);
    fireEvent.click(await screen.findByRole('button', { name: /explain with ai/i }));

    expect(await screen.findByText('What this means')).toBeInTheDocument();
    expect(screen.getByText(/no text alternative/)).toBeInTheDocument();
    expect(screen.getByText(/Screen reader users/)).toBeInTheDocument();
    expect(screen.getByText(/descriptive alt attribute/)).toBeInTheDocument();
    expect(screen.getByText('AI suggestion — verify manually')).toBeInTheDocument();
    expect(screen.getByText(/Verify the alt text/)).toBeInTheDocument();

    const enrich = calls.find((c) => c.type === 'ENRICH_FINDINGS');
    expect(enrich).toBeDefined();
    expect(JSON.stringify(enrich)).toContain('"id":"f1"');
    // No full DOM or URL ever leaves — only bounded finding evidence.
    expect(JSON.stringify(enrich)).not.toContain('<html');
  });

  it('blocks the AI flow without consent and directs to settings', async () => {
    const { client, calls } = fakeClient((m) =>
      m.type === 'GET_SETTINGS'
        ? { ok: true, requestId: m.requestId, settings: SETTINGS_OFF }
        : { ok: true, requestId: m.requestId },
    );
    render(<App client={client} initialFindings={[FINDING]} />);
    fireEvent.click(await screen.findByRole('button', { name: /explain with ai/i }));
    const status = await screen.findByRole('status');
    await waitFor(() => expect(status.textContent).toMatch(/Settings first/));
    expect(calls.some((c) => c.type === 'ENRICH_FINDINGS')).toBe(false);
  });

  it('surfaces provider errors while keeping local results', async () => {
    const { client } = fakeClient((m) =>
      m.type === 'GET_SETTINGS'
        ? { ok: true, requestId: m.requestId, settings: SETTINGS_ON }
        : m.type === 'ENRICH_FINDINGS'
          ? { ok: false, requestId: m.requestId, error: { code: 'AI_TIMEOUT', message: 'The AI endpoint took too long to respond.' } }
          : { ok: true, requestId: m.requestId },
    );
    render(<App client={client} initialFindings={[FINDING]} />);
    fireEvent.click(await screen.findByRole('button', { name: /explain with ai/i }));
    const status = await screen.findByRole('status');
    await waitFor(() => expect(status.textContent).toMatch(/too long to respond/));
    expect(screen.queryByText('What this means')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: /detected accessibility findings/i })).toBeInTheDocument();
  });

  it('copies the suggested fix only when the user asks', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const { client } = fakeClient((m) =>
      m.type === 'GET_SETTINGS'
        ? { ok: true, requestId: m.requestId, settings: SETTINGS_ON }
        : m.type === 'ENRICH_FINDINGS'
          ? { ok: true, requestId: m.requestId, enrichments: [ENRICHMENT] }
          : { ok: true, requestId: m.requestId },
    );
    render(<App client={client} initialFindings={[FINDING]} writeText={writeText} />);
    fireEvent.click(await screen.findByRole('button', { name: /explain with ai/i }));
    fireEvent.click(await screen.findByRole('button', { name: /copy fix/i }));
    await screen.findByRole('status');
    await waitFor(() => {
      const status = screen.getByRole('status');
      expect(status.textContent).toMatch(/Copied fix for/i);
    });
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('Add a descriptive alt attribute.'),
    );
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('alt="Team at sunrise"'));
  });
});

describe('UI accessibility assertions (Phase 4, T31/T34)', () => {
  it('keeps severity readable without color alone', () => {
    const { client } = fakeClient((m) =>
      m.type === 'GET_SETTINGS' ? { ok: true, requestId: m.requestId, settings: SETTINGS_ON } : { ok: true, requestId: m.requestId },
    );
    render(<App client={client} initialFindings={[FINDING]} />);
    const list = screen.getByRole('list', { name: /detected accessibility findings/i });
    expect(list.textContent).toContain('Critical'); // text label, not just a color dot
  });

  it('labels every form input in settings', async () => {
    const { client } = fakeClient((m) =>
      m.type === 'GET_SETTINGS' ? { ok: true, requestId: m.requestId, settings: SETTINGS_ON } : { ok: true, requestId: m.requestId },
    );
    render(<App client={client} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findByLabelText(/AI endpoint URL/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Model ID/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/New API key/i)).toBeInTheDocument();
  });
});
