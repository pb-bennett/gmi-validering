'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { normalizePhotographer } from '@/lib/photos/photoCaptureMetadata.mjs';
import { CAPTURE_TIME_ERRORS, captureTimeFields, captureTimeHelp, composeCaptureTime, hasPlaceholderSeconds } from '@/lib/photos/photoCaptureTimeInput.mjs';
import { formatPhotoCaptureTime, photoMetadataSourceLabel, photoSourceLabel } from '@/lib/photos/photoPresentation.mjs';
import PhotoCaptureTimeField from './PhotoCaptureTimeField';

const button = 'gmi-compact-button gmi-focus-ring min-h-9 border px-3 py-1.5 text-sm font-medium';
const timeText = (value) => formatPhotoCaptureTime(value)?.text || value?.iso || '';

// The initial choice reflects the accepted value: the matching evidence, or "Annen verdi" for a manual value.
function initialChoice(accepted, evidence) {
  if (!accepted) return null;
  const evidenceId = accepted.provenance?.evidenceId;
  return evidenceId && evidence.some((item) => item.id === evidenceId && item.value) ? `evidence:${evidenceId}` : 'other';
}

function Choice({ name, value, checked, onChange, children, disabled = false, className = '' }) {
  return <label className={`photo-metadata-choice${className ? ` ${className}` : ''}`} data-disabled={disabled || undefined}>
    <input type="radio" name={name} value={value} checked={checked} disabled={disabled} onChange={() => onChange(value)} />
    <span>{children}</span>
  </label>;
}

