import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { gmiText } from './helpers/gmiPhotoFixtures.mjs';
import { solidPng } from './helpers/photoImageFixtures.mjs';
import { gpsPng } from './helpers/photoGpsFixtures.mjs';
import { applyPhotoSourcePositions, closePhotoSources, savePhotoSource, setPhotoFiles, stagePhotoSource } from './helpers/photoSourceWorkflow.mjs';
import { chooseImportPlacement, createLayerWithPlacement, importDialog, waitForThumbnails } from './helpers/photoImportWizard.mjs';
import { KEYS, clickText, commandBar, discardEdits, editTarget, elementCentre, enterEditMode, mouseDrag, pressKey, saveEdits, selectPhotoRow, waitForStableEditTarget } from './helpers/photoWorkspace.mjs';

// Pass 1B acceptance: six photos referenced by one GMI object share exactly one position, plus one photo
// used by two other objects. Synthetic, non-customer fixtures with real portrait/landscape dimensions.
const app = process.env.PHOTO_UI_URL;
const CTRL = 2;
const tile = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#f0eee3"/></svg>');
const STACK = ['stack-1.png', 'stack-2.png', 'stack-3.png', 'stack-4.png', 'stack-5.png', 'stack-6.png'];
const inspector = 'document.querySelector(".photo-workspace-inspector")';
const viewer = 'document.querySelector(".photo-image-viewer[open]")';
const row = (id) => `document.querySelector('.photo-workspace-list li[data-photo-id="${id}"]')`;
const editCount = () => `Number(document.querySelector('[data-edit-count]')?.innerText.match(/\\d+/)?.[0] || 0)`;

async function createFixtures() {
  const root = path.resolve(tmpdir()), prefix = 'photo-pass1b-', directory = await mkdtemp(path.join(root, prefix));
  const files = [];
  const metadata = gpsPng();
  const exifChunk = metadata.subarray(33, 33 + 12 + metadata.readUInt32BE(33));
  for (const [index, name] of STACK.entries()) {
    const portrait = index % 2 === 0;
    const file = path.join(directory, name);
    const image = solidPng(portrait ? 600 : 900, portrait ? 900 : 600, [60 + index * 30, 120, 200 - index * 20]);
    await writeFile(file, Buffer.concat([image.subarray(0, 33), exifChunk, image.subarray(33)]));
    files.push(file);
  }
  const solo = path.join(directory, 'solo.png');
  await writeFile(solo, solidPng(1200, 800, [200, 150, 60]));
  files.push(solo);
  const gmi = path.join(directory, 'stack.gmi');
  await writeFile(gmi, gmiText([
    { label: 'K0', hyperlink: STACK.map((name, index) => `h:${index + 1}(link:"${name}")`).join(' ') + ' ', xyz: '581930 6566000 1' },
    { label: 'K1', hyperlink: 'h:1(link:"solo.png") ', xyz: '581990 6566000 1' },
    { label: 'K2', hyperlink: 'h:1(link:"solo.png") ', xyz: '581930 6566060 1' },
  ]));
  const gml = path.join(directory, 'stack-positions.gml');
  await writeFile(gml, '<gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:app="http://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101"><gml:boundedBy><gml:Envelope srsName="EPSG:5972"/></gml:boundedBy>'
    + STACK.map((name, i) => `<gml:featureMember><app:Skråfoto gml:id="p${i}"><app:fotolink>${name}</app:fotolink><app:fotograferingspunkt><gml:Point srsDimension="3"><gml:pos>581950 6566020 0</gml:pos></gml:Point></app:fotograferingspunkt></app:Skråfoto></gml:featureMember>`).join('') + '</gml:FeatureCollection>');
  return { files, gmi, gml, cleanup: async () => {
    if (path.dirname(path.resolve(directory)) !== root || !path.basename(directory).startsWith(prefix)) throw new Error('Unsafe fixture path');
    await rm(directory, { recursive: true, force: true });
  } };
}

