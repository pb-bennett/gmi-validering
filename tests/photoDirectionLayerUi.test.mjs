import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { solidPng } from './helpers/photoImageFixtures.mjs';
import { completionGmlText } from './helpers/photoCompletionFixtures.mjs';
import { createLayerWithoutPlacement, retainGmlInWorkspace } from './helpers/photoImportWizard.mjs';
import { applyPhotoSourcePositions, clickSourceControl } from './helpers/photoSourceWorkflow.mjs';
import { DIRECTION_PANE, KEYS, arrowOf, commandBar, editArrow, editKnob, editTarget, elementCentre, enterEditMode, mouseDrag, pressKey,
  saveEdits, selectPhotoRow, waitForStableEditTarget } from './helpers/photoWorkspace.mjs';

// Direction arrows live in their own Leaflet pane below every photo, so an arrow can never paint over a neighbouring
// photo, also not the arrow of the topmost (selected or edited) photo. Synthetic, non-customer fixture: six solid-colour
// photos 1 m apart, each with its own GML position and heading, so thumbnails overlap and arrows cross neighbours.
const app = process.env.PHOTO_UI_URL;
const tempRoot = path.resolve(tmpdir());
const PHOTOS = [
  // a is just south of b, so Leaflet stacks a above b: in the old layout a's east arrow painted over b.
  { name: 'a.png', east: 0, north: 0, direction: 90, colour: [200, 60, 60] },
  { name: 'b.png', east: 1, north: 0.15, direction: 270, colour: [60, 160, 90] },
  { name: 'c.png', east: 0, north: 1.1, direction: 45, colour: [70, 110, 200] },
  { name: 'd.png', east: 1, north: 1.25, direction: 135, colour: [220, 170, 40] },
  { name: 'e.png', east: 2, north: 0.3, direction: 0, colour: [150, 80, 190] },
  { name: 'f.png', east: 2, north: 1.4, direction: 180, colour: [40, 170, 180] },
];
const headings = Object.fromEntries(PHOTOS.map(({ name, direction }) => [name, String(direction)]));

async function fixture() {
  const directory = await mkdtemp(path.join(tempRoot, 'gmi-photo-arrow-layer-'));
  const photos = [];
  for (const [index, photo] of PHOTOS.entries()) {
    const file = path.join(directory, photo.name);
    await writeFile(file, solidPng(index % 2 ? 900 : 600, index % 2 ? 600 : 900, photo.colour));
    photos.push(file);
  }
  // completionGmlText lays features 20 m apart; move each to its 1 m grid point instead.
  let gmlText = completionGmlText(PHOTOS.map(({ name, direction }) => ({ name, direction: String(direction) })));
  PHOTOS.forEach(({ east, north }, index) => {
    gmlText = gmlText.replace(`${581930 + index * 20} 6566000 0`, `${(581930 + east).toFixed(2)} ${(6566000 + north).toFixed(2)} 0`);
  });
  const gml = path.join(directory, 'arrow-layer.gml');
  await writeFile(gml, gmlText);
  return { photos, gml, cleanup: async () => {
    if (path.dirname(directory) !== tempRoot || !path.basename(directory).startsWith('gmi-photo-arrow-layer-')) throw new Error('Unsafe fixture path');
    await rm(directory, { recursive: true, force: true });
  } };
}

