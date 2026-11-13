'use client';

import { useEffect } from 'react';
import { gmiObjectContext } from '@/lib/photos/photoImportOutcome.mjs';
import { photoDeliveryUnavailableReason, photoStackDeliverySummary } from '@/lib/photos/photoDeliveryChoice.mjs';
import PhotoDeliveryToggle from './PhotoDeliveryToggle';

// Occurrence chooser for an exact-coordinate stack in delivery planning. Every placement is listed with its filename and
// object and has its own direct toggle; changing one never changes another, and there is no group-level action.
export default function PhotoDeliveryMapPopup({ members, workspace, layerId, onLayout }) {
  const entries = workspace.delivery?.byPhotoId;
  const summary = photoStackDeliverySummary(members, entries);
  useEffect(() => { onLayout?.(); }, [summary, onLayout]);
  return <div className="photo-delivery-popup-body" role="group" aria-label="Plasseringer på samme sted">
    <p className="photo-delivery-popup-summary" aria-live="polite">{summary}</p>
    <ul className="photo-delivery-popup-list">{members.map((member) => {
      const entry = entries?.[member.id];
      const object = member.occurrence?.object ? gmiObjectContext(member.occurrence.object) : 'Uten GMI-objekt';
      const reason = photoDeliveryUnavailableReason(entry);
      return <li key={member.id} className="photo-delivery-popup-occurrence" data-occurrence-id={member.id}>
        <p className="photo-delivery-popup-name"><span>{member.originalFilename}</span><small>{object}</small></p>
        {entry && <PhotoDeliveryToggle compact entry={entry} layerId={layerId} label={`Leveringsvalg for ${member.originalFilename} · ${object}`}
          onResult={(result) => workspace.onDeliveryResult?.(member.id, result)} />}
        {reason && <small className="photo-delivery-popup-reason">{reason}</small>}
      </li>;
    })}</ul>
  </div>;
}
