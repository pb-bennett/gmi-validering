'use client';

/* eslint-disable @next/next/no-img-element -- Session thumbnail Blob URLs are already derived and browser-owned. */
import { useEffect, useId, useRef, useState } from 'react';
import { ArrowCounterClockwiseIcon, ArrowLeftIcon, ArrowsDownUpIcon, EyeIcon, EyeSlashIcon, FunnelIcon, XIcon } from '@phosphor-icons/react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { normalizePhotoDirection, photoDirectionLabel } from '@/lib/photos/photoDirection.mjs';
import { photoPositionSourceKind, photoPositionSourcePresentation } from '@/lib/photos/photoMarkerPresentation.mjs';
import { gmiObjectContext } from '@/lib/photos/photoImportOutcome.mjs';
import { PHOTO_PLACEMENT_FILTERS, PHOTO_SORT_MODES, photoIsPlaced, photoSortLabel } from '@/lib/photos/photoWorkspaceView.mjs';
import { PHOTO_DELIVERY_FILTERS, PHOTO_DELIVERY_STATUS_LABELS } from '@/lib/photos/photoDeliveryIntent.mjs';
import PhotoIconButton from './PhotoIconButton';
import PhotoWorkspaceToolsMenu from './PhotoWorkspaceToolsMenu';
import RemovePhotosConfirmation from './RemovePhotosConfirmation';
import './photoWorkspace.css';

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

// Only explicit or attention-needing states are shown on a row; the defaults (keep link, not included) stay quiet.
const ROW_DELIVERY = { transfer: 'Til GML', include: 'Tas med', review: 'Gjennomgå' };

export function photoRowLabel(photo, changed, deliveryStatus = null) {
  const placed = photoIsPlaced(photo);
  const degrees = photo.direction?.current?.degrees;
  const repeat = photo.repeatGroup?.occurrenceCount > 1 ? `, plassering ${photo.repeatGroup.occurrenceIndex} av ${photo.repeatGroup.occurrenceCount}` : '';
  return `${photo.originalFilename}, ${placed ? `plassert, ${photoPositionSourcePresentation(photoPositionSourceKind(photo)).label}` : 'uplassert'}`
    + `${degrees != null ? `, retning ${normalizePhotoDirection(degrees)} grader` : ''}${repeat}${changed ? ', endret – ikke lagret' : ''}`
    + `${ROW_DELIVERY[deliveryStatus] ? `, samlet levering: ${PHOTO_DELIVERY_STATUS_LABELS[deliveryStatus].toLowerCase()}` : ''}`;
}

function PhotoRow({ photo, active, tabbable, changed, removal, removalSelected, deliveryMode, deliverySelected, deliveryStatus, onSelect, onToggleRemoval, onToggleDelivery, onKeyDown }) {
  const placed = photoIsPlaced(photo);
  const source = photoPositionSourcePresentation(photoPositionSourceKind(photo));
  const degrees = photo.direction?.current?.degrees;
  const repeated = photo.repeatGroup?.occurrenceCount > 1;
  const context = [photo.occurrence?.object ? gmiObjectContext(photo.occurrence.object) : null,
    repeated ? `${photo.repeatGroup.occurrenceIndex}/${photo.repeatGroup.occurrenceCount}` : null].filter(Boolean).join(' · ');
  return <li data-photo-id={photo.id} className={active ? 'photo-workspace-active' : undefined} data-changed={changed || undefined}>
    {removal && <input type="checkbox" aria-label={`Velg ${photo.originalFilename} for fjerning`} checked={removalSelected} onChange={() => onToggleRemoval(photo.id)} />}
    {deliveryMode && <input type="checkbox" aria-label={`Velg ${photo.originalFilename}${context ? ` (${context})` : ''} for samlet levering`} checked={deliverySelected} onChange={() => onToggleDelivery(photo.id)} />}
    <button type="button" className="photo-workspace-row gmi-focus-ring" aria-label={photoRowLabel(photo, changed, deliveryStatus)} aria-pressed={active}
      tabIndex={tabbable ? 0 : -1} onClick={() => onSelect(photo.id)} onKeyDown={onKeyDown}>
      {photo.preview.thumbnailUrl ? <img src={photo.preview.thumbnailUrl} alt="" loading="lazy" decoding="async" /> : <span className="photo-workspace-thumbnail-empty" aria-hidden="true" />}
      <span className="photo-workspace-row-text">
        <span className="photo-workspace-filename" title={photo.sourceRelativePath || photo.originalFilename}>{photo.originalFilename}</span>
        <span className="photo-workspace-status">
          {placed ? <><span className="photo-source-dot" style={{ background: source.color }} aria-hidden="true" />{source.label}</> : <span className="photo-workspace-unplaced">Uplassert</span>}
          {degrees != null && <> · {photoDirectionLabel(degrees)}</>}
          {changed && <span className="photo-workspace-changed">Endret</span>}
          {ROW_DELIVERY[deliveryStatus] && <span className="photo-delivery-pill" data-delivery-status={deliveryStatus}
            title={PHOTO_DELIVERY_STATUS_LABELS[deliveryStatus]}>{ROW_DELIVERY[deliveryStatus]}</span>}
        </span>
        {context && <span className="photo-workspace-context">{context}</span>}
      </span>
    </button>
  </li>;
}

