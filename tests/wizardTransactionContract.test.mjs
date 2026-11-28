import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';
import { EMPTY_GML_CAPTURE_DECISION } from '../src/lib/photos/photoGmlCaptureReconciliation.mjs';
import { gmiFile } from './helpers/gmiPhotoFixtures.mjs';

// The permanent wizard rule (AGENTS.md, «Source and data safety»; DB5): a wizard is one transaction. Intermediate
// steps stage choices in a draft; only the final confirmation writes accepted data, atomically, published once; then
// the wizard shows what was saved. Cancel/close discards the draft. Every wizard is listed here; add new ones.
// Classification (B-4): wizards — «Koble og posisjoner bilder», «Legg til bilder», the integrated batch inspector, the export/delivery
// wizards (downloads only; remembered settings are exempt preferences). Task hub — «Fullfør opplysninger» (immediate
// edits, stated in the hub). Single-step dialogs with their own save — photo metadata, Rettinger object editor.
const point = (longitude = 10) => ({ crs: 'EPSG:4326', longitude, latitude: 60 });
const tick = () => new Promise((resolve) => setImmediate(resolve));
const image = (name) => new File(['original'], name, { type: 'image/jpeg' });
const gml = (names) => new File([JSON.stringify({ issues: [], entries: names.map((reference, index) => ({ id: `entry-${index}`, reference,
  kind: 'gml', status: 'viable', position: point(11), raw: { fotolink: reference } })) })], 'positions.gml');
function session() {
  let id = 0;
  return createPhotoSession({ createId: () => String(++id), yieldJob: tick,
    createThumbnail: async () => ({ dimensions: { width: 1, height: 1 }, thumbnailBlob: new Blob(['thumb']) }),
    extractGps: async () => ({ state: 'viable', candidate: { status: 'viable', position: point(), raw: { GPSLatitude: 60 } } }),
    parseGml: async (file) => JSON.parse(await file.text()) });
}
const settle = async (s, layerId = null) => {
  for (let i = 0; i < 200; i++) {
    const photos = layerId ? s.getLayerPhotos(layerId) : s.getSnapshot().photos;
    if (photos.every((photo) => photo.spatial.exifRead.state !== 'pending')) return;
    await tick();
  }
};
// Accepted data: every layer, and every occurrence's position, direction and metadata, by identity.
const accepted = (s) => s.getSnapshot().photoLayers.map((layer) => [layer, ...layer.photoIds.flatMap((id) => {
  const photo = s.getPhoto(id); return [photo.spatial, photo.direction, photo.captureMetadata]; })]);
const assertSame = (s, before, step) => {
  const now = accepted(s);
  assert.equal(now.length, before.length, `${step}: layers`);
  now.forEach((row, index) => { assert.equal(row.length, before[index].length, `${step}: occurrences`);
    row.forEach((value, field) => assert.strictEqual(value, before[index][field], `${step}: value ${field}`)); });
};

