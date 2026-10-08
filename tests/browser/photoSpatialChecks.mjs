import { parseTerrainPhotoGml, TERRAIN_PHOTO_NAMESPACE, GML_NAMESPACE } from '/src/lib/photos/terrainPhotoGml.mjs';
import { createPhotoSession } from '/src/lib/photos/photoSession.mjs';
import { readExifGps } from '/src/lib/photos/exifGps.mjs';
import { buildPhotoMapFeatures } from '/src/lib/photos/photoMapFeatures.mjs';
import { photoBatchCandidateRequests } from '/src/lib/photos/photoPositionSources.mjs';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const makeXml = ({ crs = 'http://www.opengis.net/def/crs/epsg/0/5972', pointCrs = '', posCrs = '', pos = '581932.579311 6566001.891835 0', dimension = '3', namespace = TERRAIN_PHOTO_NAMESPACE, extraEnvelope = '', prefix = 'app' } = {}) => `<gml:FeatureCollection xmlns:gml="${GML_NAMESPACE}" xmlns:${prefix}="${namespace}"><gml:boundedBy><gml:Envelope ${crs ? `srsName="${crs}"` : ''}/>${extraEnvelope}</gml:boundedBy><gml:featureMember><${prefix}:Skråfoto gml:id="id-1"><gml:name>Grøft æ.jpg</gml:name><${prefix}:fotograferingspunkt><gml:Point gml:id="point-1" srsDimension="${dimension}" ${pointCrs ? `srsName="${pointCrs}"` : ''}><gml:pos ${posCrs ? `srsName="${posCrs}"` : ''}>${pos}</gml:pos></gml:Point></${prefix}:fotograferingspunkt><${prefix}:fotolink>Attachments\\Grøft æ.jpg</${prefix}:fotolink><${prefix}:identifikasjon><${prefix}:Identifikasjon><${prefix}:lokalId>local-1</${prefix}:lokalId><${prefix}:navnerom></${prefix}:navnerom></${prefix}:Identifikasjon></${prefix}:identifikasjon><${prefix}:fotograferingstidspunkt>2025-08-06T16:30:55</${prefix}:fotograferingstidspunkt><${prefix}:retningsvektor><${prefix}:Retning><${prefix}:retningsverdi>0</${prefix}:retningsverdi><${prefix}:retningsenhet>1</${prefix}:retningsenhet><${prefix}:retningsreferanse>1</${prefix}:retningsreferanse></${prefix}:Retning></${prefix}:retningsvektor></${prefix}:Skråfoto></gml:featureMember></gml:FeatureCollection>`;
const until = async (condition) => { const deadline = Date.now() + 45000; while (!condition()) { if (Date.now() > deadline) throw new Error('Browser metadata/preview timeout'); await new Promise((resolve) => setTimeout(resolve, 20)); } };

