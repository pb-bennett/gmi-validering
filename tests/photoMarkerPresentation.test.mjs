import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PHOTO_DIRECTION_COLOR, PHOTO_POSITION_SOURCES, PHOTO_STAGED_DASH, PHOTO_THUMBNAIL_MIN_ZOOM, photoMarkerIconKey, photoPositionSourceKind, photoPositionSourcePresentation, photoThumbnailsVisible, cameraMarkerOptions, thumbnailMarkerOptions } from '../src/lib/photos/photoMarkerPresentation.mjs';
import { acceptPhotoCandidate, acceptManualPhotoPosition, emptySpatial } from '../src/lib/photos/photoSpatial.mjs';
import { buildPhotoMapFeatures } from '../src/lib/photos/photoMapFeatures.mjs';

const position = { crs: 'EPSG:4326', longitude: 10, latitude: 59 };
const candidates = ['exif', 'gmi', 'gml'].map((kind) => ({ id: kind, kind, status: 'viable', position }));
const photo = (kind) => ({ spatial: kind === 'manual' ? acceptManualPhotoPosition({ ...emptySpatial(), candidates }, position)
  : acceptPhotoCandidate({ ...emptySpatial(), candidates }, kind) });

for (const source of PHOTO_POSITION_SOURCES) test(`accepted ${source.kind}: central presentation survives selection, accepted/staged direction and unrelated evidence`, () => {
  const occurrence = photo(source.kind);
  assert.equal(photoPositionSourceKind(occurrence), source.kind);
  assert.strictEqual(photoPositionSourcePresentation(photoPositionSourceKind(occurrence)), source);
  for (const selected of [false, true]) for (const staged of [false, true]) {
    const options = cameraMarkerOptions({ sourceKind: source.kind, selected, degrees: 42, directionStaged: staged, staged });
    assert(options.html.includes(`fill="${source.color}"`));
    assert(options.html.includes(`data-position-source="${source.kind}"`));
    assert.equal(options.html.includes('r="14"'), selected, 'selection has its own outlined ring');
    assert.equal(options.className.includes('photo-camera-marker-selected'), selected);
    assert.deepEqual(options.iconSize, [30, 30]);
    assert.deepEqual(options.iconAnchor, [15, 15]);
    // Direction is drawn whether selected or not, in navy with a white halo; staged is a dashed shaft.
    assert(options.html.includes('stroke="white" stroke-width="5"'), 'arrow has independent white casing');
    assert(options.html.includes(`stroke="${PHOTO_DIRECTION_COLOR}"`));
    assert.equal(options.html.includes(`stroke-dasharray="${PHOTO_STAGED_DASH}"`), staged);
    assert.equal(options.html.includes('stroke-linecap="butt"'), staged, 'dashes keep visible gaps');
    assert.equal(options.html.includes('photo-marker-staged-dot'), staged);
    assert(!options.html.includes('#a34c00') && !options.html.includes('#075e9a'), 'retired orange/blue arrow colours');
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

test('thumbnail icons: 44 px cover crop, provenance border, independent selected ring, neutral fallback and no unsafe URLs', () => {
  for (const source of [...PHOTO_POSITION_SOURCES, photoPositionSourcePresentation('unknown')]) for (const selected of [false, true]) {
    const options = thumbnailMarkerOptions({ sourceKind: source.kind, selected, thumbnailUrl: 'blob:http://app/thumb-1', degrees: 120 });
    assert.deepEqual(options.iconSize, [44, 44]); assert.deepEqual(options.iconAnchor, [22, 22]);
    assert(options.html.includes(`style="--photo-source:${source.color}"`), 'source border colour');
    assert(options.html.includes(`data-position-source="${source.kind}"`));
    assert(options.html.includes('<img src="blob:http://app/thumb-1" alt="" decoding="async" draggable="false">'));
    assert.equal(options.className.includes('photo-marker-selected'), selected, 'selected ring is a modifier, the border stays');
    assert(options.html.includes('rotate(120 50 50)'), 'arrow drawn outside the thumbnail box');
  }
  const fallback = thumbnailMarkerOptions({ sourceKind: 'gmi', thumbnailUrl: null });
  assert(!fallback.html.includes('<img')); assert(fallback.html.includes('photo-thumb-fallback'));
  assert(fallback.html.includes('data-thumbnail="fallback"'));
  for (const unsafe of ['javascript:alert(1)', 'https://example.test/a.jpg', '"><script>', 42]) {
    const html = thumbnailMarkerOptions({ thumbnailUrl: unsafe }).html;
    assert(!html.includes('<img') && !html.includes('<script'), String(unsafe));
  }
  assert(thumbnailMarkerOptions({ editing: true, selected: true }).html.includes('photo-thumb-anchor'), 'exact point shown while editing');
});

test('sibling, staged and stack modifiers; identical presentation shares one cache key', () => {
  const sibling = cameraMarkerOptions({ sourceKind: 'gmi', sibling: true });
  assert(sibling.className.includes('photo-marker-sibling')); assert(sibling.html.includes('photo-sibling-ring'));
  assert(!cameraMarkerOptions({ sibling: true, selected: true }).className.includes('photo-marker-sibling'), 'selected wins over sibling');
  assert(cameraMarkerOptions({ stackCount: 3 }).html.includes('<span class="photo-marker-stack" aria-hidden="true">3</span>'));
  assert(!cameraMarkerOptions({ stackCount: 1 }).html.includes('photo-marker-stack'));
  assert(thumbnailMarkerOptions({ stackCount: 120 }).html.includes('>99<'));
  const base = { sourceKind: 'gmi', degrees: 90, selected: false };
  assert.equal(photoMarkerIconKey('markers', base), photoMarkerIconKey('markers', { ...base, degrees: 450 }));
  assert.equal(photoMarkerIconKey('markers', { ...base, thumbnailUrl: 'blob:a' }), photoMarkerIconKey('markers', { ...base, thumbnailUrl: 'blob:b' }), 'markers ignore thumbnails');
  assert.notEqual(photoMarkerIconKey('thumbnails', { ...base, thumbnailUrl: 'blob:a' }), photoMarkerIconKey('thumbnails', { ...base, thumbnailUrl: 'blob:b' }));
  for (const change of [{ selected: true }, { degrees: 91 }, { degrees: null }, { staged: true }, { directionStaged: true }, { sibling: true }, { stackCount: 2 }, { sourceKind: 'exif' }, { editing: true }]) {
    assert.notEqual(photoMarkerIconKey('markers', base), photoMarkerIconKey('markers', { ...base, ...change }), JSON.stringify(change));
  }
});

test('thumbnail zoom threshold starts at 16 and falls back to markers below it', () => {
  assert.equal(PHOTO_THUMBNAIL_MIN_ZOOM, 16);
  assert.equal(photoThumbnailsVisible('thumbnails', 15.9), false);
  assert.equal(photoThumbnailsVisible('thumbnails', 16), true);
  assert.equal(photoThumbnailsVisible('thumbnails', 19), true);
  assert.equal(photoThumbnailsVisible('markers', 19), false);
  assert.equal(photoThumbnailsVisible('thumbnails', undefined), false);
});

test('display card and markers share classification/palette/glyph; marker layer reads a pre-built presentation', async () => {
  const read = (name) => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8');
  const [card, view, markers] = await Promise.all([
    read('components/photos/PhotoMapDisplayCard.js'), read('components/MapView.js'), read('components/photos/PhotoMarkersLayer.js'),
  ]);
  assert.deepEqual(PHOTO_POSITION_SOURCES.map((source) => source.label), ['EXIF', 'GMI', 'GML', 'Manuell']);
  assert.equal(new Set(PHOTO_POSITION_SOURCES.map((source) => source.color)).size, 4);
  assert.match(card, /PHOTO_POSITION_SOURCES\.map/);
  assert.match(card, /photoCameraGlyph\(\{ sourceKind: kind/);
  assert.match(card, /aria-label="Bilder på kartet"/);
  assert.match(view, /<PhotoMapDisplayCard/);
  assert.doesNotMatch(view, /PhotoPositionLegend/);
  assert.doesNotMatch(markers, /photoSession\.getPhoto/, 'no per-marker session lookups');
  assert.match(markers, /photoPositionSourceKind\(photo\)/);
  assert.match(markers, /plassering: \$\{source.label\}/);
});

test('provenance palette keeps established sources and separates magenta GML from blue GMI', () => {
  assert.deepEqual(PHOTO_POSITION_SOURCES.map(({ color }) => color), ['#19785b', '#2463b5', '#a03b82', '#b06a08']);
});


test('thumbnail source badges distinguish all four sources without colour, alongside stacks, selection and edit handles', () => {
  const glyphs = new Set();
  for (const source of PHOTO_POSITION_SOURCES) {
    for (const selected of [false, true]) for (const stackCount of [1, 6]) {
      const thumb = thumbnailMarkerOptions({ sourceKind: source.kind, selected, stackCount, editing: selected, staged: true, degrees: 225 });
      assert.match(thumb.html, /class="photo-thumb-source" role="img" aria-label="/);
      assert(thumb.html.includes(source.kind === 'manual' ? 'Manuelt plassert' : `Plassering fra ${source.label}`));
      assert(thumb.html.includes(`data-source-glyph="${source.kind}"`));
      assert.equal(thumb.html.includes('photo-marker-stack'), stackCount > 1);
      assert.equal(thumb.html.includes('photo-thumb-anchor'), selected);
      assert(!cameraMarkerOptions({ sourceKind: source.kind, selected, stackCount }).html.includes('photo-thumb-source'), 'ordinary markers unchanged');
      glyphs.add(thumb.html.match(/class="photo-source-glyph"[^>]*><path d="([^"]+)"/)[1]);
    }
  }
  assert.equal(glyphs.size, 4, 'each source has a different shape');
});