// In-page snapshot of every arrow and every photo icon. Arrow icons have no size, so their rect corner is the anchor.
const LAYERING = `(() => {
  const pane = document.querySelector('${DIRECTION_PANE}');
  // The placement pane exists only in Edit mode.
  const z = (selector) => { const e = document.querySelector(selector); return e ? Number(getComputedStyle(e).zIndex) : null; };
  const centre = (e) => { const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
  const photos = Array.from(document.querySelectorAll('.leaflet-photo-markers-pane .leaflet-marker-icon[data-photo-id], .leaflet-photo-placement-pane .leaflet-marker-icon[data-edit-target]'));
  const arrows = Array.from(pane?.querySelectorAll('.leaflet-marker-icon.photo-direction-marker') || []);
  const perPhoto = photos.map((m) => { const svg = ${arrowOf('m')}; const marker = svg?.closest('.photo-direction-marker'); const a = marker?.getBoundingClientRect(), c = centre(m);
    return { id: m.dataset.photoId, edit: Boolean(m.dataset.editTarget), degrees: svg?.dataset.degrees ?? null, staged: svg?.dataset.staged ?? null,
      mode: marker?.dataset.directionMode ?? null, photoMode: m.dataset.displayMode, anchor: a ? Math.hypot(a.left - c.x, a.top - c.y) : null,
      visible: marker ? getComputedStyle(marker).visibility : null }; });
  return { z: [z('${DIRECTION_PANE}'), z('.leaflet-photo-markers-pane'), z('.leaflet-photo-placement-pane'), z('.leaflet-marker-pane')],
    outside: Array.from(document.querySelectorAll('.photo-direction-indicator')).filter((e) => !e.closest('${DIRECTION_PANE}')).length,
    arrowCount: arrows.length, interactive: arrows.filter((e) => getComputedStyle(e).pointerEvents !== 'none' || e.classList.contains('leaflet-interactive') || e.tabIndex >= 0).length,
    perPhoto };
})()`;

