'use client';

import { useId, useState } from 'react';
import { ArrowUUpLeftIcon, ArrowUUpRightIcon, CheckIcon, CrosshairIcon, CursorClickIcon } from '@phosphor-icons/react';
import PhotoIconButton from './PhotoIconButton';
import { photoPositionDistance } from '@/lib/photos/photoPositioning.mjs';
import { isPhotoPosition } from '@/lib/photos/photoSpatial.mjs';
import { normalizePhotoDirection } from '@/lib/photos/photoDirection.mjs';
import { formatPhotoMoveDistance } from '@/lib/photos/photoPresentation.mjs';
import './photoEdit.css';

const textButton = 'photo-edit-button gmi-compact-button gmi-focus-ring';
// Not gmi-compact-button: its light hover background would combine with the primary control's light text.
const primaryButton = 'photo-edit-button gmi-primary-control gmi-focus-ring';

function DirectionField({ photo, onStage }) {
  const id = useId();
  const degrees = photo.direction?.current?.degrees ?? null;
  const [draft, setDraft] = useState(null);
  const commit = () => {
    if (draft === null) return;
    const value = draft.trim() === '' ? null : Number(draft);
    setDraft(null);
    // An empty value is ignored: Edit mode never clears an accepted direction.
    if (value === null || !Number.isFinite(value)) return;
    const next = normalizePhotoDirection(value);
    if (next !== degrees) onStage(photo.id, 'direction', next);
  };
  return <span className="photo-edit-direction-field">
    <label htmlFor={`${id}-direction`}>Retning</label>
    <input id={`${id}-direction`} type="number" inputMode="numeric" min="0" max="359" step="1" value={draft ?? (degrees ?? '')}
      placeholder="–" aria-describedby={`${id}-direction-help`}
      onChange={(event) => setDraft(event.target.value)} onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); commit(); }
        if (event.key === 'Escape' && draft !== null) { event.preventDefault(); setDraft(null); }
      }} />
    <span aria-hidden="true">°</span>
    <span id={`${id}-direction-help`} className="sr-only">0° N · 90° Ø · 180° S · 270° V. Med klokken fra geografisk nord.</span>
  </span>;
}

export default function PhotoEditCommandBar({ photo, siblingCount = 1, changedCount, canUndo, canRedo, onUndo, onRedo, onSave, onDiscard, onExit,
  onStage, onMapCenter, announcement = '', clickMove = false, onClickMove, stackCount = 1 }) {
  const placed = Boolean(photo) && isPhotoPosition(photo.spatial?.current?.position);
  const savedPosition = photo?.saved?.current?.position;
  const moved = placed && photo?.staged?.position && savedPosition ? photoPositionDistance(savedPosition, photo.spatial.current.position) : null;
  const hint = !photo ? 'Velg et bilde i listen eller på kartet.'
    : clickMove ? `Klikk i kartet der ${photo.originalFilename} skal stå. Esc avbryter.`
      : placed ? 'Dra bildet for å flytte, håndtaket for å rotere.'
        : `Klikk i kartet for å plassere ${photo.originalFilename}.`;
  return <div className="photo-edit-command-bar gmi-elevated-surface">
    <div role="toolbar" aria-label="Juster plassering og retning" className="photo-edit-command-row">
      <span className="photo-edit-status"><strong>Justerer</strong>{changedCount > 0 && <> · <span data-edit-count>{changedCount} endret</span></>}</span>
      <span className="photo-edit-history" role="group" aria-label="Endringshistorikk">
      <PhotoIconButton icon={ArrowUUpLeftIcon} label="Angre" tooltip={canUndo ? 'Angre' : 'Angre – ingen endringer å angre'}
        unavailable={!canUndo} keyshortcuts="Control+Z" onClick={onUndo} className="photo-edit-icon" />
      <PhotoIconButton icon={ArrowUUpRightIcon} label="Gjør om" tooltip={canRedo ? 'Gjør om' : 'Gjør om – ingenting å gjøre om'}
        unavailable={!canRedo} keyshortcuts="Control+Shift+Z Control+Y" onClick={onRedo} className="photo-edit-icon" />
      </span>
      <span className="photo-edit-commit-actions" role="group" aria-label="Lagre eller avslutt">
      {changedCount > 0 ? <>
        {/* Narrow maps hide the second word visually; the accessible name stays complete. */}
        <button type="button" aria-label="Forkast endringer" className={`${textButton} border-gmi-border-strong bg-gmi-surface`} onClick={onDiscard}>Forkast<span className="photo-edit-long">&nbsp;endringer</span></button>
        <button type="button" aria-label="Lagre endringer" className={primaryButton} onClick={onSave}><CheckIcon size={14} weight="regular" aria-hidden="true" />Lagre<span className="photo-edit-long">&nbsp;endringer</span></button>
      </> : <button type="button" className={`${textButton} border-gmi-border-strong bg-gmi-surface`} onClick={onExit}>Avslutt redigering</button>}
      </span>
    </div>
    <div className="photo-edit-context-row">
      {photo && <div className="photo-edit-context-actions" role="group" aria-label="Flytt og angi retning">
        {/* Non-drag alternative for crowded places: the next map click moves this photo, through other markers. */}
        {placed && <button type="button" aria-pressed={clickMove} className={`${textButton} border-gmi-border-strong bg-gmi-surface${clickMove ? ' gmi-selected-control' : ''}`}
          onClick={() => onClickMove?.(!clickMove)}><CursorClickIcon size={14} weight="regular" aria-hidden="true" />Flytt med klikk</button>}
        <button type="button" className={`${textButton} border-gmi-border-strong bg-gmi-surface`} onClick={() => {
          const centre = onMapCenter?.();
          if (centre) onStage(photo.id, 'position', centre);
        }}><CrosshairIcon size={14} weight="regular" aria-hidden="true" />{placed ? 'Flytt til kartsenter' : 'Plasser i kartsenter'}</button>
        <DirectionField key={photo.id} photo={photo} onStage={onStage} />
      </div>}
      <p className="photo-edit-hint">{hint}{siblingCount > 1 && <> <span className="photo-edit-sibling-note">Dette bildet har {siblingCount} plasseringer. Du endrer bare denne.</span></>}
        {stackCount > 1 && !clickMove && <> <span className="photo-edit-stack-note" data-stack-count={stackCount}>{stackCount} bilder på samme sted: klikk bildet for å velge neste.</span></>}</p>
      {moved !== null && <p className="photo-edit-moved">Flyttet {formatPhotoMoveDistance(moved)}</p>}
    </div>
    <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
  </div>;
}
