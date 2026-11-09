'use client';

/* eslint-disable @next/next/no-img-element -- Local Blob URLs must render in the browser without server image optimization. */
import { useEffect, useRef, useState } from 'react';
import { ArrowsOutIcon, CrosshairIcon, PencilSimpleIcon } from '@phosphor-icons/react';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { photoPreviewMessage } from '@/lib/photos/imagePreview.mjs';
import { exifGpsMessage } from '@/lib/photos/exifGps.mjs';
import { photoDirectionLabel } from '@/lib/photos/photoDirection.mjs';
import { photoPositionSourceKind, photoPositionSourcePresentation } from '@/lib/photos/photoMarkerPresentation.mjs';
import { photoPositionDistance } from '@/lib/photos/photoPositioning.mjs';
import { gmiObjectContext } from '@/lib/photos/photoImportOutcome.mjs';
import { gmiPhotoAssociations } from '@/lib/photos/gmiPhotoSource.mjs';
import { isPhotoPosition } from '@/lib/photos/photoSpatial.mjs';
import { formatPhotoCaptureTime, formatPhotoCoordinates, formatPhotoMoveDistance, photoCaptureTimeStatus, photoDirectionEvidenceText, photoDirectionSourceLabel, photoMetadataConflict,
  photoMetadataSourceLabel, photoPlacementBasisLabel, photoSourceLabel } from '@/lib/photos/photoPresentation.mjs';
import PhotoIconButton from './PhotoIconButton';
import './photoCollectionPanel.css';

function formatSize(size) {
  return size >= 1024 * 1024
    ? `${(size / (1024 * 1024)).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} MB`
    : `${(size / 1024).toLocaleString('nb-NO', { maximumFractionDigits: 1 })} kB`;
}
const formatTimestamp = (value) => value ? new Date(value).toLocaleString('nb-NO') : null;
const Fact = ({ term, children }) => children === null || children === undefined || children === '' ? null
  : <div><dt>{term}</dt><dd>{children}</dd></div>;
const evidenceRaw = (raw) => typeof raw === 'string' ? raw : JSON.stringify(raw);

function CaptureValue({ field, accepted }) {
  if (!accepted) return 'Ikke angitt';
  if (field !== 'captureTime') return accepted.value;
  const formatted = formatPhotoCaptureTime(accepted.value, accepted.provenance);
  return <>{formatted?.text || accepted.value.iso}{formatted?.notes.length ? <span className="photo-inspector-note"> · {formatted.notes.join(' · ')}</span> : null}</>;
}

// The preview's height follows the image's own aspect ratio (capped by the viewport), so portrait photos
// are shown large without cropping and landscape photos use the full inspector width.
function Preview({ photo, onOpenViewer }) {
  const imageRef = useRef(null);
  const [inspectionFailed, setInspectionFailed] = useState(false);
  const canInspect = photo?.preview.state === 'ready' || (photo?.preview.errorCode === 'thumbnail-failed' && Boolean(photo?.dimensions));
  const assetId = photo?.assetId || photo?.id;
  // The inspector owns the one inline original-file URL for the selected asset; siblings share it.
  useEffect(() => {
    if (!canInspect) return undefined;
    const file = photoSession.getAssetFile(assetId), image = imageRef.current;
    if (!file || !image) return undefined;
    const url = URL.createObjectURL(file);
    image.src = url;
    return () => { image.removeAttribute('src'); URL.revokeObjectURL(url); };
  }, [assetId, canInspect]);
  const { width, height } = photo?.dimensions || {};
  const orientation = width && height ? (height > width ? 'portrait' : width > height ? 'landscape' : 'square') : 'unknown';
  return <div className="photo-collection-original photo-inspector-preview" data-orientation={orientation}
    style={width && height ? { '--photo-aspect': `${width} / ${height}` } : undefined}>
    {photo && canInspect ? <>
      <img ref={imageRef} alt={photo.originalFilename} decoding="async" onError={() => setInspectionFailed(true)} hidden={inspectionFailed} />
      {!inspectionFailed && photo.dimensions && <PhotoIconButton icon={ArrowsOutIcon} size={20} label={`Vis ${photo.originalFilename} i fullskjerm`}
        tooltip="Vis stort" aria-haspopup="dialog" className="photo-preview-open" onClick={() => onOpenViewer?.()} />}
      {inspectionFailed && <p className="p-4 text-sm text-gmi-text-muted">Originalbildet kunne ikke vises.</p>}
    </> : <p className="p-6 text-center text-sm text-gmi-text-muted">
      {!photo ? 'Velg et bilde i listen eller på kartet for å se det her.' : photo.preview.state === 'pending' ? 'Forhåndsvisningen klargjøres …' : photoPreviewMessage(photo.preview.errorCode)}
    </p>}
  </div>;
}

