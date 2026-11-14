import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { App } from '../src/components/App';
import { SettingsView } from '../src/components/SettingsView';
import type { ExtClient } from '../src/shared/messaging/client';
import type { ExtRequest, ExtResponse } from '../src/shared/types/messages';

function fakeClient(
  respond: (message: ExtRequest) => ExtResponse,
): { client: ExtClient; calls: ExtRequest[] } {
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

const SNAP = {
  endpointUrl: null,
  modelId: null,
  aiConsent: false,
  keyPreference: 'none' as const,
  hasKey: false,
};

describe('App (side panel shell)', () => {
  it('renders header and primary action', () => {
    const { client } = fakeClient(() => ({ ok: true, requestId: 'r' }));
    render(<App client={client} />);
    expect(screen.getByRole('heading', { name: 'FixFirst' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /analyze this page/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });

  it('renders validated findings returned by the scanner', async () => {
    const scan = {
      scanId: 'scan-1',
      startedAt: new Date().toISOString(),
      pageOrigin: 'https://example.test',
      pageTitle: 'Example',
      summary: {
        counts: { critical: 1, serious: 0, moderate: 0, minor: 0, unknown: 0, needsReview: 0 },
        needsReviewCount: 0,
      },
      findings: [
        {
          id: 'image-alt:0', ruleId: 'image-alt', impact: 'critical', category: 'images',
          title: 'Images must have alternative text', summary: 'Missing alternative text',
          wcagTags: ['wcag2a'], selector: 'img', snippet: '<img>', helpUrl: null, needsReview: false,
        },
      ],
      incomplete: [],
      engineVersion: '4.14.0',
    };
    const { client } = fakeClient((message) =>
      message.type === 'SCAN_ACTIVE_TAB'
        ? { ok: true, requestId: message.requestId, scan }
        : { ok: true, requestId: message.requestId },
    );
    render(<App client={client} />);
    fireEvent.click(screen.getByRole('button', { name: /analyze this page/i }));
    expect(await screen.findByText('Images must have alternative text')).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent(/Scan complete: 1 finding/i);
    expect(client.request).toHaveBeenCalledWith(expect.objectContaining({ type: 'SCAN_ACTIVE_TAB' }));
  });

  it('opens settings with the Settings button', async () => {
    const { client } = fakeClient(() => ({ ok: true, requestId: 'r', settings: SNAP }));
    render(<App client={client} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findByLabelText(/AI endpoint URL/i)).toBeInTheDocument();
  });
});

describe('SettingsView (BYOK surface)', () => {
  it('loads a snapshot and saves settings through the client', async () => {
    const { client, calls } = fakeClient((message) =>
      message.type === 'SAVE_SETTINGS'
        ? {
            ok: true,
            requestId: message.requestId,
            settings: {
              ...SNAP,
              endpointUrl: 'https://api.example.com/v1',
              modelId: 'gpt-4o-mini',
            },
          }
        : { ok: true, requestId: message.requestId, settings: SNAP },
    );
    render(<SettingsView client={client} onBack={() => {}} />);
    const endpoint = await screen.findByLabelText(/AI endpoint URL/i);
    fireEvent.change(endpoint, { target: { value: 'https://api.example.com/v1' } });
    fireEvent.change(screen.getByLabelText(/Model ID/i), { target: { value: 'gpt-4o-mini' } });
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));
    await screen.findByRole('status');
    const save = calls.find((c) => c.type === 'SAVE_SETTINGS');
    expect(save).toBeDefined();
    if (save?.type === 'SAVE_SETTINGS') {
      expect(save.endpointUrl).toBe('https://api.example.com/v1');
      expect(save.modelId).toBe('gpt-4o-mini');
    }
  });

  it('masks the API key input and sends session key without device opt-in', async () => {
    const { client, calls } = fakeClient((message) =>
      message.type === 'SET_API_KEY'
        ? {
            ok: true,
            requestId: message.requestId,
            settings: { ...SNAP, hasKey: true, keyPreference: 'session' as const },
          }
        : { ok: true, requestId: message.requestId, settings: SNAP },
    );
    render(<SettingsView client={client} onBack={() => {}} />);
    const keyInput = await screen.findByLabelText(/New API key/i);
    expect(keyInput).toHaveAttribute('type', 'password');
    fireEvent.change(keyInput, { target: { value: 'sk-test-123' } });
    fireEvent.click(screen.getByRole('button', { name: /save key/i }));
    await screen.findByRole('status');
    const setKey = calls.find((c) => c.type === 'SET_API_KEY');
    expect(setKey).toMatchObject({ type: 'SET_API_KEY', preference: 'session' });
    // The key input is cleared after saving; the snapshot never contains it.
    expect(keyInput).toHaveValue('');
  });

  it('shows a live status region for errors', async () => {
    const { client } = fakeClient(() => ({
      ok: false,
      requestId: 'r',
      error: { code: 'INVALID_SETTINGS', message: 'Some settings are invalid.' },
    }));
    render(<SettingsView client={client} onBack={() => {}} />);
    fireEvent.change(await screen.findByLabelText(/AI endpoint URL/i), {
      target: { value: 'https://x.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));
    const status = await screen.findByRole('status');
    expect(status.textContent).toMatch(/Some settings are invalid/);
  });
});