test('FOTO direction arrows: one lower pane under every photo, live in Edit mode, both map modes, cleanup',
  { skip: !chromePath || !app, timeout: 420000 }, async (t) => {
    const files = await fixture(), browser = await openTestChrome();
    const ids = {}, names = {};
    const wait = (ms) => browser.evaluate(`new Promise((resolve) => setTimeout(resolve, ${ms}))`);
    const frames = () => browser.evaluate('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const settle = async () => { await wait(350); await frames(); };
    const screenshot = async (name) => {
      if (!process.env.PHOTO_SCREENSHOT_DIR) return;
      await frames(); await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive: true });
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.PHOTO_SCREENSHOT_DIR, `arrow-layer-${name}.png`), Buffer.from(data, 'base64'));
    };
    const parkMouse = () => browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 3, y: 897, button: 'none', buttons: 0 });
    const marker = (name) => `document.querySelector('.leaflet-photo-markers-pane .leaflet-marker-icon[data-photo-id="${ids[name]}"]')`;
    const layering = () => browser.evaluate(LAYERING);
    const byName = (snapshot) => Object.fromEntries(snapshot.perPhoto.map((entry) => [names[entry.id], entry]));
    // Invariants that hold in every state: arrows only in the lower pane, below photos and the edit target, never
    // interactive, exactly one per photo with a direction, each on its photo's anchor and in its photo's mode.
    const assertLayering = async (label, expected = headings) => {
      const snapshot = await layering();
      const [direction, photos, placement, surveys] = snapshot.z;
      assert(surveys < direction && direction < photos && (placement === null || photos < placement), `${label}: pane order ${snapshot.z}`);
      assert.equal(snapshot.outside, 0, `${label}: no arrow inside a photo icon`);
      assert.equal(snapshot.interactive, 0, `${label}: arrows never take pointer events or focus`);
      assert.equal(snapshot.arrowCount, Object.keys(expected).length, `${label}: one arrow per photo, no orphans or duplicates`);
      const entries = byName(snapshot);
      for (const [name, degrees] of Object.entries(expected)) {
        const entry = entries[name];
        assert(entry, `${label}: ${name} is drawn`);
        assert.equal(entry.degrees, degrees, `${label}: ${name} heading`);
        assert(entry.anchor < 0.6, `${label}: ${name} arrow on its photo's anchor (${entry.anchor})`);
        assert.equal(entry.mode, entry.photoMode, `${label}: ${name} arrow geometry follows its photo's mode`);
      }
      return entries;
    };
    // Pixels: a strip of b's thumbnail that a's east arrow crosses must show only b's photo, never navy or the white casing.
    const assertNeighbourCovers = async (label) => {
      const aMarker = `(${editTarget} || ${marker('a.png')})`;
      const a = await elementCentre(browser, aMarker);
      const selected = await browser.evaluate(`${aMarker}.classList.contains('photo-marker-selected')`);
      const b = await browser.evaluate(`${marker('b.png')}.querySelector('.photo-thumb').getBoundingClientRect().toJSON()`);
      // a's east arrowhead: tip 10 px past a's edge (and its 4 px selection ring). The strip lies just below the axis,
      // inside the head and its white casing but clear of a's ring and of the knob's 1.5 px guide on the axis itself.
      const tip = a.x + 22 + (selected ? 4 : 0) + 10;
      const strip = { x: Math.round(tip - 6), y: Math.round(a.y + 2), width: 5, height: 2 };
      assert(strip.x > a.x + 22 + (selected ? 4 : 0) && strip.x >= b.left + 3 && strip.x + strip.width <= b.right - 3, `${label}: a's arrowhead lies over b (${JSON.stringify({ a, b, strip })})`);
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png', clip: { ...strip, scale: 1 } });
      const pixels = await browser.evaluate(`(async () => { const image = new Image(); image.src = 'data:image/png;base64,${data}'; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d'); context.drawImage(image, 0, 0); return Array.from(context.getImageData(0, 0, image.width, image.height).data); })()`);
      // b's photo is its colour with a 0.55× diagonal band (solidPng), so every pixel lies on that colour segment.
      // Navy, the white casing, or navy at 80 % over b all fall well outside it.
      const light = PHOTOS.find((photo) => photo.name === 'b.png').colour, dark = light.map((value) => value * 0.55);
      const offSegment = (pixel) => {
        const span = light.map((value, i) => value - dark[i]), along = pixel.map((value, i) => value - dark[i]);
        const t = Math.min(1, Math.max(0, along.reduce((sum, value, i) => sum + value * span[i], 0) / span.reduce((sum, value) => sum + value * value, 0)));
        return pixel.reduce((sum, value, i) => sum + Math.abs(value - (dark[i] + t * span[i])), 0);
      };
      assert(pixels.length >= 4 * 10, `${label}: sampled ${pixels.length / 4} pixels`);
      for (let i = 0; i < pixels.length; i += 4) {
        const pixel = pixels.slice(i, i + 3);
        assert(offSegment(pixel) < 30, `${label}: pixel ${i / 4} of the strip over b is not b's photo: ${pixel}`);
      }
    };
    const setMode = async (mode) => {
      await browser.evaluate(`document.querySelector('.photo-map-display-modes [data-mode=${mode}]').click()`);
      await browser.waitFor(`document.querySelectorAll('.leaflet-photo-markers-pane ${mode === 'thumbnails' ? '.photo-thumb-marker' : '.photo-camera-marker'}').length === ${PHOTOS.length}`);
      await settle();
    };
    const setInput = (value) => browser.evaluate(`(() => { const input = ${commandBar}.querySelector('input[type=number]'); input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(String(value))});
      input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const commandButton = (label) => clickSourceControl(browser, label, commandBar);
    const editAnchorDelta = () => browser.evaluate(`(() => { const t = ${editTarget}.getBoundingClientRect(), a = ${editArrow}.closest('.photo-direction-marker').getBoundingClientRect();
      return Math.hypot(a.left - (t.left + t.width / 2), a.top - (t.top + t.height / 2)); })()`);
    try {
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 900, deviceScaleFactor: 1, mobile: false });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
      await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
      await clickSourceControl(browser, 'Bilder', 'document');
      await browser.waitFor('document.querySelector(".photo-collection-dialog[open]")');
      const { root } = await browser.send('DOM.getDocument');
      const { nodeId } = await browser.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[aria-label="Velg bildefiler"]' });
      await browser.send('DOM.setFileInputFiles', { nodeId, files: files.photos });
      await browser.waitFor(`document.querySelectorAll('.photo-collection-card img').length === ${PHOTOS.length}`, 60000);
      await createLayerWithoutPlacement(browser);
      await retainGmlInWorkspace(browser, files.gml);
      await applyPhotoSourcePositions(browser, 'gml');
      await browser.waitFor(`document.querySelectorAll('.leaflet-photo-markers-pane .photo-camera-marker').length === ${PHOTOS.length}`);
      for (const [id, name] of await browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-list li[data-photo-id]')).map((e) => [e.dataset.photoId, e.querySelector('.photo-workspace-filename').innerText])`)) {
        ids[name] = id; names[id] = name;
      }
      // GML headings are adopted as accepted directions, so every photo has an arrow.
      await browser.waitFor(`document.querySelectorAll('${DIRECTION_PANE} .photo-direction-marker').length === ${PHOTOS.length}`, 20000);
      await selectPhotoRow(browser, ids['a.png']);
      await browser.evaluate(`document.querySelector('.photo-workspace-inspector .photo-inspector-locate').click()`);
      await settle();
      // Zoom until a and b are about 1 m = 24+ px apart: their 44 px thumbnails overlap and a's arrow crosses b.
      for (let i = 0; i < 6; i++) {
        const dx = await browser.evaluate(`${marker('b.png')}.getBoundingClientRect().left - ${marker('a.png')}.getBoundingClientRect().left`);
        if (dx >= 24) break;
        await browser.evaluate('document.querySelector(".leaflet-control-zoom-in").click()'); await settle();
      }
      await parkMouse();

      await t.test('ordinary viewing: every arrow below every photo, in both map modes and at 0°…315° headings', async () => {
        await setMode('markers');
        await assertLayering('markers');
        await screenshot('01-markers-cluster');
        await setMode('thumbnails');
        const entries = await assertLayering('thumbnails');
        assert.equal(entries['a.png'].photoMode, 'thumbnails');
        // a is selected, and Leaflet stacks it above b; its arrow still goes under b.
        assert.equal(await browser.evaluate(`${marker('a.png')}.classList.contains('photo-marker-selected')`), true);
        await assertNeighbourCovers('selected a over b');
        await screenshot('02-thumbnails-cluster-selected');
        // Control: with the arrow pane lifted above the photos (the old in-icon behaviour), the same check sees a's arrow.
        await browser.evaluate(`document.querySelector('${DIRECTION_PANE}').style.zIndex = '630'`); await frames();
        await screenshot('02b-control-arrows-above');
        await assert.rejects(() => assertNeighbourCovers('control'), /is not b's photo/, 'the pixel check detects an arrow over b');
        await browser.evaluate(`document.querySelector('${DIRECTION_PANE}').style.zIndex = '615'`); await frames();
        // Zooming keeps arrows on their anchors and the panes in order.
        await browser.evaluate('document.querySelector(".leaflet-control-zoom-in").click()'); await settle();
        await assertLayering('thumbnails after zoom in');
        await browser.evaluate('document.querySelector(".leaflet-control-zoom-out").click()'); await settle();
        await assertLayering('thumbnails after zoom out');
        await assertNeighbourCovers('after zoom');
        // Hovering a thumbnail brings it to the front; arrows stay below.
        const hovered = await elementCentre(browser, marker('b.png'));
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hovered.x, y: hovered.y + 12, button: 'none', buttons: 0 });
        await wait(100);
        assert.equal(await browser.evaluate(`document.elementFromPoint(${hovered.x}, ${hovered.y + 12})?.closest('.leaflet-marker-icon')?.dataset.photoId`), ids['b.png'], 'hit testing reaches the photo, never an arrow');
        await parkMouse(); await browser.waitFor('!document.querySelector(".photo-thumb-preview")');
      });

      await t.test('Edit mode: the edit target arrow stays in the lower pane and follows drag, Escape, knob and numeric changes live', async () => {
        await enterEditMode(browser);
        await browser.waitFor(editTarget);
        await waitForStableEditTarget(browser);
        let entries = await assertLayering('edit mode entered');
        assert.equal(entries['a.png'].edit, true, 'a is drawn by the edit layer');
        assert.equal(await browser.evaluate(`document.querySelectorAll('${DIRECTION_PANE} [data-direction-edit-target]').length`), 1);
        assert.equal(await browser.evaluate(`${marker('a.png')}`), null, 'no second, ordinary a marker');
        await assertNeighbourCovers('edit target a over b');
        await screenshot('03-edit-target-cluster');

        // Mid-drag: the arrow is where the photo is, not where it was.
        const from = await elementCentre(browser, editTarget);
        await mouseDrag(browser, from, { x: from.x + 70, y: from.y + 50 }, { release: false });
        await frames();
        assert(await editAnchorDelta() < 1, 'arrow follows the dragged photo');
        assert.equal(await browser.evaluate(`document.querySelectorAll('${DIRECTION_PANE} .photo-direction-marker').length`), PHOTOS.length, 'never two arrows for one photo');
        await screenshot('04-edit-dragging');
        // Escape cancels the drag: photo and arrow both go back.
        await pressKey(browser, 'Escape', KEYS.Escape);
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: from.x + 70, y: from.y + 50, button: 'left', buttons: 0, clickCount: 1 });
        await settle();
        const back = await elementCentre(browser, editTarget);
        assert(Math.hypot(back.x - from.x, back.y - from.y) < 1, 'Escape restores the photo');
        assert(await editAnchorDelta() < 1, 'and its arrow');

        // A real drag stages the move; the arrow ends on the new position.
        await mouseDrag(browser, from, { x: from.x + 70, y: from.y + 50 });
        await browser.waitFor(`Number(document.querySelector('[data-edit-count]')?.innerText.match(/\\d+/)?.[0] || 0) === 1`);
        await settle();
        assert(await editAnchorDelta() < 1, 'arrow at the staged position');
        entries = await assertLayering('after staged move');
        assert.equal(entries['a.png'].staged, 'false', 'moving does not stage the direction');

        // Knob: while rotating only the knob's live arrow shows; on release the photo arrow has the new heading, dashed.
        const anchor = await elementCentre(browser, editTarget), knob = await elementCentre(browser, editKnob);
        const target = { x: anchor.x + 70 * Math.sin(Math.PI * 200 / 180), y: anchor.y - 70 * Math.cos(Math.PI * 200 / 180) };
        await mouseDrag(browser, knob, target, { release: false });
        await frames();
        assert.equal(await browser.evaluate(`getComputedStyle(${editArrow}.closest('.photo-direction-marker')).visibility`), 'hidden', 'one arrow while rotating');
        assert.equal(await browser.evaluate(`Boolean(document.querySelector('.photo-edit-knob-rotating .photo-edit-knob-head')?.getAttribute('d'))`), true);
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: target.x, y: target.y, button: 'left', buttons: 0, clickCount: 1 });
        await browser.waitFor(`${editArrow}?.dataset.staged === 'true' && getComputedStyle(${editArrow}.closest('.photo-direction-marker')).visibility === 'visible'`);
        const rotated = await browser.evaluate(`${editArrow}.dataset.degrees`);
        assert(Math.abs(Number(rotated) - 200) <= 2, `knob heading ${rotated}`);

        // Numeric entry.
        await setInput(225); await pressKey(browser, 'Enter', KEYS.Enter);
        await browser.waitFor(`${editArrow}?.dataset.degrees === '225'`);
        await assertLayering('numeric 225', { ...headings, 'a.png': '225' });
        await screenshot('05-edit-staged-direction');

        // Undo / redo walk the arrow back and forth through direction and position.
        await commandButton('Angre');
        await browser.waitFor(`${editArrow}?.dataset.degrees === ${JSON.stringify(rotated)}`);
        await commandButton('Angre');
        await browser.waitFor(`${editArrow}?.dataset.degrees === '90' && ${editArrow}?.dataset.staged === 'false'`);
        await commandButton('Angre');
        await settle();
        const undone = await elementCentre(browser, editTarget);
        assert(Math.hypot(undone.x - from.x, undone.y - from.y) < 1.5, 'position undone');
        assert(await editAnchorDelta() < 1, 'arrow back with the photo');
        await commandButton('Gjør om'); await settle();
        assert(await editAnchorDelta() < 1, 'redo: arrow moved again with the photo');
        await commandButton('Gjør om');
        await browser.waitFor(`${editArrow}?.dataset.degrees === ${JSON.stringify(rotated)}`);
        await commandButton('Gjør om');
        await browser.waitFor(`${editArrow}?.dataset.degrees === '225'`);
        await assertLayering('after redo', { ...headings, 'a.png': '225' });

        // Leaving with unsaved changes, then «Fortsett redigering»: nothing changes, still one arrow.
        await clickSourceControl(browser, 'Tilbake til appen', 'document');
        await browser.waitFor('document.querySelector(".photo-edit-boundary[open]")');
        await clickSourceControl(browser, 'Fortsett redigering', 'document.querySelector(".photo-edit-boundary")');
        await browser.waitFor('!document.querySelector(".photo-edit-boundary[open]")');
        assert.equal(await browser.evaluate(`${editArrow}.dataset.degrees`), '225');
        assert(await editAnchorDelta() < 1);
        await assertLayering('continue editing', { ...headings, 'a.png': '225' });
      });

      await t.test('Discard and Save: the arrow ends where the photo ends, as an ordinary arrow', async () => {
        const staged = await elementCentre(browser, editTarget);
        await clickSourceControl(browser, 'Forkast endringer', commandBar);
        await browser.waitFor('document.querySelector(".photo-edit-boundary[open]")');
        await clickSourceControl(browser, 'Forkast', 'document.querySelector(".photo-edit-boundary")');
        await browser.waitFor(`!${commandBar}`);
        await settle();
        let entries = await assertLayering('discarded');
        assert.equal(entries['a.png'].edit, false);
        assert.equal(entries['a.png'].staged, 'false');
        await assertNeighbourCovers('discarded');

        await enterEditMode(browser);
        await browser.waitFor(editTarget); await waitForStableEditTarget(browser);
        const from = await elementCentre(browser, editTarget);
        await mouseDrag(browser, from, { x: staged.x, y: staged.y });
        await browser.waitFor(`Number(document.querySelector('[data-edit-count]')?.innerText.match(/\\d+/)?.[0] || 0) === 1`);
        await setInput(300); await pressKey(browser, 'Enter', KEYS.Enter);
        await browser.waitFor(`${editArrow}?.dataset.degrees === '300'`);
        await saveEdits(browser);
        await settle();
        entries = await assertLayering('saved', { ...headings, 'a.png': '300' });
        assert.equal(entries['a.png'].edit, false);
        assert.equal(entries['a.png'].staged, 'false', 'saved direction is solid');
        const saved = await elementCentre(browser, marker('a.png'));
        assert(Math.hypot(saved.x - staged.x, saved.y - staged.y) < 2, 'saved where it was dragged');
        await screenshot('06-saved');
        // Back to markers mode after editing: geometry switches with the photo.
        await setMode('markers');
        await assertLayering('markers after save', { ...headings, 'a.png': '300' });
        await setMode('thumbnails');
      });

      await t.test('main map and layer removal: arrows follow the layer and leave nothing behind', async () => {
        const layerName = await browser.evaluate('document.querySelector(".photo-workspace-collection h1").textContent');
        await clickSourceControl(browser, 'Tilbake til appen', 'document');
        await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
        await browser.waitFor(`document.querySelectorAll('${DIRECTION_PANE} .photo-direction-marker').length === ${PHOTOS.length}`);
        await assertLayering('main map', { ...headings, 'a.png': '300' });
        await browser.evaluate(`Array.from(document.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === ${JSON.stringify('Fjern fotokartlag ')} + ${JSON.stringify(layerName)}).click()`);
        await browser.evaluate(`Array.from(document.querySelectorAll('section[aria-label^="Fotokartlag"] button')).find((b) => b.textContent === 'Fjern').click()`);
        await browser.waitFor(`document.querySelectorAll('.leaflet-photo-markers-pane .leaflet-marker-icon').length === 0`);
        assert.equal(await browser.evaluate(`document.querySelectorAll('${DIRECTION_PANE} .leaflet-marker-icon, .photo-direction-indicator').length`), 0, 'no orphan arrows');
      });

      assert.deepEqual(browser.events.filter((event) => event.method === 'Runtime.exceptionThrown').map((event) => event.params.exceptionDetails.text), []);
    } catch (error) {
      console.error(await browser.evaluate('document.body.innerText.slice(0, 3000)').catch(() => ''));
      throw error;
    } finally {
      await browser.close();
      await files.cleanup();
    }
  });
