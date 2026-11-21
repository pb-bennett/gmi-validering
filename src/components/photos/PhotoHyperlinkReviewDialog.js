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
import { detectPhotoLinkReview, emptyPhotoLinkReviewChoices, photoLinkReviewCandidates, photoLinkReviewDataset, photoLinkReviewDecisions,
  photoLinkReviewHandoffIsCurrent, photoLinkReviewProgress, PHOTO_LINK_OUTCOME_LABELS, PHOTO_LINK_REVIEW_STALE, PHOTO_LINK_SHAPE_LABELS,
  reducePhotoLinkReviewChoices } from '@/lib/photos/photoHyperlinkReview.mjs';
import useGmiEditLayer from '@/components/gmi-edit/useGmiEditLayer';
import usePhotoSession from './usePhotoSession';
import PhotoIconButton from './PhotoIconButton';
import PhotoImportPreview from './PhotoImportPreview';
import './photoTheme.css';
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
  return <details className="photo-link-facts"><summary className="gmi-focus-ring">Lenkefelt med rå uttrykk</summary>
    <div className="photo-link-cells">{object.cells.length ? object.cells.map((cell) => <div key={cell.field}>
      <strong>{cell.field}</strong><p>{PHOTO_LINK_SHAPE_LABELS[cell.shape]}{!cell.canonical && ' · Avvikende kolonnenavn'}</p><pre>{rawText(cell.raw) || '(tomt)'}</pre>
    </div>) : <p>Lenkekolonnen mangler. Ingen kolonne opprettes.</p>}</div>
  </details>;
}

const objectName = (object) => `${object.tema || 'Uavklart Tema'} · ${object.pointName}`;
const resolutionText = (resolution) => resolution?.status === 'confident'
  ? `Sikkert filtreff i valgt fotolag (${resolution.method?.includes('basename') ? 'unikt filnavn' : 'sti'})`
  : resolution?.status === 'ambiguous' ? `Tvetydig filtreff: ${resolution.photoIds.length} importerte kopier. Avklar kopiene i FOTO.`
    : resolution?.status === 'invalid' ? 'Ikke en gyldig bildereferanse. Kontroller originalfeltet og filtypen.'
      : resolution?.reason === 'unsafe-reference' ? 'Ekstern adresse eller utrygg sti brukes ikke. Avklar en lokal filreferanse i originalgrunnlaget.'
        : 'Bildefilen mangler i valgt fotolag. Legg til bildene eller velg riktig fotolag.';
const groupName = (group) => group.references[0].filename || 'Ugyldig mål';

function Issues({ blocking = [], warnings = [], omit = [] }) {
  const shown = [...blocking, ...warnings].filter((entry) => !omit.includes(entry.code));
  return shown.length ? <ul className="photo-link-issues">{shown.map((entry) => <li key={entry.code} className="gmi-validation-accent"
    data-validation-tone={entry.blocking ? 'error' : 'warning'}>{entry.blocking ? 'Må avklares: ' : 'Merknad: '}{entry.text}</li>)}</ul> : null;
}

function References({ group }) {
  return <details className="photo-link-facts"><summary className="gmi-focus-ring">Rå lenkeuttrykk ({group.references.length})</summary>
    {group.references.map((reference) => <div key={reference.id} className="photo-link-reference"><code>{reference.referenceRaw}</code>
      <small>Uttrykk {reference.wrapperOrdinal === null ? 'bart' : reference.wrapperOrdinal + 1} · medlem {reference.memberOrdinal + 1} · {reference.id}</small>
      {reference.identicalRawReferenceIds.length > 1 && <p>Samme rå referanse forekommer {reference.identicalRawReferenceIds.length} ganger i kilden. Dette bekrefter ikke samme bildefil.</p>}
    </div>)}
  </details>;
}