// Bulk delivery actions for the selected occurrences (M8). Each action applies only to occurrences of its kind,
// and its count is the exact number of occurrences that will change.
function deliveryBulk(selectedIds, entries) {
  const selected = selectedIds.map((id) => entries?.[id]).filter(Boolean);
  const linked = selected.filter((entry) => entry.linked), unlinked = selected.filter((entry) => !entry.linked);
  return {
    linked: linked.length, unlinked: unlinked.length,
    transfer: linked.filter((entry) => entry.canTransfer && entry.status !== 'transfer').map((entry) => entry.photoId),
    keep: linked.filter((entry) => entry.status !== 'keep-link').map((entry) => entry.photoId),
    include: unlinked.filter((entry) => entry.canInclude && entry.status !== 'include').map((entry) => entry.photoId),
    exclude: unlinked.filter((entry) => entry.status === 'include' || entry.status === 'review').map((entry) => entry.photoId),
    blockedTransfer: linked.filter((entry) => !entry.canTransfer).length,
    withoutOccurrence: unlinked.filter((entry) => entry.linkedWithoutOccurrence).length,
  };
}

export function photoDeliverySummaryText(summary) {
  if (!summary) return null;
  const { occurrences, assets } = summary;
  const parts = [];
  if (occurrences.transfer) parts.push(`${occurrences.transfer} overføres til GML${assets.transfer !== occurrences.transfer ? ` (${plural(assets.transfer, 'bilde', 'bilder')})` : ''}`);
  if (occurrences.include) parts.push(`${occurrences.include} tas med uten GMI-lenke`);
  if (occurrences.review) parts.push(`${occurrences.review} krever gjennomgang`);
  return parts.length ? `Samlet levering: ${parts.join(' · ')}` : null;
}

