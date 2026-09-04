import type { Provenance } from '@shared/types';
import { provenanceLabel } from '../lib/format.ts';

/**
 * The one component that renders a data-provenance badge. Its copy comes from
 * `provenanceLabel`, so "live" can only ever appear on a field the server
 * actually fetched.
 */
export function ProvenanceBadge({ provenance, note }: { provenance: Provenance; note?: string }) {
  const label = provenanceLabel(provenance);
  const title = note ? `${label.explanation} ${note}` : label.explanation;
  return (
    <span className={`badge badge--${label.tone}`} title={title}>
      {label.short}
    </span>
  );
}
