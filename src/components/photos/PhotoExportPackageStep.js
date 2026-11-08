'use client';

import { groupPhotoExportDiagnostics } from '@/lib/photos/export/photoExportDiagnostics.mjs';
import { PHOTO_EXPORT_PROFILE_METADATA } from '@/lib/photos/export/photoExportRules.mjs';
import { photoCount, placementCount, singularCopy } from '@/lib/photos/photoCompletion.mjs';
import { photoExportPackageContents } from '@/lib/photos/photoExportWizard.mjs';
import PhotoExportStatus, { PhotoExportDiagnostics, PhotoExportTone } from './PhotoExportStatus';

const HEADINGS = Object.freeze({ building: 'Kontrollerer originalfiler …', 'build-failed': 'Pakken kunne ikke forberedes', ready: 'Klar til nedlasting', packaging: 'Lager ZIP …',
  stale: 'Forhåndsvisningen er utdatert', 'packaging-failed': 'ZIP-pakken kunne ikke lages', done: 'ZIP-pakken er klar' });

const TONES = Object.freeze({ building: 'wait', packaging: 'wait', ready: 'download', done: 'good', stale: 'caution', 'build-failed': 'stop', 'plan-errors': 'stop', 'packaging-failed': 'stop' });

// Originals only: the GML and the ZIP's own overhead are not counted, so this is never presented as the file size.
function imageData(bytes) {
  const megabytes = bytes / (1024 * 1024);
  return megabytes >= 0.1 ? `ca. ${megabytes.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} MB bildedata` : `ca. ${Math.ceil(bytes / 1024)} kB bildedata`;
}

function Summary({ plan, readiness }) {
  const card = PHOTO_EXPORT_PROFILE_METADATA[plan.profile];
  const contents = photoExportPackageContents(plan);
  const { zipFilename, gmlFilename } = plan.naming;
  const { counts } = plan;
  return <>
    <dl className="photo-export-summary">
      <div><dt>ZIP</dt><dd data-export-zip={zipFilename} data-export-gml={gmlFilename}>{zipFilename}</dd></div>
      <div><dt>GML</dt><dd>{gmlFilename}</dd></div>
      <div><dt>Format</dt><dd data-export-format={plan.profile}>{card.title}<small>{card.compatibility}</small></dd></div>
    </dl>
    <p className="photo-export-counts" data-export-counts>{[photoCount(contents.images), `${placementCount(contents.placements)} i GML-filen`, imageData(contents.totalBytes), contents.excluded ? `${placementCount(contents.excluded)} uten posisjon utelatt` : null].filter(Boolean).join(' · ')}</p>
    <PhotoExportStatus readiness={readiness} />
    <details className="photo-export-disclosure" data-package-contents>
      <summary>Innhold i pakken</summary>
      <ul>
        <li>{gmlFilename}</li>
        {plan.attachments.map((item) => <li key={item.assetId}>{item.path}</li>)}
      </ul>
      {contents.sharedAttachments > 0 && <p data-package-shared>{singularCopy(`${contents.sharedAttachments} originalbilder deles av flere plasseringer.`)}</p>}
      {contents.renamed.length > 0 && <>
        <p>Filnavn som er endret i pakken:</p>
        <ul data-package-renamed>{contents.renamed.map((item) => <li key={item.assetId}>{item.from} → {item.to}</li>)}</ul>
      </>}
    </details>
    <details className="photo-export-disclosure" data-package-technical>
      <summary>Tekniske detaljer</summary>
      <p>{singularCopy(`${counts.uniqueImages} unike bilder i laget · ${counts.totalOccurrences} forekomster · ${counts.placed} plassert · ${counts.excluded} utelatt`)}</p>
      <p>{singularCopy(`${counts.features} features · ${counts.attachments} vedlegg · ${counts.sharedAttachments} delte originalbilder`)}</p>
      <p>{plan.crs}{plan.profile === 'gemini-legacy2019' && singularCopy(` · 3D · ${counts.compatibilityZCount} Z-plassholdere · ${counts.missingTimestampCount} uten full opptakstid · ${counts.timezoneTransformCount} tidssoneendringer`)}</p>
      <PhotoExportDiagnostics groups={groupPhotoExportDiagnostics(plan.warnings)} />
    </details>
  </>;
}

// After the download: the name, and the schema gap when there is one. Last ned på nytt hands over the same plan, so the same
// bytes and identifiers; that guarantee lives in the wizard and needs no paragraph here.
function DownloadDone({ plan, readiness }) {
  const { zipFilename, gmlFilename } = plan.naming;
  const timeGap = readiness.levels.schema.gaps.find((gap) => gap.field === 'captureTime');
  return <>
    <p className="photo-export-filename" data-export-zip={zipFilename} data-export-gml={gmlFilename}>{zipFilename}</p>
    {timeGap && <p className="photo-completion-warning" data-export-warning="capture-time-schema">{singularCopy(`${timeGap.count} bilder mangler opptakstid.`)} Pakken følger derfor ikke {readiness.levels.schema.name}-skjemaet.</p>}
  </>;
}

// Nothing here can change the plan, so what is shown is exactly what will be packed.
export default function PhotoExportPackageStep({ status, preview, download, readiness }) {
  const { plan } = preview;
  const planErrors = status === 'plan-errors';
  return <div className="photo-export-package" data-export-step="package" data-package-state={status}>
    <h3 tabIndex={-1} aria-live="polite" data-export-heading><PhotoExportTone tone={TONES[status]} />{planErrors ? `${plan.errors.length} må rettes før eksport` : HEADINGS[status]}</h3>
    {status === 'build-failed' && <p role="alert">{preview.error}</p>}
    {planErrors && <div className="photo-export-diagnostics"><PhotoExportDiagnostics groups={groupPhotoExportDiagnostics(plan.errors)} /></div>}
    {status === 'stale' && <p role="alert">Bildene er endret etter at forhåndsvisningen ble laget.</p>}
    {status === 'packaging-failed' && <p role="alert">{download.error}</p>}
    {['ready', 'packaging', 'packaging-failed'].includes(status) && <Summary plan={plan} readiness={readiness} />}
    {status === 'done' && <DownloadDone plan={plan} readiness={readiness} />}
  </div>;
}
