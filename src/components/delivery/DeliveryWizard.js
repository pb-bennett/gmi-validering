'use client';

import { useEffect, useId, useReducer, useRef, useState } from 'react';
import { XIcon } from '@phosphor-icons/react';
import useStore from '@/lib/store';
import { gmiEditSessions } from '@/lib/gmiEditSessions.mjs';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { isLoadedGmiSurveyLayer } from '@/lib/photos/loadedGmiSource.mjs';
import { DEFAULT_PHOTO_EXPORT_CONFIG } from '@/lib/photos/photoExportConfig.mjs';
import { photosBeingRead, photoReadingNote, photoCount, placementCount } from '@/lib/photos/photoCompletion.mjs';
import { PHOTO_EXPORT_PROFILE_METADATA } from '@/lib/photos/export/photoExportRules.mjs';
import { photoExportDeliveryReadiness, photoExportDeliveryModel } from '@/lib/photos/photoExportWizard.mjs';
import { captureDeliverySnapshot, buildDeliveryPlan } from '@/lib/delivery/index.mjs';
import { DELIVERY_CHOICES, DELIVERY_STEPS, DELIVERY_WIZARD_START, deliveryWizardReducer, deliveryWizardStatus,
  deliveryContents, deliveryDiagnostics, deliveryMessage, deliveryReport, deliverySummary, initiateDeliveryDownload } from '@/lib/delivery/deliveryWizard.mjs';
import usePhotoSession from '@/components/photos/usePhotoSession';
import useGmiEditLayer from '@/components/gmi-edit/useGmiEditLayer';
import PhotoWizardSteps from '@/components/photos/PhotoWizardSteps';
import PhotoSourceOption, { photoSourceButton } from '@/components/photos/PhotoSourceOption';
import { PhotoExportSettings } from '@/components/photos/PhotoExportDeliveryStep';
import PhotoExportStatus, { PhotoExportDiagnostics, PhotoExportTone } from '@/components/photos/PhotoExportStatus';
import { ignoreFollowUpClick } from '@/components/photos/photoFollowUpClick';
import '@/components/photos/photoCollectionPanel.css';
import '@/components/photos/photoExportWizard.css';
import './deliveryWizard.css';

const primary = 'gmi-primary-control gmi-focus-ring min-h-10 px-4';
const HEADINGS = { building: 'Kontrollerer leveransen …', packaging: 'Lager leveransen …', blocked: 'Leveransen er blokkert',
  failed: 'Kontrollen kunne ikke fullføres', stale: 'Kontrollen er utdatert', ready: 'Leveransen er kontrollert',
  done: 'Nedlastingen er startet', 'download-failed': 'Nedlastingen kunne ikke startes' };
function initialSurvey(photoId) {
  const ids = [...new Set(photoSession.getLayer(photoId)?.spatialSources.filter((source) => source.kind === 'gmi' && source.loadedBinding?.live !== false)
    .map((source) => source.loadedBinding?.layerId).filter(Boolean) ?? [])];
  return ids.length === 1 ? ids[0] : '';
}

function Diagnostics({ plan, snapshot }) {
  const groups = deliveryDiagnostics(plan);
  return Object.entries(groups).map(([key, items]) => items.length > 0 && <section key={key} className="delivery-diagnostics" data-tone={key}
    aria-label={({ errors: 'Feil', warnings: 'Advarsler', info: 'Informasjon' })[key]}>
    <h4>{({ errors: 'Må rettes', warnings: 'Bør kontrolleres', info: 'Informasjon' })[key]} ({items.length})</h4>
    <ul>{items.map((item, index) => {
      const ref = snapshot.source?.references.find((entry) => entry.id === item.referenceId);
      const occurrence = snapshot.photo?.occurrences.find((entry) => entry.occurrenceId === (item.occurrenceId ?? item.photoId));
      const asset = snapshot.photo?.assets.find((entry) => entry.assetId === (item.assetId ?? occurrence?.assetId));
      const name = ref?.filename ?? asset?.originalFilename;
      return <li key={`${item.code}:${index}`} data-diagnostic-code={item.code}>{name && <strong>{name}: </strong>}{item.text}</li>;
    })}</ul>
  </section>);
}

/** Both entry points use this modal and the same M9 service. No source data or
 * export plans enter the persistent store; returning to Innhold drops review.
 */
