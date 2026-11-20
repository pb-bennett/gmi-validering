'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { XIcon } from '@phosphor-icons/react';
import useStore from '@/lib/store';
import { loadedGmiSources } from '@/lib/photos/loadedGmiSource.mjs';
import { photoSession } from '@/lib/photos/photoSession.mjs';
import { gmiEditSessions } from '@/lib/gmiEditSessions.mjs';
import { getDatasetRevision } from '@/lib/validation-v2/datasetRevision';
import { photoPositionDistance } from '@/lib/photos/photoPositioning.mjs';
import { gmiObjectLabel } from '@/lib/photos/gmiPhotoSource.mjs';
import { photoDeliveryStatusText } from '@/lib/photos/photoDeliveryChoice.mjs';
import { detectPhotoLinkReview, emptyPhotoLinkReviewChoices, photoLinkReviewCandidates, photoLinkReviewDataset,
  photoLinkReviewHandoffIsCurrent, photoLinkReviewProposal, PHOTO_LINK_REVIEW_STALE, PHOTO_LINK_SHAPE_LABELS,
  reducePhotoLinkReviewChoices } from '@/lib/photos/photoHyperlinkReview.mjs';
import useGmiEditLayer from '@/components/gmi-edit/useGmiEditLayer';
import usePhotoSession from './usePhotoSession';
import PhotoIconButton from './PhotoIconButton';
import PhotoImportPreview from './PhotoImportPreview';
import './photoHyperlinkReview.css';

const ReviewMap = dynamic(() => import('./PhotoHyperlinkReviewMap'), { ssr: false });
const button = 'gmi-compact-button gmi-focus-ring border border-gmi-border-strong px-2 py-1 text-xs';
const number = (value) => Number.isFinite(value) ? value.toLocaleString('nb-NO', { maximumFractionDigits: 3 }) : 'Mangler';
const distance = (value) => value === null ? 'Kan ikke beregnes sikkert' : `${number(value)} m`;
const rawText = (value) => typeof value === 'string' ? value : JSON.stringify(value) ?? '';
const position = (value) => value ? `${value.longitude.toLocaleString('nb-NO', { maximumFractionDigits: 8 })}, ${value.latitude.toLocaleString('nb-NO', { maximumFractionDigits: 8 })} (EPSG:4326)` : 'Uplassert';
const acceptanceLabel = (value) => ({ manual: 'manuell', 'explicit-candidate': 'valgt kilde', 'import-default': 'ved import' }[value] || 'akseptert kilde');

function ObjectFacts({ object, source }) {
  return <details className="photo-link-facts"><summary className="gmi-focus-ring">Objektidentitet, koordinater og rå attributter</summary>
    <dl><div><dt>Kildeindeks</dt><dd>point:{object.sourceIndex} · ID {object.parserId}</dd></div>
      <div><dt>GUID</dt><dd>{object.guid || 'Mangler'}</dd></div>
      <div><dt>Tema i gjennomgangen</dt><dd>{object.tema || `Uavklart (${object.temaIdentity.state})`}</dd></div>
      <div><dt>Original X / Y / Z</dt><dd>{object.rawGeometry?.map((xyz) => `${number(xyz.x)} / ${number(xyz.y)} / ${number(xyz.z)}`).join('; ') || 'Mangler'}</dd></div>
      <div><dt>Koordinatsystem</dt><dd>{source.crsContext?.crsStatus === 'declared' ? 'Deklarert' : source.crsContext?.crsStatus === 'unsupported' ? 'Ikke støttet' : 'Ikke sikkert deklarert'} · {source.crsContext?.epsg ? `EPSG:${source.crsContext.epsg}` : 'Mangler'}</dd></div>
      <div><dt>Vertikal referanse</dt><dd>{rawText(source.header?.COSYSVER_EPSG) || 'Ikke deklarert'}</dd></div>
      {Object.entries(object.attributes).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{Object.hasOwn(object.rawAttributes, key) ? rawText(object.rawAttributes[key]) : `${rawText(value)} (tolket verdi; råverdi mangler)`}</dd></div>)}
    </dl>
  </details>;
}

