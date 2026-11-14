import type { SettingsSnapshot } from '../shared/types/settings';
import type { ScanFinding } from '../shared/types/scan';
import type { EnrichedFinding } from '../shared/types/ai';
import type { ExtClient } from '../shared/messaging/client';
import type { WriteText } from '../shared/clipboard';
import type { StatusState } from './status';
import { copyForError } from './status';
import { ensureEndpointPermission, describeEndpoint } from '../ai/origin';
import { copyText } from '../shared/clipboard';
import { newId } from '../shared/util';
import { SettingsView } from './SettingsView';
import { StatusRegion } from './StatusRegion';
import { FindingList } from './FindingList';
import { EnrichmentCard } from './EnrichmentCard';
import { LIMITS } from '../shared/validation/limits';
import { useState, useEffect } from 'react';

/**
 * Phase 1–3 side panel. The local scan pipeline is wired end-to-end — Analyze
 * reaches the background and surfaces its typed error — but the scanner itself
 * ships in Phase 2 (T11+), so the panel says so. The AI enrichment flow
 * (Phase 3) activates as soon as findings exist.
 */
export function App({
  client,
  initialFindings = [],
  writeText,
}: {
  client: ExtClient;
  /** Findings would come from a scan result; Phase 2 fills this for real. */
  initialFindings?: readonly ScanFinding[];
  /** Injectable clipboard writer for tests. */
  writeText?: WriteText;
}) {
  const [view, setView] = useState<'main' | 'settings'>('main');
  const [status, setStatus] = useState<StatusState | null>(null);
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [findings, setFindings] = useState<readonly ScanFinding[]>(initialFindings);
  const [scanMeta, setScanMeta] = useState<{ title: string | null; incomplete: number } | null>(null);
  const [enrichments, setEnrichments] = useState<EnrichedFinding[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await client.request({ type: 'GET_SETTINGS', requestId: newId() });
        if (res.ok && 'settings' in res) setSnapshot(res.settings);
      } catch {
        // Settings stay unknown; actions that need them explain the gap.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  async function handleAnalyze(): Promise<void> {
    setBusy(true);
    setStatus({
      tone: 'info',
      text: 'Scanning runs locally in this tab. Nothing is sent to a network service.',
    });
    try {
      const res = await client.request({ type: 'SCAN_ACTIVE_TAB', requestId: newId() });
      if (res.ok && 'scan' in res) {
        setFindings(res.scan.findings);
        setScanMeta({ title: res.scan.pageTitle, incomplete: res.scan.incomplete.length });
        setEnrichments([]);
        setStatus({
          tone: 'success',
          text: `Scan complete: ${res.scan.findings.length} finding(s), ${res.scan.incomplete.length} check(s) need manual review. Automated results are not a compliance certification.`,
        });
      } else if (!res.ok) {
        setStatus({ tone: 'error', text: copyForError(res.error.code, res.error.message) });
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

  function handleCopy(text: string, label: string): void {
    void (async () => {
      const ok = await copyText(text, writeText);
      setStatus(
        ok
          ? { tone: 'success', text: `Copied ${label} to the clipboard.` }
          : {
              tone: 'error',
              text: 'Could not access the clipboard. Select the text manually instead.',
            },
      );
    })();
  }

  async function handleExplainWithAi(): Promise<void> {
    if (findings.length === 0) return;
    const origin = snapshot?.endpointUrl ? describeEndpoint(snapshot.endpointUrl) : null;
    if (!snapshot?.aiConsent) {
      setStatus({
        tone: 'error',
        text: copyForError('CONSENT_REQUIRED', 'Enable AI analysis consent in Settings first.'),
      });
      return;
    }
    if (!snapshot.hasKey || !snapshot.endpointUrl || !snapshot.modelId) {
      setStatus({ tone: 'error', text: copyForError('AI_NOT_CONFIGURED', 'AI is not configured.') });
      return;
    }
    setAiBusy(true);
    setStatus({
      tone: 'info',
      text: origin
        ? `Sending finding evidence to ${origin}. You consented to this in Settings.`
        : 'Sending finding evidence to your AI endpoint.',
    });
    try {
      const permission = await ensureEndpointPermission(snapshot.endpointUrl);
      if (permission === 'denied') {
        setStatus({ tone: 'error', text: copyForError('PERMISSION_DENIED', 'Access denied.') });
        return;
      }
      const res = await client.request({
        type: 'ENRICH_FINDINGS',
        requestId: newId(),
        findings: findings.slice(0, LIMITS.aiMaxFindingsPerRequest),
      });
      if (res.ok && 'enrichments' in res) {
        setEnrichments(res.enrichments);
        setStatus({ tone: 'success', text: 'AI suggestions are ready below.' });
      } else if (!res.ok) {
        setStatus({ tone: 'error', text: copyForError(res.error.code, res.error.message) });
      }
    } catch {
      setStatus({
        tone: 'error',
        text: 'Could not reach the extension background. Try reloading the panel.',
      });
    } finally {
      setAiBusy(false);
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
        onSettingsChanged={setSnapshot}
      />
    );
  }

  const enrichmentById = new Map(enrichments.map((e) => [e.findingId, e]));

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
          AI suggestions: {snapshot?.aiConsent ? 'enabled' : 'off'} — optional. The local scan
          works without any API key. Add your own endpoint in Settings.
        </p>
      </section>

      <section aria-label="Findings">
        {findings.length === 0 ? (
          <p className="panel__meta">
            Findings will appear here after a scan. The page scanner ships in Phase 2 of the
            build plan.
          </p>
        ) : (
          <>
            {scanMeta && (
              <p className="panel__meta">
                {scanMeta.title ? `Report for “${scanMeta.title}”. ` : 'Page report. '}
                {scanMeta.incomplete > 0
                  ? `${scanMeta.incomplete} check(s) could not be verified automatically; review manually. `
                  : ''}
                Automated audit only — not proof of WCAG conformance.
              </p>
            )}
            <FindingList findings={findings} />
            <button
              type="button"
              className="btn"
              onClick={handleExplainWithAi}
              disabled={aiBusy}
            >
              {aiBusy ? 'Asking your AI endpoint\u2026' : 'Explain with AI'}
            </button>
            {enrichments.length > 0 && (
              <div aria-label="AI suggestions">
                {findings.map((f) => {
                  const e = enrichmentById.get(f.id);
                  return e ? (
                    <EnrichmentCard
                      key={f.id}
                      finding={f}
                      enrichment={e}
                      onCopy={handleCopy}
                    />
                  ) : null;
                })}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
