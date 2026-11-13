import type { ScanFinding } from '../shared/types/scan';

const IMPACT_LABEL: Record<ScanFinding['impact'], string> = {
  critical: 'Critical',
  serious: 'Serious',
  moderate: 'Moderate',
  minor: 'Minor',
  unknown: 'Needs check',
  needsReview: 'Needs human review',
};

/**
 * Minimal finding display for the AI flow. Severity is conveyed by text plus
 * a marker, never color alone (plan T17/T34 full finding cards land in Phase 2).
 */
export function FindingList({ findings }: { findings: readonly ScanFinding[] }) {
  return (
    <ul className="finding-list" aria-label="Detected accessibility findings">
      {findings.map((f) => (
        <li key={f.id} className="finding-item">
          <span className="finding-impact" data-impact={f.impact}>
            ● {IMPACT_LABEL[f.impact]}
          </span>{' '}
          <strong>{f.title}</strong>
          <span className="finding-rule"> — rule {f.ruleId}</span>
        </li>
      ))}
    </ul>
  );
}