export default function DeliveryWizard({ initialMode = 'photos-only', initialPhotoLayerId = '', initialSurveyLayerId = '',
  config: suppliedConfig, onConfigChange, openerRef, resumed = false, onOpenCompletion, onClose }) {
  'use no memo';
  const ref = useRef(null), id = useId(), work = useRef({ active: false, token: 0, busy: false }), urls = useRef(new Set());
  const [mode, setMode] = useState(initialMode);
  const [photoId, setPhotoId] = useState(initialPhotoLayerId || (() => photoSession.getSnapshot().photoLayers[0]?.id ?? ''));
  const [surveyId, setSurveyId] = useState(() => initialSurveyLayerId || initialSurvey(initialPhotoLayerId));
  const [localConfig, setLocalConfig] = useState(DEFAULT_PHOTO_EXPORT_CONFIG);
  const [excluded, setExcluded] = useState(null);
  const [reportError, setReportError] = useState(null);
  const [state, dispatch] = useReducer(deliveryWizardReducer, DELIVERY_WIZARD_START);
  const layers = useStore((store) => store.layers);
  const photos = usePhotoSession();
  const gmi = useGmiEditLayer(surveyId, { autoOpen: mode !== 'photos-only' });
  const hasGmi = mode !== 'photos-only', hasPhoto = mode !== 'gmi-only';
  const photoLayer = photoSession.getLayer(photoId);
  const layerPhotos = photoLayer ? photoSession.getLayerPhotos(photoId) : [];
  const config = suppliedConfig && photoId === initialPhotoLayerId ? suppliedConfig : localConfig;
  const changeConfig = (patch) => {
    if (onConfigChange && photoId === initialPhotoLayerId) onConfigChange(patch);
    else setLocalConfig((current) => ({ ...current, ...patch }));
  };
  const fieldCount = gmi.status?.changedCells ?? 0;
  const needsExclusion = mode === 'split' && (gmi.status?.changeSetCount ?? 0) > 0;
  // A changed session requires renewed acknowledgement, even after an undo/redo.
  const exclusionKey = `${surveyId}:${gmi.status?.stateKey ?? ''}`;
  const waiting = hasPhoto && photosBeingRead(layerPhotos) > 0;
  const status = deliveryWizardStatus(state), busy = ['building', 'packaging'].includes(status);
  const readinessPhotos = mode === 'photos-only' || !state.review ? layerPhotos
    : layerPhotos.filter((photo) => state.review.plan.photoPlan?.occurrences.some((row) => row.occurrenceId === photo.id));
  const photoReadiness = hasPhoto && photoLayer ? photoExportDeliveryReadiness(readinessPhotos, config, Date.now()) : null;
  const photoModel = photoReadiness ? photoExportDeliveryModel({ photos: layerPhotos, readiness: photoReadiness }) : null;
  const canBuild = (!hasGmi || gmi.descriptor?.state === 'editable') && (!hasPhoto || photoLayer)
    && (!needsExclusion || excluded === exclusionKey) && !waiting && (mode !== 'photos-only' || photoModel?.advance.enabled);
  const decision = photoLayer ? photoSession.getLayerDelivery(photoId)?.summary : null;

  useEffect(() => {
    const dialog = ref.current, opener = openerRef?.current || document.activeElement, current = work.current, activeUrls = urls.current;
    current.active = true; dialog.showModal();
    return () => {
      current.active = false; current.token++; dialog.close();
      for (const url of activeUrls) URL.revokeObjectURL(url);
      activeUrls.clear(); if (opener?.isConnected) opener.focus();
    };
  }, [openerRef]);
  useEffect(() => { ref.current.querySelector('[data-export-heading]')?.focus(); }, [state.step]);
  // Readiness/liveness is read on every owner publication, and on visibility
  // return. This also catches a registry invalidation without a page transition.
  const [, refresh] = useState(0);
  useEffect(() => {
    const update = () => refresh((revision) => revision + 1);
    window.addEventListener('focus', update);
    return () => window.removeEventListener('focus', update);
  }, []);

  const saveFile = (blob, filename) => {
    const url = URL.createObjectURL(blob); urls.current.add(url);
    const link = document.createElement('a'); link.href = url; link.download = filename;
    try { document.body.append(link); link.click(); }
    finally { link.remove(); setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); }, 1000); }
  };
  const build = async () => {
    if (!canBuild || work.current.busy) return;
    const run = state.run + 1, token = ++work.current.token;
    work.current.busy = true; setReportError(null); dispatch({ type: 'build', run }); ignoreFollowUpClick();
    try {
      const snapshot = captureDeliverySnapshot({ mode, registry: gmiEditSessions, handle: gmi.view?.handle,
        photoSession, photoLayerId: photoId, includeFieldChanges: needsExclusion ? false : undefined });
      const plan = await buildDeliveryPlan(snapshot, config);
      if (work.current.active && token === work.current.token) dispatch({ type: 'built', run, review: { plan, snapshot, fieldCount } });
    } catch (error) {
      if (work.current.active && token === work.current.token) dispatch({ type: 'build-failed', run, error: deliveryMessage(error.code) });
    } finally { if (token === work.current.token) work.current.busy = false; }
  };
  const back = () => { if (status !== 'packaging') { work.current.token++; work.current.busy = false; dispatch({ type: 'back' }); setReportError(null); ignoreFollowUpClick(); } };
  const download = async () => {
    if (work.current.busy || !['ready', 'done', 'download-failed'].includes(status)) return;
    const { plan } = state.review, token = ++work.current.token, run = state.run;
    work.current.busy = true; dispatch({ type: 'download', run }); ignoreFollowUpClick();
    try {
      const result = await initiateDeliveryDownload(plan, { save: saveFile, isActive: () => work.current.active && token === work.current.token });
      if (result.started && work.current.active && token === work.current.token) dispatch({ type: 'downloaded', run, recorded: result.recorded });
    } catch (error) {
      if (work.current.active && token === work.current.token) dispatch({ type: typeof error.code === 'string' ? 'invalidate' : 'download-failed', run,
        error: deliveryMessage(error.code ?? 'download-failed') });
    } finally { if (token === work.current.token) work.current.busy = false; }
  };
  const report = () => {
    try {
      if (!state.review.plan.isLive()) throw new Error();
      saveFile(new Blob(['\ufeff', deliveryReport(state.review)], { type: 'text/plain;charset=utf-8' }), `${state.review.plan.naming.basename}-leveranserapport.txt`);
      setReportError(null);
    } catch { setReportError('Rapporten kunne ikke lastes ned. Kontroller at forhåndsvisningen er gyldig og prøv igjen.'); }
  };
  const close = () => { work.current.active = false; work.current.token++; onClose(); };

  return <dialog ref={ref} className="photo-collection-dialog photo-export-wizard delivery-wizard" aria-labelledby={`${id}-title`}
    data-export-phase={status} onCancel={(event) => { event.preventDefault(); close(); }}
    onClose={(event) => { if (work.current.active && !event.currentTarget.open) close(); }}>
    <div className="photo-collection-frame">
      <header className="photo-collection-header border-b border-gmi-border">
        <div><h2 id={`${id}-title`}>Eksporter leveranse</h2><p className="text-sm text-gmi-text-muted">Originalfilene endres ikke</p></div>
        <button type="button" className="gmi-focus-ring" aria-label="Lukk eksport" onClick={close}><XIcon size={22} aria-hidden="true" /></button>
      </header>
      <PhotoWizardSteps steps={DELIVERY_STEPS} current={state.step}
        canGoBack={(key) => status !== 'packaging' && (key === 'content' && state.step !== 'content' || key === 'review' && state.step === 'package' && status !== 'stale')}
        onBack={(key) => key === 'review' ? dispatch({ type: 'review', run: state.run }) : back()} />
      {state.step === 'content' ? <div className="delivery-body delivery-content" data-export-step="delivery">
        <section>
          <h3 tabIndex={-1} data-export-heading>{waiting ? 'Leser bildedata …' : 'Velg innhold'}</h3>
          <fieldset><legend className="sr-only">Leveransemåte</legend>{DELIVERY_CHOICES.map((choice) => <PhotoSourceOption key={choice.mode}
            name={`${id}-delivery-mode`} value={choice.mode} label={choice.title} hint={choice.text} checked={mode === choice.mode}
            onChange={(value) => { setMode(value); setExcluded(null); onConfigChange?.({ deliveryMode: value }); }} />)}</fieldset>
        </section>
        <section className="delivery-settings">
          {hasGmi && <label>GMI-kartlag<select className="gmi-focus-ring" aria-label="GMI-kartlag" value={surveyId} onChange={(event) => { setSurveyId(event.target.value); setExcluded(null); onConfigChange?.({ deliverySurveyId: event.target.value }); }}>
            <option value="">Velg GMI-kartlag</option>{Object.values(layers).filter(isLoadedGmiSurveyLayer).map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
          </select></label>}
          {hasPhoto && <label>Fotolag<select className="gmi-focus-ring" aria-label="Fotolag" value={photoId} onChange={(event) => { setPhotoId(event.target.value); setExcluded(null); }}>
            <option value="">Velg fotolag</option>{photos.photoLayers.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
          </select></label>}
          {hasGmi && <p>{fieldCount} {fieldCount === 1 ? 'endret felt' : 'endrede felt'} i {gmi.status?.changeSetCount ?? 0} {gmi.status?.changeSetCount === 1 ? 'retting' : 'rettinger'}.</p>}
          {hasGmi && gmi.descriptor?.state !== 'editable' && <p role="status">{gmi.descriptor?.state === 'loading' ? 'Leser GMI-kilden …' : 'Velg et GMI-kartlag som kan rettes sikkert.'}</p>}
          {needsExclusion && <label className="delivery-exclusion"><input type="checkbox" aria-label="Utelat feltrettingene" checked={excluded === exclusionKey}
            onChange={(event) => setExcluded(event.target.checked ? exclusionKey : null)} /> Jeg bekrefter at {fieldCount} {fieldCount === 1 ? 'feltretting utelates' : 'feltrettinger utelates'} fra denne leveransen. Rettingene beholdes i Rettinger.</label>}
          {hasPhoto ? <PhotoExportSettings config={config} onConfigChange={changeConfig} /> : <label className="photo-export-label">Etikett i filnavnet (valgfritt)
            <input type="text" aria-label="Eksportetikett" className="gmi-focus-ring" value={config.label} maxLength={60} onChange={(event) => changeConfig({ label: event.target.value })} /></label>}
          {hasPhoto && photoLayer && <>
            {mode === 'photos-only' ? <><p data-delivery-state={photoModel.state}>{photoModel.heading}</p><PhotoExportStatus readiness={photoReadiness} reading={waiting} />
              {photoModel.blockers.length > 0 && !waiting && <PhotoExportDiagnostics groups={photoModel.blockers} />}
              {photoModel.checks.length > 0 && !waiting && <ul className="photo-completion-notes">{photoModel.checks.map((item) => <li key={item.code}>{item.text}</li>)}</ul>}
              {photoModel.excludedText && <p data-export-excluded>{photoModel.excludedText}</p>}
              {decision?.active && <p>Kun FOTO tar med alle plasserte forekomster, uavhengig av valgene om samlet levering.</p>}</>
              : <p>{decision?.occurrences.transfer ?? 0} plasseringer er valgt for overføring til GML. {decision?.occurrences.include ?? 0} er valgt uten GMI-lenke. Endre valgene under Samlet levering i FOTO.</p>}
            {onOpenCompletion && photoId === initialPhotoLayerId && <button type="button" className={mode === 'photos-only' && photoModel.completionPrimary ? primary : photoSourceButton} data-export-completion onClick={onOpenCompletion}>Fullfør opplysninger…</button>}
          </>}
          {hasPhoto && !photoLayer && <p>Last inn bilder i FOTO før du velger en bildeleveranse.</p>}
          {waiting && <p role="status">Leser bildedata … Vent før du kontrollerer leveransen.</p>}
        </section>
      </div> : <div className="delivery-body" data-export-step={state.step} data-package-state={status}>
        <h3 tabIndex={-1} data-export-heading aria-live="polite"><PhotoExportTone tone={['blocked', 'failed', 'download-failed'].includes(status) ? 'stop' : status === 'stale' ? 'caution' : busy ? 'wait' : 'good'} />{status === 'ready' && state.step === 'package' ? 'Klar til nedlasting' : HEADINGS[status]}</h3>
        {status === 'stale' && <p role="alert">{deliveryMessage('stale-plan')}</p>}
        {state.error && <p role="alert">{state.error}</p>}
        {state.review && status !== 'stale' && <>
          <dl className="photo-export-summary delivery-summary">{deliverySummary(state.review).map(([label, value]) => <div key={label}><dt>{label}</dt><dd data-export-filename={label === 'Filnavn' ? '' : undefined}>{value}</dd></div>)}</dl>
          {state.review.plan.mode !== 'gmi-only' && <p data-export-zip={state.review.plan.naming.zipFilename} data-export-gml={state.review.plan.photoPlan ? state.review.plan.naming.gmlFilename : ''} />}
          {state.step === 'package' && <section className="delivery-inventory" aria-label="Innhold i leveransen"><h4>Innhold i leveransen</h4>
            <ul data-package-contents>{deliveryContents(state.review.plan).map((path) => <li key={path}>{path}</li>)}</ul>
            <p>Leveranserapporten lastes ned separat. Den legges ikke i ZIP-filen.</p>
          </section>}
          {state.review.plan.status === 'ready' && <p className="delivery-verification">Kilde, eksportdata og vedleggsplan er kontrollert. Originalfilen endres ikke. Filene kontrolleres på nytt før nedlasting.</p>}
          {hasGmi && <p className="photo-completion-warning"><strong>Eksperimentell.</strong> Revidert GMI er ikke akseptansetestet i Gemini VA.</p>}
          {state.review.plan.photoPlan && <PhotoExportStatus readiness={photoReadiness} />}
          {state.review.plan.photoPlan && <p data-export-counts>{photoCount(state.review.plan.photoPlan.counts.attachments)} · {placementCount(state.review.plan.counts.features)} i GML-filen
            {state.review.plan.photoPlan.excluded.length > 0 && ` · ${placementCount(state.review.plan.photoPlan.excluded.length)} uten posisjon utelatt`}</p>}
          {state.review.plan.photoPlan && <p data-export-format={state.review.plan.photoPlan.profile}>{PHOTO_EXPORT_PROFILE_METADATA[state.review.plan.photoPlan.profile].title}
            <small className="block text-gmi-text-muted">{PHOTO_EXPORT_PROFILE_METADATA[state.review.plan.photoPlan.profile].compatibility}</small></p>}
          <Diagnostics plan={state.review.plan} snapshot={state.review.snapshot} />
          {state.review.plan.photoPlan?.excluded.length > 0 && <p data-export-excluded>{state.review.plan.photoPlan.excluded.length} plasseringer uten godkjent posisjon er utelatt fra Kun FOTO. GMI endres ikke.</p>}
          {state.review.plan.counts.excludedAssets > 0 && mode !== 'photos-only' && <p>{state.review.plan.counts.excludedAssets} bilder er verken valgt for GML eller påkrevd av beholdte GMI-lenker og er ikke med.</p>}
          {state.review.plan.photoPlan && <details className="photo-export-disclosure"><summary>Tekniske detaljer</summary>
            <p>{state.review.plan.photoPlan.counts.uniqueImages} unike bilder i laget · {state.review.plan.photoPlan.counts.totalOccurrences} forekomster</p>
          </details>}
          {status === 'done' && <p role="status">Nedlastingen er startet: <strong data-downloaded-filename>{state.review.plan.filename}</strong>. Nettleseren håndterer lagringen.</p>}
          {status === 'done' && state.review.plan.gmiFingerprint && <p className="photo-export-hint">SHA-256 for revidert GMI: <code data-downloaded-fingerprint>{state.review.plan.gmiFingerprint.replace(/^sha256:/, '')}</code></p>}
          {status === 'done' && !state.recorded && <p role="status">Rettingene er endret eller ikke lenger tilgjengelige. De er fortsatt merket som ikke lastet ned.</p>}
          <p className="photo-export-hint">Dette er eksportkontroll, ikke en ny Validator-kjøring eller Gemini-akseptanse.</p>
        </>}
        {reportError && <p role="alert">{reportError}</p>}
      </div>}
      <footer className="photo-import-footer border-t border-gmi-border">
        {state.step === 'content' && <p className="photo-export-footer-status" role="status">{resumed && 'Kontrollen er oppdatert. '}{waiting ? photoReadingNote(photosBeingRead(layerPhotos))
          : mode === 'photos-only' && photoModel ? photoModel.advance.reason || `${photoCount(photoReadiness.counts.assets)} i pakken` : ''}</p>}
        <button type="button" className={photoSourceButton} onClick={close}>{status === 'done' ? 'Lukk' : 'Avbryt'}</button>
        {state.step === 'content' ? <button type="button" className={primary} data-export-advance disabled={!canBuild} onClick={build}>Kontroller leveransen</button> : <>
          <button type="button" className={photoSourceButton} disabled={status === 'packaging'} onClick={back}>{status === 'stale' ? 'Tilbake og kontroller på nytt' : 'Tilbake til Innhold'}</button>
          {state.step === 'review' && <button type="button" className={primary} disabled={status !== 'ready'} onClick={() => { dispatch({ type: 'package', run: state.run }); ignoreFollowUpClick(); }}>Til pakke</button>}
          {state.step === 'package' && <>
            <button type="button" className={photoSourceButton} disabled={busy || status === 'stale'} onClick={report}>Last ned leveranserapport</button>
            <button type="button" className={primary} disabled={busy || !['ready', 'done', 'download-failed'].includes(status)} onClick={download}>
              {busy ? 'Lager leveransen …' : status === 'done' ? 'Last ned på nytt' : state.review.plan.mode === 'gmi-only' ? 'Last ned GMI' : 'Last ned ZIP'}
            </button>
          </>}
        </>}
      </footer>
    </div>
  </dialog>;
}