test('Koble og posisjoner bilder: every step and cancel leave accepted data unchanged; the save publishes once', async () => {
  for (const cancelAfter of ['source-review', 'include-gml', 'include-gmi', 'positions', 'kontroll', 'none']) {
    const s = session();
    s.importFiles(['a.jpg', 'b.jpg'].map(image)); const layer = s.createLayer(); await settle(s, layer.id);
    const before = accepted(s);
    const ticket = s.beginSourceWorkflow(layer.id);
    const steps = [
      ['source-review', async () => { assert(await s.stageLayerSource(layer.id, gml(['a.jpg', 'b.jpg']))); }],
      ['include-gml', () => { const review = s.getSnapshot().sourceReviews[layer.id];
        assert.equal(s.stageSourceWorkflowSource(ticket, review, { captureTime: { ...EMPTY_GML_CAPTURE_DECISION, plan: s.planLayerSourceCaptureTimes(layer.id) } }).ok, true); }],
      ['include-gmi', async () => { assert(await s.stageLayerSource(layer.id, gmiFile([{ hyperlink: 'h:1(link:"a.jpg") ' }, { hyperlink: 'h:1(link:"a.jpg") ' }]), 'gmi'));
        assert.equal(s.stageSourceWorkflowSource(ticket, s.getSnapshot().sourceReviews[layer.id]).ok, true); }],
      ['positions', () => { assert(s.reviewSourceWorkflowPositions(ticket)); }],
      ['kontroll', () => { assert.equal(s.reviewSourceWorkflowDraft(ticket).ok, true); }],
    ];
    for (const [name, run] of steps) {
      await run();
      assertSame(s, before, name);
      if (name === cancelAfter) break;
    }
    if (cancelAfter !== 'none') {
      s.endSourceWorkflow(ticket);
      assertSame(s, before, `cancel after ${cancelAfter}`);
    } else {
      const plan = s.reviewSourceWorkflowPositions(ticket);
      const requests = plan.rows.flatMap((row) => { const option = row.options.find((item) => item.kind === 'gml');
        return option ? [{ photoId: row.photoId, candidateId: option.id }] : []; });
      let publications = 0; const unsubscribe = s.subscribe(() => publications++);
      const result = s.commitSourceWorkflow(ticket, { plan, requests });
      unsubscribe();
      assert.equal(result.ok, true);
      assert.equal(publications, 1, 'one publication at the final save');
      assert.equal(s.getLayer(layer.id).spatialSources.length, 2);
      assert.equal(result.receipt.placed, requests.length);
    }
    s.clear();
  }
});

test('Legg til bilder: the import draft writes no layer until Opprett; cancel discards it; the commit publishes once', async () => {
  for (const cancel of [true, false]) {
    const s = session();
    s.importFiles([image('x.jpg')]); const existing = s.createLayer(); await settle(s, existing.id);
    const before = accepted(s);
    assert(s.beginImport());
    s.importFiles(['a.jpg', 'b.jpg'].map(image)); await settle(s);
    assertSame(s, before, 'files chosen');
    assert(await s.importPositioningGml(gml(['a.jpg'])));
    assertSame(s, before, 'GML chosen');
    const placement = { kind: 'gml' }, preview = s.previewImport({ placement });
    assertSame(s, before, 'Kontroll');
    if (cancel) { s.cancelImport(); assertSame(s, before, 'cancel'); s.clear(); continue; }
    let publications = 0; const unsubscribe = s.subscribe(() => publications++);
    const result = s.completeImport({ placement, preview });
    unsubscribe();
    assert.equal(result.ok, true);
    assert.equal(publications, 1, 'layer creation and placement are published together');
    assert.equal(s.getSnapshot().photoLayers.length, 2);
    s.clear();
  }
});

test('the integrated batch inspector stages once, only in the final approval path', async () => {
  const source = await readFile(new URL('../src/components/gmi-edit/GmiBatchInspector.js', import.meta.url), 'utf8');
  assert.equal((source.match(/gmiEditSessions\.stage\(/g) || []).length, 1);
  assert.match(source, /if \(!approval && reasons\.length\) \{[\s\S]*?return;\s*\}\s*const result = gmiEditSessions\.stage\(view\.handle, changeSet\)/,
    'staging follows the final review and risk approval');
});

test('the positioning wizard has no intermediate save and the AGENTS.md rule is recorded', async () => {
  const [wizard, agents] = await Promise.all([readFile(new URL('../src/components/photos/PhotoPositioningWizard.js', import.meta.url), 'utf8'),
    readFile(new URL('../AGENTS.md', import.meta.url), 'utf8')]);
  assert.doesNotMatch(wizard, /saveSourceWorkflowSource|applySourceWorkflowPositions|removeGmiSource\(/);
  assert.equal((wizard.match(/photoSession\.commitSourceWorkflow\(/g) || []).length, 1);
  assert.match(agents, /A wizard is one transaction: intermediate steps stage choices in a draft; only the final confirmation writes accepted data, atomically/);
});
