import type { SettingsSnapshot } from '../shared/types/settings';
import type { ExtClient } from '../shared/messaging/client';
import type { StatusState } from './status';
import { copyForError } from './status';
import { SettingsView } from './SettingsView';
import { StatusRegion } from './StatusRegion';
import { useState } from 'react';
import { newId } from '../shared/util';

/**
 * Phase 1 side panel: header, primary Analyze action, settings entry point.
 * The scan pipeline is wired end-to-end — Analyze reaches the background and
 * surfaces its typed error — but the actual scanner ships in Phase 2 (T11+),
 * so the panel says so instead of pretending.
 */
export function App({ client }: { client: ExtClient }) {
  const [view, setView] = useState<'main' | 'settings'>('main');
  const [status, setStatus] = useState<StatusState | null>(null);
  const [aiConsent, setAiConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleAnalyze(): Promise<void> {
    setBusy(true);
    setStatus({
      tone: 'info',
      text: 'Scanning runs locally in this tab. Nothing is sent to a network service.',
    });
    try {
      const res = await client.request({ type: 'SCAN_ACTIVE_TAB', requestId: newId() });
      if (res.ok) {
        setStatus({ tone: 'success', text: 'Scan finished. Report appears below.' });
      } else {
        setStatus({
          tone: 'error',
          text: copyForError(res.error.code, res.error.message),
        });
      }
    } catch {
      setStatus({
        tone: 'error',
        text: 'Could not reach the extension background. Try reloading the panel.',
      });
    } finally {
      setBusy(false);
    }
  }

  if (view === 'settings') {
    return (
      <SettingsView
        client={client}
        onBack={() => {
          setView('main');
          setStatus(null);
        }}
        onSettingsChanged={(snapshot: SettingsSnapshot) => setAiConsent(snapshot.aiConsent)}
      />
    );
  }

  return (
    <main className="panel">
      <header className="panel__header">
        <h1>FixFirst</h1>
        <p className="panel__tagline">Accessibility audit for the page you are on.</p>
      </header>

      <StatusRegion status={status} />

      <section className="panel__actions" aria-label="Page audit">
        <button type="button" className="btn btn--primary" onClick={handleAnalyze} disabled={busy}>
          {busy ? 'Working\u2026' : 'Analyze this page'}
        </button>
        <button type="button" className="btn" onClick={() => setView('settings')}>
          Settings
        </button>
      </section>

      <section className="panel__meta" aria-label="AI status">
        <p>
          AI suggestions: {aiConsent ? 'enabled' : 'off'} — optional. The local scan works without
          any API key. Add your own endpoint in Settings.
        </p>
      </section>
    </main>
  );
}
