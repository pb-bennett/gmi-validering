// FOTO Slice 2, production browser: unified delivery colours in FOTO and on the main map, provenance colours kept
// through the edit lifecycle, the persistent click preview with its delivery cycle pill (shared-photo isolation),
// filters after delivery changes, and the compact layer-card entry. 1280×720 and 1366×768.
// Synthetic files only. Needs PHOTO_UI_URL (a running production build); saves screenshots with PHOTO_SCREENSHOT_DIR.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { gpsPng } from './helpers/photoGpsFixtures.mjs';
import { gmiFile } from './helpers/gmiPhotoFixtures.mjs';
import { createLayerWithoutPlacement, waitForThumbnails } from './helpers/photoImportWizard.mjs';
import { applyPhotoSourcePositions, clickSourceControl as click, savePhotoSource, setPhotoColourMode, setPhotoFiles, stagePhotoSource } from './helpers/photoSourceWorkflow.mjs';
import { KEYS, discardEdits, dragSelectedMarker, editTarget, elementCentre, enterEditMode, pressKey, saveEdits } from './helpers/photoWorkspace.mjs';

const app = process.env.PHOTO_UI_URL;
const RGB = { gmi: 'rgb(96, 165, 250)', gml: 'rgb(74, 222, 128)', excluded: 'rgb(203, 213, 225)', ink: 'rgb(15, 23, 42)' };
const HEX = { gmi: '#60a5fa', gml: '#4ade80', excluded: '#cbd5e1', provenanceGmi: '#2463b5', manual: '#b06a08' };
const rows = 'Array.from(document.querySelectorAll(".photo-workspace-list li[data-photo-id]"))';
const rowOf = (text) => `${rows}.find((row) => row.innerText.includes(${JSON.stringify(text)}))`;
const marker = (id) => `document.querySelector('.leaflet-photo-markers-pane .leaflet-marker-icon[data-photo-id="${id}"]')`;
const preview = 'document.querySelector(".photo-workspace-preview-popup")';
const fillOf = (expression) => `(${expression})?.querySelector('svg.photo-camera-glyph path')?.getAttribute('fill') || null`;
const screenshot = async (browser, name) => {
  if (!process.env.PHOTO_SCREENSHOT_DIR) return;
  await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive: true });
  const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(process.env.PHOTO_SCREENSHOT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
};
// WCAG contrast from computed rgb() strings.
const luminance = (rgb) => rgb.match(/\d+/g).slice(0, 3).map((value) => value / 255)
  .map((c) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((sum, c, index) => sum + c * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('FOTO Slice 2: delivery colours everywhere, provenance through editing, click preview with delivery cycling, filters, layer card',
  { skip: !chromePath || !app, timeout: 300000 }, async () => {
    const directory = await mkdtemp(path.join(path.resolve(tmpdir()), 'photo-slice2-ui-'));
    const browser = await openTestChrome();
    const names = ['shared.png', 'b.png', 'c.png'], files = names.map((name) => path.join(directory, name));
    const gmiPath = path.join(directory, 'leveranse.gmi');
    await Promise.all(files.map((file) => writeFile(file, gpsPng())));
    await writeFile(gmiPath, Buffer.from(await gmiFile([
      { guid: '00000000-0000-4000-8000-000000000001', label: 'Kum 1', hyperlink: 'h:1(link:"Attachments\\shared.png") ', xyz: '581930 6566000 1' },
      { guid: '00000000-0000-4000-8000-000000000002', label: 'Kum 2', hyperlink: 'h:1(link:"Attachments\\shared.png") ', xyz: '582030 6566100 1' },
      { scope: 'line', label: 'Synthetic survey line', tema: 'VL', xyz: '581960 6566020 1' },
      { guid: '00000000-0000-4000-8000-000000000003', label: 'Kum 3', hyperlink: 'h:1(link:"Attachments\\b.png") ', xyz: '582130 6566050 1' },
    ]).arrayBuffer()));
    const idOf = (text) => browser.evaluate(`${rowOf(text)}.dataset.photoId`);
    const pill = (text) => browser.evaluate(`${rowOf(text)}?.querySelector('.photo-delivery-pill')?.innerText || null`);
    const mouseClick = async (expression) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const { x, y } = await elementCentre(browser, expression);
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
      await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    };
    const select = async (text) => {
      await browser.evaluate(`${rowOf(text)}.querySelector('button.photo-workspace-row').click()`);
      await browser.waitFor(`${rowOf(text)}.querySelector('button.photo-workspace-row').getAttribute('aria-pressed')==='true'`);
    };
    const noOverflow = () => browser.evaluate(`['.photo-workspace-collection', '.photo-workspace-inspector'].every((selector) => {
      const element = document.querySelector(selector); return element && element.scrollWidth <= element.clientWidth + 1; }) && document.documentElement.scrollWidth <= innerWidth`);
    try {
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear();' });
      await browser.send('Page.navigate', { url: app + '?testmodus=1' });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
      await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
      await setPhotoFiles(browser, 'input[type=file]', [gmiPath]);
      await browser.waitFor('document.querySelector(".leaflet-overlay-pane path.leaflet-interactive")');
      await click(browser, 'Legg til bilder', 'document');
      await setPhotoFiles(browser, 'input[aria-label="Velg bildefiler"]', files);
      await waitForThumbnails(browser);
      await createLayerWithoutPlacement(browser);
      await stagePhotoSource(browser, gmiPath, 'gmi');
      await savePhotoSource(browser, 'gmi');
      await applyPhotoSourcePositions(browser, 'gmi');
      await browser.waitFor(`${rows}.length === 4`);
      await browser.evaluate('document.querySelector(".photo-workspace-toast-close")?.click()');
      const [kum1, kum2, kum3] = [await idOf('Kum 1'), await idOf('Kum 2'), await idOf('Kum 3')];
      await browser.waitFor(`${marker(kum1)} && ${marker(kum2)} && ${marker(kum3)}`);

      // 1. One palette: FOTO markers, list pills (computed fill/ink/contrast) and the legend.
      assert.deepEqual(await browser.evaluate(`[${fillOf(marker(kum1))}, ${fillOf(marker(kum2))}, ${fillOf(marker(kum3))}]`), [HEX.gmi, HEX.gmi, HEX.gmi]);
      const pillStyle = (text) => browser.evaluate(`(() => { const s = getComputedStyle(${rowOf(text)}.querySelector('.photo-delivery-pill')); return [s.backgroundColor, s.color, s.borderTopColor]; })()`);
      const [gmiFill, gmiInk, gmiEdge] = await pillStyle('Kum 1');
      assert.deepEqual([gmiFill, gmiInk], [RGB.gmi, RGB.ink]);
      assert(contrast(gmiFill, gmiInk) >= 4.5 && gmiEdge !== gmiFill, 'readable ink and a derived edge');
      assert.equal(await browser.evaluate(`document.querySelector('[data-legend-delivery="gmi"] .photo-camera-glyph path').getAttribute('fill')`), HEX.gmi);

      await select('Kum 1');
      // 2. A marker click selects the occurrence and opens the persistent preview; it does not change delivery.
      await mouseClick(marker(kum1));
      await browser.waitFor(`${preview} && ${preview}.querySelector('[data-photo-id="${kum1}"]')`);
      assert.equal(await browser.evaluate(`${rowOf('Kum 1')}.querySelector('button.photo-workspace-row').getAttribute('aria-pressed')`), 'true', 'list follows the map');
      assert.equal(await pill('Kum 1'), 'GMI', 'an ordinary click never changes delivery');
      assert.match(await browser.evaluate(`${preview}.innerText`), /shared\.png/);
      assert.equal(await browser.evaluate(`${preview}.querySelectorAll('button').length`), 3, 'placement edit, close and the delivery pill');
      assert.equal(await browser.evaluate('Boolean(document.querySelector(".photo-map-viewer-popup"))'), false, 'not the main-map viewer popup');
      await screenshot(browser, 'slice2-preview-1366x768');

      // 3. The cycle pill: GMI → GML → Ikke → GMI on this occurrence only; the shared sibling stays GMI.
      const previewPill = `${preview}.querySelector('.photo-delivery-row-button')`;
      for (const [label, key] of [['GML', 'gml'], ['Ikke', 'excluded'], ['GMI', 'gmi']]) {
        await browser.evaluate(`${previewPill}.click()`);
        await browser.waitFor(`${previewPill}?.innerText === ${JSON.stringify(label)} && ${fillOf(marker(kum1))} === ${JSON.stringify(HEX[key])}`);
        assert.equal(await pill('Kum 1'), label);
        assert.equal(await pill('Kum 2'), 'GMI', 'sibling placement untouched');
        assert.equal(await browser.evaluate(fillOf(marker(kum2))), HEX.gmi);
        assert.equal(await browser.evaluate(`getComputedStyle(${previewPill}).color`), RGB.ink);
        if (key === 'gml') await screenshot(browser, 'slice2-preview-gml-1366x768');
      }

      // 4. Another marker updates the preview; Escape and X close it; X returns focus to the marker.
      await mouseClick(marker(kum2));
      await browser.waitFor(`${preview}?.querySelector('[data-photo-id="${kum2}"]')`);
      await pressKey(browser, 'Escape', KEYS.Escape);
      await browser.waitFor(`!${preview}`);
      assert.equal(await browser.evaluate(`${rowOf('Kum 2')}.querySelector('button.photo-workspace-row').getAttribute('aria-pressed')`), 'true', 'closing keeps the selection');
      await mouseClick(marker(kum2));
      const closeButton = `${preview}?.querySelector('[aria-label="Lukk bildeforhåndsvisning"]')`;
      await browser.waitFor(closeButton);
      await browser.evaluate(`${closeButton}.click()`);
      await browser.waitFor(`!${preview} && document.activeElement === ${marker(kum2)}`);
      await select('Kum 2');
      assert.equal(await browser.evaluate(`Boolean(${preview})`), false, 'list selection alone never opens it');

      // Acceptance corrections: hover in both modes, independent dismissal, exact edit target and stable list.
      const emptyMapPoint = () => browser.evaluate(`(() => {
        const map = document.querySelector('.leaflet-container'), b = map.getBoundingClientRect();
        for (let y = b.top + 160; y < b.bottom - 80; y += 50) for (let x = b.left + 80; x < b.right - 80; x += 50) {
          const e = document.elementFromPoint(x, y);
          if (e?.closest('.leaflet-container') === map && e.matches('img.leaflet-tile, .leaflet-container, .leaflet-pane')) return { x, y };
        }
        throw new Error('No unobstructed empty-map point');
      })()`);
      const positionForPreview = async () => {
        for (let attempt = 0; attempt < 8; attempt++) {
          const zoom = await browser.evaluate(`Number(document.body.innerText.match(/Zoom: (\\d+)/)?.[1])`);
          if (zoom === 17) break;
          await browser.evaluate(`document.querySelector('.leaflet-control-zoom-${zoom > 17 ? 'out' : 'in'}').click()`);
          await new Promise((resolve) => setTimeout(resolve, 350));
        }
        await select('Kum 1');
        await new Promise((resolve) => setTimeout(resolve, 500));
        const delta = await browser.evaluate(`(() => { const b = document.querySelector('.leaflet-container').getBoundingClientRect(), p = ${marker(kum1)}.getBoundingClientRect();
          return { x: b.left + 180 - p.left - p.width / 2, y: b.top + 450 - p.top - p.height / 2 }; })()`);
        const from = await emptyMapPoint();
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...from });
        await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...from, button: 'left', buttons: 1, clickCount: 1 });
        for (let step = 1; step <= 8; step++) await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + delta.x * step / 8, y: from.y + delta.y * step / 8, button: 'left', buttons: 1 });
        await new Promise((resolve) => setTimeout(resolve, 150));
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: from.x + delta.x, y: from.y + delta.y, button: 'left', buttons: 0, clickCount: 1 });
        await new Promise((resolve) => setTimeout(resolve, 500));
      };
      const hover = async (id) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 400, y: 70 });
        const { x, y } = await elementCentre(browser, marker(id));
        assert(await browser.evaluate(`document.elementFromPoint(${x}, ${y})?.closest('[data-photo-id]') === ${marker(id)}`), 'hover target is reachable');
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      };
      for (const mode of ['markers', 'thumbnails']) {
        // The display controls expose their Norwegian labels rather than marker data attributes.
        await click(browser, mode === 'markers' ? 'Mark\u00f8rer' : 'Miniatyrer', 'document');
        await positionForPreview();
        await hover(kum1);
        await browser.waitFor('document.querySelector(".photo-thumb-preview")');
        await mouseClick(marker(kum1));
        await browser.waitFor(`${preview}?.querySelector('.photo-delivery-row-button')`);
        await hover(kum1);
        await new Promise((resolve) => setTimeout(resolve, 350));
        assert.equal(await browser.evaluate('Boolean(document.querySelector(".photo-thumb-preview"))'), false, 'no duplicate for persistent photo');
        await screenshot(browser, `acceptance-before-neighbour-${mode}`);
        await hover(kum2);
        await new Promise((resolve) => setTimeout(resolve, 350));
        assert.equal(await browser.evaluate('Boolean(document.querySelector(".photo-thumb-preview"))'), false, 'no duplicate photograph through a repeated placement');
        await hover(kum3);
        await browser.waitFor('document.querySelector(".photo-thumb-preview")');
        assert(await browser.evaluate(`(() => { const e = document.querySelector('.photo-thumb-preview'); const b = e.getBoundingClientRect();
          // Temporarily enable hit testing to inspect paint order; production hover remains non-interactive.
          e.style.pointerEvents = 'auto';
          const above = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.closest('.photo-thumb-preview') === e;
          e.style.pointerEvents = ''; return above; })()`), 'neighbour hover above popup');
        assert.equal(await browser.evaluate('document.querySelectorAll(".leaflet-photo-hover-preview-pane").length'), 1);
        await screenshot(browser, `acceptance-hover-${mode}`);
        const survey = 'document.querySelector(".leaflet-overlay-pane path.leaflet-interactive")';
        await browser.evaluate(`${survey}.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 500, clientY: 300 }))`);
        await browser.waitFor('document.querySelector(".gmi-object-popup")');
        assert(await browser.evaluate(`Boolean(${preview})`), 'survey feature popup keeps photo preview');
        await browser.evaluate('document.querySelector(".gmi-object-popup .leaflet-popup-close-button").click()');
        // Controls and real drags do not dismiss; empty map click does.
        await browser.evaluate('document.querySelector(".leaflet-control-zoom-in").click()');
        assert(await browser.evaluate(`Boolean(${preview})`));
        await new Promise((resolve) => setTimeout(resolve, 500));
        await browser.evaluate('document.querySelector(".leaflet-control-zoom-out").click()');
        await new Promise((resolve) => setTimeout(resolve, 500));
        const mapPoint = await emptyMapPoint();
        await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...mapPoint, button: 'left', buttons: 1, clickCount: 1 });
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mapPoint.x + 30, y: mapPoint.y + 25, button: 'left', buttons: 1 });
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mapPoint.x + 30, y: mapPoint.y + 25, button: 'left', buttons: 0, clickCount: 1 });
        assert(await browser.evaluate(`Boolean(${preview})`), 'drag keeps preview');
        await new Promise((resolve) => setTimeout(resolve, 700));
        await screenshot(browser, `acceptance-before-dismiss-${mode}`);
        const clickPoint = await emptyMapPoint();
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...clickPoint, button: 'none', buttons: 0 });
        await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...clickPoint, button: 'left', buttons: 1, clickCount: 1 });
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...clickPoint, button: 'left', buttons: 0, clickCount: 1 });
        await browser.waitFor(`!${preview}`);
        assert.equal(await pill('Kum 1'), 'GMI');
        assert.equal(await browser.evaluate(`${rowOf('Kum 1')}.querySelector('button.photo-workspace-row').getAttribute('aria-pressed')`), 'true');
        await select('Kum 1');
        await mouseClick(marker(kum1));
        await browser.waitFor(`${preview}?.querySelector('.photo-delivery-row-button')`);
        const doublePoint = await emptyMapPoint();
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...doublePoint });
        for (const clickCount of [1, 2]) {
          await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...doublePoint, button: 'left', buttons: 1, clickCount });
          await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...doublePoint, button: 'left', buttons: 0, clickCount });
        }
        await browser.waitFor(`!${preview}`);
        // Restore the zoom after the approved double-click dismissal before testing the next mode.
        await new Promise((resolve) => setTimeout(resolve, 500));
        await browser.evaluate('document.querySelector(".leaflet-control-zoom-out").click()');
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      for (const [width, height] of [[1280, 720], [1366, 768]]) {
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        await positionForPreview();
        await mouseClick(marker(kum1));
        await browser.waitFor(`${preview}?.querySelector('.photo-delivery-row-button')`);
        const top = await browser.evaluate('document.querySelector(".photo-workspace-list").getBoundingClientRect().top');
        for (const label of ['GML', 'Ikke', 'GMI']) {
          const before = await browser.evaluate(`[${marker(kum1)}.dataset.lat, ${marker(kum1)}.dataset.lng]`);
          await browser.evaluate(`${preview}.querySelector('.photo-delivery-row-button').click()`);
          await browser.waitFor(`${preview}.querySelector('.photo-delivery-pill').innerText === '${label}'`);
          assert.equal(await browser.evaluate('document.querySelector(".photo-workspace-list").getBoundingClientRect().top'), top, 'delivery cycling keeps list position');
          const edit = `${preview}.querySelector('[aria-label="Juster plassering og retning"]')`;
          await pressKey(browser, 'Tab', { code: 'Tab', keyCode: 9 });
          await browser.evaluate(`${edit}.focus()`);
          await browser.waitFor(`${edit}.dataset.tooltipOpen === 'true'`);
          await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
          await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
          await browser.waitFor(editTarget);
          assert.equal(await browser.evaluate(`${editTarget}.dataset.photoId`), kum1, 'exact repeated occurrence');
          assert(await browser.evaluate('document.activeElement === document.querySelector(".photo-edit-command-bar")'), 'edit entry focuses command bar');
          await browser.waitFor(`!${preview}`);
          assert.equal(await browser.evaluate(`Boolean(${preview})`), false);
          assert.equal(await pill('Kum 1'), label);
          await click(browser, 'Avslutt redigering', 'document');
          await browser.waitFor(`!${editTarget}`);
          await browser.waitFor(marker(kum1));
          assert.deepEqual(await browser.evaluate(`[${marker(kum1)}.dataset.lat, ${marker(kum1)}.dataset.lng]`), before);
          await mouseClick(marker(kum1));
          await browser.waitFor(`${preview}?.querySelector('.photo-delivery-row-button')`);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        await screenshot(browser, `acceptance-preview-${width}x${height}`);
        await pressKey(browser, 'Escape', KEYS.Escape);
      }

      await click(browser, 'Mark\u00f8rer', 'document');
      // 5. Filters after a delivery change: the occurrence leaves list, map and preview at once; counts follow.
      await mouseClick(marker(kum1));
      await browser.waitFor(`${preview}?.querySelector('.photo-delivery-row-button')`);
      await browser.evaluate('document.querySelector("button[aria-label^=\'Filtrer bilder\']").click()');
      await browser.waitFor('document.querySelector(".photo-filter-panel")');
      const legends = await browser.evaluate('Array.from(document.querySelectorAll(".photo-filter-panel legend")).map((item) => item.innerText)');
      assert.deepEqual(legends, ['Plasseringskilde', 'Mangler', 'Annet', 'Leveringsvalg']);
      await browser.evaluate(`document.querySelector('.photo-filter-panel input[value="keep-link"]').click()`);
      await browser.waitFor(`${rows}.length === 3`);
      await browser.evaluate(`${previewPill}.click()`);
      await browser.waitFor(`${rows}.length === 2 && !${marker(kum1)} && !${preview}`);
      const options = await browser.evaluate(`Array.from(document.querySelectorAll('.photo-filter-panel fieldset')).at(-1).innerText`);
      assert(options.includes('GMI (2)') && options.includes('GML (1)'), options);
      await browser.evaluate(`document.querySelector('.photo-filter-panel input[value="gml"][name$="-delivery"]').click()`);
      await browser.waitFor(`${rows}.length === 1 && Boolean(${marker(kum1)})`);
      await browser.evaluate(`document.querySelector('.photo-filter-panel input[value="all"][name$="-delivery"]').click()`);
      await browser.waitFor(`${rows}.length === 4`);
      await browser.evaluate('document.querySelector("button[aria-label^=\'Filtrer bilder\']").click()');
      await select('Kum 1');
      await browser.evaluate(`${rowOf('Kum 1')}.querySelector('.photo-delivery-row-button').click()`); // GML → Ikke
      await browser.evaluate(`${rowOf('Kum 1')}.querySelector('.photo-delivery-row-button').click()`); // Ikke → GMI
      await browser.waitFor(`${rowOf('Kum 1')}.querySelector('.photo-delivery-pill').innerText === 'GMI'`);

      // 6. Edit lifecycle in both colour modes: the edit target keeps its mode colour (never selection blue or Manuell orange).
      await select('Kum 2');
      await setPhotoColourMode(browser, 'provenance');
      await browser.waitFor(`${fillOf(marker(kum1))} === ${JSON.stringify(HEX.provenanceGmi)}`);
      await enterEditMode(browser);
      await browser.waitFor(editTarget);
      assert.equal(await browser.evaluate(fillOf(editTarget)), HEX.provenanceGmi);
      await dragSelectedMarker(browser, 80, 40);
      await browser.waitFor(`${rowOf('Kum 2')}.dataset.changed === 'true'`);
      assert.equal(await browser.evaluate(fillOf(editTarget)), HEX.provenanceGmi, 'a staged move keeps its original source colour');
      await setPhotoColourMode(browser, 'delivery');
      await browser.waitFor(`${fillOf(editTarget)} === ${JSON.stringify(HEX.gml)}`); // the Slice 1 GML proposal, in delivery colour
      await screenshot(browser, 'slice2-edit-delivery-1366x768');
      await discardEdits(browser);
      await browser.waitFor(`${fillOf(marker(kum2))} === ${JSON.stringify(HEX.gmi)}`);
      await setPhotoColourMode(browser, 'provenance');
      await enterEditMode(browser);
      await dragSelectedMarker(browser, 80, 40);
      await browser.waitFor(`${rowOf('Kum 2')}.dataset.changed === 'true'`);
      await saveEdits(browser);
      await browser.waitFor(`${fillOf(marker(kum2))} === ${JSON.stringify(HEX.provenanceGmi)}`);
      assert.match(await browser.evaluate(`${rowOf('Kum 2')}.innerText`), /GMI · justert/, 'saved move keeps its provenance in the list');
      assert.notEqual(await browser.evaluate(fillOf(marker(kum2))), HEX.manual);
      await browser.evaluate('document.querySelector("button[aria-label^=\'Filtrer bilder\']").click()');
      await browser.waitFor('document.querySelector(".photo-filter-panel")');
      await browser.evaluate(`document.querySelector('.photo-filter-panel input[value="gmi"][name$="-placement"]').click()`);
      await browser.waitFor(`${rows}.length === 3 && Boolean(${rowOf('Kum 2')})`); // Kilde: GMI still includes the moved placement
      await browser.evaluate(`document.querySelector('.photo-filter-panel input[value="all"][name$="-placement"]').click()`);
      await browser.evaluate('document.querySelector("button[aria-label^=\'Filtrer bilder\']").click()');
      await setPhotoColourMode(browser, 'delivery');
      await browser.waitFor(`${fillOf(marker(kum2))} === ${JSON.stringify(HEX.gml)} && ${fillOf(marker(kum1))} === ${JSON.stringify(HEX.gmi)}`);

      for (const [width, height] of [[1280, 720], [1366, 768]]) {
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        // Selecting pans the marker clear of the map card; the marker click then opens the preview of that selection.
        await select('Kum 3');
        await browser.waitFor(`(() => { const b = ${marker(kum3)}.getBoundingClientRect(); return document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.closest('[data-photo-id]') === ${marker(kum3)}; })()`);
        await mouseClick(marker(kum3));
        await browser.waitFor(`${preview}?.querySelector('.photo-delivery-row-button')`);
        assert(await noOverflow(), `no horizontal overflow at ${width}×${height}`);
        assert(await browser.evaluate(`(() => { const box = ${preview}.getBoundingClientRect(), map = document.querySelector('.leaflet-container').getBoundingClientRect();
          return box.width <= 330 && box.left >= map.left - 1 && box.right <= map.right + 1; })()`), `preview inside the map at ${width}×${height}`);
        await screenshot(browser, `slice2-preview-${width}x${height}`);
        await pressKey(browser, 'Escape', KEYS.Escape);
        await browser.waitFor(`!${preview}`);
      }

      // 7. Main map: delivery colours (never provenance), a delivery legend, the compact layer-card entry.
      await click(browser, 'Lukk FOTO', 'document');
      await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
      await browser.waitFor(`${marker(kum2)} && ${marker(kum1)}`);
      assert.deepEqual(await browser.evaluate(`[${fillOf(marker(kum1))}, ${fillOf(marker(kum2))}, ${fillOf(marker(kum3))}]`), [HEX.gmi, HEX.gml, HEX.gmi]);
      // The legend is a lazily loaded chunk and may start collapsed; expand it like a user would.
      await browser.waitFor(`Array.from(document.querySelectorAll('button')).some((button) => button.innerText.trim() === 'Tegnforklaring')`);
      if (!await browser.evaluate('Boolean(document.querySelector("[data-legend-photos]"))')) await click(browser, 'Tegnforklaring', 'document');
      await browser.waitFor('Boolean(document.querySelector("[data-legend-photos] [data-legend-delivery=gml]"))');
      assert.equal(await browser.evaluate(`document.querySelector('[data-legend-photos] [data-legend-delivery="gml"] .photo-camera-glyph path').getAttribute('fill')`), HEX.gml);
      const entry = 'document.querySelector("[data-photo-layer-open]")';
      assert.deepEqual(await browser.evaluate(`[${entry}.getAttribute('aria-label'), ${entry}.dataset.iconTooltip, ${entry}.innerText.trim(), Boolean(${entry}.querySelector('svg'))]`),
        ['Åpne FOTO', 'Åpne bildemodul', '', true]);
      assert(await browser.evaluate(`${entry}.getBoundingClientRect().width <= 24`), 'compact like the other layer-card actions');
      await screenshot(browser, 'slice2-main-map-1366x768');
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
      await screenshot(browser, 'slice2-main-map-1280x720');
      await browser.evaluate(`${entry}.click()`);
      await browser.waitFor('document.querySelector(".photo-workspace-shell")');
      // Main map popups are unchanged: a workspace click never shows the main-map viewer popup (checked above), and outside FOTO
      // a marker click still opens it.
      await click(browser, 'Lukk FOTO', 'document');
      await browser.waitFor(`!document.querySelector(".photo-workspace-shell") && ${marker(kum3)}`);
      await mouseClick(marker(kum3));
      await browser.waitFor('document.querySelector(".photo-map-viewer-popup")');
      assert.equal(await browser.evaluate(`Boolean(${preview})`), false);
    } finally {
      await browser.close();
      if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('photo-slice2-ui-')) throw new Error('Unsafe temporary fixture directory');
      await rm(directory, { recursive: true, force: true });
    }
  });
