import type { StatusState } from './status';

/**
 * Single live region for all scan/settings feedback. Announced politely to
 * screen readers; tone is conveyed by text and styling, never color alone.
 */
export function StatusRegion({ status }: { status: StatusState | null }) {
  if (status === null) return null;
  const prefix = status.tone === 'error' ? 'Error: ' : status.tone === 'success' ? 'Done: ' : '';
  return (
    <p className={`status status--${status.tone}`} role="status" aria-live="polite">
      {prefix}
      {status.text}
    </p>
  );
}
