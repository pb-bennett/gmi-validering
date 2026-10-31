import proj4 from 'proj4';
import '../../map/coordinateProjection.js';
import { isPhotoPosition } from '../photoSpatial.mjs';
import { PHOTO_EXPORT_PROFILES, EXPORT_CONTEXT_FIELDS, fullCaptureTime, freezeExportData, isXmlText, validateExportContext } from './exportContract.mjs';
import { compareExportKeys, digestHex, exportGuid, planAttachmentNames } from './attachmentNames.mjs';

const issuedPlans = new WeakSet();

export function capturePhotoExportSnapshot(session, layerId) {
  const layer = session.getLayer(layerId);
  if (!layer) throw new Error('Fotolaget finnes ikke lenger.');
  const photos = session.getLayerPhotos(layerId);
  const assets = [...new Map(photos.map((photo) => [photo.assetId, {
    assetId: photo.assetId, originalFilename: photo.originalFilename, sourceRelativePath: photo.sourceRelativePath,
    file: session.getAssetFile(photo.assetId), metadata: photo.captureMetadata,
  }])).values()];
  const occurrences = photos.map((photo) => ({ occurrenceId: photo.id, assetId: photo.assetId,
    current: photo.spatial.current, direction: photo.direction.current, sourceContext: photo.occurrence,
    positionProvenance: { basis: photo.spatial.current?.basis || null, acceptance: photo.spatial.current?.acceptance || null,
      acceptedAt: photo.spatial.current?.acceptedAt || null,
      source: photo.spatial.candidates.find((candidate) => candidate.id === photo.spatial.current?.basis.candidateId) || null },
    associations: session.getGmiPhotoAssociations(layerId, photo.id).map((link) => {
      const source = layer.spatialSources.find((item) => item.id === link.sourceId);
      return { ...link, sourceFingerprint: source.fingerprint, loadedBinding: source.loadedBinding || null };
    }),
  }));
  const isLive = () => {
    const live = session.getLayer(layerId);
    return live?.photoIds === layer.photoIds && live?.spatialSources === layer.spatialSources
      && assets.every((asset) => session.getAssetFile(asset.assetId) === asset.file)
      && photos.every((photo) => {
        const now = session.getPhoto(photo.id);
        return now?.captureMetadata === photo.captureMetadata && now?.spatial.current === photo.spatial.current
          && now?.direction.current === photo.direction.current && now?.occurrence === photo.occurrence;
      });
  };
  return freezeExportData({ layer: { id: layer.id, name: layer.name }, assets, occurrences, isLive });
}

export function formatExportCoordinate(value) {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e21) throw new Error('Ugyldig projisert koordinat.');
  const text = value.toFixed(3);
  return text === '-0.000' ? '0.000' : text;
}

