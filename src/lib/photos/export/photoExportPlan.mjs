import proj4 from 'proj4';
import '../../map/coordinateProjection.js';
import { isPhotoPosition } from '../photoSpatial.mjs';
import { fullCaptureTime, freezeExportData } from './exportContract.mjs';
import { compareExportKeys, digestHex, exportGuid, planAttachmentNames } from './attachmentNames.mjs';
import { evaluatePhotoExportRules, normalizeExportContext } from './photoExportRules.mjs';

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
  const profile = configuration.profile, gemini = profile === 'gemini-legacy2019';
  const crs = gemini ? 'EPSG:5972' : configuration.crs;
  const horizontalCrs = gemini ? 'EPSG:25832' : crs;
  const usedGuids = new Set();
  const geminiGuid = () => {
    // Gemini/FME rejected UUIDv5 lokalId; UUIDv4 was accepted into GeoFoto.
    const guid = globalThis.crypto.randomUUID();
    if (usedGuids.has(guid)) throw new Error('Eksport-GUID er ikke unik. Lag en ny forhåndsvisning.');
    usedGuids.add(guid);
    return guid;
  };
  const context = normalizeExportContext(configuration.context);
  const errors = [], warnings = [];
  const error = (code, message, occurrenceId, assetId) => errors.push({ code, message, occurrenceId, assetId });
  // Shared with readiness. Each owner's diagnostics are placed where the plan reaches that owner, which keeps
  // the established order around the checks only the plan can make. Keys carry the kind of owner, because an
  // unrepeated photo's occurrence ID is the same as its asset ID.
  const rules = evaluatePhotoExportRules({ profile, crs, context, assets: snapshot.assets, occurrences: snapshot.occurrences });
  const owner = (item) => item.occurrenceId ? `occurrence:${item.occurrenceId}` : item.assetId ? `asset:${item.assetId}` : 'layer';
  const ruleErrors = Map.groupBy(rules.errors, owner), ruleWarnings = Map.groupBy(rules.warnings, owner);
  const applyRules = (key) => { errors.push(...(ruleErrors.get(key) || [])); warnings.push(...(ruleWarnings.get(key) || [])); };
  const all = [...snapshot.occurrences].sort((a, b) => compareExportKeys(a.occurrenceId, b.occurrenceId));
  const excluded = all.filter((row) => !row.current).map((row) => ({ occurrenceId: row.occurrenceId, reason: 'unplaced' }));
  const placed = all.filter((row) => row.current);
  applyRules('layer');
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
    applyRules(`asset:${asset.assetId}`);
  }
  const byAsset = new Map(assets.map((asset) => [asset.assetId, asset]));
  const occurrences = [];
  for (const row of placed) {
    let point = null;
    try {
      if (!isPhotoPosition(row.current.position) || !['EPSG:25832', 'EPSG:25833'].includes(horizontalCrs)) throw new Error();
      const coordinates = transform('EPSG:4326', horizontalCrs, [row.current.position.longitude, row.current.position.latitude]);
      const format = gemini ? (value) => { if (!Number.isFinite(value) || Math.abs(value) >= 1e21) throw new Error(); return value.toFixed(6).replace(/^-0\.000000$/, '0.000000'); } : formatExportCoordinate;
      point = { easting: format(coordinates[0]), northing: format(coordinates[1]), ...(gemini ? { z: '0.000000' } : {}) };
    } catch { error('projection-failed', `${byAsset.get(row.assetId)?.originalFilename || row.assetId} (${row.occurrenceId}): posisjonen kan ikke projiseres.`, row.occurrenceId); }
    applyRules(`occurrence:${row.occurrenceId}`);
    const guid = gemini ? geminiGuid() : await exportGuid(`occurrence:${snapshot.layer.id}:${row.occurrenceId}`);
    occurrences.push({ ...row, point, guid, featureId: gemini ? `id${guid}` : `photo-${guid}`,
      geometryId: gemini ? `id${geminiGuid()}` : `point-${guid}` });
  }
  const associationCount = new Set(all.flatMap((row) => row.associations.map((link) => JSON.stringify([row.assetId, link.sourceId, link.object.objectKey])))).size;
  if (associationCount) warnings.push({ code: 'associations-omitted', message: `${associationCount} objektkoblinger beholdes i appen, men er ikke med i denne testeksporten.` });
  const occurrenceCounts = new Map();
  for (const row of placed) occurrenceCounts.set(row.assetId, (occurrenceCounts.get(row.assetId) || 0) + 1);
  const sharedAttachments = [...occurrenceCounts.values()].filter((count) => count > 1).length;
  if (sharedAttachments) warnings.push({ code: 'shared-attachments', message: `${sharedAttachments} originalbilder deles av flere separate forekomst-features.` });
  warnings.push({ code: 'experimental-mapping', message: 'Eksperimentell forekomstbevarende mapping: én godtatt forekomst = én Skråfoto-feature. Ingen ny kameraposisjon utledes. Gemini-kompatibilitet er ikke verifisert.' });
  warnings.push({ code: 'direction-assumption', message: 'Eksperimentell retningsantakelse: med klokken i grader fra geografisk nord (enhet 1, referanse 1).' });
  if (!gemini) warnings.push({ code: 'path-convention', message: 'Attachments/<filnavn> med skråstrek er appens testkonvensjon, ikke et dokumentert Gemini-krav.' });
  if (profile === 'asbuilt52') warnings.push({ code: 'experimental-2d', message: 'Eksperimentell 2D AsBuilt-fotogeometri uten Z. Gemini-aksept er ukjent.' });
  const missingTimestampCount = occurrences.filter((row) => !fullCaptureTime(byAsset.get(row.assetId)?.metadata?.captureTime)).length;
  const timezoneTransformCount = occurrences.filter((row) => /(?:Z|[+-]\d{2}:\d{2})$/.test(fullCaptureTime(byAsset.get(row.assetId)?.metadata?.captureTime) || '')).length;
  if (gemini) {
    warnings.push({ code: 'compatibility-z', message: `${occurrences.length} XYZ-punkter i EPSG:5972: Z=0 er kun en kompatibilitetsplassholder, ikke målt høyde.` });
    warnings.push({ code: 'compatibility-time', message: `${missingTimestampCount} features uten full opptakstid får ikke opptakstid i GML-filen. ${timezoneTransformCount} tidssone-suffikser fjernes, og klokkeslettet endres ikke: UTC-tid blir stående som UTC, uten tidssone. Brøkdelsekunder utelates for å matche referansen. Godtatte data endres ikke.` });
    warnings.push({ code: 'compatibility-metadata', message: `${assets.filter((asset) => asset.metadata?.photographer).length} godtatte fotografverdier utelates; bildeinformasjon eksporteres ikke.` });
    warnings.push({ code: 'compatibility-import', message: 'Pakk ut ZIP. Importer photos.gml med Attachments-mappen ved siden av. XML bruker Attachments\\filnavn. Gemini-import må testes manuelt.' });
  }
  if (!snapshot.isLive()) error('stale-plan', 'Fotolaget eller godtatte data er endret. Lag en ny forhåndsvisning.');
  const plan = freezeExportData({ version: 1, profile, crs, context, collectionId: gemini ? `id${geminiGuid()}` : 'photo-collection', layer: snapshot.layer, assets, occurrences, attachments, excluded, warnings, errors,
    counts: { uniqueImages: snapshot.assets.length, totalOccurrences: all.length, placed: placed.length, excluded: excluded.length,
      missingTimestampCount, timezoneTransformCount, compatibilityZCount: gemini ? occurrences.length : 0,
      features: occurrences.length, attachments: attachments.length, sharedAttachments, associationCount },
    isLive: snapshot.isLive });
  issuedPlans.add(plan);
  return plan;
}

export function assertExportablePlan(plan) {
  if (!issuedPlans.has(plan) || plan.errors.length) throw new Error('Eksportplanen har blokkerende feil. Lag og kontroller forhåndsvisningen.');
  if (!plan.isLive()) throw new Error('Eksportplanen er utdatert. Lag en ny forhåndsvisning.');
}