function PositionEvidence({ row, decision }) {
  const target = decision?.target;
  return <details className="photo-link-facts"><summary className="gmi-focus-ring">Posisjoner og Z-evidens</summary>
    <p>Original {row.tema || 'LOK/TOP'}: {position(row.placement?.position)} · Z: {number(row.rawGeometry?.[0]?.z)}</p>
    {row.relatedPhotos.map((entry) => {
      const acceptedCandidate = entry.spatial.candidates.find((candidate) => candidate.id === entry.spatial.current?.basis?.candidateId);
      return <div key={entry.id}><p>Akseptert nå ({entry.originalFilename} · {entry.occurrence?.object ? gmiObjectLabel(entry.occurrence.object) : 'uten GMI-plassering'}, {entry.spatial.current ? acceptanceLabel(entry.spatial.current.acceptance) : 'ingen'}): {position(entry.spatial.current?.position)}
        {target && ` · Nå → mottaker, XY: ${distance(photoPositionDistance(entry.spatial.current?.position, target.placement?.position))}`}</p>
        <pre>{acceptedCandidate ? rawText({ kilde: acceptedCandidate.kind, rådata: acceptedCandidate.raw }) : 'Ingen rå Z-evidens knyttet til nåværende plassering. Høyde er ikke antatt.'}</pre></div>;
    })}
    {!row.relatedPhotos.length && <p>Ingen sikkert tilknyttet FOTO-plassering. Ingen akseptert posisjon er antatt.</p>}
    {target && <><p>Foreslått mottaker: {position(target.placement?.position)} · Z: {number(target.rawGeometry?.[0]?.z)}</p>
      <p>Original → mottaker, ΔZ: {number(decision.candidate.deltaZ)}{decision.candidate.deltaZ !== null ? ' (rå differanse, uten vertikal transformasjon)' : ''}</p></>}
    <p>Z er rå evidens. Høydereferanse og mottakerens tolkning må avklares; høyder endres ikke.</p>
  </details>;
}

function ControlStep({ decisions, progress, headingRef, onEdit }) {
  return <section className="photo-link-control" aria-labelledby="photo-link-control-heading">
    <h3 id="photo-link-control-heading" ref={headingRef} tabIndex={-1}>Kontroll</h3>
    <p>{progress.allResolved ? 'Alle valgte beslutninger er avklart.' : `${progress.unresolved} av ${progress.selected} beslutninger må avklares.`} {progress.unchangedReferences} bildereferanser er ikke valgt og forblir uendret.</p>
    <table>
      <thead><tr><th scope="col">Bilde og referanser</th><th scope="col">Kilde</th><th scope="col">Handling</th><th scope="col">Mottaker</th><th scope="col">XY-avstand</th><th scope="col">Status og merknader</th><th scope="col"><span className="sr-only">Endre</span></th></tr></thead>
      <tbody>{decisions.map((entry) => <tr key={entry.key} data-decision-key={entry.key} data-resolved={entry.resolved}>
        <td><strong>{groupName(entry.group)}</strong><References group={entry.group} /></td>
        <td>{objectName(entry.row)}{entry.row.identifierText && <small>{entry.row.identifierText}</small>}</td>
        <td>{PHOTO_LINK_OUTCOME_LABELS[entry.outcome]}{entry.deliveryEntry && <small>Nå: {photoDeliveryStatusText(entry.deliveryEntry)}</small>}</td>
        <td>{entry.outcome !== 'move' ? '–' : entry.target ? objectName(entry.target) : 'Ikke valgt'}</td>
        <td className="photo-link-number">{entry.outcome === 'move' && entry.target ? distance(entry.distanceMetres) : '–'}</td>
        <td><span className="photo-link-state" data-resolved={entry.resolved}>{entry.resolved ? 'Avklart' : 'Uavklart'}</span><Issues blocking={entry.blocking} warnings={entry.warnings} /></td>
        <td><button type="button" className={button} aria-label={`Endre ${groupName(entry.group)} på ${entry.row.pointName}`} onClick={() => onEdit(entry)}>Endre</button></td>
      </tr>)}</tbody>
    </table>
  </section>;
}