function Cells({ object }) {
  return <div className="photo-link-cells">{object.cells.length ? object.cells.map((cell) => <div key={cell.field}>
    <strong>{cell.field}</strong><p>{PHOTO_LINK_SHAPE_LABELS[cell.shape]}{!cell.canonical && ' · Avvikende kolonnenavn'}</p><pre>{rawText(cell.raw) || '(tomt)'}</pre>
  </div>) : <p>Lenkekolonnen mangler. Ingen kolonne opprettes.</p>}</div>;
}

function ReviewBody({ model }) {
  'use no memo';
  const [choices, setChoices] = useState(emptyPhotoLinkReviewChoices);
  const [focusedOnly, setFocusedOnly] = useState(model.restricted);
  const [query, setQuery] = useState('');
  const [targetQuery, setTargetQuery] = useState('');
  const [activeKey, setActiveKey] = useState(() => model.rows.find((row) => row.focused)?.objectKey || '');
  const [candidatePage, setCandidatePage] = useState(0);
  const [photoId, setPhotoId] = useState(null);
  const rows = model.rows.filter((row) => (!focusedOnly || row.focused) && `${row.label} ${row.guid || ''} ${row.tema || ''} ${row.sourceIndex}`.toLocaleLowerCase('nb-NO').includes(query.toLocaleLowerCase('nb-NO')));
  const row = rows.find((entry) => entry.objectKey === activeKey) || rows[0];
  const candidates = row ? photoLinkReviewCandidates(model, row) : [];
  const filteredCandidates = candidates.filter(({ target }) => `${target.label} ${target.guid || ''} ${target.sourceIndex}`.toLocaleLowerCase('nb-NO').includes(targetQuery.toLocaleLowerCase('nb-NO')));
  const page = Math.min(candidatePage, Math.max(0, Math.ceil(filteredCandidates.length / 20) - 1));
  const selected = candidates.find((entry) => entry.target.objectKey === choices.targets[row?.objectKey]);
  const previewPhotos = row?.groups.flatMap((group) => group.photos) || [];
  const photo = previewPhotos.find((entry) => entry.id === photoId) || previewPhotos[0];
  const proposal = row ? photoLinkReviewProposal(model, row, choices) : null;
  const choose = (action) => setChoices((state) => reducePhotoLinkReviewChoices(state, { objectKey: row.objectKey, ...action }, model));
  const id = useId();
  return <>
    <div className="photo-link-filter">
      {model.restricted && <label><input type="checkbox" className="accent-gmi-interactive gmi-focus-ring" checked={focusedOnly} onChange={(event) => setFocusedOnly(event.target.checked)} /> Kun Validator-utvalget ({model.rows.filter((entry) => entry.focused).length})</label>}
      <label htmlFor={`${id}-search`}>Søk kildeobjekt</label><input id={`${id}-search`} className="gmi-compact-field" value={query} onChange={(event) => setQuery(event.target.value)} />
      <span>{rows.length} av {model.rows.length} tilfeller · {Object.values(choices.targets).filter(Boolean).length} foreslåtte KUM</span>
    </div>
    <div className="photo-link-columns">
      <nav aria-label="LOK/TOP med bildelenker" className="photo-link-list">
        {rows.map((entry) => <button key={entry.objectKey} type="button" className={`${button}${row === entry ? ' gmi-selected-control' : ''}`} aria-current={row === entry ? 'true' : undefined}
          onClick={() => { setActiveKey(entry.objectKey); setPhotoId(null); setCandidatePage(0); setTargetQuery(''); }}>
          <strong>{entry.tema || 'Uavklart Tema'} · {entry.label}</strong><span>point:{entry.sourceIndex} · {entry.references.length} referanser{choices.targets[entry.objectKey] ? ' · KUM foreslått' : ''}</span>
        </button>)}
        {!rows.length && <p>Ingen tilfeller i dette utvalget. Vis hele laget eller endre søket.</p>}
      </nav>
      <main className="photo-link-detail" aria-label="Gjennomgang av bildelenker">
        {row && <>
          <section><h3>Kilde: {row.tema || 'Uavklart Tema'} · {row.label}</h3><ObjectFacts object={row} source={model.source} /><Cells object={row} />
            {row.issues.map((issue) => <p key={issue} className="gmi-validation-accent" data-validation-tone="warning">{issue}</p>)}
          </section>
          <section aria-label="Bildereferanser"><h3>Bilder og referanser som vurderes</h3>
            {row.groups.map((group) => <article key={group.key} className="photo-link-group">
              <label><input type="checkbox" className="accent-gmi-interactive gmi-focus-ring" checked={choices.groups[JSON.stringify([row.objectKey, group.key])] === true}
                onChange={(event) => choose({ type: 'group', groupKey: group.key, selected: event.target.checked })} />
                {group.references[0].filename || 'Ugyldig mål'} · {group.references.length} referanse(r)</label>
              {group.references.map((reference) => <div key={reference.id}><code>{reference.referenceRaw}</code>
                <p>{reference.resolution.status === 'confident' ? `Sikkert filtreff i valgt fotolag (${reference.resolution.method?.includes('basename') ? 'unikt filnavn' : 'sti'})`
                  : reference.resolution.status === 'ambiguous' ? `Tvetydig filtreff: ${reference.resolution.photoIds.length} importerte kopier. Avklar kopiene i FOTO.`
                    : reference.resolution.status === 'invalid' ? 'Ikke en gyldig bildereferanse. Kontroller originalfeltet og filtypen.'
                      : reference.resolution.reason === 'unsafe-reference' ? 'Ekstern adresse eller utrygg sti brukes ikke. Avklar en lokal filreferanse i originalgrunnlaget.'
                      : 'Bildefilen mangler i valgt fotolag. Legg til bildene eller velg riktig fotolag.'}</p>
                <small>Uttrykk {reference.wrapperOrdinal === null ? 'bart' : reference.wrapperOrdinal + 1} · medlem {reference.memberOrdinal + 1}</small>
                {reference.identicalRawReferenceIds.length > 1 && <p>Samme rå referanse forekommer {reference.identicalRawReferenceIds.length} ganger i kilden. Dette bekrefter ikke samme bildefil.</p>}
              </div>)}
              {group.references.length > 1 && <p>Gjentatte referanser vises samlet for samme filtreff. Ingen duplikater fjernes.</p>}
              {group.sharedObjectKeys.length > 1 && <p>Bildet deles av {group.sharedObjectKeys.length} objekter: {group.sharedObjectKeys.join(', ')}. Hver eier beholdes separat.</p>}
              {group.photos.map((entry, index) => <div key={entry.id} className="photo-link-photo-row"><button type="button" className={`${button}${photo?.id === entry.id ? ' gmi-selected-control' : ''}`} aria-pressed={photo?.id === entry.id} onClick={() => setPhotoId(entry.id)}>{group.assetId ? 'Vis' : `Mulig fil ${index + 1}:`} {entry.sourceRelativePath || entry.originalFilename}</button>
                <span>{entry.occurrence?.object ? gmiObjectLabel(entry.occurrence.object) : 'Uten GMI-plassering'} · {photoDeliveryStatusText(model.delivery?.byPhotoId?.[entry.id]) || 'Leveringsvalg mangler'}</span></div>)}
            </article>)}
          </section>
          <section aria-label="KUM-kandidater"><h3>KUM i samme kilde ({candidates.length})</h3>
            <p>Avstand sorterer listen. Nærmeste objekt og like identifikatorer bekrefter ingen relasjon. Ingen søkeradius er fastsatt.</p>
            {candidates.length > 1 && <p>Flere mulige KUM. Mottaker må avklares faglig; ingen er valgt automatisk.</p>}
            <label htmlFor={`${id}-targets`}>Søk KUM</label><input id={`${id}-targets`} className="gmi-compact-field" value={targetQuery} onChange={(event) => { setTargetQuery(event.target.value); setCandidatePage(0); }} />
            <label className="photo-link-target"><input type="radio" className="accent-gmi-interactive gmi-focus-ring" name={`${id}-target`} checked={!selected} onChange={() => choose({ type: 'target', targetKey: null })} /> Ingen foreslått mottaker</label>
            {!candidates.length && <p>Ingen entydig Tema KUM finnes i kilden. Kontroller Tema i Validator eller avklar mottaker i originalgrunnlaget.</p>}
            {filteredCandidates.slice(page * 20, page * 20 + 20).map((candidate) => <label className="photo-link-target" key={candidate.target.objectKey}>
              <input type="radio" className="accent-gmi-interactive gmi-focus-ring" name={`${id}-target`} checked={selected?.target.objectKey === candidate.target.objectKey}
                onChange={() => choose({ type: 'target', targetKey: candidate.target.objectKey })} />
              <span><strong>{candidate.target.label}</strong><span>point:{candidate.target.sourceIndex} · XY: {distance(candidate.distanceMetres)} · ΔZ: {number(candidate.deltaZ)}{candidate.deltaZ !== null ? ' (rå differanse)' : ''}</span>
                {candidate.sameIdentifiers.length > 0 && <span>Like felt: {candidate.sameIdentifiers.join(', ')} – ikke bekreftet forelderrelasjon</span>}
                {candidate.reusedAssets.length > 0 && <span>Finnes allerede på KUM: {candidate.reusedAssets.length} filtreff. Gjenbruk er ikke avklart.</span>}
                {candidate.target.references.length > 0 && <span>KUM har {candidate.target.references.length} eksisterende referanser</span>}</span>
            </label>)}
            {filteredCandidates.length > 20 && <div className="photo-link-pagination"><button type="button" className={button} disabled={page === 0} onClick={() => setCandidatePage(page - 1)}>Forrige KUM</button>
              <span>{page + 1} / {Math.ceil(filteredCandidates.length / 20)}</span><button type="button" className={button} disabled={(page + 1) * 20 >= filteredCandidates.length} onClick={() => setCandidatePage(page + 1)}>Neste KUM</button></div>}
          </section>
          <section aria-label="Foreslått mottaker"><h3>Foreslått mottaker og plassering</h3>
            {selected ? <><p><strong>{selected.target.label}</strong> · {proposal.referenceIds.length} valgte referanser</p><ObjectFacts object={selected.target} source={model.source} /><Cells object={selected.target} />
              <p>Original → KUM, XY: {distance(selected.distanceMetres)} · ΔZ: {number(selected.deltaZ)} (uten vertikal transformasjon)</p>
              {selected.conflicts.map((issue) => <p key={issue} className="gmi-validation-accent" data-validation-tone="warning">{issue}</p>)}</> : <p>Velg en KUM eksplisitt for å se et posisjonsforslag.</p>}
            <p>Original LOK/TOP: {position(row.placement?.position)} · Z: {number(row.rawGeometry?.[0]?.z)}</p>
            {row.relatedPhotos.map((entry) => {
              const acceptedCandidate = entry.spatial.candidates.find((candidate) => candidate.id === entry.spatial.current?.basis?.candidateId);
              return <div key={entry.id}><p>Akseptert nå ({entry.originalFilename} · {entry.occurrence?.object ? gmiObjectLabel(entry.occurrence.object) : 'uten GMI-plassering'}, {entry.spatial.current ? acceptanceLabel(entry.spatial.current.acceptance) : 'ingen'}): {position(entry.spatial.current?.position)}
                {selected && ` · Nå → KUM, XY: ${distance(photoPositionDistance(entry.spatial.current?.position, selected.target.placement?.position))}`}</p>
                <details><summary className="gmi-focus-ring">Akseptert kilde og rå Z-evidens</summary><pre>{acceptedCandidate ? rawText({ kilde: acceptedCandidate.kind, rådata: acceptedCandidate.raw }) : 'Ingen rå Z-evidens knyttet til nåværende plassering. Høyde er ikke antatt.'}</pre></details></div>;
            })}
            {!row.relatedPhotos.length && <p>Ingen sikkert tilknyttet FOTO-plassering. Ingen akseptert posisjon er antatt.</p>}
            {selected && <p>Foreslått KUM: {position(selected.target.placement?.position)} · Z: {number(selected.target.rawGeometry?.[0]?.z)}</p>}
            <p>Z er rå evidens. Høydereferanse, vertikalnivå og mottakerens tolkning må avklares; høyder endres ikke.</p>
            <ReviewMap row={row} candidates={candidates} selected={selected} />
          </section>
        </>}
      </main>
      <aside className="photo-link-preview" aria-label="Fotoforhåndsvisning">{photo ? <PhotoImportPreview key={photo.assetId} photo={photo} enableLargeView={false} /> : <p>Ingen bildefil å vise for dette objektet.</p>}</aside>
    </div>
  </>;
}

