// Direct-click GMI/GML delivery planning («Fordel bilder til GMI/GML»). Synthetic data only.
// Every write goes through the canonical M8 session actions for exactly one occurrence.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';
import { parseGmiPhotoSource } from '../src/lib/photos/gmiPhotoSource.mjs';
import { PHOTO_DELIVERY_COLOURS, PHOTO_POSITION_SOURCES, photoMarkerOptions, photoStackDeliveryState } from '../src/lib/photos/photoMarkerPresentation.mjs';
import { applyPhotoDeliveryChoice, photoDeliveryDestination, photoDeliveryDestinationCounts, photoDeliveryOptions, photoDeliveryShortLabel,
  photoDeliveryToggleTarget, photoDeliveryUnavailableReason, photoStackDeliverySummary, togglePhotoDelivery } from '../src/lib/photos/photoDeliveryChoice.mjs';
import { gmiFile } from './helpers/gmiPhotoFixtures.mjs';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const point = (longitude = 10) => ({ crs: 'EPSG:4326', longitude, latitude: 60 });
const KUM1 = '00000000-0000-4000-8000-000000000001', KUM2 = '00000000-0000-4000-8000-000000000002', KUM3 = '00000000-0000-4000-8000-000000000003';
// Kum 1 and Kum 2 share a.jpg; Kum 3 has b.jpg; a line links c.jpg (no FOTO occurrence); d.jpg has no GMI reference.
const OBJECTS = [
  { guid: KUM1, label: 'Kum 1', hyperlink: 'h:1(link:"Attachments\\a.jpg") ', xyz: '581930 6566000 1' },
  { guid: KUM2, label: 'Kum 2', hyperlink: 'h:1(link:"Attachments\\a.jpg") ', xyz: '582030 6566100 1' },
  { guid: KUM3, label: 'Kum 3', hyperlink: 'h:1(link:"Attachments\\b.jpg") ', xyz: '582050 6566120 1' },
  { scope: 'line', guid: '00000000-0000-4000-8000-000000000010', label: 'Ledning', hyperlink: 'h:1(link:"Attachments\\c.jpg") ' },
];

