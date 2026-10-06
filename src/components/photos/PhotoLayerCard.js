'use client';

import { useState } from 'react';
import { ImagesIcon, TrashIcon } from '@phosphor-icons/react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import LayerTypeBadge from '../LayerTypeBadge';

export default function PhotoLayerCard({ layer, onOpen }) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  return (
    <section className="border-b-2 border-gmi-border py-1" aria-label={`Fotokartlag ${layer.name}`}>
      <div className="flex items-center gap-2 p-2">
        <input type="checkbox" checked={layer.visible} onChange={(event) => photoSession.setLayerVisibility(layer.id, event.target.checked)}
          aria-label={`Vis lag ${layer.name}`} title="Vis eller skjul bilder med gjeldende posisjon på kartet"
          className="h-3.5 w-3.5 shrink-0 accent-gmi-interactive" />
        <span className="w-2 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5"><LayerTypeBadge layer={layer} /><span className="truncate text-xs font-medium" title={layer.name}>{layer.name}</span></div>
          <p className="text-[10px] text-gmi-text-subtle">{layer.photoCount} bilder · {layer.placedCount} plassert · {layer.unplacedCount} uplassert</p>
        </div>
        <button type="button" onClick={(event) => onOpen(layer.id, event.currentTarget)} title="Åpne bildemodul" aria-label={`Åpne bildemodul for ${layer.name}`} className="gmi-compact-button gmi-focus-ring flex items-center gap-1 px-2 py-1 text-xs"><ImagesIcon size={15} aria-hidden="true" />Bildemodul</button>
        <button type="button" onClick={() => setConfirmRemove(true)} aria-label={`Fjern fotokartlag ${layer.name}`} className="gmi-focus-ring rounded-lg p-1 text-gmi-text-subtle hover:bg-red-100 hover:text-red-600"><TrashIcon size={14} aria-hidden="true" /></button>
      </div>
      {confirmRemove && (
        <div className="mx-2 mb-2 rounded-lg border border-gmi-border bg-gmi-surface-soft p-2 text-xs">
          <p>Fjerne «{layer.name}» og {layer.photoCount} bilder fra økten? Originalfilene på disken beholdes.</p>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmRemove(false)} className="gmi-compact-button gmi-focus-ring px-2 py-1">Avbryt</button>
            <button type="button" onClick={() => photoSession.deleteLayer(layer.id)} className="gmi-focus-ring rounded-lg bg-red-600 px-2 py-1 text-white">Fjern</button>
          </div>
        </div>
      )}
    </section>
  );
}