// Asset-level capture metadata for the selected photo. A canonical, explicit replacement written with
// setCaptureMetadata on save; it is never part of the Edit-mode transaction.
export default function PhotoCaptureMetadataDialog({ photo, layerId, occurrenceCount = 1, exportProfile, onClose, onSaved }) {
  const ref = useRef(null);
  const id = useId();
  const accepted = photo.captureMetadata || {};
  const timeEvidence = (photo.metadataEvidence || []).filter((item) => item.field === 'captureTime');
  const nameEvidence = (photo.metadataEvidence || []).filter((item) => item.field === 'photographer');
  const [timeChoice, setTimeChoice] = useState(() => initialChoice(accepted.captureTime, timeEvidence));
  const timePrefill = accepted.captureTime?.value || timeEvidence.find((item) => item.value)?.value;
  const [timeFields, setTimeFields] = useState(() => captureTimeFields(timePrefill?.iso));
  const [timeEdited, setTimeEdited] = useState(false);
  // A genuine :00 looks exactly like the prefill, so it is confirmed outright. It is saved as manual, never as the source's value.
  const [zeroSecondsConfirmed, setZeroSecondsConfirmed] = useState(false);
  const [nameChoice, setNameChoice] = useState(() => initialChoice(accepted.photographer, nameEvidence));
  const [nameText, setNameText] = useState(() => accepted.photographer?.value || nameEvidence.find((item) => item.value)?.value || '');
  const [errors, setErrors] = useState({});
  // Untouched fields are never written, so Save alone can never turn evidence provenance into "manual".
  const [touched, setTouched] = useState({});
  const touch = (field, setter) => (value) => { setTouched((previous) => ({ ...previous, [field]: true })); setter(value); };
  const changeTimeFields = touch('captureTime', (fields) => { if (fields.time !== timeFields.time) setTimeEdited(true); setTimeFields(fields); });
  const secondsUnknown = !timeEdited && hasPlaceholderSeconds(timePrefill, timeFields);

  useEffect(() => {
    const dialog = ref.current, opener = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); if (opener?.isConnected) opener.focus(); };
  }, []);

  // Each field yields null (unchanged) or the exact setCaptureMetadata arguments.
  function plannedWrite(field, choice, manualInput) {
    const current = accepted[field];
    if (!choice || !touched[field]) return { write: null };
    if (choice === 'remove') return { write: current ? { input: null } : null };
    if (choice.startsWith('evidence:')) {
      const evidenceId = choice.slice('evidence:'.length);
      return { write: current?.provenance?.evidenceId === evidenceId ? null : { input: null, evidenceId } };
    }
    if (field === 'captureTime') {
      if (secondsUnknown && !zeroSecondsConfirmed) return { error: CAPTURE_TIME_ERRORS['missing-seconds'] };
      const composed = composeCaptureTime(manualInput);
      if (!composed.ok) return { error: CAPTURE_TIME_ERRORS[composed.error] };
      const same = current?.provenance?.kind === 'manual' && current.value.iso === composed.value.iso;
      return { write: same ? null : { input: composed.value.iso } };
    }
    const value = normalizePhotographer(manualInput);
    if (!value) return { error: 'Skriv inn et navn, eller velg en kildeverdi.' };
    return { write: current?.provenance?.kind === 'manual' && current.value === value ? null : { input: value } };
  }

  const save = (event) => {
    event.preventDefault();
    const time = plannedWrite('captureTime', timeChoice, timeFields), name = plannedWrite('photographer', nameChoice, nameText);
    const nextErrors = { captureTime: time.error, photographer: name.error };
    setErrors(nextErrors);
    if (time.error || name.error) return;
    const writes = [['captureTime', time.write], ['photographer', name.write]].filter(([, write]) => write);
    for (const [field, write] of writes) {
      const result = photoSession.setCaptureMetadata(layerId, [photo.id], field, write.input, write.evidenceId ? { evidenceId: write.evidenceId } : undefined);
      if (!result.ok) { setErrors({ [field]: 'Verdien kunne ikke lagres. Kildeverdien er endret eller ugyldig.' }); return; }
    }
    if (writes.length) onSaved?.(`Opptaksdata lagret for ${photo.originalFilename}`);
    onClose();
  };

  // onClose covers a close the browser makes by itself: without a user action since the last Escape it skips cancel.
  return <dialog ref={ref} className="photo-metadata-dialog" aria-labelledby={`${id}-title`} onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={onClose}>
    <form onSubmit={save} className="photo-metadata-form">
      <header><h2 id={`${id}-title`}>Rediger opptaksdata</h2><p className="break-all">{photo.originalFilename}</p></header>
      <div className="photo-metadata-body">
        <fieldset>
          <legend>Opptakstid</legend>
          <p className="photo-metadata-current">Godtatt: {accepted.captureTime ? `${timeText(accepted.captureTime.value)} · ${photoMetadataSourceLabel('captureTime', accepted.captureTime.provenance)}` : 'Ikke angitt'}</p>
          {timeEvidence.map((evidence) => <Choice key={evidence.id} name={`${id}-time`} value={`evidence:${evidence.id}`} checked={timeChoice === `evidence:${evidence.id}`}
            onChange={touch('captureTime', setTimeChoice)} disabled={!evidence.value}>
            {photoSourceLabel(evidence.kind)}{evidence.sourceFilename ? ` · ${evidence.sourceFilename}` : ''}: {evidence.value ? timeText(evidence.value) : `${typeof evidence.raw === 'string' ? evidence.raw : JSON.stringify(evidence.raw)} (kan ikke tolkes sikkert)`}
          </Choice>)}
          <Choice name={`${id}-time`} value="other" checked={timeChoice === 'other'} onChange={touch('captureTime', setTimeChoice)}>Annen verdi</Choice>
          {timeChoice === 'other' && <PhotoCaptureTimeField value={timeFields} onChange={changeTimeFields} error={errors.captureTime} help={captureTimeHelp(exportProfile)} />}
          {timeChoice === 'other' && secondsUnknown && <label className="photo-metadata-seconds">
            <input type="checkbox" checked={zeroSecondsConfirmed} onChange={(event) => { setZeroSecondsConfirmed(event.target.checked); setErrors((previous) => ({ ...previous, captureTime: undefined })); }} />
            <span>Sekundene er 00 <span className="photo-metadata-consequence">Kilden oppgir bare minutter. Dette lagres som din manuelle verdi, ikke som kildens.</span></span>
          </label>}
          {accepted.captureTime && <Choice name={`${id}-time`} value="remove" checked={timeChoice === 'remove'} onChange={touch('captureTime', setTimeChoice)} className="photo-metadata-remove">
            Fjern godtatt opptakstid <span className="photo-metadata-consequence">Hentes ikke inn automatisk igjen. Kan blokkere eksport for Legacy og AsBuilt.</span>
          </Choice>}
          {timeChoice !== 'other' && errors.captureTime && <p role="alert" className="photo-capture-time-error">{errors.captureTime}</p>}
        </fieldset>
        <fieldset>
          <legend>Fotograf</legend>
          <p className="photo-metadata-current">Godtatt: {accepted.photographer ? `${accepted.photographer.value} · ${photoMetadataSourceLabel('photographer', accepted.photographer.provenance)}` : 'Ikke angitt'}</p>
          {nameEvidence.map((evidence) => <Choice key={evidence.id} name={`${id}-name`} value={`evidence:${evidence.id}`} checked={nameChoice === `evidence:${evidence.id}`}
            onChange={touch('photographer', setNameChoice)} disabled={!evidence.value}>
            {photoSourceLabel(evidence.kind)}: {evidence.value || 'kan ikke tolkes sikkert'}
          </Choice>)}
          <Choice name={`${id}-name`} value="other" checked={nameChoice === 'other'} onChange={touch('photographer', setNameChoice)}>Annen verdi</Choice>
          {nameChoice === 'other' && <label className="photo-metadata-text">Navn
            <input className="gmi-focus-ring rounded border border-gmi-border-strong bg-gmi-surface px-2 py-1 text-sm" value={nameText} onChange={(event) => touch('photographer', setNameText)(event.target.value)} autoComplete="off" />
          </label>}
          {accepted.photographer && <Choice name={`${id}-name`} value="remove" checked={nameChoice === 'remove'} onChange={touch('photographer', setNameChoice)} className="photo-metadata-remove">
            Fjern godtatt fotograf
          </Choice>}
          {errors.photographer && <p role="alert" className="photo-capture-time-error">{errors.photographer}</p>}
        </fieldset>
      </div>
      <footer>
        <p>{occurrenceCount > 1 ? `Gjelder alle ${occurrenceCount} plasseringer av bildet.` : 'Gjelder bildet.'} Originalfilen endres ikke.</p>
        <div><button type="button" className={`${button} border-gmi-border-strong bg-gmi-surface`} onClick={onClose}>Avbryt</button>
          <button type="submit" className={`${button} gmi-primary-control border-gmi-navy`}>Lagre</button></div>
      </footer>
    </form>
  </dialog>;
}
