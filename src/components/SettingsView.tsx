import { useEffect, useState } from 'react';
import type { SettingsSnapshot } from '../shared/types/settings';
import type { ExtClient } from '../shared/messaging/client';
import { copyForError, type StatusState } from './status';
import { StatusRegion } from './StatusRegion';
import { newId } from '../shared/util';
import { ensureEndpointPermission, describeEndpoint } from '../ai/origin';

const CONSENT_TEXT =
  'Enabling AI analysis means FixFirst will send bounded evidence about detected issues ' +
  '(rule, impact, a short sanitized element excerpt) to the endpoint you configure, using ' +
  'your API key and your account. Full page HTML, form values, and URLs are never sent. ' +
  'The provider\u2019s own privacy policy governs what it does with the request.';

/**
 * BYOK settings surface (plan T09/T10): endpoint URL, model ID, key handling,
 * and explicit consent before any AI use. Keys are shown masked, never echoed
 * back by the background, and deletable at any time.
 */
export function SettingsView({
  client,
  onBack,
  onSettingsChanged,
}: {
  client: ExtClient;
  onBack: () => void;
  onSettingsChanged?: (snapshot: SettingsSnapshot) => void;
}) {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [endpointUrl, setEndpointUrl] = useState('');
  const [modelId, setModelId] = useState('');
  const [consent, setConsent] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [rememberOnDevice, setRememberOnDevice] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<StatusState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await client.request({ type: 'GET_SETTINGS', requestId: newId() });
        if (res.ok && 'settings' in res) {
          setSnapshot(res.settings);
          setEndpointUrl(res.settings.endpointUrl ?? '');
          setModelId(res.settings.modelId ?? '');
          setConsent(res.settings.aiConsent);
        } else {
          const err = res.ok ? null : res.error;
          setStatus({
            tone: 'error',
            text: err ? copyForError(err.code, err.message) : 'Could not load settings.',
          });
        }
      } catch {
        setStatus({ tone: 'error', text: 'Could not reach the extension background.' });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  function applySnapshot(s: SettingsSnapshot): void {
    setSnapshot(s);
    setConsent(s.aiConsent);
    onSettingsChanged?.(s);
  }

  async function saveSettings(): Promise<void> {
    setBusy(true);
    try {
      const res = await client.request({
        type: 'SAVE_SETTINGS',
        requestId: newId(),
        endpointUrl: endpointUrl.trim() === '' ? null : endpointUrl.trim(),
        modelId: modelId.trim() === '' ? null : modelId.trim(),
        aiConsent: consent,
      });
      if (res.ok && 'settings' in res) {
        applySnapshot(res.settings);
        const endpoint = res.settings.endpointUrl;
        let note = 'Settings saved on this device.';
        if (endpoint !== null) {
          const origin = describeEndpoint(endpoint);
          const outcome = await ensureEndpointPermission(endpoint);
          if (outcome === 'denied') {
            setStatus({ tone: 'error', text: `Saved, but access to ${origin ?? 'the endpoint'} was not granted. AI requests to it will fail until you allow access.` });
            return;
          }
          if (outcome === 'granted') note = `Settings saved. Access to ${origin ?? 'the endpoint'} granted for AI requests.`;
          else if (outcome === 'not-needed') note = 'Settings saved. (Local http endpoints use CORS instead of a browser permission.)';
        }
        setStatus({ tone: 'success', text: note });
      } else {
        const err = res.ok ? null : res.error;
        setStatus({
          tone: 'error',
          text: err ? copyForError(err.code, err.message) : 'Could not save settings.',
        });
      }
    } catch {
      setStatus({ tone: 'error', text: 'Could not reach the extension background.' });
    } finally {
      setBusy(false);
    }
  }

  async function saveKey(): Promise<void> {
    if (keyInput.trim() === '') {
      setStatus({ tone: 'error', text: 'Enter an API key first.' });
      return;
    }
    setBusy(true);
    try {
      const res = await client.request({
        type: 'SET_API_KEY',
        requestId: newId(),
        key: keyInput.trim(),
        preference: rememberOnDevice ? 'device' : 'session',
      });
      if (res.ok && 'settings' in res) {
        applySnapshot(res.settings);
        setKeyInput('');
        setShowKey(false);
        setStatus({
          tone: 'success',
          text:
            res.settings.keyPreference === 'device'
              ? 'API key saved on this device. Delete it any time.'
              : 'API key kept for this session only. It is not written to disk.',
        });
      } else {
        const err = res.ok ? null : res.error;
        setStatus({
          tone: 'error',
          text: err ? copyForError(err.code, err.message) : 'Could not save the API key.',
        });
      }
    } catch {
      setStatus({ tone: 'error', text: 'Could not reach the extension background.' });
    } finally {
      setBusy(false);
    }
  }

  async function clearKey(): Promise<void> {
    setBusy(true);
    try {
      const res = await client.request({ type: 'CLEAR_API_KEY', requestId: newId() });
      if (res.ok && 'settings' in res) {
        applySnapshot(res.settings);
        setKeyInput('');
        setStatus({ tone: 'success', text: 'API key removed from this device and session.' });
      } else {
        setStatus({ tone: 'error', text: 'Could not remove the API key.' });
      }
    } catch {
      setStatus({ tone: 'error', text: 'Could not reach the extension background.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="panel">
      <header className="panel__header">
        <button type="button" className="btn btn--link" onClick={onBack}>
          ← Back
        </button>
        <h1>Settings</h1>
        <p className="panel__tagline">
          AI is optional. The local scan never needs a key and never calls the network.
        </p>
      </header>

      <StatusRegion status={status} />

      <form
        className="settings"
        onSubmit={(e) => {
          e.preventDefault();
          void saveSettings();
        }}
      >
        <div className="field">
          <label htmlFor="endpoint">AI endpoint URL (HTTPS)</label>
          <input
            id="endpoint"
            type="url"
            inputMode="url"
            placeholder="https://api.example.com/v1"
            value={endpointUrl}
            onChange={(e) => setEndpointUrl(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <p className="field__hint">
            Any OpenAI-compatible chat-completions endpoint you control. localhost http is allowed
            for development.
          </p>
        </div>

        <div className="field">
          <label htmlFor="model">Model ID</label>
          <input
            id="model"
            type="text"
            placeholder="gpt-4o-mini"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <p className="field__hint">The model name your provider expects. You pay for usage.</p>
        </div>

        <fieldset className="field">
          <legend>AI analysis consent</legend>
          <label className="choice">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>Allow sending finding evidence to my endpoint when I run AI analysis</span>
          </label>
          <p className="field__hint">{CONSENT_TEXT}</p>
        </fieldset>

        <button type="submit" className="btn btn--primary" disabled={busy}>
          Save settings
        </button>
      </form>

      <section className="settings" aria-label="API key">
        <h2>API key</h2>
        <p>
          Status:{' '}
          {snapshot === null
            ? 'checking\u2026'
            : snapshot.hasKey
              ? 'a key is available for this session/device'
              : 'no key set (local scan still works)'}
          {snapshot?.keyPreference === 'device' ? ' — saved on this device' : ''}
        </p>
        <div className="field">
          <label htmlFor="apikey">New API key</label>
          <div className="field__row">
            <input
              id="apikey"
              type={showKey ? 'text' : 'password'}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="btn"
              onClick={() => setShowKey((v) => !v)}
              aria-pressed={showKey}
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="field__hint">
            Keys are not synced, not logged, and not sent anywhere except the endpoint you set.
          </p>
          <label className="choice">
            <input
              type="checkbox"
              checked={rememberOnDevice}
              onChange={(e) => setRememberOnDevice(e.target.checked)}
            />
            <span>Remember key on this device (unencrypted chrome.storage — opt in explicitly)</span>
          </label>
          <p className="field__hint">
            Without this, the key is kept in memory for this session only and disappears when the
            browser closes the panel or restarts the service worker.
          </p>
        </div>
        <div className="field__row">
          <button type="button" className="btn" onClick={() => void saveKey()} disabled={busy}>
            Save key (this session)
          </button>
          <button type="button" className="btn btn--danger" onClick={() => void clearKey()} disabled={busy}>
            Remove key
          </button>
        </div>
      </section>
    </main>
  );
}
