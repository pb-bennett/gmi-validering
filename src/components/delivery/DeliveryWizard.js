'use client';

import { useEffect, useId, useReducer, useRef, useState } from 'react';
import { DownloadSimpleIcon, XIcon } from '@phosphor-icons/react';
import useStore from '@/lib/store';
import { gmiEditSessions } from '@/lib/gmiEditSessions.mjs';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { isLoadedGmiSurveyLayer, loadedGmiSources } from '@/lib/photos/loadedGmiSource.mjs';
import { parseSourceFilename, exportFilenamePreview } from '@/lib/photos/export/photoExportNaming.mjs';
import { DEFAULT_PHOTO_EXPORT_CONFIG } from '@/lib/photos/photoExportConfig.mjs';
import { photosBeingRead, photoReadingNote, photoCount, placementCount, photoCaptureTimeSchemaWarning } from '@/lib/photos/photoCompletion.mjs';
import { PHOTO_EXPORT_PROFILE_METADATA } from '@/lib/photos/export/photoExportRules.mjs';
import { photoExportDeliveryReadiness, photoExportDeliveryModel } from '@/lib/photos/photoExportWizard.mjs';
import { captureDeliverySnapshot, buildDeliveryPlan, deliveryTransferredUnplaced } from '@/lib/delivery/index.mjs';
import { DELIVERY_CHOICES, DELIVERY_STEPS, DELIVERY_WIZARD_START, deliveryWizardReducer, deliveryWizardStatus,
  deliveryDiagnostics, deliveryMessage, deliveryPackageFacts, deliveryReport, deliveryReviewStatus, deliveryReviewSummary,
  deliveryExclusionNote, deliveryExclusionLines, deliveryCorrectionCounts,
  deliverySurveySelection, initiateDeliveryDownload } from '@/lib/delivery/deliveryWizard.mjs';
import DeliveryInventory from './DeliveryInventory';
import usePhotoSession from '@/components/photos/usePhotoSession';
import useGmiEditLayer from '@/components/gmi-edit/useGmiEditLayer';
import PhotoWizardSteps from '@/components/photos/PhotoWizardSteps';
import PhotoSourceOption, { photoSourceButton } from '@/components/photos/PhotoSourceOption';
import { PhotoExportSettings, ExportFilenameEditor } from '@/components/photos/PhotoExportDeliveryStep';
import PhotoExportStatus, { PhotoExportDiagnostics, PhotoExportTone } from '@/components/photos/PhotoExportStatus';
import { ignoreFollowUpClick } from '@/components/photos/photoFollowUpClick';
import '@/components/photos/photoCollectionPanel.css';
import '@/components/photos/photoExportWizard.css';
import './deliveryWizard.css';

const primary = 'gmi-primary-control gmi-focus-ring min-h-10 px-4';
const HEADINGS = { building: 'Kontrollerer leveransen …', packaging: 'Lager leveransen …', blocked: 'Leveransen er blokkert',
  failed: 'Kontrollen kunne ikke fullføres', stale: 'Kontrollen er utdatert', ready: 'Eksportkontroll fullført',
  done: 'Nedlastingen er startet', 'download-failed': 'Nedlastingen kunne ikke startes' };
// Må rettes and Bør kontrolleres are always open; Informasjon is folded, since
// nothing in it needs action. Every diagnostic stays in the DOM either way.
function Diagnostics({ plan, snapshot }) {
  const groups = deliveryDiagnostics(plan);
  return Object.entries(groups).map(([key, items]) => {
    if (!items.length) return null;
    const title = `${({ errors: 'Må rettes', warnings: 'Bør kontrolleres', info: 'Informasjon' })[key]} (${items.length})`;
    const list = <ul>{items.map((item, index) => {
      const ref = snapshot.source?.references.find((entry) => entry.id === item.referenceId);
      const occurrence = snapshot.photo?.occurrences.find((entry) => entry.occurrenceId === (item.occurrenceId ?? item.photoId));
      const asset = snapshot.photo?.assets.find((entry) => entry.assetId === (item.assetId ?? occurrence?.assetId));
      const name = item.filename ?? ref?.filename ?? asset?.originalFilename;
      return <li key={`${item.code}:${index}`} data-diagnostic-code={item.code}>{name && <strong>{name}: </strong>}
        {item.objectLabel && <span>{item.objectLabel} · </span>}{item.text}</li>;
    })}</ul>;
    const label = ({ errors: 'Feil', warnings: 'Advarsler', info: 'Informasjon' })[key];
    return key === 'info'
      ? <details key={key} className="delivery-diagnostics" data-tone={key} aria-label={label}><summary>{title}</summary>{list}</details>
      : <section key={key} className="delivery-diagnostics" data-tone={key} aria-label={label}><h4>{title}</h4>{list}</section>;
  });
}

