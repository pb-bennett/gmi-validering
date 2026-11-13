'use client';

import { useEffect, useId } from 'react';
import { gmiObjectLabel } from '@/lib/photos/gmiPhotoSource.mjs';
import { PHOTO_DELIVERY_LABELS } from '@/lib/photos/photoMarkerPresentation.mjs';
import PhotoDeliveryControls from './PhotoDeliveryControls';

const TABS = [['batch', 'Massevalg'], ['decisions', 'Leveringsvalg']];
export default function PhotoDeliveryMapPopup({ members, workspace, layerId, onLayout }) {
  const id = useId(), tab = workspace.deliveryPopupTab || 'batch';
  useEffect(() => { onLayout?.(); }, [tab, onLayout]);
  return <div className="photo-delivery-popup-body">
    <div role="tablist" aria-label="Plasseringer på samme sted" className="photo-delivery-popup-tabs" onKeyDown={(event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 'batch' : event.key === 'End' ? 'decisions' : tab === 'batch' ? 'decisions' : 'batch';
      workspace.onDeliveryPopupTabChange(next);
      event.currentTarget.querySelector(`[data-tab="${next}"]`)?.focus();
    }}>
      {TABS.map(([key, label]) => <button key={key} type="button" role="tab" data-tab={key} id={`${id}-${key}`}
        aria-selected={tab === key} aria-controls={`${id}-panel`} tabIndex={tab === key ? 0 : -1}
        className="gmi-compact-button gmi-focus-ring" onClick={() => workspace.onDeliveryPopupTabChange(key)}>{label}</button>)}
    </div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} tabIndex={0} className="gmi-focus-ring">
      <p className="photo-inspector-note">{members.length} {members.length === 1 ? 'plassering' : 'plasseringer'}</p>
      {members.map((member) => {
        const entry = workspace.delivery?.byPhotoId[member.id];
        const name = `${member.originalFilename}${member.occurrence ? ` · ${gmiObjectLabel(member.occurrence.object)}` : ''}`;
        return <div key={member.id} className="photo-delivery-popup-occurrence" data-occurrence-id={member.id}>
          {tab === 'batch' ? <label><input type="checkbox" checked={workspace.deliveryIds?.includes(member.id) || false}
            onChange={() => workspace.onToggleDelivery(member.id)} /><span>{name}<small>{PHOTO_DELIVERY_LABELS[entry?.status]}</small></span></label>
            : <><p className="photo-delivery-popup-name">{name}</p><PhotoDeliveryControls compact photo={member} layerId={layerId} entry={entry} /></>}
        </div>;
      })}
    </div>
  </div>;
}