function ReviewBody({ model, onClose }) {
  'use no memo';
  const [choices, setChoices] = useState(emptyPhotoLinkReviewChoices);
  const [focusedOnly, setFocusedOnly] = useState(model.restricted);
  const [query, setQuery] = useState('');
  const [targetQuery, setTargetQuery] = useState('');
  const [activeKey, setActiveKey] = useState(() => model.rows.find((row) => row.focused)?.objectKey || '');
  const [activeDecisionKey, setActiveDecisionKey] = useState(null);
  const [candidatePage, setCandidatePage] = useState(0);
  const [photoId, setPhotoId] = useState(null);
  const [step, setStep] = useState('pairing');
  const [pendingFocus, setPendingFocus] = useState(null);
  const controlHeading = useRef(null), bodyRef = useRef(null);
  const rows = model.rows.filter((row) => (!focusedOnly || row.focused) && `${row.pointName} ${row.identifierText} ${row.guid || ''} ${row.tema || ''} ${row.sourceIndex}`.toLocaleLowerCase('nb-NO').includes(query.toLocaleLowerCase('nb-NO')));
  const row = rows.find((entry) => entry.objectKey === activeKey) || rows[0];
  const candidates = useMemo(() => row ? photoLinkReviewCandidates(model, row) : [], [model, row]);
  const decisions = useMemo(() => photoLinkReviewDecisions(model, choices), [model, choices]);
  const progress = photoLinkReviewProgress(model, decisions);
  const decisionByKey = new Map(decisions.map((entry) => [entry.key, entry]));
  const activeGroup = row?.groups.find((group) => group.decisionKey === activeDecisionKey && decisionByKey.has(group.decisionKey));
  const activeDecision = activeGroup ? decisionByKey.get(activeGroup.decisionKey) : null;
  const pairing = activeDecision?.outcome === 'move';
  const filteredCandidates = candidates.filter(({ target }) => `${target.tema || ''} ${target.pointName} ${target.identifierText} ${target.guid || ''} ${target.sourceIndex}`.toLocaleLowerCase('nb-NO').includes(targetQuery.toLocaleLowerCase('nb-NO')));
  const pages = Math.max(1, Math.ceil(filteredCandidates.length / 20)), page = Math.min(candidatePage, pages - 1);
  const pageCandidates = filteredCandidates.slice(page * 20, page * 20 + 20);
  const selected = pairing && activeDecision.target ? candidates.find((entry) => entry.target.objectKey === activeDecision.target.objectKey) : null;
  const previewPhotos = row?.groups.flatMap((group) => group.photos) || [];
  const photo = previewPhotos.find((entry) => entry.id === photoId) || previewPhotos[0];
  const choose = (group, action) => setChoices((state) => reducePhotoLinkReviewChoices(state, { objectKey: row.objectKey, groupKey: group.key, ...action }, model));
  const openRow = (entry, decisionKey = entry.groups.find((group) => choices.decisions[group.decisionKey]?.outcome === 'move')?.decisionKey || null) => {
    setActiveKey(entry.objectKey); setActiveDecisionKey(decisionKey); setPhotoId(null); setCandidatePage(0); setTargetQuery('');
  };
  useEffect(() => {
    if (step === 'kontroll') controlHeading.current?.focus();
  }, [step]);
  useEffect(() => {
    if (!pendingFocus || step !== 'pairing') return;
    bodyRef.current?.querySelector(`[data-decision-key="${CSS.escape(pendingFocus)}"] input[type=checkbox]`)?.focus();
    setPendingFocus(null);
  }, [pendingFocus, step]);
  const edit = (entry) => {
    if (!entry.row.focused) setFocusedOnly(false);
    setQuery(''); openRow(entry.row, entry.key); setStep('pairing'); setPendingFocus(entry.key);
  };
  const id = useId();
  return <>
    {step === 'kontroll' ? <div className="photo-link-control-body" ref={bodyRef}><ControlStep decisions={decisions} progress={progress} headingRef={controlHeading} onEdit={edit} /></div> : <>
      <div className="photo-link-filter">
        {model.restricted && <label><input type="checkbox" className="accent-gmi-interactive gmi-focus-ring" checked={focusedOnly} onChange={(event) => setFocusedOnly(event.target.checked)} /> Kun Validator-utvalget ({model.rows.filter((entry) => entry.focused).length})</label>}
        <div className="photo-link-search-field"><label htmlFor={`${id}-search`}>Søk kildeobjekt</label><input id={`${id}-search`} className="gmi-compact-field" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <span>{rows.length} av {model.rows.length} tilfeller</span>
      </div>
      <div className="photo-link-columns" ref={bodyRef}>
        <nav aria-label="LOK/TOP med bildelenker" className="photo-link-list">
          {rows.map((entry) => {
            const chosen = entry.groups.filter((group) => decisionByKey.has(group.decisionKey)).length;
            return <button key={entry.objectKey} type="button" className={`${button}${row === entry ? ' gmi-selected-control' : ''}`} aria-current={row === entry ? 'true' : undefined}
              onClick={() => openRow(entry)}>
              <strong>{objectName(entry)}</strong><span>{entry.identifierText && `${entry.identifierText} · `}point:{entry.sourceIndex} · {entry.references.length} referanser{chosen ? ` · ${chosen} valgt` : ''}</span>
            </button>;
          })}
          {!rows.length && <p>Ingen tilfeller i dette utvalget. Vis hele laget eller endre søket.</p>}
        </nav>
        <main className="photo-link-detail" aria-label="Gjennomgang av bildelenker">
          {row && <>
            <section aria-label="Kildeobjekt"><h3>Kilde: {objectName(row)}{row.identifierText && ` · ${row.identifierText}`}</h3>
              <Issues blocking={row.issues.filter((entry) => entry.blocking)} warnings={row.issues.filter((entry) => !entry.blocking)} />
              <ObjectFacts object={row} source={model.source} /><Cells object={row} />
            </section>
            <section aria-label="Bilder"><h3>Bilder</h3>
              {!row.groups.length && <p>Ingen bildereferanser å vurdere.</p>}
              {row.groups.map((group) => {
                const decision = decisionByKey.get(group.decisionKey), active = activeGroup === group;
                return <article key={group.key} className="photo-link-group" data-decision-key={group.decisionKey} data-active={active || undefined}>
                  <label className="photo-link-group-select"><input type="checkbox" className="accent-gmi-interactive gmi-focus-ring" checked={Boolean(decision)}
                    onChange={(event) => { choose(group, { type: 'select', selected: event.target.checked }); setActiveDecisionKey(event.target.checked ? group.decisionKey : null); }} />
                    <span><strong>{groupName(group)}</strong> · {group.references.length} referanse(r)</span></label>
                  <p>{resolutionText(group.references[0].resolution)}</p>
                  {group.photos.map((entry, index) => <div key={entry.id} className="photo-link-photo-row"><button type="button" className={`${button}${photo?.id === entry.id ? ' gmi-selected-control' : ''}`} aria-pressed={photo?.id === entry.id} onClick={() => setPhotoId(entry.id)}>{group.assetId ? 'Vis' : `Mulig fil ${index + 1}:`} {entry.sourceRelativePath || entry.originalFilename}</button>
                    <span>{entry.occurrence?.object ? gmiObjectLabel(entry.occurrence.object) : 'Uten GMI-plassering'} · {photoDeliveryStatusText(model.delivery?.byPhotoId?.[entry.id]) || 'Leveringsvalg mangler'}</span></div>)}
                  {group.sharedObjectKeys.length > 1 && <p>Bildet deles av {group.sharedObjectKeys.length} objekter. Hver forekomst beholdes separat.</p>}
                  {decision && <fieldset className="photo-link-outcomes"><legend className="sr-only">Handling for {groupName(group)}</legend>
                    {Object.entries(PHOTO_LINK_OUTCOME_LABELS).map(([outcome, label]) => <label key={outcome}><input type="radio" className="accent-gmi-interactive gmi-focus-ring"
                      name={`${id}-outcome-${group.decisionKey}`} checked={decision.outcome === outcome}
                      onChange={() => { choose(group, { type: 'outcome', outcome }); setActiveDecisionKey(group.decisionKey); }} /> {label}</label>)}
                  </fieldset>}
                  {decision?.outcome === 'move' && <div className="photo-link-recipient-line">
                    <span>Mottaker: <strong>{decision.target ? objectName(decision.target) : 'Ikke valgt'}</strong>{decision.target && ` · ${distance(decision.distanceMetres)}`}</span>
                    <button type="button" className={`${button}${active ? ' gmi-selected-control' : ''}`} aria-pressed={active}
                      aria-label={`Velg mottaker for ${groupName(group)}`} onClick={() => setActiveDecisionKey(group.decisionKey)}>{decision.target ? 'Endre mottaker' : 'Velg mottaker'}</button>
                  </div>}
                  {decision && <Issues blocking={decision.blocking} warnings={decision.warnings} omit={['recipient-missing', 'target-existing-links', 'asset-missing', 'asset-ambiguous', 'asset-invalid', 'asset-unsafe', ...row.issues.map((entry) => entry.code)]} />}
                  <References group={group} />
                </article>;
              })}
            </section>
            <section aria-label="Punktobjekter i samme kilde"><h3>Punktobjekter i samme kilde ({candidates.length})</h3>
              <p>Sortert etter XY-avstand. Nærmeste objekt og like identifikatorer bekrefter ingen relasjon. Ingen søkeradius er fastsatt.</p>
              <div className="photo-link-search-field"><label htmlFor={`${id}-targets`}>Søk punktobjekt</label>
                <input id={`${id}-targets`} className="gmi-compact-field" value={targetQuery} onChange={(event) => { setTargetQuery(event.target.value); setCandidatePage(0); }} /></div>
              {!pairing && <p>Velg «Flytt til punktobjekt» for et bilde for å foreslå mottaker.</p>}
              {pairing && <label className="photo-link-target"><input type="radio" className="accent-gmi-interactive gmi-focus-ring" name={`${id}-target`} checked={!selected}
                onChange={() => choose(activeGroup, { type: 'target', targetKey: null })} /> Ingen mottaker valgt</label>}
              {!candidates.length && <p>Kilden har ingen andre punktobjekter.</p>}
              {pageCandidates.map((candidate) => <label className="photo-link-target" key={candidate.target.objectKey}>
                <input type="radio" className="accent-gmi-interactive gmi-focus-ring" name={`${id}-target`} disabled={!pairing} checked={selected?.target.objectKey === candidate.target.objectKey}
                  onChange={() => choose(activeGroup, { type: 'target', targetKey: candidate.target.objectKey })} />
                <span><strong>{objectName(candidate.target)}</strong>{candidate.target.identifierText && ` · ${candidate.target.identifierText}`}
                  <span className="photo-link-number">XY: {distance(candidate.distanceMetres)} · {candidate.target.photoReferenceCount ? `${candidate.target.photoReferenceCount} bildereferanser` : 'Ingen bildereferanser'}</span>
                  {candidate.sameIdentifiers.length > 0 && <span>Like felt: {candidate.sameIdentifiers.join(', ')} – ikke bekreftet relasjon</span>}
                  <Issues blocking={candidate.conflicts.filter((entry) => entry.blocking)} warnings={candidate.conflicts.filter((entry) => !entry.blocking)} omit={['target-existing-links']} /></span>
              </label>)}
              {filteredCandidates.length > 20 && <div className="photo-link-pagination"><button type="button" className={button} aria-label="Forrige side med punktobjekter" disabled={page === 0} onClick={() => setCandidatePage(page - 1)}>Forrige</button>
                <span>{page + 1} / {pages}</span><button type="button" className={button} aria-label="Neste side med punktobjekter" disabled={page + 1 >= pages} onClick={() => setCandidatePage(page + 1)}>Neste</button></div>}
            </section>
            <section aria-label="Foreslått mottaker"><h3>Foreslått mottaker</h3>
              {selected ? <><p><strong>{objectName(selected.target)}</strong>{selected.target.identifierText && ` · ${selected.target.identifierText}`} · XY: {distance(selected.distanceMetres)} · {groupName(activeGroup)}, {activeGroup.references.length} referanse(r)</p>
                <ObjectFacts object={selected.target} source={model.source} /><Cells object={selected.target} /></>
                : <p>{pairing ? `Velg et punktobjekt for ${groupName(activeGroup)}.` : 'Ingen mottaker er valgt for et aktivt bilde.'}</p>}
              <PositionEvidence row={row} decision={selected ? activeDecision : null} />
              <ReviewMap row={row} candidates={selected && !pageCandidates.includes(selected) ? [...pageCandidates, selected] : pageCandidates} selected={selected} />
            </section>
          </>}
        </main>
        <aside className="photo-link-preview" aria-label="Fotoforhåndsvisning">{photo ? <PhotoImportPreview key={photo.assetId} photo={photo} enableLargeView={false} /> : <p>Ingen bildefil å vise for dette objektet.</p>}</aside>
      </div>
    </>}
    <footer>
      <span className="photo-link-progress">Valgt: {progress.selected} · Avklart: {progress.resolved} · Uavklart: {progress.unresolved}</span>
      <div className="photo-link-footer-actions">
        <button type="button" className={button} onClick={onClose}>Avslutt gjennomgang</button>
        {step === 'kontroll' ? <button type="button" className={button} onClick={() => setStep('pairing')}>Tilbake til paring</button>
          : <button type="button" className="gmi-primary-control gmi-compact-button gmi-focus-ring px-2 py-1 text-xs" disabled={!progress.selected} onClick={() => setStep('kontroll')}>Kontroll</button>}
      </div>
    </footer>
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
      photos, delivery, focusRefs: restricted ? request.refs : null, liveSource: Boolean(current.binding && loadedGmiSources.isLive(current.binding)) }) }; }
    catch (error) { return { error: error.message }; }
  }, [current, dataset, photos, delivery, restricted, request, layers, referenceDate, view, option, photoLayer, datasetKind, proposed]);
  const model = result.model;
  return <dialog ref={dialogRef} className="photo-link-review" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header><h2 id={titleId}>FOTO · Gjennomgå bildelenker</h2><PhotoIconButton icon={XIcon} size={20} label="Lukk gjennomgang av bildelenker" onClick={onClose} /></header>
    <p className="photo-link-boundary">Kun gjennomgang. Valgene er midlertidige og forkastes ved lukking. Ingen data lagres eller flyttes. Flytting til et punktobjekt er en egen operasjon, adskilt fra levering GMI → GML.</p>
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
      photos.map((photo) => [photo.id, photo.spatial.current])])} model={model} onClose={onClose} />}
    {!model && <footer><span /><button type="button" className={button} onClick={onClose}>Avslutt gjennomgang</button></footer>}
  </dialog>;
}