export default function PhotoWorkspaceCollection({ layer, photos, view, workspace, dispatch, editing = false, changedIds, delivery = null, onNotify, onExit, onTool, onSelect }) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [confirmRemoval, setConfirmRemoval] = useState(null);
  const filterId = useId(), sortId = useId();
  const listRef = useRef(null), sortTriggerRef = useRef(null), sortMenuRef = useRef(null);
  const removal = workspace.mode === 'remove';
  const deliveryMode = workspace.mode === 'delivery';
  const deliveryIds = workspace.deliveryIds || [];
  const bulk = deliveryMode ? deliveryBulk(deliveryIds, delivery?.byPhotoId) : null;
  const deliverySummary = photoDeliverySummaryText(delivery?.summary);
  const assetCount = layer.assetCount ?? layer.photoCount;
  const repeats = assetCount < layer.photoCount;
  const filterCount = view.summary.length;
  const shownRows = view.pinned ? [view.pinned, ...view.rows] : view.rows;
  // Roving tabindex: the active row, or the first row when the active one is not shown.
  const tabbableId = shownRows.some((photo) => photo.id === workspace.activePhotoId) ? workspace.activePhotoId : shownRows[0]?.id;
  const clearFilter = () => dispatch({ type: 'filter', filter: { placement: 'all', missingDirection: false, missingCaptureTime: false, repeated: false, changed: false, delivery: 'all', work: null } });
  const removalIds = workspace.removalIds;
  const removalAssets = new Set(photos.filter((photo) => removalIds.includes(photo.id)).map((photo) => photo.assetId));
  const removalHasRepeats = photos.some((photo) => removalIds.includes(photo.id) && photo.repeatGroup?.occurrenceCount > 1);
  const unit = (count) => repeats ? plural(count, 'plassering', 'plasseringer') : plural(count, 'bilde', 'bilder');
  const runDelivery = (ids, run, message) => {
    const result = run(ids);
    if (!result.ok) { onNotify?.('Valget kunne ikke lagres fordi utvalget er endret. Prøv igjen.', 'error'); return; }
    onNotify?.(`${plural(result.changedIds.length, 'plassering', 'plasseringer')} ${message}. Ingen filer er endret.`);
    dispatch({ type: 'select-delivery', photoIds: [] });
  };

  // Map selection keeps its list row in view without moving keyboard focus.
  useEffect(() => {
    const row = listRef.current?.querySelector(`li[data-photo-id="${CSS.escape(workspace.activePhotoId || '')}"]`);
    row?.scrollIntoView?.({ block: 'nearest' });
  }, [workspace.activePhotoId]);

  useEffect(() => {
    if (!sortOpen) return undefined;
    sortMenuRef.current?.querySelector('[aria-checked=true]')?.focus();
    const outside = (event) => { if (!sortMenuRef.current?.contains(event.target) && !sortTriggerRef.current?.contains(event.target)) setSortOpen(false); };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [sortOpen]);

  const rowKeyDown = (event) => {
    const buttons = Array.from(listRef.current?.querySelectorAll('.photo-workspace-row') || []);
    const index = buttons.indexOf(event.currentTarget);
    const target = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: buttons.length - 1 }[event.key];
    if (target === undefined || target < 0 || target >= buttons.length) return;
    event.preventDefault();
    const id = buttons[target].closest('li').dataset.photoId;
    onSelect(id);
    buttons[target].focus();
  };
  const sortKeyDown = (event) => {
    const items = Array.from(sortMenuRef.current?.querySelectorAll('[role=menuitemradio]') || []);
    const index = items.indexOf(document.activeElement);
    const target = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: items.length - 1 }[event.key];
    if (target !== undefined) { event.preventDefault(); items[(target + items.length) % items.length]?.focus(); }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setSortOpen(false); sortTriggerRef.current?.focus(); }
    if (event.key === 'Tab') setSortOpen(false);
  };
  const filter = workspace.filter;
  const setFilter = (patch) => dispatch({ type: 'filter', filter: patch });
  const sortModes = PHOTO_SORT_MODES.filter((mode) => mode.key !== 'object' || view.hasObjects);
  const placementOptions = PHOTO_PLACEMENT_FILTERS.filter((item) => item.key !== 'unknown' || view.counts.unknown > 0);

  return <section className="photo-workspace-collection" aria-label="Bildemodul" data-mode={workspace.mode}
    onKeyDown={(event) => { if (event.key === 'Escape' && (removal || deliveryMode) && !event.defaultPrevented) { event.preventDefault(); dispatch({ type: 'mode', mode: 'browse' }); } }}>
    <header className="photo-workspace-header">
      <div className="photo-workspace-title-row">
        <PhotoIconButton icon={ArrowLeftIcon} size={20} label="Tilbake til appen" onClick={onExit} className="photo-workspace-back" />
        <h1 title={layer.name}>{layer.name}</h1>
        <PhotoIconButton icon={layer.visible ? EyeIcon : EyeSlashIcon} size={18} pressed={!layer.visible}
          label={layer.visible ? `Skjul fotolaget ${layer.name} på kartet` : `Vis fotolaget ${layer.name} på kartet`}
          tooltip={editing ? 'Fotolaget vises mens du redigerer' : layer.visible ? 'Skjul fotolag' : 'Vis fotolag'}
          unavailable={editing} onClick={() => photoSession.setLayerVisibility(layer.id, !layer.visible)} className="photo-workspace-visibility" />
      </div>
      {/* Unique assets first; placements only when an asset is used more than once; unplaced only when there are any. */}
      <p className="photo-workspace-counts">
        <span>{plural(assetCount, 'bilde', 'bilder')}{repeats ? ` · ${plural(layer.photoCount, 'plassering', 'plasseringer')}` : ''}</span>
        {view.counts.unplaced > 0 && <span className="photo-workspace-unplaced-count">{view.counts.unplaced} uplassert</span>}
        {editing && <span className="photo-workspace-editing-pill">Justerer</span>}
      </p>
      {deliverySummary && <p className="photo-delivery-summary" title="Valgene brukes når en samlet leveranse lages senere. Ingen filer er endret.">{deliverySummary}</p>}
      <div className="photo-workspace-toolbar">
        <PhotoWorkspaceToolsMenu occurrenceCount={layer.photoCount} onSelect={onTool} />
        <span className="photo-workspace-toolbar-icons">
          <PhotoIconButton icon={FunnelIcon} label={filterCount ? `Filtrer bilder – ${filterCount} ${filterCount === 1 ? 'filter aktivt' : 'filtre aktive'}` : 'Filtrer bilder'}
            tooltip="Filtrer bilder" expanded={filterOpen} controls={filterId} className={`photo-toolbar-square${view.filterActive ? ' gmi-selected-control' : ''}`}
            onClick={() => { setFilterOpen((value) => !value); setSortOpen(false); }}>
            {view.filterActive && <span aria-hidden="true" className="photo-filter-dot" />}
          </PhotoIconButton>
          <span className="relative">
            <PhotoIconButton buttonRef={sortTriggerRef} icon={ArrowsDownUpIcon} label={`Sorter bilder: ${photoSortLabel(view.sort)}`} tooltip="Sorter bilder"
              expanded={sortOpen} controls={sortOpen ? sortId : undefined} aria-haspopup="menu" className={`photo-toolbar-square${view.sortActive ? ' gmi-selected-control' : ''}`}
              onClick={() => { setSortOpen((value) => !value); setFilterOpen(false); }} />
            {sortOpen && <div ref={sortMenuRef} id={sortId} role="menu" aria-label="Sorter bilder" className="photo-sort-menu gmi-elevated-surface" onKeyDown={sortKeyDown}>
              {sortModes.map((mode) => <button key={mode.key} type="button" role="menuitemradio" aria-checked={view.sort === mode.key} tabIndex={-1}
                className={`gmi-compact-button gmi-focus-ring${view.sort === mode.key ? ' gmi-selected-control font-semibold' : ''}`}
                onClick={() => { dispatch({ type: 'sort', sort: mode.key }); setSortOpen(false); sortTriggerRef.current?.focus(); }}>{mode.label}</button>)}
            </div>}
          </span>
          {(view.filterActive || view.sortActive) && <PhotoIconButton icon={ArrowCounterClockwiseIcon} label="Nullstill filter og sortering"
            className="photo-toolbar-square" onClick={() => dispatch({ type: 'reset-view' })} />}
        </span>
      </div>
      {filterOpen && <div id={filterId} className="photo-filter-panel gmi-elevated-surface">
        <fieldset><legend>Plassering</legend>
          {placementOptions.map((item) => {
            const count = view.counts[item.key];
            return <label key={item.key} data-disabled={(!count && filter.placement !== item.key) || undefined}>
              <input type="radio" name={`${filterId}-placement`} value={item.key} checked={filter.placement === item.key}
                disabled={!count && filter.placement !== item.key && item.key !== 'all'} onChange={() => setFilter({ placement: item.key })} />
              {item.label} ({count})
            </label>;
          })}
        </fieldset>
        <fieldset><legend>Mangler</legend>
          <label><input type="checkbox" checked={filter.missingDirection} onChange={(event) => setFilter({ missingDirection: event.target.checked })} />Retning ({view.counts.missingDirection})</label>
          <label><input type="checkbox" checked={filter.missingCaptureTime} onChange={(event) => setFilter({ missingCaptureTime: event.target.checked })} />Opptakstid ({view.counts.missingCaptureTime})</label>
        </fieldset>
        <fieldset><legend>Annet</legend>
          <label><input type="checkbox" checked={filter.repeated} onChange={(event) => setFilter({ repeated: event.target.checked })} />Flere plasseringer ({view.counts.repeated})</label>
          {filter.work && <label><input type="checkbox" checked onChange={() => setFilter({ work: null })} />{filter.work.label} ({filter.work.ids.size})</label>}
          {editing && <label><input type="checkbox" checked={filter.changed} onChange={(event) => setFilter({ changed: event.target.checked })} />Endret (ikke lagret) ({view.counts.changed})</label>}
        </fieldset>
        {delivery && view.counts.delivery && <fieldset><legend>Samlet levering</legend>
          {PHOTO_DELIVERY_FILTERS.map((item) => {
            const count = view.counts.delivery[item.key], current = (filter.delivery || 'all') === item.key;
            return <label key={item.key} data-disabled={(!count && !current) || undefined}>
              <input type="radio" name={`${filterId}-delivery`} value={item.key} checked={current}
                disabled={!count && !current && item.key !== 'all'} onChange={() => setFilter({ delivery: item.key })} />
              {item.label} ({count})
            </label>;
          })}
        </fieldset>}
      </div>}
      {!filterOpen && view.filterActive && <p className="photo-filter-summary" role="status">
        <span>Viser {view.shownCount} av {view.totalCount} · {view.summary.join(' · ')}</span>
        <PhotoIconButton icon={XIcon} size={14} label="Fjern filter" className="photo-filter-clear" onClick={clearFilter} />
      </p>}
    </header>
    {removal && <div className="photo-removal-bar" role="region" aria-label="Fjern bilder fra laget">
      <p>Velg bilder som skal fjernes</p>
      <span><button type="button" className="gmi-compact-button gmi-focus-ring" onClick={() => dispatch({ type: 'select-removal', photoIds: shownRows.map((photo) => photo.id) })}>Velg alle viste</button>
        <button type="button" className="gmi-compact-button gmi-focus-ring" onClick={() => dispatch({ type: 'mode', mode: 'browse' })}>Avbryt</button></span>
    </div>}
    {deliveryMode && <div className="photo-delivery-bar" role="region" aria-label="Velg samlet levering">
      <p>Velg plasseringer for samlet levering</p>
      <span><button type="button" className="gmi-compact-button gmi-focus-ring" onClick={() => dispatch({ type: 'select-delivery', photoIds: shownRows.map((photo) => photo.id) })}>Velg alle viste</button>
        <button type="button" className="gmi-compact-button gmi-focus-ring" onClick={() => dispatch({ type: 'mode', mode: 'browse' })}>Ferdig</button></span>
      <small>Valgene brukes når en samlet leveranse lages senere. GMI-filen og bildene endres ikke nå.</small>
    </div>}
    <ul ref={listRef} className="photo-workspace-list" aria-label="Bilder i fotokartlaget">
      {view.pinned && <li className="photo-workspace-pinned-heading"><span>Valgt bilde (skjult av filteret)</span>
        <button type="button" className="photo-link-button gmi-focus-ring" onClick={clearFilter}>Vis alle</button></li>}
      {shownRows.map((photo) => <PhotoRow key={photo.id} photo={photo} active={photo.id === workspace.activePhotoId} tabbable={photo.id === tabbableId} changed={changedIds.has(photo.id)}
        removal={removal} removalSelected={removalIds.includes(photo.id)} onSelect={onSelect} onKeyDown={rowKeyDown}
        deliveryMode={deliveryMode} deliverySelected={deliveryIds.includes(photo.id)} deliveryStatus={delivery?.byPhotoId[photo.id]?.status}
        onToggleDelivery={(id) => dispatch({ type: 'toggle-delivery', photoId: id })}
        onToggleRemoval={(id) => dispatch({ type: 'toggle-removal', photoId: id })} />)}
      {!shownRows.length && <li className="photo-workspace-empty">{photos.length ? 'Ingen bilder med dette filteret.' : 'Laget er tomt. Legg til bilder for å fortsette.'}</li>}
    </ul>
    {removal && <div className="photo-removal-actions">
      <button type="button" className="gmi-compact-button gmi-focus-ring photo-removal-primary" disabled={!removalIds.length}
        onClick={() => setConfirmRemoval([...removalIds])}>Fjern {unit(removalIds.length)} fra laget</button>
      {removalHasRepeats && <button type="button" className="gmi-compact-button gmi-focus-ring photo-removal-secondary" onClick={() => {
        setConfirmRemoval(photos.filter((photo) => removalAssets.has(photo.assetId)).map((photo) => photo.id));
      }}>Fjern hele bildet med alle plasseringer ({plural(removalAssets.size, 'bilde', 'bilder')})</button>}
    </div>}
    {deliveryMode && bulk && <div className="photo-delivery-actions" role="group" aria-label="Handlinger for valgte plasseringer">
      <p className="photo-delivery-selection">{deliveryIds.length ? `Valgt: ${unit(deliveryIds.length)}${bulk.linked && bulk.unlinked ? ` · ${bulk.linked} med GMI-lenke, ${bulk.unlinked} uten` : ''}` : 'Ingen plasseringer valgt'}</p>
      {/* Only actions that would change something are offered; each count is the exact number that changes. */}
      {(bulk.transfer.length + bulk.keep.length + bulk.include.length + bulk.exclude.length) > 0 ? <span className="photo-delivery-buttons">
        {bulk.transfer.length > 0 && <button type="button" className="gmi-compact-button gmi-focus-ring photo-delivery-primary"
          onClick={() => runDelivery(bulk.transfer, (ids) => photoSession.setDeliveryIntent(layer.id, ids, 'transfer'), 'merket «Overføres til GML»')}>
          Overfør {unit(bulk.transfer.length)} til GML</button>}
        {bulk.keep.length > 0 && <button type="button" className="gmi-compact-button gmi-focus-ring"
          onClick={() => runDelivery(bulk.keep, (ids) => photoSession.setDeliveryIntent(layer.id, ids, 'keep-link'), 'beholder lenken i GMI')}>
          Behold lenker for {unit(bulk.keep.length)}</button>}
        {bulk.include.length > 0 && <button type="button" className="gmi-compact-button gmi-focus-ring"
          onClick={() => runDelivery(bulk.include, (ids) => photoSession.setCombinedDeliveryInclusion(layer.id, ids, true), 'tas med uten GMI-lenke')}>
          Ta med {unit(bulk.include.length)} uten GMI-lenke</button>}
        {bulk.exclude.length > 0 && <button type="button" className="gmi-compact-button gmi-focus-ring"
          onClick={() => runDelivery(bulk.exclude, (ids) => photoSession.setCombinedDeliveryInclusion(layer.id, ids, false), 'tas ikke med')}>
          Ikke ta med {unit(bulk.exclude.length)}</button>}
      </span> : deliveryIds.length > 0 && <p className="photo-inspector-note">De valgte plasseringene har allerede disse valgene.</p>}
      {bulk.linked > 0 && bulk.unlinked > 0 && <p className="photo-inspector-note">Hver handling gjelder bare plasseringer av riktig type. De andre i utvalget endres ikke.</p>}
      {bulk.blockedTransfer > 0 && <p className="photo-inspector-warning">{unit(bulk.blockedTransfer)} har ingen sikker GMI-kobling nå og kan ikke overføres.</p>}
      {bulk.withoutOccurrence > 0 && <p className="photo-inspector-note">{unit(bulk.withoutOccurrence)} er koblet til GMI uten egen plassering (for eksempel ledning) og beholdes i GMI.</p>}
    </div>}
    {confirmRemoval && <RemovePhotosConfirmation count={confirmRemoval.filter((id) => layer.photoIds.includes(id)).length}
      occurrences={photos.some((photo) => confirmRemoval.includes(photo.id) && photo.repeatGroup?.repeated)}
      onCancel={() => setConfirmRemoval(null)} onConfirm={() => {
        photoSession.removeLayerPhotos(layer.id, confirmRemoval, { confirmed: true });
        setConfirmRemoval(null);
        dispatch({ type: 'mode', mode: 'browse' });
      }} />}
  </section>;
}
