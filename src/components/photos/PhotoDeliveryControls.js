'use client';

import { useId } from 'react';
import { WarningIcon } from '@phosphor-icons/react';
import { gmiObjectContext } from '@/lib/photos/photoImportOutcome.mjs';
import { PHOTO_DELIVERY_REASON_TEXT } from '@/lib/photos/photoDeliveryIntent.mjs';
import { photoDeliveryOptions } from '@/lib/photos/photoDeliveryChoice.mjs';
import { photoIsPlaced, photoMissingCaptureTime, photoMissingDirection } from '@/lib/photos/photoWorkspaceView.mjs';
import PhotoDeliveryToggle from './PhotoDeliveryToggle';

// What is still missing for a photo that is meant for the combined FOTO-GML. Shown, never enforced here:
// the combined delivery planner (M9) makes the final, atomic readiness check.
export function photoDeliveryReadiness(photo) {
  return [!photoIsPlaced(photo) && 'godkjent plassering', photoMissingDirection(photo) && 'retning',
    photoMissingCaptureTime(photo) && 'opptakstid'].filter(Boolean);
}

export const photoPlacementName = (photo) => photo.occurrence?.object ? gmiObjectContext(photo.occurrence.object) : 'uten GMI-objekt';

// Per-occurrence delivery choice in the inspector: one compact GMI/GML toggle for the selected placement. Siblings of a
// shared photo show their own state in the occurrence switcher above, so no asset-level state is implied. How links are
// removed is explained in the export wizard; only genuine warnings are repeated here.
export default function PhotoDeliveryControls({ photo, layerId, entry, assetDelivery, onResult }) {
  const notesId = useId();
  if (!entry) return null;
  const missing = ['transfer', 'include'].includes(entry.status) ? photoDeliveryReadiness(photo) : [];
  // A transfer lock is explained once, in the inspector's «Flyttet bildelenke» section.
  const reason = entry.transferLocked ? null : photoDeliveryOptions(entry).find((item) => item.reason)?.reason;
  const exclusionNote = ['exclude', 'not-selected'].includes(entry.status)
    ? assetDelivery?.status === 'partial' ? 'Bare denne plasseringen er ikke med. Bildefilen er fortsatt med via andre plasseringer eller GMI-lenker.'
      : 'Plasseringen er ikke med i leveransen. Bildet beholdes i FOTO-arbeidsområdet.' : null;
  const notes = exclusionNote || entry.proposed || entry.status === 'review' || reason || entry.ambiguousGmiReference || missing.length > 0;
  const target = `${photo.originalFilename}${entry.linked ? ` · ${photoPlacementName(photo)}` : ''}`;
  return <section className="photo-inspector-section photo-delivery-section" aria-label="Samlet levering" data-delivery-status={entry.status}>
    <div className="photo-delivery-row">
      <h3>Samlet levering</h3>
      <PhotoDeliveryToggle entry={entry} layerId={layerId} label={`Leveringsvalg for ${target}`} describedBy={notes ? notesId : undefined} onResult={onResult} />
    </div>
    {notes && <div id={notesId} className="photo-delivery-notes">
      {exclusionNote && <p className="photo-inspector-note">{exclusionNote}</p>}
      {entry.proposed && <p className="photo-inspector-note" data-delivery-proposed>Foreslått GML fordi plasseringen er flyttet fra GMI-punktet. Lagres sammen med plasseringen; GMI-objektet beholdes som opphav.</p>}
      {entry.status === 'review' && <p className="photo-delivery-review" role="note"><WarningIcon size={14} weight="regular" aria-hidden="true" />
        <span><strong>Krever gjennomgang.</strong> {PHOTO_DELIVERY_REASON_TEXT[entry.reason] || 'Valget kan ikke brukes slik det er.'}</span></p>}
      {reason && entry.status !== 'review' && <p className="photo-inspector-note">{reason}</p>}
      {entry.ambiguousGmiReference && <p className="photo-inspector-warning" role="note">GMI-filen refererer et bilde med samme navn, men koblingen er tvetydig.</p>}
      {missing.length > 0 && <p className="photo-inspector-warning" role="note">Mangler for GML: {missing.join(', ')}. Kontrolleres ved eksport; valget beholdes.</p>}
    </div>}
  </section>;
}
