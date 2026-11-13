import type { EnrichedFinding } from '../shared/types/ai';
import type { ScanFinding } from '../shared/types/scan';

/**
 * AI-generated guidance for one finding (plan T26). Every string renders as
 * plain text (React escapes output; code shows in <code>). Model content is
 * always labeled as a suggestion with a verify-manually caveat.
 */
export function EnrichmentCard({
  finding,
  enrichment,
  onCopy,
}: {
  finding: ScanFinding;
  enrichment: EnrichedFinding;
  onCopy: (text: string, label: string) => void;
}) {
  function copyFix(): void {
    const parts = [enrichment.suggestedFix];
    if (enrichment.codeSnippet !== undefined) parts.push(enrichment.codeSnippet);
    void onCopy(parts.join('\n\n'), `fix for “${finding.title}”`);
  }

  return (
    <article className="enrichment" aria-label={`AI suggestion for ${finding.title}`}>
      <h3>{finding.title}</h3>
      <p className="enrichment__badge">AI suggestion — verify manually</p>
      <section>
        <h4>What this means</h4>
        <p>{enrichment.explanation}</p>
      </section>
      <section>
        <h4>Why it matters</h4>
        <p>{enrichment.whyItMatters}</p>
      </section>
      <section>
        <h4>Suggested fix</h4>
        <p>{enrichment.suggestedFix}</p>
        {enrichment.codeSnippet !== undefined && (
          <pre className="enrichment__code">
            <code>{enrichment.codeSnippet}</code>
          </pre>
        )}
      </section>
      {enrichment.caution !== undefined && (
        <p className="enrichment__caution">Note: {enrichment.caution}</p>
      )}
      <button type="button" className="btn" onClick={copyFix}>
        Copy fix
      </button>
    </article>
  );
}
