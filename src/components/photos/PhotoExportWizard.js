'use client';

import { useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import { XIcon } from '@phosphor-icons/react';
import { buildPhotoExportPackage } from '@/lib/photos/export/photoExportPackage.mjs';
import { buildPhotoExportPlan, capturePhotoExportSnapshot } from '@/lib/photos/export/photoExportPlan.mjs';
import { photoCount } from '@/lib/photos/photoCompletion.mjs';
import { PHOTO_EXPORT_WIZARD_START, photoExportDeliveryModel, photoExportDeliveryReadiness, photoExportPackageState, photoExportWizardReducer } from '@/lib/photos/photoExportWizard.mjs';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import PhotoExportDeliveryStep from './PhotoExportDeliveryStep';
import PhotoExportPackageStep from './PhotoExportPackageStep';
import { ignoreFollowUpClick } from './photoFollowUpClick';
import { photoSourceButton } from './PhotoSourceOption';
import PhotoWizardSteps from './PhotoWizardSteps';
import './photoExportWizard.css';

const STEPS = Object.freeze([{ key: 'delivery', label: 'Leveranse' }, { key: 'package', label: 'Pakke' }]);
const primary = 'gmi-primary-control gmi-focus-ring min-h-10 px-4';
const focusHeading = (dialog) => dialog.querySelector('[data-export-heading]')?.focus();

function saveFile(blob, filename, urls) {
  const url = URL.createObjectURL(blob); urls.add(url);
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => { URL.revokeObjectURL(url); urls.delete(url); }, 1000);
}

// Choices live in the page's export config, so they outlast this dialog. The plan lives only here: going back or closing
// discards it, and nothing on the second screen can change what it was built from.
// `resumed` means the user came back from Fullfør opplysninger.
export default function PhotoExportWizard({ layer, photos, config, onConfigChange, openerRef, resumed = false, onOpenCompletion, onClose }) {
  // Render reads plan.isLive(), which depends on the session and not on props or state, so it must never be cached.
  'use no memo';
  const ref = useRef(null), live = useRef(false), id = useId();
  const [now] = useState(() => Date.now());
  const [state, dispatch] = useReducer(photoExportWizardReducer, PHOTO_EXPORT_WIZARD_START);
  // The reducer drops late results, but it cannot stop a handler, and two clicks can land before a render. This can.
  const work = useRef({ build: 0, download: 0, packaging: false });
  const urls = useRef(new Set());

  useEffect(() => {
    const dialog = ref.current, opener = openerRef?.current || document.activeElement, running = work.current, activeUrls = urls.current;
    live.current = true;
    dialog.showModal();
    return () => {
      live.current = false; running.download++; dialog.close();
      for (const url of activeUrls) URL.revokeObjectURL(url);
      activeUrls.clear();
      if (opener?.isConnected) opener.focus();
    };
  }, [openerRef]);

  const { profile, crs, context, label } = config;
  const readiness = useMemo(() => photoExportDeliveryReadiness(photos, { profile, crs, context }, now), [photos, profile, crs, context, now]);
  const model = useMemo(() => photoExportDeliveryModel({ photos, readiness }), [photos, readiness]);
  const packageState = photoExportPackageState(state);

  // A new step replaces the button that was pressed, so a held Enter must not reach the next one.
  useEffect(() => { focusHeading(ref.current); }, [state.step]);
  useEffect(() => { const dialog = ref.current; if (dialog.open && !dialog.contains(document.activeElement)) focusHeading(dialog); }, [packageState]);

  const build = async () => {
    const run = state.run + 1;
    if (work.current.build >= run) return;
    work.current.build = run;
    dispatch({ type: 'build-start', run });
    ignoreFollowUpClick();
    try { dispatch({ type: 'build-done', run, plan: await buildPhotoExportPlan(capturePhotoExportSnapshot(photoSession, layer.id), { profile, crs, context, label }) }); }
    catch (error) { dispatch({ type: 'build-failed', run, error: error.message }); }
  };
  const download = async () => {
    if (work.current.packaging) return;
    const { run, preview: { plan } } = state, token = ++work.current.download;
    work.current.packaging = true;
    dispatch({ type: 'download-start', run });
    ignoreFollowUpClick();
    try {
      const blob = await buildPhotoExportPackage(plan);
      if (token !== work.current.download) return;
      if (!plan.isLive()) throw new Error('Eksportplanen er utdatert. Lag en ny forhåndsvisning.');
      saveFile(blob, plan.naming.zipFilename, urls.current);
      dispatch({ type: 'download-done', run });
    } catch (error) { dispatch({ type: 'download-failed', run, error: error.message }); }
    finally { work.current.packaging = false; }
  };
  const back = () => { dispatch({ type: 'back' }); ignoreFollowUpClick(); };

  const packaging = packageState === 'packaging';
  const cancelButton = <button type="button" className={photoSourceButton} onClick={onClose}>Avbryt</button>;

  // onClose covers a close the browser makes by itself, as in the hub. One from this dialog's own cleanup arrives late and must not count.
  return <dialog ref={ref} className="photo-collection-dialog photo-export-wizard" aria-labelledby={`${id}-title`} onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClose={(event) => { if (live.current && !event.currentTarget.open) onClose(); }}>
    <div className="photo-collection-frame">
      <header className="photo-collection-header border-b border-gmi-border">
        <div className="min-w-0"><h2 id={`${id}-title`}>Eksporter bilder</h2><p className="truncate text-sm text-gmi-text-muted">{layer.name}</p></div>
        <button type="button" className="gmi-focus-ring" aria-label="Lukk eksport" onClick={onClose}><XIcon size={22} aria-hidden="true" /></button>
      </header>
      <PhotoWizardSteps steps={STEPS} current={state.step} canGoBack={(key) => key === 'delivery' && state.step === 'package' && !packaging} onBack={back} />
      {state.step === 'delivery'
        ? <PhotoExportDeliveryStep config={config} model={model} readiness={readiness} onConfigChange={onConfigChange} onOpenCompletion={onOpenCompletion} />
        : <PhotoExportPackageStep status={packageState} preview={state.preview} download={state.download} readiness={readiness} />}
      {state.step === 'delivery' ? <footer key="delivery" className="photo-import-footer border-t border-gmi-border">
        <p className="photo-export-footer-status" role="status">{resumed && 'Kontrollen er oppdatert. '}{model.advance.reason || `${photoCount(readiness.counts.assets)} i pakken`}</p>
        {cancelButton}
        <button type="button" className={model.completionPrimary ? photoSourceButton : primary} data-export-advance disabled={!model.advance.enabled} onClick={build}>{model.advance.label}</button>
      </footer> : <footer key="package" className="photo-import-footer border-t border-gmi-border">
        {packageState === 'done' ? <>
          <button type="button" className={photoSourceButton} onClick={download}>Last ned på nytt</button>
          <button type="button" className={primary} onClick={onClose}>Lukk</button>
        </> : <>
          {cancelButton}
          <button type="button" className={photoSourceButton} disabled={packaging} onClick={back}>Tilbake</button>
          {(packageState === 'ready' || packaging) && <button type="button" className={primary} disabled={packaging} onClick={download}>Last ned ZIP</button>}
          {packageState === 'stale' && <button type="button" className={primary} disabled={model.state === 'reading'} onClick={build}>Oppdater forhåndsvisning</button>}
          {packageState === 'packaging-failed' && <button type="button" className={primary} onClick={download}>Prøv igjen</button>}
        </>}
      </footer>}
    </div>
  </dialog>;
}
