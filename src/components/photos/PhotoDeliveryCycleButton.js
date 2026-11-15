'use client';

import { PHOTO_DELIVERY_COLOURS } from '@/lib/photos/photoMarkerPresentation.mjs';
import { photoDeliveryDestination, photoDeliveryStatusText, photoDeliveryToggleTarget, photoDeliveryUnavailableReason } from '@/lib/photos/photoDeliveryChoice.mjs';

// Native Enter/Space activation, shared by list and overlap chooser. The caller reads fresh session evidence on every click.
export default function PhotoDeliveryCycleButton({ entry, label, onCycle }) {
  const destination = photoDeliveryDestination(entry), target = photoDeliveryToggleTarget(entry);
  const nextAction = { gmi: 'å beholde lenken i GMI', gml: 'å ta med plasseringen i GML', excluded: 'å velge Ikke med i leveransen' };
  const action = target ? `Klikk for ${nextAction[target.key]}. Bare denne plasseringen endres. Bildet beholdes i FOTO.`
    : photoDeliveryUnavailableReason(entry);
  const description = `${label}: ${photoDeliveryStatusText(entry)}. ${action}`;
  return <button type="button" className="photo-delivery-pill photo-delivery-row-button gmi-focus-ring"
    data-destination={destination} data-delivery-status={entry.status} aria-disabled={!target || undefined}
    aria-label={description} title={description} onClick={(event) => { event.stopPropagation(); onCycle(entry.photoId); }}>
    {PHOTO_DELIVERY_COLOURS[destination].short}
  </button>;
}