test('Pass 1B: stacked photos in Edit mode, photo-first inspector, full-screen navigation, main-map thumbnails and new import entry',
  { skip: !chromePath || !app, timeout: 420000 }, async (t) => {
    const fixtures = await createFixtures();
    const browser = await openTestChrome();
    const wait = (ms) => browser.evaluate(`new Promise(resolve => setTimeout(resolve, ${ms}))`);
    const exceptions = () => browser.events.filter((event) => event.method === 'Runtime.exceptionThrown');
    const screenshot = async (name) => {
      if (!process.env.PHOTO_SCREENSHOT_DIR) return;
      await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive: true });
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.PHOTO_SCREENSHOT_DIR, `pass1b-${name}.png`), Buffer.from(data, 'base64'));
    };
    const setViewport = async (width, height) => { await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await wait(500); };
    const hover = async (expression) => { const point = await elementCentre(browser, expression); await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, button: 'none', buttons: 0 }); };
    const unhover = () => browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 3, y: 3, button: 'none', buttons: 0 });
    const click = async ({ x, y }) => {
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
      await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    };
    const hitAt = (point) => browser.evaluate(`document.elementFromPoint(${point.x}, ${point.y})?.closest('.leaflet-marker-icon')?.dataset.photoId || null`);
    const activeId = () => browser.evaluate(`document.querySelector('.photo-workspace-row[aria-pressed=true]')?.closest('li').dataset.photoId || null`);
    const markerPositions = () => browser.evaluate(`Object.fromEntries(Array.from(document.querySelectorAll('.leaflet-marker-icon[data-photo-id]')).map((e) => [e.dataset.photoId, e.dataset.lat ? e.dataset.lat + ',' + e.dataset.lng : 'edit']))`);
    const ids = {};
    try {
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `const imageSrc=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
        Object.defineProperty(HTMLImageElement.prototype,'src',{...imageSrc,set(value){imageSrc.set.call(this,String(value).includes('cache.kartverket.no/')||String(value).includes('geonorge.no/')?${JSON.stringify(tile)}:value);}});` });
      await setViewport(1920, 1080);
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
      await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
      await browser.evaluate(`Array.from(document.querySelectorAll('button')).find((item) => item.innerText.trim() === 'Bilder').click()`);
      await browser.waitFor(importDialog);
      await setPhotoFiles(browser, 'input[aria-label="Velg bildefiler"]', fixtures.files);
      await waitForThumbnails(browser);
      await browser.waitFor(`${importDialog}.dataset.exifPending === "0"`, 60000);
      await chooseImportPlacement(browser, 'gmi');
      await setPhotoFiles(browser, 'input[aria-label="Velg GMI-fil"]', [fixtures.gmi]);
      await browser.waitFor(`${importDialog}.innerText.includes('stack.gmi')`);
      await createLayerWithPlacement(browser, 'gmi-layer');
      await browser.waitFor('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length === 8');
      for (const [id, name, context] of await browser.evaluate('Array.from(document.querySelectorAll(".photo-workspace-list li[data-photo-id]")).map((e) => [e.dataset.photoId, e.querySelector(".photo-workspace-filename").innerText, e.querySelector(".photo-workspace-context")?.innerText || ""])')) {
        ids[name === 'solo.png' ? `solo${context.endsWith('1/2') ? 1 : 2}` : name] = id;
      }
      assert.deepEqual(Object.keys(ids).sort(), [...STACK, 'solo1', 'solo2'].sort());

      await t.test('counts: unique assets and placements; wider left pane without overflow', async () => {
        assert.match(await browser.evaluate('document.querySelector(".photo-workspace-counts").innerText'), /^7 bilder · 8 plasseringer$/);
        for (const [width, height, min, max] of [[1920, 1080, 316, 316], [1366, 768, 310, 316], [1280, 720, 292, 300]]) {
          await setViewport(width, height);
          const layout = await browser.evaluate(`({ left: Math.round(document.querySelector('.workspace-left').getBoundingClientRect().width),
            map: Math.round(document.querySelector('.leaflet-container').getBoundingClientRect().width), scroll: document.documentElement.scrollWidth > innerWidth,
            wrapped: document.querySelector('.photo-workspace-title-row').getBoundingClientRect().height > 40 })`);
          assert(layout.left >= min && layout.left <= max && layout.map >= 520 && !layout.scroll && !layout.wrapped, `${width}: ${JSON.stringify(layout)}`);
        }
        await setViewport(1920, 1080);
      });

      await t.test('inspector: portrait and landscape previews are large and uncropped; details stay available', async () => {
        for (const [width, height, minPortrait] of [[1920, 1080, 600], [1280, 720, 400]]) {
          await setViewport(width, height);
          await selectPhotoRow(browser, ids['stack-1.png']);
          await browser.waitFor(`${inspector}.querySelector('.photo-inspector-preview[data-orientation=portrait] img')?.complete`);
          const portrait = await browser.evaluate(`(() => { const box = ${inspector}.querySelector('.photo-inspector-preview').getBoundingClientRect(), img = ${inspector}.querySelector('.photo-inspector-preview img');
            return { w: Math.round(box.width), h: Math.round(box.height), fit: getComputedStyle(img).objectFit, bottom: box.bottom, vh: innerHeight }; })()`);
          assert(portrait.h >= minPortrait && portrait.h > portrait.w && portrait.fit === 'contain' && portrait.bottom <= portrait.vh + 1, `${width} portrait ${JSON.stringify(portrait)}`);
          await selectPhotoRow(browser, ids['stack-2.png']);
          await browser.waitFor(`${inspector}.querySelector('.photo-inspector-preview[data-orientation=landscape]')`);
          const landscape = await browser.evaluate(`(() => { const box = ${inspector}.querySelector('.photo-inspector-preview').getBoundingClientRect(); return { w: Math.round(box.width), h: Math.round(box.height) }; })()`);
          assert(landscape.w > landscape.h && Math.abs(landscape.h - landscape.w * 2 / 3) < 3, `${width} landscape ${JSON.stringify(landscape)}`);
          await screenshot(`inspector-${width}`);
        }
        await setViewport(1920, 1080);
        // Default view: photo, chips, coordinates, concise capture data. Associations and file details are collapsed but retained.
        const text = await browser.evaluate(`${inspector}.innerText`);
        assert.match(text, /Plassert · GMI/); assert.match(text, /Koordinater/); assert.match(text, /Opptakstid\s+Ikke angitt/);
        assert.doesNotMatch(text, /Status\s+Plassert/, 'status is not repeated next to the chip');
        assert.doesNotMatch(text, /MIME\/type/);
        assert(await browser.evaluate(`${inspector}.textContent.includes('MIME/type') && ${inspector}.textContent.includes('GUID')`), 'file details and identifiers are kept');
        assert.match(await browser.evaluate(`${inspector}.querySelector('section[aria-label=Fil] summary').innerText`), /900 × 600 px/);
      });

      await t.test('Pass 1C: disclosure scrollbars never change preview geometry, portrait or landscape', async () => {
        for (const name of ['stack-1.png', 'stack-2.png']) {
          await selectPhotoRow(browser, ids[name]);
          let transitions = 0;
          for (const height of [1200, 1080, 900, 768, 720]) {
            await setViewport(1366, height);
            const measure = () => browser.evaluate(`(() => { const e = ${inspector}, r = e.querySelector('.photo-inspector-preview').getBoundingClientRect();
              return { x:r.x, width:r.width, height:r.height, overflow:e.scrollHeight > e.clientHeight, gutter:getComputedStyle(e).scrollbarGutter, fit:getComputedStyle(e.querySelector('img')).objectFit }; })()`);
            await browser.evaluate(`${inspector}.querySelectorAll('details').forEach(e => e.open = false)`); await wait(80);
            const before = await measure();
            await browser.evaluate(`${inspector}.querySelectorAll('details').forEach(e => e.open = true)`); await wait(80);
            const after = await measure();
            assert.equal(after.gutter, 'stable'); assert.equal(after.fit, 'contain');
            for (const key of ['x', 'width', 'height']) assert.equal(after[key], before[key], `${name} ${height}: stable ${key}`);
            if (!before.overflow && after.overflow) transitions++;
            await browser.evaluate(`${inspector}.querySelectorAll('details').forEach(e => e.open = false); ${inspector}.scrollTop = 0`);
          }
          assert(transitions > 0, `${name}: exercised fitting-to-overflowing content`);
        }
        await setViewport(1920, 1080);
      });

      await t.test('Pass 1C: command groups fit laptop/narrow maps; controls and selected photo stay reachable', async () => {
        await selectPhotoRow(browser, ids['stack-4.png']);
        await enterEditMode(browser);
        await clickText(browser, 'Flytt til kartsenter', commandBar);
        await browser.waitFor(`${editCount()} === 1`);
        for (const [width, height] of [[1920,1080], [1366,768], [1280,720], [1024,620]]) {
          await setViewport(width, height);
          // Re-select requests the existing overlay-aware pan using the resized command bar.
          await selectPhotoRow(browser, ids['stack-2.png']);
          await selectPhotoRow(browser, ids['stack-4.png']);
          await waitForStableEditTarget(browser);
          const layout = await browser.evaluate(`(() => { const bar = ${commandBar}, b = bar.getBoundingClientRect(), map = document.querySelector('.leaflet-container').getBoundingClientRect();
            const controls = Array.from(bar.querySelectorAll('button,input'));
            return { width:b.width, height:b.height, inside:b.left>=map.left && b.right<=map.right && b.top>=map.top && b.bottom<=map.bottom,
              overflow:bar.scrollWidth > bar.clientWidth, groups:bar.querySelectorAll('[role=group]').length,
              reachable:controls.every(e => { const r=e.getBoundingClientRect(); return r.left>=b.left && r.right<=b.right && r.top>=b.top && r.bottom<=b.bottom && e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); }) }; })()`);
          assert(layout.inside && !layout.overflow && layout.reachable && layout.groups === 3 && layout.height <= 220, `${width}: ${JSON.stringify(layout)}`);
          const selected = await elementCentre(browser, editTarget);
          assert.equal(await hitAt(selected), ids['stack-4.png'], 'selected photo stays clear of overlays');
          await screenshot(`pass1c-command-${width}`);
        }
        await clickText(browser, 'Angre', commandBar); await browser.waitFor(`${editCount()} === 0`);
        await clickText(browser, 'Gjør om', commandBar); await browser.waitFor(`${editCount()} === 1`);
        await discardEdits(browser);
        await setViewport(1920,1080);
      });

      await t.test('Edit mode: each of six stacked occurrences is selectable from the list, on top and draggable', async () => {
        await enterEditMode(browser);
        for (const name of STACK) {
          await selectPhotoRow(browser, ids[name]);
          await browser.waitFor(`${editTarget}?.dataset.photoId === ${JSON.stringify(ids[name])}`);
          const centre = await elementCentre(browser, editTarget);
          assert.equal(await hitAt(centre), ids[name], `${name} is on top at its own position`);
          assert.equal(await browser.evaluate(`${editTarget}.dataset.stackCount`), '6');
          assert.equal(await browser.evaluate(`${editTarget}.querySelector('.photo-marker-stack')?.innerText`), '6', 'the selected occurrence carries the stack badge');
          assert.equal(await browser.evaluate('document.querySelectorAll(".leaflet-photo-markers-pane .photo-marker-stack").length'), 0, 'no second, smaller badge underneath');
        }
        assert.match(await browser.evaluate(`${commandBar}.innerText`), /6 bilder på samme sted/);
        // Forgiving grab target: 20 px from the centre is outside the 30 px icon but inside the transparent ring.
        await selectPhotoRow(browser, ids['stack-4.png']);
        await browser.waitFor(`${editTarget}?.dataset.photoId === ${JSON.stringify(ids['stack-4.png'])}`);
        const before = await markerPositions();
        const centre = await elementCentre(browser, editTarget);
        const edge = { x: centre.x + 20, y: centre.y };
        assert.equal(await hitAt(edge), ids['stack-4.png']);
        await mouseDrag(browser, edge, { x: edge.x + 70, y: edge.y + 40 });
        await browser.waitFor(`${editCount()} === 1`);
        const after = await markerPositions();
        for (const name of STACK.filter((item) => item !== 'stack-4.png')) assert.equal(after[ids[name]], before[ids[name]], `${name} did not move`);
        assert.equal(await browser.evaluate(`${editTarget}.dataset.stackCount`), '1', 'the moved photo left the stack');
        assert.equal(await browser.evaluate('document.querySelector(".leaflet-photo-markers-pane .photo-marker-stack")?.innerText'), '5');
        await pressKey(browser, 'z', { code: 'KeyZ', keyCode: 90, modifiers: CTRL });
        await browser.waitFor(`${editCount()} === 0`);
        assert.equal(exceptions().length, 0);
      });

      await t.test('Edit mode: a plain click on the stacked selection cycles through all six; it never moves', async () => {
        await wait(300); // the click that ends a drag never cycles; a later, separate click does
        const seen = new Set();
        for (let i = 0; i < 6; i++) {
          seen.add(await activeId());
          await click(await elementCentre(browser, editTarget));
          await wait(120);
        }
        assert.equal(seen.size, 6);
        assert.equal(await activeId(), ids['stack-4.png'], 'six clicks return to the first occurrence');
        assert.equal(await browser.evaluate(editCount()), 0);
      });

      await t.test('Edit mode: «Flytt med klikk» moves through other markers; Escape leaves the mode only', async () => {
        await selectPhotoRow(browser, ids['stack-3.png']);
        await clickText(browser, 'Flytt med klikk', commandBar);
        await browser.waitFor('document.querySelector(".leaflet-container").classList.contains("photo-edit-click-move")');
        await pressKey(browser, 'Escape', KEYS.Escape);
        await browser.waitFor('!document.querySelector(".leaflet-container").classList.contains("photo-edit-click-move")');
        assert.equal(await browser.evaluate('Boolean(document.querySelector(".photo-edit-boundary[open]"))'), false);
        assert.equal(await browser.evaluate(editCount()), 0);
        await clickText(browser, 'Flytt med klikk', commandBar);
        assert.equal(await browser.evaluate(`Array.from(${commandBar}.querySelectorAll('button')).find((b) => b.innerText.includes('Flytt med klikk')).getAttribute('aria-pressed')`), 'true');
        // Target the solo photo's marker: the click goes through it to the map instead of selecting it.
        const solo = await elementCentre(browser, `document.querySelector('.leaflet-photo-markers-pane [data-photo-id="${ids.solo1}"]')`);
        await click(solo);
        await browser.waitFor(`${editCount()} === 1`);
        assert.equal(await activeId(), ids['stack-3.png'], 'the other marker did not take the selection');
        const moved = await elementCentre(browser, editTarget);
        assert(Math.abs(moved.x - solo.x) < 2 && Math.abs(moved.y - solo.y) < 2, JSON.stringify({ moved, solo }));
        assert.equal(await browser.evaluate('document.querySelector(".leaflet-container").classList.contains("photo-edit-click-move")'), false, 'one placement per activation');
        await discardEdits(browser);
      });

      await t.test('Edit mode in Miniatyrer: stacked thumbnails keep the same selection, hit target and drag', async () => {
        await browser.evaluate('document.querySelector(".photo-map-display-card [data-mode=thumbnails]").click()');
        for (let i = 0; i < 4 && await browser.evaluate('!document.querySelector(".photo-thumb-marker")'); i++) {
          await browser.evaluate('document.querySelector(".leaflet-control-zoom-in").click()'); await wait(400);
        }
        await browser.waitFor('document.querySelectorAll(".photo-thumb-marker").length === 8');
        await enterEditMode(browser);
        await selectPhotoRow(browser, ids['stack-5.png']);
        await browser.waitFor(`${editTarget}?.dataset.photoId === ${JSON.stringify(ids['stack-5.png'])} && ${editTarget}.dataset.displayMode === 'thumbnails'`);
        const centre = await elementCentre(browser, editTarget);
        const edge = { x: centre.x + 26, y: centre.y };
        assert.equal(await hitAt(centre), ids['stack-5.png']);
        assert.equal(await hitAt(edge), ids['stack-5.png'], 'thumbnail ring widens the grab target');
        await mouseDrag(browser, edge, { x: edge.x + 60, y: edge.y - 50 });
        await browser.waitFor(`${editCount()} === 1`);
        await screenshot('edit-thumbnails');
        await discardEdits(browser);
        assert.equal(exceptions().length, 0);
      });

      await t.test('full-screen viewer: unique-asset navigation, reset zoom, same-location gallery, icon tooltips', async () => {
        await selectPhotoRow(browser, ids['stack-2.png']);
        await browser.evaluate(`${inspector}.querySelector('.photo-preview-open').click()`);
        await browser.waitFor(viewer);
        const position = () => browser.evaluate(`${viewer}.querySelector('.photo-image-viewer-position').innerText`);
        const title = () => browser.evaluate(`${viewer}.querySelector('h2').innerText`);
        assert.equal(await position(), '3 av 7 bilder');
        assert.deepEqual(await browser.evaluate(`Array.from(${viewer}.querySelectorAll('.photo-image-viewer-controls .photo-icon-button')).map((b) => b.getAttribute('aria-label'))`),
          ['Zoom ut', 'Zoom inn', 'Tilpass skjermen', 'Faktisk størrelse (100 %)', 'Bilder på samme sted (6)']);
        assert.equal(await browser.evaluate(`Array.from(${viewer}.querySelectorAll('*')).some((e) => !e.closest('.sr-only') && e.childElementCount === 0 && e.textContent.includes('Rull for å zoome'))`), false, 'no permanently visible instructions; the help is only an accessible description');
        await hover(`${viewer}.querySelector('[aria-label="Zoom inn"]')`);
        await browser.waitFor('document.querySelector(".photo-icon-tooltip")');
        assert.equal(await browser.evaluate('document.querySelector(".photo-icon-tooltip").textContent'), 'Zoom inn');
        await unhover();
        const fit = await browser.evaluate(`${viewer}.querySelector('output').innerText`);
        await browser.evaluate(`${viewer}.querySelector('[aria-label="Zoom inn"]').click()`);
        await browser.waitFor(`${viewer}.querySelector('output').innerText !== ${JSON.stringify(fit)}`);
        await browser.evaluate(`${viewer}.querySelector('.photo-image-viewer-close').focus()`);
        await pressKey(browser, 'ArrowRight', KEYS.ArrowRight);
        await browser.waitFor(`${viewer}.querySelector('h2').innerText === 'stack-3.png'`);
        assert.equal(await position(), '4 av 7 bilder');
        assert.equal(await browser.evaluate(`${viewer}.querySelector('[aria-label="Zoom ut"]').getAttribute('aria-disabled')`), 'true', 'a new photo starts at fit');
        assert.equal(await activeId(), ids['stack-3.png'], 'selection and inspector follow the viewer');
        await browser.evaluate(`${viewer}.querySelector('[aria-label="Forrige bilde"]').click()`);
        await browser.waitFor(`${viewer}.querySelector('h2').innerText === 'stack-2.png'`);
        for (let i = 0; i < 4; i++) await pressKey(browser, 'ArrowLeft', KEYS.ArrowLeft);
        await browser.waitFor(`${viewer}.querySelector('.photo-image-viewer-position').innerText === '1 av 7 bilder'`);
        assert.equal(await browser.evaluate(`${viewer}.querySelector('[aria-label="Forrige bilde"]').getAttribute('aria-disabled')`), 'true', 'no wrapping at the start');
        const names = [await title()];
        for (let i = 0; i < 7; i++) { await pressKey(browser, 'ArrowRight', KEYS.ArrowRight); await wait(80); names.push(await title()); }
        assert.deepEqual([...new Set(names)], ['solo.png', ...STACK], 'every unique asset once; the repeated solo.png is not shown twice');
        assert.equal(await position(), '7 av 7 bilder');
        assert.equal(await browser.evaluate(`${viewer}.querySelector('[aria-label="Neste bilde"]').getAttribute('aria-disabled')`), 'true');
        // Same-location gallery: only the six co-located photos, separate from the layer-wide arrows.
        await browser.evaluate(`${viewer}.querySelector('.photo-image-viewer-stack').click()`);
        await browser.waitFor(`${viewer}.querySelector('.photo-image-viewer-gallery')`);
        assert.deepEqual(await browser.evaluate(`Array.from(${viewer}.querySelectorAll('.photo-image-viewer-thumb')).map((b) => [b.querySelector('.photo-image-viewer-thumb-name').innerText, b.getAttribute('aria-pressed')])`),
          STACK.map((name) => [name, String(name === 'stack-6.png')]));
        await browser.evaluate(`${viewer}.querySelector('.photo-image-viewer-thumb[data-photo-id="${ids['stack-4.png']}"]').click()`);
        await browser.waitFor(`${viewer}.querySelector('h2').innerText === 'stack-4.png'`);
        assert.equal(await activeId(), ids['stack-4.png']);
        await browser.evaluate(`${viewer}.querySelector('.photo-image-viewer-thumb').focus()`);
        await pressKey(browser, 'ArrowRight', KEYS.ArrowRight);
        assert.equal(await browser.evaluate('document.activeElement.dataset.photoId'), ids['stack-2.png'], 'arrows inside the gallery move between thumbnails');
        assert.equal(await title(), 'stack-4.png', 'and never trigger layer-wide navigation');
        await screenshot('viewer-gallery');
        await browser.evaluate(`${viewer}.querySelector('.photo-image-viewer-close').focus()`);
        for (let i = 0; i < 4; i++) await pressKey(browser, 'ArrowLeft', KEYS.ArrowLeft);
        await browser.waitFor(`${viewer}.querySelector('h2').innerText === 'solo.png'`);
        assert.deepEqual(await browser.evaluate(`(() => { const b = ${viewer}.querySelector('.photo-image-viewer-stack'); return [b.getAttribute('aria-label'), b.getAttribute('aria-disabled')]; })()`),
          ['Bilder på samme sted (1)', 'true']);
        await pressKey(browser, 'Escape', KEYS.Escape);
        await browser.waitFor(`!${viewer}`);
        await browser.waitFor(`document.activeElement === ${inspector}.querySelector('.photo-preview-open')`, 3000); // focus returns to the inspector
        assert.equal(exceptions().length, 0);
      });

      await t.test('main map: shared Miniatyrer preference, stack popup paging, zoom fallback, inspection only', async () => {
        await browser.evaluate('document.querySelector(".photo-workspace-back").click()');
        await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
        const legend = 'document.querySelector("[data-legend-photos]")';
        // The legend is a lazily loaded chunk; with only FOTO layers it now carries the photo display modes.
        await browser.waitFor(`Array.from(document.querySelectorAll('button')).some((b) => b.innerText.trim() === 'Tegnforklaring')`);
        if (!await browser.evaluate(`Boolean(${legend})`)) await clickText(browser, 'Tegnforklaring');
        await browser.waitFor(legend);
        assert.equal(await browser.evaluate(`${legend}.querySelector('[aria-checked=true]').dataset.mode`), 'thumbnails', 'the workspace choice is shared with the main map');
        await browser.waitFor('document.querySelectorAll(".photo-thumb-marker").length === 8');
        assert.equal(await browser.evaluate('document.querySelector(".photo-marker-stack")?.innerText'), '6');
        assert.equal(await browser.evaluate('document.querySelectorAll("[data-edit-target], .leaflet-marker-draggable").length'), 0, 'no spatial editing on the main map');
        await screenshot('main-thumbnails');
        await hover('document.querySelector(".photo-marker-stack").closest(".leaflet-marker-icon")');
        await browser.waitFor('document.querySelector(".photo-thumb-preview")');
        await click(await elementCentre(browser, 'document.querySelector(".photo-marker-stack").closest(".leaflet-marker-icon")'));
        await browser.waitFor('document.querySelector(".photo-map-popup")');
        await browser.waitFor('!document.querySelector(".photo-thumb-preview")'); // Leaflet fades a removed tooltip before detaching its DOM.
        assert.equal(await browser.evaluate('Boolean(document.querySelector(".photo-thumb-preview"))'), false, 'click closes the active hover preview');
        for (const [width, height] of [[1920,1080], [1366,768], [1280,720], [768,620]]) {
          await setViewport(width, height);
          const orientations = new Set();
          for (let i = 0; i < 6; i++) {
            await browser.waitFor('document.querySelector(".photo-map-popup-preview img")?.complete');
            await wait(350); // Leaflet auto-pan after the new image orientation is laid out.
            const layout = await browser.evaluate(`(() => { const popup=document.querySelector('.photo-map-viewer-popup').getBoundingClientRect(), map=document.querySelector('.leaflet-container').getBoundingClientRect(), image=document.querySelector('.photo-map-popup-preview img'), box=image.getBoundingClientRect();
              return { inside:popup.left>=map.left && popup.right<=map.right && popup.top>=map.top && popup.bottom<=map.bottom, popupHeight:popup.height,
                width:box.width, fit:getComputedStyle(image).objectFit, orientation:image.naturalWidth>image.naturalHeight?'landscape':'portrait',
                source:document.querySelector('.photo-map-popup-placement').innerText, details:document.querySelector('.photo-map-popup-details').open,
                margins:Array.from(document.querySelectorAll('.photo-map-popup p')).map(e=>getComputedStyle(e).marginBlock), bodyHeight:document.querySelector('.photo-map-popup-body').getBoundingClientRect().height }; })()`);
            assert(layout.inside && layout.width >= 300 && layout.fit === 'contain' && !layout.details, `${width} popup: ${JSON.stringify(layout)}`);
            assert(layout.margins.every(m=>m==='0px') && layout.bodyHeight < 130, 'compact body overrides Leaflet paragraph margins');
            assert.match(layout.source, /Plassering fra GMI/);
            if (!orientations.has(layout.orientation)) await screenshot(`pass1c-popup-${width}-${layout.orientation}`);
            orientations.add(layout.orientation);
            await clickText(browser, 'Neste bilde på samme sted', 'document.querySelector(".photo-map-popup")');
          }
          assert.equal(orientations.size, 2, 'same-location paging covers portrait and landscape');
          await browser.evaluate('document.querySelector(".photo-map-popup-details").open = true');
          await wait(350);
          assert(await browser.evaluate('document.querySelector(".photo-map-popup-details").innerText.includes("GUID")'), 'technical identification is accessible on demand');
          const fits = await browser.evaluate(`(() => { const p=document.querySelector('.photo-map-viewer-popup').getBoundingClientRect(), m=document.querySelector('.leaflet-container').getBoundingClientRect(); return p.top>=m.top && p.bottom<=m.bottom; })()`);
          assert(fits, 'expanded details remain inside the map');
          await browser.evaluate('document.querySelector(".photo-map-popup-details").open = false');
        }
        await setViewport(1920,1080);
        await clickText(browser, 'Lukk bildeforhåndsvisning', 'document.querySelector(".photo-map-popup")');
        await browser.waitFor('!document.querySelector(".photo-map-popup")');
        await unhover(); await hover('document.querySelector(".photo-marker-stack").closest(".leaflet-marker-icon")');
        await browser.waitFor('document.querySelector(".photo-thumb-preview")');
        await click(await elementCentre(browser, 'document.querySelector(".photo-marker-stack").closest(".leaflet-marker-icon")'));
        await browser.waitFor('document.querySelector(".photo-map-popup")');
        const pager = () => browser.evaluate('document.querySelector(".photo-map-popup-stack span").innerText');
        const first = await browser.evaluate('document.querySelector(".photo-map-popup .font-semibold").innerText');
        assert.match(await pager(), /^\d av 6 på samme sted$/);
        await browser.evaluate('document.querySelector(".photo-map-popup [aria-label=\\"Neste bilde på samme sted\\"]").click()');
        await browser.waitFor(`document.querySelector(".photo-map-popup .font-semibold").innerText !== ${JSON.stringify(first)}`);
        const shown = await browser.evaluate('document.querySelector(".photo-map-popup .font-semibold").innerText');
        await clickText(browser, 'Åpne i bildemodul', 'document.querySelector(".photo-map-popup")');
        await browser.waitFor('document.querySelector(".photo-workspace-shell")');
        assert.equal(await activeId(), ids[shown], 'the paged photo opens in the workspace');
        await browser.evaluate('document.querySelector(".photo-workspace-back").click()');
        await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
        for (const [key, occurrence] of [['solo1', '1 av 2'], ['solo2', '2 av 2']]) {
          await click(await elementCentre(browser, `document.querySelector('.leaflet-marker-icon[data-photo-id="${ids[key]}"]')`));
          await browser.waitFor(`document.querySelector('.photo-map-popup')?.dataset.photoId === ${JSON.stringify(ids[key])}`);
          assert.match(await browser.evaluate('document.querySelector(".photo-map-popup .photo-occurrence-context").innerText'), /Flere plasseringer.*Samme bilde/);
          assert((await browser.evaluate('document.querySelector(".photo-map-popup .photo-occurrence-context").innerText')).includes(occurrence));
          assert.equal(await browser.evaluate('Boolean(document.querySelector(".photo-map-popup-stack"))'), false, 'multiple placements of one asset do not invent a same-location stack');
          await clickText(browser, 'Åpne i bildemodul', 'document.querySelector(".photo-map-popup")');
          await browser.waitFor('document.querySelector(".photo-workspace-shell")');
          assert.equal(await activeId(), ids[key], 'opens this exact occurrence of the shared asset');
          await clickText(browser, 'Tilbake til appen');
          await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
        }
        for (let i = 0; i < 6 && await browser.evaluate('Boolean(document.querySelector(".photo-thumb-marker"))'); i++) {
          await browser.evaluate('document.querySelector(".leaflet-control-zoom-out").click()'); await wait(400);
        }
        await browser.waitFor('document.querySelectorAll(".photo-thumb-marker").length === 0 && document.querySelectorAll(".photo-camera-marker[data-photo-id]").length === 8');
        await browser.waitFor(`Array.from(document.querySelectorAll('button')).some((b) => b.innerText.trim() === 'Tegnforklaring')`);
        if (!await browser.evaluate(`Boolean(${legend})`)) await clickText(browser, 'Tegnforklaring');
        await browser.waitFor(legend);
        assert.match(await browser.evaluate(`${legend}.innerText`), /Miniatyrer vises fra zoom 16/);
      });

      await t.test('new photo import lives in the layer list; the header has no Bilder button', async () => {
        const actions = await browser.evaluate(`Array.from(document.querySelectorAll('.layer-manager-add-actions button')).map((b) => b.innerText.trim())`);
        assert.deepEqual(actions, ['Legg til fil', 'Legg til bilder']);
        assert.equal(await browser.evaluate(`Array.from(document.querySelectorAll('.workspace-left > header button')).some((b) => /Bilder/.test(b.innerText))`), false);
        const layers = await browser.evaluate('document.querySelectorAll("section[aria-label^=\\"Fotokartlag\\"]").length');
        await clickText(browser, 'Legg til bilder', 'document.querySelector(".layer-manager-add-actions")');
        await browser.waitFor(importDialog);
        assert.match(await browser.evaluate(`${importDialog}.querySelector('.photo-collection-header').innerText`), /Nytt fotolag/, 'a new, independent FOTO layer');
        await clickText(browser, 'Avbryt', importDialog);
        await browser.waitFor(`!${importDialog}`);
        assert.equal(await browser.evaluate('document.querySelectorAll("section[aria-label^=\\"Fotokartlag\\"]").length'), layers);
        for (const [width, height] of [[1366, 768], [1280, 720]]) {
          await setViewport(width, height);
          const fit = await browser.evaluate(`Array.from(document.querySelectorAll('.layer-manager-add-actions button')).every((b) => b.scrollWidth <= b.clientWidth + 1 && b.getBoundingClientRect().height <= 40)`);
          assert(fit, `bottom actions fit at ${width}`);
        }
        await setViewport(1920, 1080);
        assert.equal(exceptions().length, 0, JSON.stringify(exceptions().map((event) => event.params.exceptionDetails.text)));
      });
      await t.test('Pass 1C: real six-photo stacks carry each provenance badge in both map surfaces', async () => {
        await clickText(browser, 'Bildemodul');
        await browser.waitFor(inspector);
        const verify = async (kind) => {
          await selectPhotoRow(browser, ids['stack-1.png']);
          await browser.evaluate(`${inspector}.querySelector('.photo-inspector-locate').click()`);
          await browser.waitFor('document.querySelectorAll(".photo-thumb-marker").length === 8');
          await browser.waitFor(`document.querySelector('.photo-marker-selected .photo-marker-stack')?.innerText === '6'`);
          assert.equal(await browser.evaluate('document.querySelector(".photo-marker-selected .photo-thumb").dataset.positionSource'), kind);
          const clear = await browser.evaluate(`(() => {const marker=document.querySelector('.photo-marker-selected'), source=marker.querySelector('.photo-thumb-source').getBoundingClientRect(), stack=marker.querySelector('.photo-marker-stack').getBoundingClientRect();
            return source.right<=stack.left || source.left>=stack.right || source.bottom<=stack.top || source.top>=stack.bottom;})()`);
          assert(clear, 'source dot and stack count never overlap');
          await screenshot(`pass1c-stack-${kind}-workspace`);
          await clickText(browser, 'Tilbake til appen');
          await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
          assert.equal(await browser.evaluate('document.querySelector(".photo-marker-stack").closest(".leaflet-marker-icon").querySelector(".photo-thumb").dataset.positionSource'), kind);
          await screenshot(`pass1c-stack-${kind}-main`);
          await clickText(browser, 'Bildemodul');
          await browser.waitFor(inspector);
        };
        await verify('gmi');
        await applyPhotoSourcePositions(browser, 'exif');
        await verify('exif');
        await stagePhotoSource(browser, fixtures.gml, 'gml'); await savePhotoSource(browser, 'gml'); await closePhotoSources(browser);
        await applyPhotoSourcePositions(browser, 'gml');
        await verify('gml');
        // Pan empty map before using the existing centre action, so every member gets the same new manual position.
        const mapCentre = await elementCentre(browser, 'document.querySelector(".leaflet-container")');
        await mouseDrag(browser, { x:mapCentre.x-80, y:mapCentre.y+80 }, { x:mapCentre.x-40, y:mapCentre.y+110 });
        await enterEditMode(browser);
        for (const name of STACK) {
          await selectPhotoRow(browser, ids[name]); await waitForStableEditTarget(browser);
          await clickText(browser, 'Flytt til kartsenter', commandBar);
        }
        assert.equal(await browser.evaluate(editCount()), 6);
        await saveEdits(browser);
        await verify('manual');
        assert.equal(exceptions().length, 0);
      });
    } finally {
      await browser.close();
      await fixtures.cleanup();
    }
  });
