'use client';

import { useState } from 'react';
import { ImageIcon, TrashIcon } from '@phosphor-icons/react';
import PhotoIconButton from './PhotoIconButton';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import LayerTypeBadge from '../LayerTypeBadge';
import GmiConfirmDialog from '../gmi-edit/GmiConfirmDialog';

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
          <p className="text-[10px] text-gmi-text-subtle">{layer.assetCount ?? layer.photoCount} bilder{layer.assetCount < layer.photoCount ? ` · ${layer.photoCount} plasseringer` : ''} · {layer.placedCount} plassert · {layer.unplacedCount} uplassert</p>
        </div>
        {/* Compact icon action like the other layer-card actions; the card's own label names the layer. */}
        <PhotoIconButton icon={ImageIcon} size={14} label="Åpne FOTO" tooltip="Åpne bildemodul" data-photo-layer-open={layer.id}
          className="layer-card-icon-button" onClick={(event) => onOpen(layer.id, event.currentTarget)} />
        <PhotoIconButton icon={TrashIcon} size={14} label={`Fjern fotokartlag ${layer.name}`} tooltip="Fjern fotokartlag"
          aria-haspopup="dialog" className="layer-card-icon-button layer-card-icon-button-destructive"
          onClick={() => { if ((layer.assetCount ?? layer.photoCount) > 0) setConfirmRemove(true); else photoSession.deleteLayer(layer.id); }} />
      </div>
      {/* DD2: a FOTO layer with photographs is removed only after the application's confirmation dialog. */}
      {confirmRemove && <GmiConfirmDialog title="Fjerne fotolaget?" confirmLabel="Fjern" testId="photo-layer-remove"
        onCancel={() => setConfirmRemove(false)} onConfirm={() => { setConfirmRemove(false); photoSession.deleteLayer(layer.id); }}>
        <p>Fjerne «{layer.name}» og {layer.assetCount ?? layer.photoCount} {(layer.assetCount ?? layer.photoCount) === 1 ? 'bilde' : 'bilder'}{layer.assetCount < layer.photoCount ? ` med ${layer.photoCount} plasseringer` : ''} fra økten? Posisjoner, opptakstider og andre opplysninger i laget forsvinner. Originalfilene på disken beholdes.</p>
      </GmiConfirmDialog>}
    </section>
  );
}