// Disclosure state survives switching photos (the inspector remounts per asset) for this page session only.
const openDisclosures = new Set();
const rememberToggle = (id) => (event) => { if (event.currentTarget.open) openDisclosures.add(id); else openDisclosures.delete(id); };

function Disclosure({ id, summary, children }) {
  return <details className="photo-inspector-disclosure" data-disclosure={id} open={openDisclosures.has(id) || undefined} onToggle={rememberToggle(id)}>
    <summary>{summary}</summary>
    <div className="photo-inspector-disclosure-body">{children}</div>
  </details>;
}

// A whole section that starts collapsed (GMI associations, file details): its heading is the summary.
function CollapsibleSection({ id, title, count = null, scope, children }) {
  return <section className="photo-inspector-section photo-inspector-collapsible" aria-label={title}>
    <details data-disclosure={id} open={openDisclosures.has(id) || undefined} onToggle={rememberToggle(id)}>
      <summary><h3>{title}{count !== null && <span className="photo-inspector-count">{count}</span>}{scope && <span className="photo-inspector-scope">{scope}</span>}</h3></summary>
      <div className="photo-inspector-disclosure-body">{children}</div>
    </details>
  </section>;
}

function Section({ title, scope, children, className = '' }) {
  return <section className={`photo-inspector-section ${className}`} aria-label={title}>
    <h3>{title}{scope && <span className="photo-inspector-scope">{scope}</span>}</h3>
    {children}
  </section>;
}

