'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { XIcon } from '@phosphor-icons/react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { planPhotoExclusion } from '@/lib/photos/photoDeliveryChoice.mjs';
import PhotoIconButton from './PhotoIconButton';

const countLabel = (count, one, many) => `${count} ${count === 1 ? one : many}`;

function ExclusionConfirmation({ request, onCancel, onConfirm }) {
  const ref = useRef(null), titleId = useId(), descriptionId = useId();
  useEffect(() => {
    const dialog = ref.current, opener = document.activeElement;
    dialog.showModal();
    dialog.querySelector('[data-exclusion-cancel]')?.focus();
    return () => {
      dialog.close();
      if (opener?.isConnected) {
        opener.focus();
      }
    };
  }, []);
  return <dialog ref={ref} className="photo-exclusion-confirmation" aria-labelledby={titleId} aria-describedby={descriptionId}
    onKeyDown={(event) => {
      if (event.key === 'Escape') event.stopPropagation();
      if (event.key === 'Tab') {
        const buttons = Array.from(event.currentTarget.querySelectorAll('button:not(:disabled)'));
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}
    onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onCancel(); }}>
    <header><h2 id={titleId}>{request.plan.ok ? request.include ? 'Ta med alle plasseringene igjen?' : 'Ta ut alle plasseringene?' : 'Bildene kan ikke endres'}</h2>
      <PhotoIconButton icon={XIcon} size={20} label="Lukk leveringsvalg" onClick={onCancel} /></header>
    <p id={descriptionId}>{request.plan.ok
      ? `${countLabel(request.plan.assetCount, 'bilde', 'bilder')} · ${countLabel(request.plan.occurrenceCount, 'plassering', 'plasseringer')}. ${countLabel(request.plan.additional.length, 'endring', 'endringer')} gjelder plasseringer som ikke er valgt eller vist. Bildene beholdes i FOTO-arbeidsområdet. Dette er forskjellig fra Fjern fra laget.`
      : 'Ingen leveringsvalg er endret. Avklar alle punktene før du prøver igjen.'}</p>
    <ul>{(request.plan.ok ? request.plan.affected : request.plan.blocked).map((item, index) => {
      const photo = item.photoId ? photoSession.getPhoto(item.photoId) : null;
      return <li key={`${item.photoId || item.assetId || 'blocked'}-${index}`}>
        {photo?.originalFilename || (item.assetId && photoSession.getLayerPhotos(request.layerId).find((row) => row.assetId === item.assetId)?.originalFilename)}
        {item.objectLabel && ` · ${item.objectLabel}`}{item.text && ` · ${item.text}`}
        {!item.objectLabel && photo && ' · Uten GMI-objekt'}
      </li>;
    })}</ul>
    <footer><button type="button" className="gmi-compact-button gmi-focus-ring" data-exclusion-cancel onClick={onCancel}>Avbryt</button>
      {request.plan.ok && <button type="button" className="gmi-primary-control gmi-focus-ring" onClick={onConfirm}>
        {request.include ? 'Ta med igjen' : 'Ta ut av leveransen'}</button>}</footer>
  </dialog>;
}

/** Inspector whole-photo action retains the existing confirmation and atomic session command. */
export default function PhotoExclusionActions({ layerId, selectedIds, visibleIds, delivery, onComplete }) {
  const [request, setRequest] = useState(null), [announcement, setAnnouncement] = useState('');
  const layer = photoSession.getLayer(layerId);
  const plan = planPhotoExclusion(delivery, layer, selectedIds, { visibleIds });
  const apply = (command) => {
    const result = photoSession.setPhotoDeliveryExclusion(layerId, command.ids, { scope: command.scope, include: command.include,
      visibleIds: command.visibleIds, expectedStateKey: command.plan.stateKey });
    setRequest(null);
    if (!result.ok) {
      setRequest({ ...command, plan: { ...result, ok: false } });
      return;
    }
    setAnnouncement(`${countLabel(result.assetCount, 'bilde', 'bilder')} · ${countLabel(result.changedIds.length, 'plassering', 'plasseringer')} ${command.include ? 'tatt med igjen' : 'tatt ut av leveransen'}. Bildene beholdes i FOTO.`);
    onComplete?.();
  };
  const run = (scope, include) => {
    const fresh = planPhotoExclusion(photoSession.getLayerDelivery(layerId), photoSession.getLayer(layerId), selectedIds, { scope, include, visibleIds });
    const command = { layerId, ids: [...selectedIds], scope, include, visibleIds: [...visibleIds], plan: fresh };
    if (!fresh.ok || fresh.needsConfirmation) setRequest(command);
    else apply(command);
  };
  return <div className="photo-exclusion-inspector">
    <p>{plan.occurrenceCount} plasseringer av samme bilde. Andre plasseringer kan bli berørt.</p>
    <button type="button" className="photo-link-button gmi-focus-ring" disabled={!selectedIds.length} onClick={() => run('photo', false)}>
      Ta ut alle plasseringer av bildet</button>
    <p role="status" aria-live="polite">{announcement}</p>
    {request && <ExclusionConfirmation request={request} onCancel={() => setRequest(null)} onConfirm={() => apply(request)} />}
  </div>;
}
