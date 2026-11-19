import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { gpsJpeg } from './helpers/photoGpsFixtures.mjs';
import { createLayerWithPlacement, importDialog, waitForThumbnails } from './helpers/photoImportWizard.mjs';
import { clickSourceControl, setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { selectPhotoRow } from './helpers/photoWorkspace.mjs';

// A8: the FOTO header eye hides the workspace photos on the map (markers, miniatures, direction arrows, previews) and
// shows them again exactly as they were. Selection, inspector, list position, map extent and display mode are kept, and
// toggling never fits or pans the map.
const app = process.env.PHOTO_UI_URL;
const eye = 'document.querySelector(".photo-workspace-visibility")';
const markers = 'document.querySelectorAll(".leaflet-photo-markers-pane .leaflet-marker-icon[data-photo-id]")';
const arrows = 'document.querySelectorAll(".leaflet-photo-directions-pane .leaflet-marker-icon")';
const preview = 'document.querySelector(".photo-workspace-map-preview")';
const marker = (id) => `document.querySelector('.leaflet-photo-markers-pane .leaflet-marker-icon[data-photo-id="${id}"]')`;
const zoom = 'Number(document.body.innerText.match(/Zoom: (\\d+(?:\\.\\d+)?)/)?.[1])';

for (const [width, height] of [[1280, 720], [1366, 768]]) test(`FOTO photo visibility toggle at ${width}×${height}`,
  { skip: !app || !chromePath, timeout: 120000 }, async () => {
    const directory = await mkdtemp(path.join(path.resolve(tmpdir()), 'photo-visibility-ui-'));
    const browser = await openTestChrome();
    const click = (label) => clickSourceControl(browser, label, 'document');
    const shot = async (stage) => {
      const target = process.env.PHOTO_SCREENSHOT_DIR;
      if (!target) return;
      await mkdir(target, { recursive: true });
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(target, `a8-visibility-${stage}-${width}x${height}.png`), Buffer.from(data, 'base64'));
    };
    try {
      const files = await Promise.all([['01-a.jpg', [10, 26, 4], 45], ['02-b.jpg', [10, 26, 5], 135], ['03-c.jpg', [10, 26, 6], 270]]
        .map(async ([name, longitude, direction]) => {
          const file = path.join(directory, name);
          await writeFile(file, gpsJpeg({ longitude, direction, directionRef: 'T' }));
          return file;
        }));
      const tile = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS3cAAAAASUVORK5CYII=';
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.clear();
        const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
        Object.defineProperty(HTMLImageElement.prototype, 'src', { ...source, set(value) {
          source.set.call(this, String(value).includes('cache.kartverket.no/') ? ${JSON.stringify(tile)} : value);
        } });` });
      await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
      await click('Lukk');
      await click('Bilder');
      await browser.waitFor(importDialog);
      await setPhotoFiles(browser, 'input[aria-label="Velg bildefiler"]', files);
      await waitForThumbnails(browser);
      await browser.waitFor(`${importDialog}.dataset.exifPending === '0'`);
      await createLayerWithPlacement(browser, 'exif');
      await browser.waitFor(`${markers}.length === 3`);
      const ids = await browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-list li[data-photo-id]')).map(e => e.dataset.photoId)`);
      await selectPhotoRow(browser, ids[1]);
      await browser.evaluate('new Promise(resolve => setTimeout(resolve, 500))');
      // Open the persistent preview from its marker, as a user does, then let the map settle.
      await browser.evaluate(`${marker(ids[1])}.click()`);
      await browser.waitFor(preview);
      await browser.evaluate('new Promise(resolve => setTimeout(resolve, 600))');
      const state = () => browser.evaluate(`(() => { const m = ${marker(ids[1])}?.getBoundingClientRect();
        const list = document.querySelector('.photo-workspace-list');
        return { markers: ${markers}.length, arrows: ${arrows}.length, preview: ${preview}?.dataset.photoId ?? null,
          selected: document.querySelector('.photo-workspace-list li[aria-current], .photo-workspace-list .photo-workspace-row[aria-pressed="true"]')?.closest('li')?.dataset.photoId ?? null,
          inspector: document.querySelector('.photo-workspace-inspector h2')?.innerText ?? null, zoom: ${zoom},
          mode: document.querySelector('.photo-map-display-card [aria-checked="true"]')?.dataset.mode ?? null,
          listTop: list?.scrollTop ?? null, pressed: ${eye}.getAttribute('aria-pressed'), label: ${eye}.getAttribute('aria-label'),
          marker: m ? { x: Math.round(m.x), y: Math.round(m.y) } : null }; })()`);
      const before = await state();
      assert.equal(before.markers, 3);
      assert(before.arrows > 0, 'direction arrows are drawn before hiding');
      assert.equal(before.preview, ids[1]);
      assert.equal(before.selected, ids[1]);
      assert.equal(before.pressed, 'false');
      await shot('shown');

      await browser.evaluate(`${eye}.click()`);
      await browser.waitFor(`${markers}.length === 0 && !${preview}`);
      await browser.evaluate('new Promise(resolve => setTimeout(resolve, 400))');
      const hidden = await state();
      assert.equal(hidden.arrows, 0, 'direction arrows hide with their photos');
      assert.equal(hidden.preview, null, 'the floating preview hides');
      assert.equal(hidden.selected, before.selected, 'selection is kept');
      assert.equal(hidden.inspector, before.inspector, 'inspector is kept');
      assert.equal(hidden.zoom, before.zoom, 'no fit or zoom');
      assert.equal(hidden.mode, before.mode, 'display mode is kept');
      assert.equal(hidden.listTop, before.listTop, 'list position is kept');
      assert.equal(hidden.pressed, 'true');
      assert.match(hidden.label, /^Vis fotolaget /);
      await shot('hidden');

      await browser.evaluate(`${eye}.click()`);
      await browser.waitFor(`${markers}.length === 3 && ${preview}`);
      await browser.evaluate('new Promise(resolve => setTimeout(resolve, 600))');
      const shown = await state();
      assert.deepEqual({ ...shown, pressed: undefined, label: undefined }, { ...before, pressed: undefined, label: undefined },
        'the previous display state returns, with no pan or fit');

      // Thumbnails (Miniatyrer) hide and return the same way.
      await browser.evaluate(`document.querySelector('.photo-map-display-card [data-mode="thumbnails"]').click()`);
      await browser.waitFor(`document.querySelector('.photo-map-display-card [data-mode="thumbnails"]').getAttribute('aria-checked') === 'true'`);
      const thumbs = await browser.evaluate(`${markers}.length`);
      await browser.evaluate(`${eye}.click()`);
      await browser.waitFor(`${markers}.length === 0`);
      assert.equal(await browser.evaluate(`document.querySelector('.photo-map-display-card [data-mode="thumbnails"]').getAttribute('aria-checked')`), 'true');
      await browser.evaluate(`${eye}.click()`);
      await browser.waitFor(`${markers}.length === ${thumbs}`);
      await shot('restored');
    } finally {
      await browser.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
