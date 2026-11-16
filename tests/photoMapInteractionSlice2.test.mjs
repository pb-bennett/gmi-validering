// FOTO Slice 2 (2026-11-16): unified delivery colours, provenance kept through manual adjustments, the persistent
// FOTO preview with its delivery cycle pill, consolidated filters and the compact layer-card entry. Synthetic data only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { acceptManualPhotoPosition, acceptPhotoCandidate, photoPositionOriginKind } from '../src/lib/photos/photoSpatial.mjs';
import { createPhotoEditState, effectivePhoto, photoEditReducer } from '../src/lib/photos/photoEditSession.mjs';
import { PHOTO_DELIVERY_COLOURS, PHOTO_DELIVERY_INK, PHOTO_POSITION_SOURCES, photoMarkerOptions, photoPositionAdjusted,
  photoPositionProvenanceKind, photoPositionSourceKind } from '../src/lib/photos/photoMarkerPresentation.mjs';
import { photoWorkspaceView } from '../src/lib/photos/photoWorkspaceView.mjs';
import { DEFAULT_PHOTO_FILTER, photoWorkspaceReducer, emptyPhotoWorkspace } from '../src/lib/photos/photoWorkspaceState.mjs';
import { PHOTO_DELIVERY_FILTERS } from '../src/lib/photos/photoDeliveryIntent.mjs';

const at = (longitude) => ({ crs: 'EPSG:4326', longitude, latitude: 59 });
const sourceColour = (kind) => PHOTO_POSITION_SOURCES.find((source) => source.kind === kind).color;
const spatialFrom = (kind) => ({ candidates: [{ id: `c-${kind}`, kind, status: 'viable', position: at(10) }], current: null });
const photo = (id, spatial, assetId = id) => ({ id, assetId, originalFilename: `${id}.jpg`, spatial, direction: { current: null },
  captureMetadata: { captureTime: null }, repeatGroup: { occurrenceCount: 1, occurrenceIndex: 1, referringObjectCount: 0 }, preview: {} });
const read = (name) => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8');

test('provenance survives manual adjustments; a hand placement from scratch is Manuell', () => {
  for (const kind of ['gmi', 'gml', 'exif']) {
    const accepted = acceptPhotoCandidate(spatialFrom(kind), `c-${kind}`, 'explicit-candidate', 1);
    assert.equal(photoPositionOriginKind(accepted), kind);
    const moved = acceptManualPhotoPosition(accepted, at(10.001), 2);
    const movedTwice = acceptManualPhotoPosition(moved, at(10.002), 3);
    assert.deepEqual([moved.current.basis, moved.current.origin, movedTwice.current.origin], [{ kind: 'manual' }, kind, kind]);
    assert.equal(photoPositionSourceKind(photo('p', movedTwice)), 'manual', 'the current basis is still reported as manual');
    assert.equal(photoPositionProvenanceKind(photo('p', movedTwice)), kind);
    assert.equal(photoPositionAdjusted(photo('p', movedTwice)), true);
  }
  const scratch = acceptManualPhotoPosition({ candidates: [], current: null }, at(11), 4);
  assert.deepEqual(scratch.current, { position: at(11), basis: { kind: 'manual' }, acceptance: 'manual', acceptedAt: 4 }, 'no origin field is invented');
  assert.equal(photoPositionProvenanceKind(photo('s', scratch)), 'manual');
  assert.equal(photoPositionAdjusted(photo('s', scratch)), false);
  assert.equal(photoPositionOriginKind({ candidates: [], current: null }), null);
});

test('staged moves keep provenance in the overlay, so list, filter and map agree throughout editing', () => {
  const gmi = photo('g', acceptPhotoCandidate(spatialFrom('gmi'), 'c-gmi', 'explicit-candidate', 1));
  const unplaced = photo('u', { candidates: [], current: null });
  let state = createPhotoEditState({ id: 't', layerId: 'l', baseline: { g: { current: gmi.spatial.current, direction: null }, u: { current: null, direction: null } } });
  state = photoEditReducer(state, { type: 'stage', photoId: 'g', field: 'position', value: at(10.5), at: 1 });
  state = photoEditReducer(state, { type: 'stage', photoId: 'u', field: 'position', value: at(10.6), at: 2 });
  const [g, u] = [gmi, unplaced].map((item) => effectivePhoto(item, state));
  assert.equal(g.spatial.current.acceptance, 'staged');
  assert.deepEqual([photoPositionProvenanceKind(g), photoPositionProvenanceKind(u)], ['gmi', 'manual']);
  const view = (placement) => photoWorkspaceView([g, u], { filter: { ...DEFAULT_PHOTO_FILTER, placement } }).rows.map((item) => item.id);
  assert.deepEqual([view('gmi'), view('manual')], [['g'], ['u']]);
  const counts = photoWorkspaceView([g, u]).counts;
  assert.deepEqual([counts.gmi, counts.manual, counts.placed], [1, 1, 2]);
});