export async function runPhotoSpatialChecks() {
  const results = [];
  const check = async (name, fn) => { const details = await fn(); results.push({ name, passed: true, ...(details ? { details } : {}) }); };
  await check('actual DOMParser: legacy profile, Unicode, raw IDs/date/direction and envelope-only CRS', () => {
    const parsed = parseTerrainPhotoGml(makeXml()); const entry = parsed.entries[0];
    assert(entry.status === 'viable', 'Fixture geometry should be viable');
    assert(entry.crsResolution.method === 'terrain-envelope-fallback', 'Envelope compatibility provenance');
    assert(entry.raw.pointSrsName === null && entry.raw.coordinates[2] === 0, 'Raw source retained');
    assert(entry.raw.name === 'Grøft æ.jpg' && entry.raw.featureId === 'id-1' && entry.raw.pointId === 'point-1' && entry.raw.localId === 'local-1' && entry.raw.idNamespace === '', 'Names and IDs');
    assert(entry.raw.photographedAtText === '2025-08-06T16:30:55' && entry.raw.direction.valueText === '0', 'Opaque date/direction');
    assert(!('direction' in entry) && !('heading' in entry.position), 'No operational heading');
    assert(parseTerrainPhotoGml(makeXml({ prefix: 'terrain' })).entries[0].status === 'viable', 'Prefix independence');
  });
  await check('actual DOMParser: explicit point CRS wins and conflicts are diagnosed', () => {
    const explicit = parseTerrainPhotoGml(makeXml({ crs: 'EPSG:9999', pointCrs: 'urn:ogc:def:crs:EPSG::25832' })).entries[0];
    assert(explicit.status === 'viable' && explicit.crsResolution.method === 'explicit-declaration', 'Point declaration must win');
    assert(parseTerrainPhotoGml(makeXml({ pointCrs: 'EPSG:25832', posCrs: 'EPSG:25833' })).entries[0].errorCode === 'conflicting-crs', 'Pos/Point conflict');
    assert(parseTerrainPhotoGml(makeXml({ extraEnvelope: '<gml:Envelope srsName="EPSG:25833"/>' })).entries[0].errorCode === 'conflicting-crs', 'Ambiguous envelope');
  });
  await check('actual DOMParser: missing/unsupported CRS and invalid geometry never create viable position', () => {
    for (const options of [{ crs: '' }, { crs: 'EPSG:9999' }, { pos: 'NaN 2 0' }, { pos: '1 2' }, { pos: '1 2', dimension: '2' }, { dimension: '4' }, { extraEnvelope: '<gml:Envelope/>' }]) {
      const entry = parseTerrainPhotoGml(makeXml(options)).entries[0];
      assert(entry.status !== 'viable' && entry.position === null && entry.errorCode, 'Bad geometry/CRS must be explicit');
    }
    assert(parseTerrainPhotoGml(makeXml({ crs: '' })).entries[0].crsResolution.method === null, 'Missing CRS must not claim an explicit declaration');
    const point = makeXml().match(/<gml:Point[^]*?<\/gml:Point>/)[0];
    for (const xml of [makeXml().replace(point, point + point), makeXml().replace('</gml:Point>', '<gml:pos>1 2 3</gml:pos></gml:Point>'), makeXml().replace('srsDimension="3"', 'srsDimension="2"')]) {
      assert(parseTerrainPhotoGml(xml).entries[0].status !== 'viable', 'Multiple/inconsistent geometry must not be guessed');
    }
  });
  await check('actual DOMParser: size limits and mixed feature members rejected; empty source fields preserved', () => {
    let code;
    try { parseTerrainPhotoGml(' '.repeat(10 * 1024 * 1024 + 1)); } catch (error) { code = error.code; }
    assert(code === 'gml-too-large', 'Explicit input limit');
    let rejected = false;
    try { parseTerrainPhotoGml(makeXml().replace('</gml:featureMember>', '<app:Other/></gml:featureMember>')); } catch { rejected = true; }
    assert(rejected, 'Do not silently discard mixed features');
    const empty = parseTerrainPhotoGml(makeXml().replace('gml:id="id-1"', '').replace('<app:lokalId>local-1</app:lokalId>', '<app:lokalId/>')).entries[0];
    assert(empty.raw.featureId === null && empty.raw.localId === '' && empty.status === 'viable', 'No fabricated IDs or metadata');
  });
  await check('actual DOMParser: malformed XML, unknown profile and DOCTYPE rejected', () => {
    for (const xml of ['<broken>', makeXml({ namespace: 'urn:other' }), '<!DOCTYPE gml:FeatureCollection>' + makeXml()]) {
      let threw = false; try { parseTerrainPhotoGml(xml); } catch { threw = true; }
      assert(threw, 'Must reject unsupported XML');
    }
  });
  await check('browser File + actual lazy exifr: JPEG/PNG GPS and absence/malformed/unsupported distinctions', async () => {
    for (const [name, expected] of [['gps.jpg', 'viable'], ['gps.png', 'viable'], ['none.png', 'no-gps'], ['partial.jpg', 'invalid'], ['broken.jpg', 'error'], ['preview.webp', 'unsupported-format']]) {
      const bytes = await (await fetch(`/synthetic/${name}`)).arrayBuffer();
      const result = await readExifGps(new File([bytes], name));
      assert(result.state === expected, `${name}: ${result.state} != ${expected}`);
    }
  });
  await check('actual browser draft/layer flow: independent EXIF and conflicting GML, no original changes', async () => {
    const file = new File([await (await fetch('/synthetic/gps.png')).arrayBuffer()], 'Grøft æ.jpg');
    const session = createPhotoSession();
    try {
      const id = session.importFiles([file]).acceptedIds[0];
      await session.importPositioningGml(new File([makeXml({ pos: '582141.956370 6566396.191621 0' })], 'positions.gml'));
      const layer = session.createLayer();
      await until(() => session.getPhoto(id).spatial.exifRead.state !== 'pending' && session.getPhoto(id).preview.state !== 'pending');
      const photo = session.getPhoto(id), evidence = photo.spatial.candidates;
      assert(photo.direction.current === null, 'Raw GML zero does not establish operational north');
      assert(evidence.length === 2 && photo.spatial.current.basis.candidateId === evidence.find((item) => item.kind === 'gml').id, 'GML basis survives extraction');
      const exif = evidence.find((item) => item.kind === 'exif');
      session.acceptCandidates(layer.id, [{ photoId: id, candidateId: exif.id }]);
      assert(session.getPhoto(id).spatial.current.position.longitude === exif.position.longitude, 'Explicit EXIF accepted');
      assert(session.getPhoto(id).spatial.candidates === evidence, 'Evidence identity preserved');
      assert(session.getFile(id) === file, 'Original identity retained');
      const features = () => buildPhotoMapFeatures(session.getSnapshot().photoLayers, session.getLayerPhotos);
      assert(features().length === 1, 'Placed marker'); session.setLayerVisibility(layer.id, false); assert(features().length === 0, 'Hidden marker');
      session.deleteLayer(layer.id); assert(session.getFile(id) === null && features().length === 0, 'Delete releases owner');
    } finally { session.clear(); }
  });
  const fixture = await (await fetch('/fixture-index')).json();
  if (fixture) await check('real corpus: 148 candidates/current positions, 136 locations, independent EXIF and URL cleanup', async () => {
    const ownedUrls = new Set();
    const session = createPhotoSession({ urls: {
      createObjectURL: (blob) => { const url = URL.createObjectURL(blob); ownedUrls.add(url); return url; },
      revokeObjectURL: (url) => { ownedUrls.delete(url); URL.revokeObjectURL(url); },
    } });
    const started = performance.now();
    try {
      const files = [];
      for (const [index, name] of fixture.photos.entries()) files.push(new File([await (await fetch(`/fixture-photo/${index}`)).arrayBuffer()], name, { type: 'image/jpeg' }));
      const ids = session.importFiles(files).acceptedIds;
      await session.importPositioningGml(new File([await (await fetch('/fixture-gml')).text()], fixture.gmlName));
      const draft = session.getSnapshot().positioning;
      assert(draft.ledger.summary.matchedCount === 148 && draft.ledger.summary.ambiguousCount === 0 && draft.ledger.summary.unmatchedCount === 0 && draft.ledger.summary.viablePlacementCount === 148, 'Exact real matching');
      const layer = session.createLayer();
      assert(layer.placedCount === 148 && layer.unplacedCount === 0, 'Initial current positions');
      await until(() => session.getLayer(layer.id).exifCandidateCount === 148 && session.getLayerPhotos(layer.id).every((photo) => photo.preview.state !== 'pending'));
      const photos = session.getLayerPhotos(layer.id), features = buildPhotoMapFeatures(session.getSnapshot().photoLayers, session.getLayerPhotos);
      assert(photos.every(photo => photo.direction.current === null
        && photo.spatial.candidates.find(candidate => candidate.kind === 'gml').raw.direction.valueText === '0'),
      'All 148 raw zero headings remain source evidence; operational direction stays unknown');
      assert(photos.every((photo) => photo.preview.state === 'ready' && photo.spatial.candidates.length === 2 && photo.spatial.candidates.find((candidate) => candidate.id === photo.spatial.current.basis.candidateId).kind === 'gml'), 'EXIF and preview never overwrite GML');
      assert(photos.every((photo) => {
        const gml = photo.spatial.candidates.find((candidate) => candidate.kind === 'gml').position;
        const exif = photo.spatial.candidates.find((candidate) => candidate.kind === 'exif').position;
        return Math.abs(gml.longitude - exif.longitude) < 1e-8 && Math.abs(gml.latitude - exif.latitude) < 1e-8;
      }), 'Real horizontal candidates agree within numerical precision, without inferring authority');
      assert(features.length === 148 && new Set(features.map((feature) => feature.geometry.coordinates.join(','))).size === 136, 'No marker deduplication');
      assert(ids.every((id, index) => session.getFile(id) === files[index]), 'Exact originals');
      const evidence = photos.map((photo) => photo.spatial.candidates);
      const gmlSource = session.getLayer(layer.id).spatialSources[0];
      const gmlFile = new File([await (await fetch('/fixture-gml')).text()], fixture.gmlName);
      assert(await session.stageLayerSource(layer.id, gmlFile) === false
        && session.getSnapshot().sourceReviews[layer.id].errorCode === 'duplicate-source', 'Repeated evidence diagnosed');
      session.cancelLayerSourceReview(layer.id);
      session.acceptCandidates(layer.id, photoBatchCandidateRequests(photos, ids, 'exif'));
      assert(ids.every((id) => session.getPhoto(id).spatial.current.basis.candidateId.endsWith(':exif')), '148 explicit EXIF acceptances');
      session.acceptCandidates(layer.id, photoBatchCandidateRequests(session.getLayerPhotos(layer.id), ids, 'gml', gmlSource.id));
      assert(ids.every((id, index) => session.getPhoto(id).spatial.candidates === evidence[index]), 'Batch changes no evidence');
      assert(session.recheckLayerSource(layer.id, gmlSource.id) && session.applyLayerSource(layer.id), 'Real source recheck');
      assert(ids.every((id, index) => session.getPhoto(id).spatial.candidates === evidence[index]), 'Recheck never doubles candidates');
      session.deleteLayer(layer.id);
      assert(ownedUrls.size === 0 && ids.every((id) => session.getFile(id) === null), 'Originals/thumbnails released');
      // Same originals in a fresh photos-only owner: late GML stays evidence for all 148.
      const lateIds = session.importFiles(files).acceptedIds;
      const lateLayer = session.createLayer();
      assert(await session.stageLayerSource(lateLayer.id, gmlFile), 'Real late ingestion');
      const review = session.getSnapshot().sourceReviews[lateLayer.id];
      assert(review.ledger.summary.matchedCount === 148 && review.unplacedPhotoIds.length === 148, 'Owner-scoped late matching');
      assert(session.applyLayerSource(lateLayer.id), 'Apply late evidence');
      assert(lateIds.every((id) => session.getPhoto(id).spatial.current === null), 'No late automatic placement');
      const latePhotos = session.getLayerPhotos(lateLayer.id);
      session.acceptCandidates(lateLayer.id, photoBatchCandidateRequests(latePhotos, lateIds, 'gml'));
      assert(buildPhotoMapFeatures(session.getSnapshot().photoLayers, session.getLayerPhotos).length === 148, 'Batch places all late matches');
      session.clear();
      assert(ownedUrls.size === 0 && lateIds.every((id) => session.getFile(id) === null), 'Reset including pending metadata/preview');
      return { photos: 148, matches: 148, gmlCandidates: 148, exifCandidates: 148, placed: 148, locations: 136,
        batchAccepted: 148, lateCandidates: 148, lateAutomaticPositions: 0, seconds: Math.round((performance.now() - started) / 100) / 10 };
    } finally { session.clear(); }
  });
  return results;
}