export async function buildPhotoExportPlan(snapshot, configuration, { transform = proj4 } = {}) {
  const profile = configuration.profile, crs = configuration.crs;
  const context = Object.fromEntries(EXPORT_CONTEXT_FIELDS.map(({ key }) => [key, String(configuration.context?.[key] ?? '').trim()]));
  const errors = [], warnings = [];
  const error = (code, message, occurrenceId) => errors.push({ code, message, occurrenceId });
  if (!Object.hasOwn(PHOTO_EXPORT_PROFILES, profile)) error('invalid-profile', 'Velg en eksportprofil eksplisitt.');
  if (!['EPSG:25832', 'EPSG:25833'].includes(crs)) error('invalid-crs', 'Velg EPSG:25832 eller EPSG:25833.');
  if (profile === 'asbuilt52') errors.push(...validateExportContext(context));
  const all = [...snapshot.occurrences].sort((a, b) => compareExportKeys(a.occurrenceId, b.occurrenceId));
  const excluded = all.filter((row) => !row.current).map((row) => ({ occurrenceId: row.occurrenceId, reason: 'unplaced' }));
  const placed = all.filter((row) => row.current);
  if (!placed.length) error('no-placed-photos', 'Ingen forekomster har godtatt posisjon.');
  if (excluded.length) warnings.push({ code: 'unplaced-excluded', message: `${excluded.length} uplasserte forekomster er utelatt.` });
  const selectedAssets = new Set(placed.map((row) => row.assetId));
  const assets = [...snapshot.assets].filter((asset) => selectedAssets.has(asset.assetId)).map((asset) => ({ ...asset })).sort((a, b) => compareExportKeys(a.assetId, b.assetId));
  let attachments = [];
  try { attachments = await planAttachmentNames(assets); }
  catch (e) { error('attachment-naming', e.message); }
  for (const asset of assets) {
    asset.exportFilename = attachments.find((item) => item.assetId === asset.assetId)?.filename || null;
    if (!asset.file || typeof asset.file.arrayBuffer !== 'function' || !asset.file.size) error('missing-file', `${asset.originalFilename}: originalfil mangler eller er tom.`);
    else {
      try { asset.checksum = await digestHex(await asset.file.arrayBuffer()); }
      catch { error('file-read-failed', `${asset.originalFilename}: originalfilen kunne ikke leses og hashes.`); }
    }
    if (!fullCaptureTime(asset.metadata?.captureTime)) error('capture-time-required', `${asset.originalFilename}: godtatt opptakstid med sekunder kreves.`);
    const photographer = asset.metadata?.photographer?.value;
    if (profile === 'legacy2019' && photographer && !isXmlText(photographer)) error('invalid-xml-text', `${asset.originalFilename}: fotograf inneholder ugyldige XML-tegn.`);
    if (profile === 'asbuilt52' && photographer) warnings.push({ code: 'photographer-omitted', assetId: asset.assetId,
      message: `${asset.originalFilename}: fotograf utelates i AsBuilt 5.2 fordi godtatt brennvidde og kameratype mangler.` });
  }
  const occurrences = [];
  for (const row of placed) {
    let point = null;
    try {
      if (!isPhotoPosition(row.current.position) || !['EPSG:25832', 'EPSG:25833'].includes(crs)) throw new Error();
      const coordinates = transform('EPSG:4326', crs, [row.current.position.longitude, row.current.position.latitude]);
      point = { easting: formatExportCoordinate(coordinates[0]), northing: formatExportCoordinate(coordinates[1]) };
    } catch { error('projection-failed', `${row.occurrenceId}: posisjonen kan ikke projiseres.`, row.occurrenceId); }
    if (row.direction && (!Number.isInteger(row.direction.degrees) || row.direction.degrees < 0 || row.direction.degrees > 359)) error('invalid-direction', `${row.occurrenceId}: ugyldig godtatt retning.`, row.occurrenceId);
    if (profile === 'legacy2019' && !row.direction) error('direction-required', `${row.occurrenceId}: Legacy krever godtatt retning.`, row.occurrenceId);
    const guid = await exportGuid(`occurrence:${snapshot.layer.id}:${row.occurrenceId}`);
    occurrences.push({ ...row, point, guid, featureId: `photo-${guid}`, geometryId: `point-${guid}` });
  }
  const associationCount = new Set(all.flatMap((row) => row.associations.map((link) => JSON.stringify([row.assetId, link.sourceId, link.object.objectKey])))).size;
  if (associationCount) warnings.push({ code: 'associations-omitted', message: `${associationCount} objektkoblinger beholdes i appen, men er ikke med i denne testeksporten.` });
  const sharedAttachments = assets.filter((asset) => placed.filter((row) => row.assetId === asset.assetId).length > 1).length;
  if (sharedAttachments) warnings.push({ code: 'shared-attachments', message: `${sharedAttachments} originalbilder deles av flere separate forekomst-features.` });
  warnings.push({ code: 'experimental-mapping', message: 'Eksperimentell forekomstbevarende mapping: én godtatt forekomst = én Skråfoto-feature. Ingen ny kameraposisjon utledes. Gemini-kompatibilitet er ikke verifisert.' });
  warnings.push({ code: 'direction-assumption', message: 'Eksperimentell retningsantakelse: med klokken i grader fra geografisk nord (enhet 1, referanse 1).' });
  warnings.push({ code: 'path-convention', message: 'Attachments/<filnavn> med skråstrek er appens testkonvensjon, ikke et dokumentert Gemini-krav.' });
  if (profile === 'asbuilt52') warnings.push({ code: 'experimental-2d', message: 'Eksperimentell 2D AsBuilt-fotogeometri uten Z. Gemini-aksept er ukjent.' });
  if (!snapshot.isLive()) error('stale-plan', 'Fotolaget eller godtatte data er endret. Lag en ny forhåndsvisning.');
  const plan = freezeExportData({ version: 1, profile, crs, context, layer: snapshot.layer, assets, occurrences, attachments, excluded, warnings, errors,
    counts: { uniqueImages: snapshot.assets.length, totalOccurrences: all.length, placed: placed.length, excluded: excluded.length,
      features: occurrences.length, attachments: attachments.length, sharedAttachments, associationCount },
    isLive: snapshot.isLive });
  issuedPlans.add(plan);
  return plan;
}

export function assertExportablePlan(plan) {
  if (!issuedPlans.has(plan) || plan.errors.length) throw new Error('Eksportplanen har blokkerende feil. Lag og kontroller forhåndsvisningen.');
  if (!plan.isLive()) throw new Error('Eksportplanen er utdatert. Lag en ny forhåndsvisning.');
}