// Read-only in place: navigation (preview, locate, occurrence switcher), disclosures, and exactly one
// contextual action that opens the focused metadata dialog. Nothing is edited inside the inspector itself.
// Photo first: the default view is the photo, its status chips, coordinates and concise capture data.
// Provenance, evidence, associations, file details and raw diagnostics are kept, one click away.
export default function PhotoWorkspaceInspector({ photo, layer, siblings = [], editing = false, onSelect, onLocate, onEditMetadata, onOpenViewer }) {
  if (!photo) return <section className="photo-collection-inspector photo-workspace-inspector-body" aria-label="Bilde som vises">
    <h2 className="truncate text-sm font-semibold text-gmi-navy">Velg et bilde</h2>
    <Preview photo={null} />
  </section>;
  const current = photo.spatial.current, placed = isPhotoPosition(current?.position);
  const source = photoPositionSourcePresentation(photoPositionSourceKind(photo));
  const basis = photo.spatial.candidates.find((candidate) => candidate.id === current?.basis?.candidateId);
  const direction = photo.direction?.current || null;
  const capture = photo.captureMetadata || {};
  const staged = photo.staged || null;
  const saved = photo.saved || null;
  const others = photo.spatial.candidates.filter((candidate) => candidate.status === 'viable' && candidate.id !== basis?.id);
  const links = gmiPhotoAssociations(layer, photo.id);
  const filename = photo.originalFilename;
  const occurrenceObjectKey = photo.occurrence?.objectKey;
  const thisLink = links.find(({ association }) => association.objectKey === occurrenceObjectKey);
  return <section className="photo-collection-inspector photo-workspace-inspector-body" aria-label="Bilde som vises" data-photo-id={photo.id}>
    <header className="photo-inspector-header">
      <h2 className="truncate text-sm font-semibold text-gmi-navy" title={photo.sourceRelativePath || filename}>{filename}</h2>
      {siblings.length > 1 && <div className="photo-occurrence-switcher" role="group" aria-label={`Brukt på ${siblings.length} plasseringer`}>
        <span>Brukt på {siblings.length} plasseringer</span>
        {siblings.map((sibling) => <button key={sibling.id} type="button" aria-pressed={sibling.id === photo.id}
          className={`gmi-compact-button gmi-focus-ring${sibling.id === photo.id ? ' gmi-selected-control' : ''}`} onClick={() => onSelect?.(sibling.id)}>
          {sibling.repeatGroup?.occurrenceIndex} · {sibling.occurrence?.object ? gmiObjectContext(sibling.occurrence.object) : 'Uten objekt'}
        </button>)}
      </div>}
    </header>
    <Preview photo={photo} onOpenViewer={onOpenViewer} />
    <ul className="photo-inspector-chips" aria-label="Oppsummering">
      <li>{placed ? <><span className="photo-source-dot" style={{ background: source.color }} aria-hidden="true" />Plassert · {source.label}</> : 'Uplassert'}</li>
      <li>{direction ? `Retning ${photoDirectionLabel(direction.degrees)}` : 'Uten retning'}</li>
      <li>{photoCaptureTimeStatus(photo)}</li>
      {editing && staged && <li className="photo-inspector-chip-staged">Endret – ikke lagret</li>}
    </ul>

    <Section title="Plassering" scope="gjelder denne plasseringen">
      <div className="photo-inspector-locate-row">
        <dl className="photo-inspector-facts">
          <Fact term="Koordinater">{placed ? formatPhotoCoordinates(current.position) : 'Ikke plassert'}</Fact>
          {staged?.position && <Fact term="Lagret">{saved.current ? `${formatPhotoCoordinates(saved.current.position)} · ${formatPhotoMoveDistance(photoPositionDistance(saved.current.position, current.position))} unna` : 'Uplassert'}</Fact>}
          {staged?.direction && <Fact term="Lagret retning">{saved.direction ? photoDirectionLabel(saved.direction.degrees) : 'Ikke angitt'}</Fact>}
        </dl>
        <PhotoIconButton icon={CrosshairIcon} label={`Zoom til ${filename} på kartet`} tooltip={placed ? 'Zoom til bildet' : 'Zoom til bildet – bildet er ikke plassert'}
          unavailable={!placed} className="photo-inspector-locate" onClick={() => onLocate?.({ layerId: layer.id, photoId: photo.id, ...(staged?.position ? { position: current.position } : {}) })} />
      </div>
      <Disclosure id="placement-provenance" summary="Kilde, grunnlag og retning">
        <dl className="photo-inspector-facts">
          <Fact term="Status">{placed ? 'Plassert' : 'Uplassert'}</Fact>
          {placed && <Fact term="Kilde"><span className="photo-source-dot" style={{ background: source.color }} aria-hidden="true" />{source.label}</Fact>}
          {placed && <Fact term="Grunnlag">{photoPlacementBasisLabel(current)}{current.acceptedAt ? ` · ${formatTimestamp(current.acceptedAt)}` : ''}</Fact>}
          {basis?.sourceFilename && <Fact term="Kildefil"><span className="break-all">{basis.sourceFilename}</span></Fact>}
          <Fact term="Retning">{direction ? photoDirectionLabel(direction.degrees) : 'Ikke angitt'}</Fact>
          {direction && <Fact term="Retningskilde">{photoDirectionSourceLabel(direction)}{direction.acceptedAt ? ` · ${formatTimestamp(direction.acceptedAt)}` : ''}</Fact>}
        </dl>
      </Disclosure>
      {others.length > 0 && <Disclosure id="placement-alternatives" summary={`Andre mulige posisjoner (${others.length})`}>
        <ul className="photo-inspector-candidates">{others.map((candidate) => {
          const distance = placed ? photoPositionDistance(current.position, candidate.position) : null;
          const kind = photoSourceLabel(candidate.kind);
          return <li key={candidate.id} data-candidate-kind={candidate.kind}>
            <span>
              <strong>{kind}</strong>{candidate.sourceFilename ? ` · ${candidate.sourceFilename}` : ''}
              {distance !== null && <span className="photo-inspector-note"> · {formatPhotoMoveDistance(distance)} fra gjeldende</span>}
              {candidate.issues?.includes('questionable-zero-gps') && <span className="photo-inspector-warning">GPS er 0°/0°. Kontroller kilden før du bruker posisjonen.</span>}
            </span>
            <PhotoIconButton icon={CrosshairIcon} size={14} label={`Zoom til ${kind}-posisjon for ${filename}`} tooltip={`Zoom til ${kind}-posisjon`}
              className="photo-inspector-locate" onClick={() => onLocate?.({ layerId: layer.id, photoId: photo.id, candidateId: candidate.id })} />
          </li>;
        })}</ul>
      </Disclosure>}
      <Disclosure id="placement-technical" summary="Tekniske kildedata">
        <p>{exifGpsMessage(photo.spatial.exifRead.state, photo.spatial.exifRead.errorCode)}</p>
        {photo.spatial.candidates.map((candidate) => <div key={candidate.id} className="photo-inspector-raw">
          <p>{photoSourceLabel(candidate.kind)}{candidate.status !== 'viable' ? ' · Kan ikke brukes' : ''}{candidate.id === basis?.id ? ' · I bruk' : ''}{candidate.sourceFilename ? ` · ${candidate.sourceFilename}` : ''}</p>
          <p>{formatPhotoCoordinates(candidate.position)}</p>
          {candidate.errorCode && <p className="text-red-700">{candidate.errorCode}</p>}
          {candidate.crsResolution?.method === 'terrain-envelope-fallback' && <p>CRS er hentet fra samlingens avgrensning i eldre Terrain GML. Bare horisontal posisjon er transformert.</p>}
          <pre>{JSON.stringify({ raw: candidate.raw, crs: candidate.crsResolution, transform: candidate.transform }, null, 2)}</pre>
        </div>)}
        {!photo.spatial.candidates.length && <p>Ingen kildeposisjoner er registrert.</p>}
      </Disclosure>
      {photo.directionEvidence?.length > 0 && <Disclosure id="direction-evidence" summary="Retningsdata fra kilder">
        {photo.directionEvidence.map((item) => <p key={item.id}><code>{JSON.stringify(item.raw)}</code> · {photoDirectionEvidenceText(item)}</p>)}
      </Disclosure>}
    </Section>

    <Section title="Opptak" scope="gjelder bildet (alle plasseringer)">
      <dl className="photo-inspector-facts">
        <Fact term="Opptakstid"><CaptureValue field="captureTime" accepted={capture.captureTime} /></Fact>
        <Fact term="Fotograf"><CaptureValue field="photographer" accepted={capture.photographer} /></Fact>
      </dl>
      {photoMetadataConflict(photo, 'captureTime') && <p className="photo-inspector-warning" role="note">Kildene oppgir ulike opptakstider.</p>}
      {(capture.captureTime || capture.photographer || photo.metadataEvidence?.length > 0) && <Disclosure id="capture-evidence"
        summary={photo.metadataEvidence?.length ? `Kilder og kildeverdier (${photo.metadataEvidence.length})` : 'Kilder'}>
        <dl className="photo-inspector-facts">
          {capture.captureTime && <Fact term="Opptakstid fra">{photoMetadataSourceLabel('captureTime', capture.captureTime.provenance)}</Fact>}
          {capture.photographer && <Fact term="Fotograf fra">{photoMetadataSourceLabel('photographer', capture.photographer.provenance)}</Fact>}
        </dl>
        {photo.metadataEvidence?.length > 0 && <ul className="photo-inspector-evidence">{photo.metadataEvidence.map((evidence) => <li key={evidence.id}>
          <strong>{evidence.field === 'captureTime' ? 'Opptakstid' : 'Fotograf'} · {photoSourceLabel(evidence.kind)}</strong>{evidence.sourceFilename ? ` · ${evidence.sourceFilename}` : ''}
          <p>{evidence.value ? (evidence.field === 'captureTime' ? formatPhotoCaptureTime(evidence.value)?.text || evidence.value.iso : evidence.value) : 'Kan ikke tolkes sikkert; beholdt som rå kildedata.'}</p>
          <p className="photo-inspector-note">Rå verdi: {evidenceRaw(evidence.raw)}</p>
        </li>)}</ul>}
      </Disclosure>}
      <button type="button" className="photo-inspector-action gmi-compact-button gmi-focus-ring" aria-haspopup="dialog" onClick={onEditMetadata}>
        <PencilSimpleIcon size={15} weight="regular" aria-hidden="true" />Rediger opptaksdata…
      </button>
    </Section>

    <CollapsibleSection id="links" title="Koblinger" count={links.length}
      scope={thisLink ? `denne plasseringen: ${gmiObjectContext(thisLink.object)}` : links.length ? null : 'ingen GMI-objekter'}>
      {links.length ? <ul className="photo-inspector-links">{links.map(({ association, sourceFilename, object }) => {
        const identifiers = Object.entries(object.identifiers || {}).filter(([, value]) => value !== null && value !== undefined && String(value).trim());
        return <li key={association.id} data-object-key={object.objectKey}>
          <p className="photo-inspector-link-title"><strong>{gmiObjectContext(object)}</strong>
            {association.objectKey === occurrenceObjectKey && <span className="photo-inspector-badge">Denne plasseringen</span>}</p>
          <p>{[object.tema && `TEMA ${object.tema}`, object.type && `Type ${object.type}`, object.geometryScope === 'line' ? 'Ledning' : 'Punkt'].filter(Boolean).join(' · ')}</p>
          {identifiers.length > 0 && <p>{identifiers.map(([key, value]) => `${key} ${value}`).join(' · ')}</p>}
          {object.geometryScope === 'line' && <p className="photo-inspector-note">Kobling uten posisjon (ledning)</p>}
          <p className="photo-inspector-note break-all">Kilde: {sourceFilename}</p>
          <details><summary>Tekniske detaljer</summary><p className="break-all">GUID: {object.guid || 'Ikke oppgitt'}</p></details>
        </li>;
      })}</ul> : <p className="photo-inspector-note">Ikke koblet til GMI-objekter.</p>}
    </CollapsibleSection>

    <CollapsibleSection id="file" title="Fil" scope={photo.dimensions ? `${photo.dimensions.width} × ${photo.dimensions.height} px · ${formatSize(photo.size)}` : formatSize(photo.size)}>
      <dl className="photo-inspector-facts">
        <Fact term="Filnavn"><span className="break-all">{filename}</span></Fact>
        <Fact term="Relativ sti">{photo.sourceRelativePath ? <span className="break-all">{photo.sourceRelativePath}</span> : null}</Fact>
        <Fact term="Størrelse">{formatSize(photo.size)}</Fact>
        <Fact term="Dimensjoner">{photo.dimensions ? `${photo.dimensions.width} × ${photo.dimensions.height} px` : 'Ikke tilgjengelig'}</Fact>
        <Fact term="MIME/type"><span className="break-all">{photo.mimeType || 'Ikke oppgitt'}</span></Fact>
        <Fact term="Fil sist endret">{formatTimestamp(photo.lastModified)}</Fact>
      </dl>
      <p className="photo-inspector-note">Originalfilen endres ikke.</p>
    </CollapsibleSection>
  </section>;
}