test('markers keep the active colour mode through selection, editing and staging; selection is size and ring only', () => {
  const states = [{}, { selected: true }, { selected: true, editing: true }, { selected: true, editing: true, staged: true }, { sibling: true }];
  for (const [status, key] of [['keep-link', 'gmi'], ['transfer', 'gml'], ['include', 'gml'], ['exclude', 'excluded'], ['not-selected', 'excluded']]) {
    for (const extra of states) for (const mode of ['markers', 'thumbnails']) {
      // A moved GMI photo would read «manual» (orange) or «gmi» (provenance blue) if the mode were ignored.
      const options = photoMarkerOptions(mode, { colourMode: 'delivery', deliveryStatus: status, sourceKind: 'manual', ...extra });
      assert(options.html.includes(PHOTO_DELIVERY_COLOURS[key].color), `${status} ${mode} ${JSON.stringify(extra)}`);
      assert(!options.html.includes(sourceColour('manual')) && !options.html.includes(sourceColour('gmi')));
    }
  }
  for (const kind of ['gmi', 'gml', 'exif']) for (const extra of states) {
    const options = photoMarkerOptions('markers', { colourMode: 'provenance', sourceKind: kind, ...extra });
    assert(options.html.includes(sourceColour(kind)) && !options.html.includes(sourceColour('manual')), `${kind} ${JSON.stringify(extra)}`);
  }
  const plain = photoMarkerOptions('markers', { colourMode: 'delivery', deliveryStatus: 'keep-link' });
  const selected = photoMarkerOptions('markers', { colourMode: 'delivery', deliveryStatus: 'keep-link', selected: true });
  assert(selected.html.includes('width="22"') && plain.html.includes('width="16"'), 'selection enlarges the marker');
  assert(selected.html.includes('r="14"') && !plain.html.includes('r="14"'), 'selection adds the ring');
  assert(plain.html.includes(`stroke="${PHOTO_DELIVERY_INK}"`), 'light delivery fills take the dark lens');
  assert(photoMarkerOptions('markers', { colourMode: 'provenance', sourceKind: 'gmi' }).html.includes('stroke="white" stroke-width="2"'), 'provenance keeps the white lens');
});