export default function PhotoHyperlinkReviewDialog({ request, onClose, openerRef }) {
  'use no memo';
  const dialogRef = useRef(null), titleId = useId();
  const layers = useStore((state) => state.layers);
  const referenceDate = useStore((state) => state.gmiValidatorReferenceDate);
  const snapshot = usePhotoSession();
  const restricted = request.kind === 'validator-photo-links';
  const initialPhotoLayer = request.photoLayerId || snapshot.photoLayers.find((layer) => layer.spatialSources.some((source) => source.loadedBinding?.inputId === request.binding?.inputId))?.id || '';
  const [photoLayerId, setPhotoLayerId] = useState(initialPhotoLayer);
  const photoLayer = snapshot.photoLayers.find((layer) => layer.id === photoLayerId);
  const options = useMemo(() => {
    const attached = (photoLayer?.spatialSources || []).filter((source) => source.kind === 'gmi').map((source) => ({ id: source.id,
      label: `${source.filename} · ${source.loadedBinding && loadedGmiSources.isLive(source.loadedBinding) ? 'koblet GMI-lag' : 'FOTO-kilde'}`, source,
      layerId: source.loadedBinding && loadedGmiSources.isLive(source.loadedBinding) ? source.loadedBinding.layerId : null }));
    const live = Object.values(layers).filter((layer) => loadedGmiSources.available(layer.id) && !attached.some((entry) => entry.layerId === layer.id))
      .map((layer) => ({ id: `loaded:${layer.id}`, label: `${layer.name || layer.filename || layer.id} · lastet GMI-lag`, layerId: layer.id }));
    return [...attached, ...live].filter((entry) => !restricted || entry.layerId === request.layerId);
  }, [photoLayer, layers, restricted, request.layerId]);
  const [sourceId, setSourceId] = useState(() => options.find((entry) => entry.layerId === request.layerId)?.id || options[0]?.id || '');
  const option = options.find((entry) => entry.id === sourceId) || options[0];
  const { view } = useGmiEditLayer(option?.layerId);
  const [datasetKind, setDatasetKind] = useState(request.datasetKind || 'original');
  const proposed = useMemo(() => view ? gmiEditSessions.proposed(view.handle) : null, [view]);
  const [loaded, setLoaded] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const ticket = option?.layerId ? loadedGmiSources.begin(option.layerId) : null;
    if (ticket) void loadedGmiSources.read(ticket).then((evidence) => {
      if (!cancelled) setLoaded({ optionId: option.id, source: option.source || { ...evidence, id: option.id, filename: ticket.binding.filename }, binding: ticket.binding });
    }).catch(() => { if (!cancelled) setLoaded({ optionId: option.id, error: PHOTO_LINK_REVIEW_STALE }); });
    return () => { cancelled = true; };
  }, [option]);
  useEffect(() => {
    const dialog = dialogRef.current, opener = openerRef?.current || document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); if (opener?.isConnected) opener.focus(); };
  }, [openerRef]);
  const current = useMemo(() => loaded?.optionId === option?.id ? loaded : option?.source && !option.layerId ? { optionId: option.id, source: option.source, binding: null } : null, [loaded, option]);
  const dataset = useMemo(() => datasetKind === 'proposed' ? proposed?.dataset
    : option?.layerId ? layers[option.layerId]?.data : current?.source ? photoLinkReviewDataset(current.source) : null,
  [datasetKind, proposed, option?.layerId, layers, current?.source]);
  const { photos, delivery } = useMemo(() => {
    // Session publications may change accepted positions or decisions without changing layer counts/identity.
    const live = snapshot.photoLayers.some((layer) => layer.id === photoLayerId);
    return { photos: live ? photoSession.getLayerPhotos(photoLayerId) : [], delivery: live ? photoSession.getLayerDelivery(photoLayerId) : null };
  }, [snapshot, photoLayerId]);
  const result = useMemo(() => {
    if (restricted && (!option || !current?.binding || !loadedGmiSources.isLive(current.binding) || referenceDate !== request.run.runContext.referenceDate
      || !photoLinkReviewHandoffIsCurrent(request, { layer: layers[request.layerId], binding: current.binding,
        dataset, session: request.datasetKind === 'proposed' ? view?.session : null }))) return { error: current || !option ? PHOTO_LINK_REVIEW_STALE : null };
    if (request.photoLayerId && !photoLayer) return { error: 'Fotolaget er ikke lenger tilgjengelig. Lukk gjennomgangen og åpne et gjeldende fotolag.' };
    if (current?.source && datasetKind === 'proposed' && !proposed?.ok) return { error: 'Foreslått grunnlag kan ikke verifiseres. Velg Original eller kontroller Rettinger før du åpner gjennomgangen på nytt.' };
    if (!current?.source || !dataset) return { error: current?.error || null };
    try { return { model: detectPhotoLinkReview({ source: current.source, dataset, layerId: option?.layerId || current.source.id,
      photos, delivery, focusRefs: restricted ? request.refs : null }) }; }
    catch (error) { return { error: error.message }; }
  }, [current, dataset, photos, delivery, restricted, request, layers, referenceDate, view, option, photoLayer, datasetKind, proposed]);
  const model = result.model;
  return <dialog ref={dialogRef} className="photo-link-review" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header><h2 id={titleId}>FOTO · Gjennomgå bildelenker på LOK/TOP</h2><PhotoIconButton icon={XIcon} size={20} label="Lukk gjennomgang av bildelenker" onClick={onClose} /></header>
    <p className="photo-link-boundary">Kun gjennomgang. KUM- og lenkevalg er midlertidige og forkastes ved lukking. Ingen data lagres eller flyttes. KUM-flytting er en egen operasjon, adskilt fra GMI → GML.</p>
    <div className="photo-link-source-controls">
      <label>GMI-kilde<select className="gmi-compact-field" value={option?.id || ''} disabled={restricted} onChange={(event) => setSourceId(event.target.value)}>
        {!options.length && <option value="">Ingen GMI-kilde</option>}{options.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
      <label>Grunnlag<select className="gmi-compact-field" value={datasetKind} disabled={restricted} onChange={(event) => setDatasetKind(event.target.value)}><option value="original">Original</option><option value="proposed" disabled={!proposed?.ok}>Foreslått i Rettinger</option></select></label>
      <label>Fotolag<select className="gmi-compact-field" value={photoLayer?.id || ''} onChange={(event) => setPhotoLayerId(event.target.value)}><option value="">Ingen bildefiler</option>{snapshot.photoLayers.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}</select></label>
    </div>
    {!option && <p className="photo-link-message">Koble en GMI-kilde til fotolaget, eller last inn GMI som kartlag, og åpne gjennomgangen på nytt.</p>}
    {current?.source && !current.binding && <p className="photo-link-message">Kun FOTO-kilde: ingen levende kobling til et lastet GMI-lag. Last inn originalfilen for å avklare kildebinding før eventuell flytting.</p>}
    {option && !current && <p className="photo-link-message" role="status">Leser kildegrunnlag …</p>}
    {result.error && <p className="photo-link-message" role="alert">{result.error}</p>}
    {model && <ReviewBody key={JSON.stringify([option.id, getDatasetRevision(dataset), photoLayer?.id, delivery?.stateKey,
      photos.map((photo) => [photo.id, photo.spatial.current])])} model={model} />}
    <footer><span>Ingen utførings- eller lagringsfunksjon i denne gjennomgangen.</span><button type="button" className={button} onClick={onClose}>Avslutt gjennomgang</button></footer>
  </dialog>;
}