/** Kontroll: the one place for findings, photo readiness and technical detail. */
function ReviewDetails({ review, photoReadiness }) {
  const { plan } = review, photoPlan = plan.photoPlan, profile = photoPlan && PHOTO_EXPORT_PROFILE_METADATA[photoPlan.profile];
  const notNeededAssets = plan.counts.notNeededAssets;
  const note = deliveryExclusionNote(plan.mode, plan.photoDelivery.ignoredExclusions);
  const exclusions = deliveryExclusionLines(plan);
  return <>
    <dl className="photo-export-summary delivery-summary">{deliveryReviewSummary(review).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {plan.status === 'ready' && <p className="delivery-verification">Kan genereres. Kilde, eksportdata og vedleggsplan er kontrollert. Filene kontrolleres på nytt før nedlasting.</p>}
    <Diagnostics plan={plan} snapshot={review.snapshot} />
    {note && <p className="photo-export-hint" data-delivery-exclusion-note>{note}</p>}
    {exclusions.length > 0 && <details className="photo-export-disclosure" data-delivery-exclusions>
      <summary>Ikke med i leveransen ({placementCount(exclusions.length)})</summary>
      <ul>{exclusions.map((line, index) => <li key={index}>{line}</li>)}</ul>
    </details>}
    {photoPlan && <PhotoExportStatus readiness={photoReadiness} />}
    {photoPlan && <p data-export-counts>{photoCount(new Set(photoPlan.attachments.map((item) => item.assetId)).size)} · {placementCount(plan.counts.features)} i GML-filen
      {photoPlan.excluded.length > 0 && ` · ${placementCount(photoPlan.excluded.length)} uten posisjon utelatt`}</p>}
    {photoPlan?.excluded.length > 0 && <p data-export-excluded>{photoPlan.excluded.length} plasseringer uten godkjent posisjon er utelatt fra Kun GML med bilder. GMI endres ikke.</p>}
    {(photoPlan || notNeededAssets > 0) && <details className="photo-export-disclosure" data-export-technical><summary>Tekniske detaljer</summary>
      {photoPlan && <p data-export-format={photoPlan.profile}>{profile.title}</p>}
      {photoPlan && <p>{photoPlan.counts.uniqueImages} unike bilder i laget · {placementCount(photoPlan.counts.totalOccurrences)}</p>}
      {notNeededAssets > 0 && <p>{notNeededAssets} bilder er ikke valgt og er ikke påkrevd av beholdte GMI-lenker. Disse er forskjellige fra plasseringene du har valgt Ikke med for.</p>}
    </details>}
    <p className="photo-export-hint">Dette er eksportkontroll, ikke en ny Validator-kjøring eller full XSD-sertifisering. Originalfilen endres ikke.</p>
  </>;
}

/** Pakke: the package and its download; findings stay in Kontroll. */
function PackageDetails({ review, status, recorded, photoReadiness }) {
  const { plan } = review, photoNotes = plan.photoPlan && photoReadiness && photoCaptureTimeSchemaWarning(photoReadiness) ? 1 : 0;
  return <>
    <p className="delivery-package-line"><strong data-export-filename="">{plan.filename}</strong>
      <span className="text-gmi-text-muted" data-export-package-facts> · {deliveryPackageFacts(plan).join(' · ')}</span></p>
    <p className="delivery-review-status" data-review-status>{deliveryReviewStatus(plan, photoNotes)}</p>
    <section className="delivery-inventory" aria-label="Innhold i leveransen"><h4>Innhold i leveransen</h4>
      <DeliveryInventory plan={plan} />
      <p>Leveranserapporten lastes ned separat. Den legges ikke i ZIP-filen.</p>
    </section>
    {status === 'done' && <p role="status">Nedlastingen er startet: <strong data-downloaded-filename>{plan.filename}</strong>. Nettleseren håndterer lagringen.</p>}
    {status === 'done' && plan.gmiFingerprint && <p className="photo-export-hint">SHA-256 for revidert GMI: <code data-downloaded-fingerprint>{plan.gmiFingerprint.replace(/^sha256:/, '')}</code></p>}
    {status === 'done' && !recorded && <p role="status">Rettingene er endret eller ikke lenger tilgjengelige. De er fortsatt merket som ikke lastet ned.</p>}
  </>;
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
  const [selectedSurvey, setSelectedSurvey] = useState(initialMode === 'gmi-only' && !initialPhotoLayerId ? initialSurveyLayerId : null);
  const [localConfig, setLocalConfig] = useState(DEFAULT_PHOTO_EXPORT_CONFIG);
  const [excluded, setExcluded] = useState(null);
  const [transferInclusion, setTransferInclusion] = useState(null);
  const [reportError, setReportError] = useState(null);
  const [state, dispatch] = useReducer(deliveryWizardReducer, DELIVERY_WIZARD_START);
  const layers = useStore((store) => store.layers);
  const photos = usePhotoSession();
  const hasGmi = mode !== 'photos-only', hasPhoto = mode !== 'gmi-only';
  const photoLayer = photoSession.getLayer(photoId);
  const surveyId = deliverySurveySelection({ sources: photoLayer?.spatialSources, explicit: selectedSurvey,
    stored: initialSurveyLayerId, isSelectable: (layerId) => isLoadedGmiSurveyLayer(layers[layerId]),
    isAvailable: loadedGmiSources.available, isLive: loadedGmiSources.isLive });
  const gmi = useGmiEditLayer(surveyId, { autoOpen: hasGmi });
  const layerPhotos = photoLayer ? photoSession.getLayerPhotos(photoId) : [];
  const config = suppliedConfig && photoId === initialPhotoLayerId ? suppliedConfig : localConfig;
  // The descriptive text is the user's once edited; the revision always follows the live source and is never stored.
  const sourceParts = hasGmi ? parseSourceFilename(gmi.descriptor?.filename) : null;
  const suggestedLabel = sourceParts?.descriptive ?? '';
  const label = config.labelEdited ? config.label : suggestedLabel;
  const filenameTimestamp = config.filenameTimestamp !== false, revisionChecked = config.filenameRevision !== false;
  const revision = revisionChecked && sourceParts ? `rev${sourceParts.nextRevision}` : '';
  const changeConfig = (patch) => {
    if (Object.hasOwn(patch, 'label')) patch = { ...patch, labelEdited: patch.labelEdited ?? true };
    if (onConfigChange && photoId === initialPhotoLayerId) onConfigChange(patch);
    else setLocalConfig((current) => ({ ...current, ...patch }));
  };
  const extension = mode === 'gmi-only' ? '.gmi' : '.zip';
  const filenameIssue = exportFilenamePreview({ descriptive: label, timestamp: filenameTimestamp, revision, extension }).issue;
  const filename = { descriptive: label, timestamp: filenameTimestamp, revision, revisionChecked, showRevision: hasGmi, extension,
    issueText: filenameIssue ? deliveryMessage(filenameIssue) : '',
    onUseSuggestion: sourceParts && config.labelEdited && label !== suggestedLabel ? () => changeConfig({ label: '', labelEdited: false }) : undefined };
  // Field corrections only: a hyperlink transfer is a history entry with changed S_HYPERLINK cells, but split delivery
  // always includes it, so it is neither counted as a field correction nor part of the exclusion confirmation.
  const corrections = deliveryCorrectionCounts(gmi.view, gmi.status);
  const fieldCount = corrections.fieldCells;
  const needsExclusion = mode === 'split' && corrections.fieldChangeSets > 0;
  // A changed session requires renewed acknowledgement, even after an undo/redo.
  const exclusionKey = `${surveyId}:${gmi.status?.stateKey ?? ''}`;
  const waiting = hasPhoto && photosBeingRead(layerPhotos) > 0;
  // Kun GML med bilder: moved photographs that were unplaced before the transfer need this explicit inclusion; its key
  // follows the transfer state, so a later commit, undo or redo clears it. Optional: without it they stay out of GML.
  const transferredUnplaced = mode === 'photos-only' && photoLayer ? deliveryTransferredUnplaced({ registry: gmiEditSessions, photoSession, photoLayerId: photoId }) : null;
  const includeTransferredUnplaced = Boolean(transferredUnplaced) && transferInclusion === transferredUnplaced.key;
  const status = deliveryWizardStatus(state), busy = ['building', 'packaging'].includes(status);
  const readinessPhotos = mode === 'photos-only' || !state.review ? layerPhotos
    : layerPhotos.filter((photo) => state.review.plan.photoPlan?.occurrences.some((row) => row.occurrenceId === photo.id));
  const photoReadiness = hasPhoto && photoLayer ? photoExportDeliveryReadiness(readinessPhotos, config, Date.now()) : null;
  const photoModel = photoReadiness ? photoExportDeliveryModel({ photos: layerPhotos, readiness: photoReadiness }) : null;
  const canBuild = (!hasGmi || gmi.descriptor?.state === 'editable') && (!hasPhoto || photoLayer)
    && (!needsExclusion || excluded === exclusionKey) && !waiting && (mode !== 'photos-only' || photoModel?.advance.enabled) && !filenameIssue;
  const delivery = photoLayer ? photoSession.getLayerDelivery(photoId) : null;
  const decision = delivery?.summary;
  const deliveryChoices = photoLayer ? photoSession.getPhotoDeliverySnapshot(photoId) : null;
  const excludedDecisions = (deliveryChoices?.exclusions.length ?? 0)
    + (deliveryChoices?.unresolved.filter((entry) => entry.decision === 'exclude').length ?? 0);
  const exclusionNote = deliveryExclusionNote(mode, excludedDecisions);

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
        photoSession, photoLayerId: photoId, includeFieldChanges: needsExclusion ? false : undefined, includeTransferredUnplaced });
      const plan = await buildDeliveryPlan(snapshot, { ...config, label, filenameTimestamp, filenameRevision: revisionChecked, revision });
      if (work.current.active && token === work.current.token) dispatch({ type: 'built', run, review: { plan, snapshot, fieldCount } });
    } catch (error) {
      if (work.current.active && token === work.current.token) dispatch({ type: 'build-failed', run, error: deliveryMessage(error.code) });
    } finally { if (token === work.current.token) work.current.busy = false; }
  };
  const back = () => { if (status !== 'packaging') {
    work.current.token++; work.current.busy = false;
    dispatch(state.step === 'package' && status !== 'stale' ? { type: 'review', run: state.run } : { type: 'back' });
    setReportError(null); ignoreFollowUpClick();
  } };
  const backToContent = () => { if (status !== 'packaging') { work.current.token++; work.current.busy = false; dispatch({ type: 'back' }); setReportError(null); ignoreFollowUpClick(); } };
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
      saveFile(new Blob(['\ufeff', deliveryReport(state.review)], { type: 'text/plain;charset=utf-8' }), state.review.plan.naming.reportFilename);
      setReportError(null);
    } catch { setReportError('Rapporten kunne ikke lastes ned. Kontroller at forhåndsvisningen er gyldig og prøv igjen.'); }
  };
  const close = () => { work.current.active = false; work.current.token++; onClose(); };

  return <dialog ref={ref} className="photo-collection-dialog photo-export-wizard delivery-wizard" aria-labelledby={`${id}-title`}
    data-export-phase={status} data-delivery-step={state.step} onCancel={(event) => { event.preventDefault(); close(); }}
    onClose={(event) => { if (work.current.active && !event.currentTarget.open) close(); }}>
    <div className="photo-collection-frame">
      <header className="photo-collection-header border-b border-gmi-border">
        <div><h2 id={`${id}-title`}>Eksporter leveranse</h2><p className="text-sm text-gmi-text-muted">Originalfilene endres ikke</p></div>
        <button type="button" className="gmi-focus-ring" aria-label="Lukk eksport" onClick={close}><XIcon size={22} aria-hidden="true" /></button>
      </header>
      <PhotoWizardSteps steps={DELIVERY_STEPS} current={state.step}
        canGoBack={(key) => status !== 'packaging' && (key === 'content' && state.step !== 'content' || key === 'review' && state.step === 'package' && status !== 'stale')}
        onBack={(key) => key === 'review' ? back() : backToContent()} />
      {state.step === 'content' ? <div className="delivery-body delivery-content" data-export-step="delivery">
        <section>
          <h3 tabIndex={-1} data-export-heading>{waiting ? 'Leser bildedata …' : 'Velg innhold'}</h3>
          <fieldset><legend className="sr-only">Leveransemåte</legend>{DELIVERY_CHOICES.map((choice) => <PhotoSourceOption key={choice.mode}
            name={`${id}-delivery-mode`} value={choice.mode} label={choice.title} hint={choice.text} checked={mode === choice.mode}
            onChange={(value) => { setMode(value); setExcluded(null); setTransferInclusion(null); onConfigChange?.({ deliveryMode: value }); }} />)}</fieldset>
        </section>
        <section className="delivery-settings">
          {hasGmi && <label>GMI-kartlag<select className="gmi-focus-ring" aria-label="GMI-kartlag" value={surveyId} onChange={(event) => { setSelectedSurvey(event.target.value); setExcluded(null); onConfigChange?.({ deliverySurveyId: event.target.value }); }}>
            <option value="">Velg GMI-kartlag</option>{Object.values(layers).filter(isLoadedGmiSurveyLayer).map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
          </select></label>}
          {hasPhoto && <label>Fotolag<select className="gmi-focus-ring" aria-label="Fotolag" value={photoId} onChange={(event) => { setPhotoId(event.target.value); setExcluded(null); setTransferInclusion(null); }}>
            <option value="">Velg fotolag</option>{photos.photoLayers.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
          </select></label>}
          {hasGmi && <p>{fieldCount} {fieldCount === 1 ? 'endret felt' : 'endrede felt'} i {corrections.fieldChangeSets} {corrections.fieldChangeSets === 1 ? 'retting' : 'rettinger'}.</p>}
          {hasGmi && corrections.movedReferences > 0 && <p data-delivery-moved-links>{mode === 'split' ? 'Flyttede bildelenker inkluderes' : 'Flyttede bildelenker tas med'}: {photoCount(corrections.movedPhotos)} · {corrections.movedReferences} {corrections.movedReferences === 1 ? 'bildereferanse' : 'bildereferanser'} til et annet punktobjekt.</p>}
          {hasGmi && gmi.descriptor?.state !== 'editable' && <p role="status">{gmi.descriptor?.state === 'loading' ? 'Leser GMI-kilden …' : 'Velg et GMI-kartlag som kan rettes sikkert.'}</p>}
          {needsExclusion && <label className="delivery-exclusion"><input type="checkbox" aria-label="Utelat feltrettingene" checked={excluded === exclusionKey}
            onChange={(event) => setExcluded(event.target.checked ? exclusionKey : null)} /> Jeg bekrefter at {fieldCount} {fieldCount === 1 ? 'feltretting utelates' : 'feltrettinger utelates'} fra denne leveransen. Rettingene beholdes i Rettinger.</label>}
          {hasPhoto ? <PhotoExportSettings config={{ ...config, label }} onConfigChange={changeConfig} filename={filename} />
            : <ExportFilenameEditor filename={filename} onConfigChange={changeConfig} />}
          {exclusionNote && <p className="photo-export-hint" data-delivery-exclusion-note>{exclusionNote}</p>}
          {hasPhoto && photoLayer && <>
            {mode === 'photos-only' ? <><p data-delivery-state={photoModel.state}>{photoModel.heading}</p><PhotoExportStatus readiness={photoReadiness} reading={waiting} />
              {photoModel.blockers.length > 0 && !waiting && <PhotoExportDiagnostics groups={photoModel.blockers} />}
              {photoModel.checks.length > 0 && !waiting && <ul className="photo-completion-notes">{photoModel.checks.map((item) => <li key={item.code}>{item.text}</li>)}</ul>}
              {photoModel.excludedText && <p data-export-excluded>{photoModel.excludedText}</p>}
              {transferredUnplaced && <label className="delivery-exclusion" data-delivery-transfer-inclusion><input type="checkbox" aria-label="Ta med flyttede bilder som var uplassert"
                checked={includeTransferredUnplaced} onChange={(event) => setTransferInclusion(event.target.checked ? transferredUnplaced.key : null)} /> Ta med {photoCount(transferredUnplaced.assets)} som var uplassert før bildelenken ble flyttet, på mottakerens GMI-posisjon. Uten bekreftelse utelates {transferredUnplaced.assets === 1 ? 'bildet' : 'bildene'} fra GML.</label>}
              {decision?.active && <p>Kun GML med bilder tar med alle plasserte forekomster, uavhengig av valgene om samlet levering.</p>}</>
              : <p>{decision?.occurrences.transfer ?? 0} plasseringer er valgt for overføring til GML. {decision?.occurrences.include ?? 0} er valgt uten GMI-lenke.
                {' '}{decision?.occurrences.exclude ?? 0} er valgt Ikke med i leveransen. Endre valgene under Samlet levering i FOTO.</p>}
            {onOpenCompletion && photoId === initialPhotoLayerId && <button type="button" className={photoSourceButton} data-export-completion onClick={onOpenCompletion}>Fullfør opplysninger…</button>}
          </>}
          {hasPhoto && !photoLayer && <p>Last inn bilder i FOTO før du velger en bildeleveranse.</p>}
          {waiting && <p role="status">Leser bildedata … Vent før du kontrollerer leveransen.</p>}
        </section>
      </div> : <div className="delivery-body" data-export-step={state.step} data-package-state={status}>
        <h3 tabIndex={-1} data-export-heading aria-live="polite"><PhotoExportTone tone={['blocked', 'failed', 'download-failed'].includes(status) ? 'stop' : status === 'stale' ? 'caution' : busy ? 'wait' : 'good'} />{status === 'ready' && state.step === 'package' ? 'Klar til nedlasting' : HEADINGS[status]}</h3>
        {status === 'stale' && <p role="alert">{deliveryMessage('stale-plan')}</p>}
        {state.error && <p role="alert">{state.error}</p>}
        {state.review && status !== 'stale' && <>
          {state.review.plan.mode !== 'gmi-only' && <p data-export-zip={state.review.plan.naming.zipFilename} data-export-gml={state.review.plan.photoPlan ? state.review.plan.naming.gmlFilename : ''} />}
          {state.step === 'review' ? <ReviewDetails review={state.review} photoReadiness={photoReadiness} />
            : <PackageDetails review={state.review} status={status} recorded={state.recorded} photoReadiness={photoReadiness} />}
        </>}
        {reportError && <p role="alert">{reportError}</p>}
      </div>}
      <footer className="photo-import-footer border-t border-gmi-border" data-export-footer>
        {state.step === 'package' && <button type="button" className={`${photoSourceButton} delivery-footer-report`}
          disabled={busy || status === 'stale'} onClick={report} data-export-report>Last ned rapport</button>}
        {state.step === 'content' && <p className="photo-export-footer-status" role="status">{resumed && 'Kontrollen er oppdatert. '}{waiting ? photoReadingNote(photosBeingRead(layerPhotos))
          : mode === 'photos-only' && photoModel ? photoModel.advance.reason || `${photoCount(photoReadiness.counts.assets)} i pakken` : ''}</p>}
        <div className="delivery-footer-actions">
          <button type="button" className={photoSourceButton} onClick={close} data-export-cancel>{status === 'done' ? 'Lukk' : 'Avbryt'}</button>
          {state.step === 'content' ? <button type="button" className={primary} data-export-advance disabled={!canBuild} onClick={build}>Kontroller leveransen</button> : <>
            <button type="button" className={photoSourceButton} disabled={status === 'packaging'} onClick={back} data-export-back>{status === 'stale' ? 'Tilbake og kontroller på nytt' : 'Tilbake'}</button>
            {state.step === 'review' && <button type="button" className={primary} data-export-next disabled={status !== 'ready'} onClick={() => { dispatch({ type: 'package', run: state.run }); ignoreFollowUpClick(); }}>Neste</button>}
            {state.step === 'package' && <button type="button" className={`${primary} delivery-final-action`} data-export-download aria-busy={busy} disabled={busy || !['ready', 'done', 'download-failed'].includes(status)} onClick={download}>
              <DownloadSimpleIcon size={16} weight="regular" aria-hidden="true" />{busy ? 'Lager leveransen …' : state.review.plan.mode === 'gmi-only' ? 'Last ned GMI' : 'Last ned ZIP'}
            </button>}
          </>}
        </div>
      </footer>
    </div>
  </dialog>;
}
