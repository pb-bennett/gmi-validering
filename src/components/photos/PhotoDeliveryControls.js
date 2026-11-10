'use client';

import { useId } from 'react';
import { WarningIcon } from '@phosphor-icons/react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { gmiObjectContext } from '@/lib/photos/photoImportOutcome.mjs';
import { PHOTO_DELIVERY_REASON_TEXT, PHOTO_DELIVERY_STATUS_LABELS } from '@/lib/photos/photoDeliveryIntent.mjs';
import { photoIsPlaced, photoMissingCaptureTime, photoMissingDirection } from '@/lib/photos/photoWorkspaceView.mjs';

// What is still missing for a photo that is meant for the combined FOTO-GML. Shown, never enforced here:
// the combined delivery planner (M9) makes the final, atomic readiness check.
export function photoDeliveryReadiness(photo) {
  return [!photoIsPlaced(photo) && 'godkjent plassering', photoMissingDirection(photo) && 'retning',
    photoMissingCaptureTime(photo) && 'opptakstid'].filter(Boolean);
}

const placementName = (photo) => photo.occurrence?.object ? gmiObjectContext(photo.occurrence.object) : 'uten GMI-objekt';

// Per-occurrence delivery choice in the inspector. Each occurrence of a shared photo has its own choice;
// the other occurrences are listed with theirs so that no asset-level state is implied.
export default function PhotoDeliveryControls({ photo, layerId, entry, siblings = [], entries = {}, onSelect }) {
  const name = useId();
  if (!entry) return null;
  const others = siblings.filter((sibling) => sibling.id !== photo.id);
  const missing = ['transfer', 'include'].includes(entry.status) ? photoDeliveryReadiness(photo) : [];
  const object = entry.association.objectLabel ? placementName(photo) : null;
  const setIntent = (intent) => photoSession.setDeliveryIntent(layerId, [photo.id], intent);
  return <section className="photo-inspector-section photo-delivery-section" aria-label="Samlet levering" data-delivery-status={entry.status}>
    <h3>Samlet levering<span className="photo-inspector-scope">gjelder denne plasseringen</span></h3>
    {entry.linked ? <>
      <fieldset className="photo-delivery-choice">
        <legend className="sr-only">Levering av bildet for {object}</legend>
        <label><input type="radio" name={name} checked={entry.status === 'keep-link'} onChange={() => setIntent('keep-link')} />Behold lenke i GMI</label>
        <label data-disabled={!entry.canTransfer || undefined}>
          <input type="radio" name={name} checked={entry.status === 'transfer'} disabled={!entry.canTransfer}
            onChange={() => setIntent('transfer')} />Overfør til GML
        </label>
      </fieldset>
      {entry.status === 'transfer' ? <p className="photo-inspector-note">Bildet er tenkt levert i FOTO-GML. Lenken fra {object} fjernes først når en samlet leveranse lages senere. GMI-filen er ikke endret.</p>
        : entry.status === 'keep-link' ? <p className="photo-inspector-note">Lenken fra {object} beholdes i GMI-filen.</p> : null}
      {entry.status === 'review' && <p className="photo-delivery-review" role="note"><WarningIcon size={14} weight="regular" aria-hidden="true" />
        <span><strong>Krever gjennomgang.</strong> {PHOTO_DELIVERY_REASON_TEXT[entry.reason] || 'Valget kan ikke brukes slik det er.'} Velg «Behold lenke i GMI» eller koble kilden på nytt.</span></p>}
      {entry.status !== 'review' && !entry.canTransfer && <p className="photo-inspector-note">Overføring er ikke mulig nå: {PHOTO_DELIVERY_REASON_TEXT[entry.association.state] || 'GMI-koblingen er ikke sikker.'}</p>}
    </> : entry.linkedWithoutOccurrence ? <p className="photo-inspector-note">{PHOTO_DELIVERY_REASON_TEXT['linked-without-occurrence']}</p>
      : <>
        <label className="photo-delivery-include">
          <input type="checkbox" checked={entry.status === 'include'} onChange={(event) => photoSession.setCombinedDeliveryInclusion(layerId, [photo.id], event.target.checked)} />
          Ta med i samlet levering
        </label>
        <p className="photo-inspector-note">Bildet har ingen GMI-lenke. Er det valgt, blir det med i FOTO-GML når en samlet leveranse lages senere.</p>
        {entry.status === 'review' && <p className="photo-delivery-review" role="note"><WarningIcon size={14} weight="regular" aria-hidden="true" />
          <span><strong>Krever gjennomgang.</strong> {PHOTO_DELIVERY_REASON_TEXT[entry.reason]}</span></p>}
        {entry.ambiguousGmiReference && <p className="photo-inspector-warning" role="note">GMI-filen refererer et bilde med samme navn, men koblingen er tvetydig.</p>}
      </>}
    {missing.length > 0 && <p className="photo-inspector-warning" role="note">Mangler foreløpig {missing.join(', ')}. Dette kontrolleres når samlet levering lages; valget ditt beholdes.</p>}
    {others.length > 0 && <div className="photo-delivery-siblings">
      <p>Andre plasseringer av samme bilde</p>
      <ul>{others.map((sibling) => <li key={sibling.id}>
        <button type="button" className="photo-link-button gmi-focus-ring" onClick={() => onSelect?.(sibling.id)}>{placementName(sibling)}</button>
        <span data-delivery-status={entries[sibling.id]?.status}>{PHOTO_DELIVERY_STATUS_LABELS[entries[sibling.id]?.status] || ''}</span>
      </li>)}</ul>
    </div>}
  </section>;
}