async function setup() {
  let next = 0, live = true;
  const session = createPhotoSession({ createId: () => `id-${++next}`, yieldJob: tick,
    urls: { createObjectURL: () => `blob:${next}`, revokeObjectURL: () => {} },
    createThumbnail: async () => ({ dimensions: { width: 3, height: 2 }, thumbnailBlob: new Blob(['thumb']) }),
    extractGps: async () => ({ state: 'viable', candidate: { status: 'viable', position: point(), raw: {} } }) });
  session.importFiles(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'].map((name) => new File(['image'], name, { type: 'image/jpeg', lastModified: 1 })));
  const layer = session.createLayer();
  for (let count = 0; count < 100 && session.getLayerPhotos(layer.id).some((photo) => photo.preview.state === 'pending' || photo.spatial.exifRead.state === 'pending'); count++) await tick();
  const gmi = gmiFile(OBJECTS, 'leveranse.gmi');
  const binding = { layerId: 'survey-1', datasetRevision: 'rev-1', inputId: 'input-1', filename: 'leveranse.gmi' };
  const ticket = session.beginSourceWorkflow(layer.id);
  assert(await session.stageLayerSource(layer.id, { binding, read: () => parseGmiPhotoSource(gmi), isLive: () => live }, 'gmi'));
  assert(session.saveSourceWorkflowSource(ticket, session.getSnapshot().sourceReviews[layer.id]).ok);
  session.endSourceWorkflow(ticket);
  const photos = () => session.getLayerPhotos(layer.id);
  const byObject = (guid) => photos().find((photo) => photo.occurrence?.object.guid === guid);
  const byName = (name) => photos().find((photo) => photo.originalFilename === name && !photo.occurrence);
  const entry = (photo) => session.getLayerDelivery(layer.id).byPhotoId[photo.id];
  const destinations = () => Object.fromEntries(photos().map((photo) => [photo.occurrence?.object.guid || photo.originalFilename, photoDeliveryDestination(entry(photo))]));
  const toggle = (photo) => togglePhotoDelivery(session, layer.id, photo.id);
  return { session, layer, photos, byObject, byName, entry, destinations, toggle, setLive: (value) => { live = value; } };
}

test('one click toggles GMI -> GML -> GMI for exactly one occurrence; a shared photo keeps independent decisions', async () => {
  const f = await setup();
  const kum1 = f.byObject(KUM1), kum2 = f.byObject(KUM2);
  assert.equal(kum1.assetId, kum2.assetId, 'one physical photograph, two placements');
  assert.deepEqual(f.destinations(), { [KUM1]: 'gmi', [KUM2]: 'gmi', [KUM3]: 'gmi', 'c.jpg': 'gmi', 'd.jpg': 'excluded' });
  const counts = () => photoDeliveryDestinationCounts(f.session.getLayerDelivery(f.layer.id));
  assert.deepEqual(counts(), { gmi: 4, gml: 0, excluded: 1, review: 0 });

  let result = f.toggle(kum1);
  assert(result.ok); assert.deepEqual(result.changedIds, [kum1.id]);
  assert.equal(result.entry.status, 'transfer');
  assert.deepEqual(f.destinations(), { [KUM1]: 'gml', [KUM2]: 'gmi', [KUM3]: 'gmi', 'c.jpg': 'gmi', 'd.jpg': 'excluded' }, 'Kum 2 is untouched');
  assert.deepEqual(counts(), { gmi: 3, gml: 1, excluded: 1, review: 0 });
  result = f.toggle(kum2);
  assert.deepEqual(result.changedIds, [kum2.id]);
  assert.equal(f.entry(kum1).status, 'transfer', 'the sibling keeps its own choice');
  result = f.toggle(kum1);
  assert.deepEqual(result.changedIds, [kum1.id]);
  assert.equal(f.entry(kum1).status, 'keep-link');
  assert.equal(f.entry(kum2).status, 'transfer');
  assert.deepEqual(counts(), { gmi: 3, gml: 1, excluded: 1, review: 0 });
  // Canonical snapshot for M9: only the toggled occurrence is a removal selection.
  const snapshot = f.session.getPhotoDeliverySnapshot(f.layer.id);
  assert.deepEqual(snapshot.transfers.map((item) => item.photoId), [kum2.id]);
  assert.deepEqual(snapshot.removalSelections.map((item) => item.key), [kum2.occurrence.key]);
});

test('unlinked placements toggle «Ikke med» <-> GML and never offer GMI; line-linked photos stay in GMI', async () => {
  const f = await setup();
  const unlinked = f.byName('d.jpg'), line = f.byName('c.jpg');
  assert.deepEqual(photoDeliveryOptions(f.entry(unlinked)).map(({ key, label, active }) => [key, label, active]), [['excluded', 'Ikke med', true], ['gml', 'GML', false]]);
  assert(!photoDeliveryOptions(f.entry(unlinked)).some((item) => item.key === 'gmi'), 'no invalid GMI destination');
  assert.equal(f.toggle(unlinked).entry.status, 'include');
  assert.equal(photoDeliveryShortLabel(f.entry(unlinked)), 'GML');
  assert.equal(f.toggle(unlinked).entry.status, 'not-selected');

  const lineEntry = f.entry(line);
  assert(lineEntry.linkedWithoutOccurrence);
  assert.deepEqual(photoDeliveryOptions(lineEntry).map(({ key, active, disabled }) => [key, active, disabled]), [['gmi', true, true]]);
  assert.equal(photoDeliveryToggleTarget(lineEntry), null);
  const blocked = f.toggle(line);
  assert.equal(blocked.ok, false); assert.equal(blocked.error, 'not-changeable');
  assert.match(blocked.reason, /Lenken beholdes i GMI/);
  assert.equal(f.entry(line).status, 'keep-link');
});

test('transfer unavailable or needing review: clicks never write an invalid decision and review resolves to keeping the GMI link', async () => {
  const f = await setup();
  const kum3 = f.byObject(KUM3);
  assert.equal(f.toggle(kum3).entry.status, 'transfer');
  f.setLive(false);
  f.session.reconcileLoadedGmiBindings(() => false);
  const review = f.entry(kum3);
  assert.equal(review.status, 'review'); assert.equal(review.reason, 'source-not-live');
  // A stale transfer resolves to its safe default (GMI); GML stays unavailable while the source is not live.
  assert.equal(photoDeliveryToggleTarget(review).key, 'gmi');
  assert.deepEqual(photoDeliveryOptions(review).map(({ key, active, disabled }) => [key, active, disabled]), [['gmi', false, false], ['gml', false, true]]);
  assert.equal(f.toggle(kum3).entry.status, 'keep-link');
  const blocked = f.toggle(kum3);
  assert.equal(blocked.error, 'not-changeable');
  assert.equal(f.entry(kum3).status, 'keep-link', 'nothing invalid was written');
  assert.match(photoDeliveryUnavailableReason(f.entry(kum3)), /^Kan ikke overføres nå: GMI-filen er ikke lenger lastet inn/);
  // Synthetic entries cover every state independently of how a session reaches it.
  const linked = (status, canTransfer = true) => ({ photoId: 'p', linked: true, status, canTransfer, association: { state: canTransfer ? 'confident' : 'association-lost' } });
  assert.equal(photoDeliveryToggleTarget(linked('keep-link')).key, 'gml');
  assert.equal(photoDeliveryToggleTarget(linked('transfer')).key, 'gmi');
  assert.equal(photoDeliveryToggleTarget(linked('review')).key, 'gmi');
  assert.equal(photoDeliveryToggleTarget(linked('keep-link', false)), null);
  assert.match(photoDeliveryUnavailableReason(linked('keep-link', false)), /sikre GMI-koblingen/);
  const staleUnlinked = { photoId: 'p', linked: false, status: 'review', reason: 'link-removed', canInclude: true };
  assert.equal(photoDeliveryToggleTarget(staleUnlinked).key, 'gml', 'a link-removed review can only be replaced by an inclusion');
  const lineReview = { photoId: 'p', linked: false, linkedWithoutOccurrence: true, status: 'review', reason: 'decision-type-changed' };
  assert.deepEqual(photoDeliveryToggleTarget(lineReview).apply, { kind: 'inclusion', include: false });
  assert.deepEqual(applyPhotoDeliveryChoice({}, 'l', 'p', { disabled: true, apply: { kind: 'intent', intent: 'transfer' } }), { ok: false, error: 'unavailable', changedIds: [] });
});

test('apply writes only through the two M8 actions, one occurrence at a time', () => {
  const calls = [];
  const session = { setDeliveryIntent: (...args) => { calls.push(['intent', ...args]); return { ok: true, changedIds: args[1] }; },
    setCombinedDeliveryInclusion: (...args) => { calls.push(['inclusion', ...args]); return { ok: true, changedIds: args[1] }; } };
  applyPhotoDeliveryChoice(session, 'layer', 'p1', { apply: { kind: 'intent', intent: 'transfer' } });
  applyPhotoDeliveryChoice(session, 'layer', 'p2', { apply: { kind: 'inclusion', include: true } });
  assert.deepEqual(calls, [['intent', 'layer', ['p1'], 'transfer'], ['inclusion', 'layer', ['p2'], true]]);
});

test('overlapping groups summarise per occurrence and colour as mixed without a group action', () => {
  const members = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const entries = { a: { status: 'keep-link' }, b: { status: 'transfer' }, c: { status: 'include' } };
  assert.equal(photoStackDeliverySummary(members, entries), '3 plasseringer · 1 GMI · 2 GML');
  assert.equal(photoStackDeliverySummary(members.slice(0, 1), entries), '1 plassering · 1 GMI');
  assert.equal(photoStackDeliveryState(members, entries), 'mixed');
  assert.equal(photoStackDeliveryState(members.slice(1), entries), 'gml');
  const mixed = photoMarkerOptions('markers', { colourMode: 'delivery', deliveryColourState: 'mixed', deliveryStatus: 'keep-link' });
  assert(mixed.html.includes(PHOTO_DELIVERY_COLOURS.mixed.color) && mixed.html.includes('stroke-dasharray'));
});

// WCAG relative luminance and contrast.
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255).map((c) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('the destination palette is shared, clearly distinguishable and readable', async () => {
  const css = await readFile(new URL('../src/app/globals.css', import.meta.url), 'utf8');
  const token = (name) => css.match(new RegExp(`--gmi-delivery-${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1]?.toLowerCase();
  assert.equal(token('gmi'), PHOTO_DELIVERY_COLOURS.gmi.color, 'CSS token and marker colour are one palette');
  assert.equal(token('gml-marker'), PHOTO_DELIVERY_COLOURS.gml.color);
  assert.equal(token('gml'), '#166534');
  assert.equal(token('gmi-ink'), '#ffffff');
  assert.equal(token('gml-ink'), '#ffffff');
  assert.equal(token('neutral'), PHOTO_DELIVERY_COLOURS.excluded.color);
  const { gmi, gml, excluded } = PHOTO_DELIVERY_COLOURS;
  // Not a subtle hue difference: GMI and GML differ strongly in lightness too (the rejected pair was ~1.3:1).
  assert(contrast(gmi.color, gml.color) >= 3.5, `GMI/GML lightness separation ${contrast(gmi.color, gml.color).toFixed(2)}`);
  assert(contrast('#2463b5', '#19785b') < 1.5, 'the replaced pair was nearly equal in lightness');
  assert(contrast(gml.color, excluded.color) >= 2 && contrast(gmi.color, excluded.color) >= 1.5);
  // Pill text on the filled destination colours (AA for small text).
  assert(contrast(gmi.color, token('gmi-ink')) >= 4.5);
  assert(contrast(token('gml'), token('gml-ink')) >= 4.5);
  // Markers keep a white casing and dark outline, so both fills stay visible on light and dark map backgrounds.
  for (const background of ['#ffffff', '#f2efe9', '#1f2937']) assert(Math.max(contrast(gmi.color, background), contrast(gml.color, background)) >= 3);
  // Provenance mode keeps its accepted palette.
  assert.deepEqual(PHOTO_POSITION_SOURCES.map((source) => source.color), ['#19785b', '#2463b5', '#a03b82', '#b06a08']);
});

test('UI source contract: direct-click planning replaced the batch workflow; the tree pill follows the filename', async () => {
  const read = (name) => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8');
  const [collection, popup, markers, tools, toggle, inventory, inspector, state] = await Promise.all(['components/photos/PhotoWorkspaceCollection.js',
    'components/photos/PhotoDeliveryMapPopup.js', 'components/photos/PhotoMarkersLayer.js', 'components/photos/PhotoWorkspaceToolsMenu.js',
    'components/photos/PhotoDeliveryToggle.js', 'components/delivery/DeliveryInventory.js', 'components/photos/PhotoWorkspaceInspector.js', 'lib/photos/photoWorkspaceState.mjs'].map(read));
  assert.match(tools, /label: 'Fordel bilder til GMI\/GML'/);
  assert.doesNotMatch(tools, /Velg samlet levering/);
  assert.match(collection, /onClick=\{\(\) => onSelect\(photo.id\)\}/);
  assert.match(collection, /event.stopPropagation\(\); if \(target\) onPlan\(photo.id\)/);
  assert.doesNotMatch(collection, /pan: false|const planPhoto/);
  assert.match(collection, /Bruk leveringsknappen for å endre GMI\/GML\./);
  for (const removed of [/for samlet levering`\}/, /photo-delivery-actions/, /Overfør \{unit/, /Behold lenker for/, /select-delivery/, /toggle-delivery/])
    assert.doesNotMatch(collection, removed);
  const planningBar = collection.slice(collection.indexOf('{deliveryMode && <div className="photo-delivery-bar"'), collection.indexOf('<ul ref={listRef}'));
  assert(planningBar.length > 0 && !/Velg alle viste|type="checkbox"/.test(planningBar), 'no selection controls in the planning bar');
  assert.doesNotMatch(popup, /Massevalg|role="tab"|type="checkbox"/);
  assert.doesNotMatch(markers, /batchSelected|deliveryIds|aria-pressed/);
  assert.doesNotMatch(state, /deliveryIds|deliveryPopupTab/);
  // The toggle writes through the shared dispatcher only.
  assert.doesNotMatch(toggle, /photoSession\.set/);
  assert.match(toggle, /applyPhotoDeliveryChoice\(photoSession/);
  // Destination pill sits in the same inline label as the filename (no right-aligned badge column).
  assert.match(inventory, /<span className="delivery-file-label"><span className="delivery-file-name">\{node\.name\}<\/span>\s*\{node\.destination && <>\{' '\}<span className="delivery-destination"/);
  const css = await read('components/delivery/deliveryWizard.css');
  assert.doesNotMatch(css.match(/\.delivery-destination \{[^}]*\}/)[0], /margin-left: auto/);
  assert.match(css, /\.delivery-destination \{[^}]*border-radius: 999px/);
  assert.match(css, /data-destination='GMI \+ GML'/);
  // Inspector: nested placement/links and file information, compact toggle directly after the status row.
  const order = ['photo-inspector-status-row', '<PhotoDeliveryControls', 'title="Opptak"', 'title="Plassering og koblinger"', 'aria-label="Plassering"',
    'id="placement-provenance"', 'id="placement-technical"', 'id="placement-alternatives"', 'aria-label="Koblinger"', 'id="links"', 'title="Filinformasjon"'];
  const positions = order.map((needle) => inspector.indexOf(needle));
  assert(positions.every((position) => position > 0), JSON.stringify(Object.fromEntries(order.map((needle, index) => [needle, positions[index]]))));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  const controls = await read('components/photos/PhotoDeliveryControls.js');
  assert.doesNotMatch(controls, /fjernes først når en samlet leveranse lages|Bildet har ingen GMI-lenke. Er det valgt/, 'no repeated link-removal explanation');
});


test('pills and selected destination controls share dark fills; marker green stays separate', async () => {
  const css = await readFile(new URL('../src/components/photos/photoWorkspace.css', import.meta.url), 'utf8');
  const tree = await readFile(new URL('../src/components/delivery/deliveryWizard.css', import.meta.url), 'utf8');
  for (const [key, label] of [['gmi', 'GMI'], ['gml', 'GML']]) {
    for (const [source, selector] of [[css, `.photo-delivery-pill[data-destination=${key}]`],
      [css, `.photo-delivery-option[aria-checked=true][data-destination=${key}]`],
      [tree, `.delivery-destination[data-destination=${label}]`]]) {
      const rule = source.slice(source.indexOf(selector)).split('}')[0];
      assert(rule.includes(`background: var(--gmi-delivery-${key})`), selector);
      assert(rule.includes(`color: var(--gmi-delivery-${key}-ink)`), selector);
    }
  }
  assert.match(css, /photo-delivery-row-button:hover:not\(\[aria-disabled\]\)/);
  assert.match(css, /photo-delivery-row-button\[aria-disabled\][^}]*border-style: dashed/);
  assert.match(tree, /linear-gradient\(90deg, var\(--gmi-delivery-gmi\) 0 50%, var\(--gmi-delivery-gml\) 50% 100%\)/);
  assert(!css.includes('#22c55e') && !tree.includes('#22c55e'), 'bright green belongs to map presentation only');
});