test('main map colours by delivery choice; only the FOTO card offers Plasseringskilde; the edit target follows the mode', async () => {
  const [markers, editLayer, mapInner, legend, card] = await Promise.all(['components/photos/PhotoMarkersLayer.js', 'components/photos/PhotoEditLayer.js',
    'components/MapInner.js', 'components/MapLegend.js', 'components/photos/PhotoMapDisplayCard.js'].map(read));
  assert.match(markers, /colourMode: inWorkspace \? workspace\.colourMode : 'delivery'/);
  assert.match(markers, /photoSession\.getLayerDelivery\(layerId\)/);
  assert.doesNotMatch(markers, /colourMode: inWorkspace \? workspace\.colourMode : 'provenance'/);
  assert.match(markers, /sourceKind: photoPositionProvenanceKind\(photo\)/);
  assert.match(editLayer, /sourceKind: photoPositionProvenanceKind\(photo\), selected: true, colourMode, deliveryStatus/);
  assert.match(mapInner, /colourMode=\{photoWorkspace\?\.colourMode\} delivery=\{photoWorkspace\?\.delivery\}/);
  assert.match(legend, /photoDeliveryLegendItems\(/);
  assert.doesNotMatch(legend, /Plasseringskilde|PHOTO_POSITION_SOURCES/);
  assert.match(card, /<option value="provenance">Plasseringskilde<\/option><option value="delivery">Leveringsvalg<\/option>/);
  assert.equal(emptyPhotoWorkspace.colourMode, 'delivery');
  assert.equal(photoWorkspaceReducer({ ...emptyPhotoWorkspace, layerId: 'a', colourMode: 'provenance' }, { type: 'enter', layerId: 'b', photoIds: [] }).colourMode, 'delivery');
});

test('persistent FOTO preview: image, filename, close and the shared delivery cycle pill only', async () => {
  const [preview, markers, page] = await Promise.all(['components/photos/PhotoWorkspaceMapPreview.js', 'components/photos/PhotoMarkersLayer.js', 'app/page.js'].map(read));
  assert.match(preview, /<PhotoIconButton icon=\{XIcon\} label="Lukk bildeforhåndsvisning"/);
  assert.match(preview, /<PhotoDeliveryCycleButton entry=\{deliveryEntry\}/);
  for (const absent of ['PhotoOccurrenceContext', 'Bildedetaljer', 'Åpne i bildemodul', 'captureTime', 'photoSession.set']) assert(!preview.includes(absent), absent);
  // Browse mode only, X/Escape close, no map-click close, and it never shares the main-map popup class that hides hover previews.
  assert.match(markers, /workspace && !workspace\.editing && workspace\.photoId/);
  assert.match(markers, /closeOnClick=\{false\} closeOnEscapeKey=\{false\}/);
  assert.match(markers, /className="photo-workspace-preview-popup"/);
  assert.match(markers, /querySelector\('\.photo-map-viewer-popup'\)/, 'the hover preview rule is unchanged');
  assert.match(markers, /PREVIEW_DELAY_MS = 250/);
  // The cycle pill uses the page's single per-occurrence toggle (proposal-aware), never a stack- or asset-wide write.
  assert.match(page, /delivery: shownDelivery, onToggleDelivery: toggleWorkspaceDelivery/);
});

test('filters: source and destination are named apart; destination choices follow the pills', () => {
  assert.deepEqual(PHOTO_DELIVERY_FILTERS.map((item) => item.label), ['Alle', 'GMI', 'GML', 'Ikke', 'Delvis med', 'Gjennomgå']);
  const placed = (id, kind) => photo(id, acceptPhotoCandidate(spatialFrom(kind), `c-${kind}`, 'explicit-candidate', 1));
  const photos = [placed('a', 'gmi'), placed('b', 'gmi'), placed('c', 'gml'), placed('d', 'exif'), photo('e', { candidates: [], current: null })];
  const statuses = { a: 'keep-link', b: 'transfer', c: 'include', d: 'exclude', e: 'not-selected' };
  const delivery = { byPhotoId: Object.fromEntries(Object.entries(statuses).map(([id, status]) => [id, { photoId: id, status }])), assets: {} };
  const view = (filter, activePhotoId = null) => photoWorkspaceView(photos, { activePhotoId, filter: { ...DEFAULT_PHOTO_FILTER, ...filter } }, { delivery });
  const ids = (result) => result.rows.map((item) => item.id);
  assert.deepEqual(ids(view({ delivery: 'keep-link' })), ['a']);
  assert.deepEqual(ids(view({ delivery: 'gml' })), ['b', 'c']);
  assert.deepEqual(ids(view({ delivery: 'not-delivered' })), ['d', 'e']);
  assert.deepEqual(ids(view({ placement: 'gmi' })), ['a', 'b'], 'source GMI is not destination GMI');
  assert.deepEqual(view({ placement: 'gmi', delivery: 'gml' }).summary, ['Kilde: GMI', 'Levering: GML']);
  assert.deepEqual(view({ delivery: 'transfer' }).summary, ['Levering: Overføres til GML'], 'finer statuses still filter exactly');
  const counts = view({}).counts.delivery;
  assert.deepEqual(counts, { all: 5, 'keep-link': 1, gml: 2, 'not-delivered': 2, partial: 0, review: 0 });
  // Counts, list and map stay consistent; a delivery mismatch is not pinned (Slice 1), a source mismatch is.
  const gml = view({ delivery: 'gml' }, 'a');
  assert.deepEqual([gml.shownCount, gml.pinned, gml.visibleIds.has('a')], [counts.gml, null, false]);
  const source = view({ placement: 'gml' }, 'a');
  assert.deepEqual([source.pinned?.id, source.visibleIds.has('a')], ['a', true]);
  assert.equal(photoWorkspaceReducer({ ...emptyPhotoWorkspace, layerId: 'l' }, { type: 'filter', filter: { delivery: 'gml' } }).filter.delivery, 'gml');
});

test('layer card: compact Phosphor image icon, accessible name Åpne FOTO, tooltip Åpne bildemodul', async () => {
  const card = await read('components/photos/PhotoLayerCard.js');
  assert.match(card, /<PhotoIconButton icon=\{ImageIcon\} size=\{14\} label="Åpne FOTO" tooltip="Åpne bildemodul"/);
  assert.match(card, /className="layer-card-icon-button" onClick=\{\(event\) => onOpen\(layer\.id, event\.currentTarget\)\}/);
  assert.doesNotMatch(card, />Bildemodul</);
  assert.match(card, /bilder\{layer\.assetCount < layer\.photoCount/, 'counts and status line unchanged');
});
