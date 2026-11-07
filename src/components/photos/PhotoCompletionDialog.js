'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CheckIcon, XIcon } from '@phosphor-icons/react';
import { photoExportReadiness } from '@/lib/photos/export/photoExportReadiness.mjs';
import { PHOTO_COMPLETION_TARGETS, completionRecommendations, initialCompletionTask, liveSelection, photoCompletionModel, photoCompletionStatus, selectionScope } from '@/lib/photos/photoCompletion.mjs';
import PhotoCaptureMetadataDialog from './PhotoCaptureMetadataDialog';
import { PhotoCompletionContextPanel, PhotoCompletionPhotographerPanel, PhotoCompletionPlacementPanel } from './PhotoCompletionDetailsPanels';
import PhotoCompletionDirectionPanel from './PhotoCompletionDirectionPanel';
import PhotoCompletionTimePanel from './PhotoCompletionTimePanel';
import './photoCompletion.css';

const TASK_NOTES = Object.freeze({
  captureTime: ({ requirement, schemaRequired }) => requirement === 'recommended' && schemaRequired ? 'Kreves av skjemaet, men stopper ikke eksporten.' : null,
  direction: ({ requirement }) => requirement === 'optional' ? 'Ukjent retning utelates fra leveransen.' : null,
  photographer: ({ requirement }) => requirement === 'omitted' ? 'Fotograf eksporteres ikke til dette målet. Verdiene blir i appen.' : requirement === 'optional' ? 'Eksporteres når den er godtatt.' : null,
});

function TaskButton({ task, active, onSelect }) {
  const omitted = task.requirement === 'omitted';
  return <li><button type="button" className="photo-completion-task gmi-focus-ring" data-task={task.key} aria-current={active ? 'true' : undefined} onClick={() => onSelect(task.key)}>
    <span className="photo-completion-task-label">{task.label}<small>{task.requirementLabel}</small></span>
    {task.done && !omitted ? <span className="photo-completion-task-done"><CheckIcon size={15} aria-hidden="true" /><span className="sr-only">Ferdig</span></span>
      : !omitted && !task.empty && <span className="photo-completion-task-count" data-outstanding={task.outstanding}><span className="sr-only">Gjenstår </span>{task.outstanding}</span>}
  </button></li>;
}

