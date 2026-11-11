'use client';

import { CheckCircleIcon, WarningIcon, XCircleIcon } from '@phosphor-icons/react';

/**
 * Rettinger's one severity symbol mapping (U2/S3): FEIL, SJEKK and Løst differ
 * by shape and are always shown with a text label, so colour is never the
 * only signal. Colour comes from the surrounding `data-validation-tone`.
 */
export const GMI_SEVERITY_ICONS = Object.freeze({ error: XCircleIcon, warning: WarningIcon, success: CheckCircleIcon });

/** Tone of one Validator finding: resolved → success, FAIL → error, otherwise warning (SJEKK). */
export const gmiFindingTone = (finding) => finding.transition === 'resolved' ? 'success' : finding.state === 'FAIL' ? 'error' : 'warning';

/** Decorative severity icon (Phosphor Regular). The adjacent text carries the meaning. */
export default function GmiSeverityIcon({ tone, size = 14 }) {
  const Icon = GMI_SEVERITY_ICONS[tone];
  if (!Icon) return null;
  return <Icon size={size} weight="regular" aria-hidden="true" className="gmi-severity-icon" data-severity-icon={tone} />;
}
