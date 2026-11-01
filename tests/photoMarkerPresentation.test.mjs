import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PHOTO_POSITION_SOURCES, photoPositionSourceKind, photoPositionSourcePresentation, cameraMarkerOptions, proposalMarkerOptions } from '../src/lib/photos/photoMarkerPresentation.mjs';
import { acceptPhotoCandidate, acceptManualPhotoPosition, emptySpatial } from '../src/lib/photos/photoSpatial.mjs';
import { buildPhotoMapFeatures } from '../src/lib/photos/photoMapFeatures.mjs';

const position = { crs: 'EPSG:4326', longitude: 10, latitude: 59 };
const candidates = ['exif', 'gmi', 'gml'].map((kind) => ({ id: kind, kind, status: 'viable', position }));
const photo = (kind) => ({ spatial: kind === 'manual' ? acceptManualPhotoPosition({ ...emptySpatial(), candidates }, position)
  : acceptPhotoCandidate({ ...emptySpatial(), candidates }, kind) });

for (const source of PHOTO_POSITION_SOURCES) test(`accepted ${source.kind}: central presentation survives selection, accepted/proposed direction and unrelated evidence`, () => {
  const occurrence = photo(source.kind);
  assert.equal(photoPositionSourceKind(occurrence), source.kind);
  assert.strictEqual(photoPositionSourcePresentation(photoPositionSourceKind(occurrence)), source);
  for (const selected of [false, true]) for (const proposed of [false, true]) {
    const options = cameraMarkerOptions({ sourceKind: source.kind, selected, degrees: 42, proposed });
    assert(options.html.includes(`fill="${source.color}"`));
    assert(options.html.includes(`data-position-source="${source.kind}"`));
    assert.equal(options.html.includes('r="14"'), selected, 'selection has its own outlined ring');
    assert.equal(options.className.includes('photo-camera-marker-selected'), selected);
    assert.deepEqual(options.iconSize, [30, 30]);
    assert.deepEqual(options.iconAnchor, [15, 15]);
    if (selected) {
      assert(options.html.includes('stroke="white" stroke-width="5"'), 'arrow has independent white casing');
      assert(options.html.includes(`stroke="${proposed ? '#a34c00' : '#075e9a'}"`));
    }
  }
});

test('unknown, missing and dangling accepted basis use neutral fallback without guessing from evidence', () => {
  const fallback = photoPositionSourcePresentation('unknown');
  assert.equal(fallback.kind, 'unknown');
  assert(!PHOTO_POSITION_SOURCES.some((source) => source.color === fallback.color));
  for (const basis of [null, {}, { kind: 'future' }, { kind: 'candidate', candidateId: 'missing' }, { kind: '__proto__' }]) {
    assert.equal(photoPositionSourceKind({ spatial: { candidates, current: { position, basis } } }), 'unknown');
  }
  assert.equal(photoPositionSourceKind(null), 'unknown');
  assert.equal(photoPositionSourceKind({ spatial: { candidates, current: null } }), 'unknown');
  assert(cameraMarkerOptions({ sourceKind: '<unsafe>' }).html.includes(`fill="${fallback.color}"`));
  assert(!cameraMarkerOptions({ sourceKind: '<unsafe>' }).html.includes('<unsafe>'));
});

test('source replacement derives presentation each time; unplaced/hidden evidence creates no marker', () => {
  let spatial = { ...emptySpatial(), candidates };
  const layers = [{ id: 'layer', visible: true }];
  const getPhotos = () => [{ id: 'occurrence', spatial }];
  assert.deepEqual(buildPhotoMapFeatures(layers, getPhotos), []);
  for (const kind of ['gml', 'exif', 'manual', 'gmi']) {
    spatial = kind === 'manual' ? acceptManualPhotoPosition(spatial, position) : acceptPhotoCandidate(spatial, kind);
    assert.equal(photoPositionSourceKind(getPhotos()[0]), kind);
    assert.equal(buildPhotoMapFeatures(layers, getPhotos).length, 1);
    assert.equal(buildPhotoMapFeatures([{ ...layers[0], visible: false }], getPhotos).length, 0);
    assert(!JSON.stringify(spatial).includes('color'));
  }
});

test('proposal crosshair remains separate from accepted manual camera', () => {
  const accepted = cameraMarkerOptions({ sourceKind: 'manual' });
  assert.equal(proposalMarkerOptions.className, 'photo-proposed-marker');
  assert(!proposalMarkerOptions.html.includes('photo-camera-glyph'));
  assert(!proposalMarkerOptions.html.includes('data-position-source'));
  assert.notEqual(proposalMarkerOptions.html, accepted.html);
});

test('legend and markers share classification/palette/glyph; workspace wiring is stateless and adds no actions', async () => {
  const read = (name) => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8');
  const [legend, view, markers, page] = await Promise.all([
    read('components/photos/PhotoPositionLegend.js'), read('components/MapView.js'),
    read('components/photos/PhotoMarkersLayer.js'), read('app/page.js'),
  ]);
  assert.deepEqual(PHOTO_POSITION_SOURCES.map((source) => source.label), ['EXIF', 'GMI', 'GML', 'Manuell']);
  assert.equal(new Set(PHOTO_POSITION_SOURCES.map((source) => source.color)).size, 4);
  assert.match(legend, /PHOTO_POSITION_SOURCES\.map/);
  assert.match(legend, /photoCameraGlyph\(\{ sourceKind: kind/);
  assert.match(legend, /aria-label="Bildeplassering"/);
  assert.doesNotMatch(legend, /<button|<input|onClick|useState|useEffect/);
  assert.match(view, /props\.photoWorkspaceSelection \? <PhotoPositionLegend \/> : <MapLegend \/>/);
  assert.match(page, /photoWorkspaceSelection=\{workspaceLayer \? \{ layerId: workspaceLayer.id, photoId: photoWorkspace.activePhotoId \} : null\}/);
  assert.match(markers, /photoPositionSourceKind\(photo\)/);
  assert.match(markers, /title=\{accessibleLabel\} alt=\{accessibleLabel\} keyboard/);
  assert.match(markers, /plassering: \$\{source.label\}/);
});