// Standalone hub for accepted metadata. It never writes on its own: every value needs an explicit action, and each
// action goes through the session, so readiness and the counts here follow canonical state after any change.
// `entry` is set when the hub comes back from a handoff: { task, selections }. Nothing else survives the trip.
export default function PhotoCompletionDialog({ layer, photos, config, onConfigChange, openerRef, entry = null, onOpenMap, onOpenSources, onClose }) {
  const ref = useRef(null), id = useId();
  const [now] = useState(() => Date.now());
  const [activeKey, setActiveKey] = useState(null);
  const [selections, setSelections] = useState(entry?.selections || {});
  const [resumed] = useState(Boolean(entry));
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const dialog = ref.current, opener = openerRef?.current || document.activeElement;
    dialog.showModal();
    if (resumed) dialog.querySelector('[data-completion-heading]')?.focus();
    return () => { dialog.close(); if (opener?.isConnected) opener.focus(); };
  }, [openerRef, resumed]);

  const readiness = useMemo(() => photoExportReadiness(photos, { profile: config.profile, crs: config.crs, context: config.context, now }), [photos, config, now]);
  const model = useMemo(() => photoCompletionModel(photos, readiness), [photos, readiness]);
  const [initialKey] = useState(() => entry?.task || initialCompletionTask(model.tasks));
  const task = model.tasks.find((item) => item.key === (activeKey || initialKey)) || model.tasks[0];
  const status = photoCompletionStatus(readiness);
  const [returnNote] = useState(() => entry ? `${task.label}: ${task.outstanding} gjenstår.` : '');
  const editing = photos.find((photo) => photo.id === editingId);

  // A saved row can move to Ferdig and take its button along, so focus must land somewhere in the hub.
  useEffect(() => {
    if (!editingId && ref.current?.open && !ref.current.contains(document.activeElement)) ref.current.querySelector('[data-completion-heading]')?.focus();
  }, [editingId]);

  const selected = (key) => liveSelection(model[key].rows, selections[key]);
  const panelProps = (key) => ({ task: model[key], title: task.label, requirementLabel: task.requirementLabel, note: TASK_NOTES[key]?.(model[key]) ?? null,
    excluded: model.excluded, layerId: layer.id, selected: selected(key), scope: selectionScope(model[key].rows, selections[key]), onSelection: (keys) => setSelections((previous) => ({ ...previous, [key]: keys })), onStatus: setMessage });
  const groups = [['main', null], ['other', 'Andre opplysninger']].map(([group, label]) => [label, model.tasks.filter((item) => item.group === group)]).filter(([, tasks]) => tasks.length);

  return <>
    {/* onClose covers a close the browser makes by itself: without a user action since the last Escape it skips cancel. */}
    <dialog ref={ref} className="photo-collection-dialog photo-completion-dialog" aria-labelledby={`${id}-title`} onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={onClose}>
      <div className="photo-collection-frame">
        <header className="photo-collection-header border-b border-gmi-border">
          <div className="min-w-0"><h2 id={`${id}-title`}>Fullfør opplysninger</h2><p className="truncate text-sm text-gmi-text-muted">{layer.name}</p></div>
          <label className="photo-completion-target">Mål
            <select className="gmi-focus-ring" value={config.profile} onChange={(event) => { setMessage(''); onConfigChange({ profile: event.target.value }); }}>
              {PHOTO_COMPLETION_TARGETS.filter((target) => target.tier === 'primary').map((target) => <option key={target.value} value={target.value}>{target.label}</option>)}
              <optgroup label="Flere formater">{PHOTO_COMPLETION_TARGETS.filter((target) => target.tier !== 'primary').map((target) => <option key={target.value} value={target.value}>{target.label}</option>)}</optgroup>
            </select>
          </label>
          <button type="button" className="gmi-focus-ring" aria-label="Lukk Fullfør opplysninger" onClick={onClose}><XIcon size={22} aria-hidden="true" /></button>
        </header>
        <div className="photo-completion-body">
          <nav className="photo-completion-nav" aria-label="Oppgaver">
            {groups.map(([label, tasks]) => <div key={label || 'main'}>
              {label && <p className="photo-completion-nav-label">{label}</p>}
              <ul>{tasks.map((item) => <TaskButton key={item.key} task={item} active={item.key === task.key} onSelect={setActiveKey} />)}</ul>
            </div>)}
          </nav>
          <div className="photo-completion-panel">
            {task.key === 'captureTime' && <PhotoCompletionTimePanel {...panelProps('captureTime')} recommendations={completionRecommendations(readiness, 'captureTime')} onEdit={setEditingId} />}
            {task.key === 'direction' && <PhotoCompletionDirectionPanel {...panelProps('direction')} recommendations={completionRecommendations(readiness, 'direction')} photos={photos} onOpenMap={(handoff) => onOpenMap({ ...handoff, selections })} />}
            {task.key === 'photographer' && <PhotoCompletionPhotographerPanel {...panelProps('photographer')} onEdit={setEditingId} />}
            {task.key === 'placement' && <PhotoCompletionPlacementPanel task={model.placement} title={task.label} requirementLabel={task.requirementLabel} onOpenMap={(handoff) => onOpenMap({ ...handoff, selections })} onOpenSources={() => onOpenSources({ selections })} />}
            {task.key === 'context' && <PhotoCompletionContextPanel title={task.label} requirementLabel={task.requirementLabel} context={config.context}
              missing={readiness.blocking.filter((item) => item.code === 'invalid-context')} onChange={(context) => onConfigChange({ context })} />}
          </div>
        </div>
        <footer className="photo-import-footer border-t border-gmi-border">
          <div className="photo-completion-footer-status">
            <p data-completion-status={status.status}>{status.text}</p>
            <p role="status">{message || returnNote}</p>
          </div>
          <button type="button" className="gmi-primary-control gmi-focus-ring min-h-10 px-4" onClick={onClose}>Lukk</button>
        </footer>
      </div>
    </dialog>
    {editing && <PhotoCaptureMetadataDialog key={editing.assetId} photo={editing} layerId={layer.id} occurrenceCount={photos.filter((photo) => photo.assetId === editing.assetId).length}
      exportProfile={config.profile} onClose={() => setEditingId(null)} onSaved={setMessage} />}
  </>;
}
