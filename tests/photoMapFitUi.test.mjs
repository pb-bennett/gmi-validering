import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { gmiText } from './helpers/gmiPhotoFixtures.mjs';
import { gpsPng } from './helpers/photoGpsFixtures.mjs';
import { createLayerWithPlacement, createLayerWithoutPlacement, importDialog, waitForThumbnails } from './helpers/photoImportWizard.mjs';
import { applyPhotoSourcePositions, clickSourceControl, setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { dragSelectedMarker, editArrow, enterEditMode, rotateSelected, saveEdits, selectPhotoRow, waitForStableEditTarget } from './helpers/photoWorkspace.mjs';

const app = process.env.PHOTO_UI_URL;
const map = 'document.querySelector(".leaflet-container")';
const zoom = 'Number(document.body.innerText.match(/Zoom: (\\d+(?:\\.\\d+)?)/)?.[1])';
const row = (id) => `document.querySelector('.photo-workspace-list li[data-photo-id="${id}"]')`;
const marker = (id) => `document.querySelector('.leaflet-photo-markers-pane .leaflet-marker-icon[data-photo-id="${id}"]')`;
const settle = (browser) => browser.evaluate('new Promise(resolve => setTimeout(resolve, 450))');

for (const [width, height] of [[1280, 720], [1366, 768]]) test(`FOTO fit with a loaded survey at ${width}×${height}`,
  { skip: !app || !chromePath, timeout: 120000 }, async () => {
    const root = path.resolve(tmpdir());
    const directory = await mkdtemp(path.join(root, 'photo-map-fit-ui-'));
    const browser = await openTestChrome();
    const click = (label) => clickSourceControl(browser, label, 'document');
    const photoFile = async (name, longitude) => {
      const file = path.join(directory, name);
      await writeFile(file, gpsPng({ longitude }));
      return file;
    };
    const importPhotos = async (files, useExif) => {
      await click('Bilder');
      await browser.waitFor(importDialog);
      await setPhotoFiles(browser, 'input[aria-label="Velg bildefiler"]', files);
      await waitForThumbnails(browser);
      await browser.waitFor(`${importDialog}.dataset.exifPending === '0'`);
      if (useExif) await createLayerWithPlacement(browser, 'exif');
      else await createLayerWithoutPlacement(browser);
      return browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-list li[data-photo-id]')).map(e => e.dataset.photoId)`);
    };
    const closeFoto = async () => {
      await click('Lukk FOTO');
      await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
    };
    const viewportAt = (anchor) => browser.evaluate(`(() => { const r = ${marker(anchor)}.getBoundingClientRect();
      return { zoom: ${zoom}, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
    const pointsAreClear = (ids) => `(() => { const bounds = ${map}.getBoundingClientRect();
      const card = document.querySelector('.photo-map-display-card').getBoundingClientRect();
      return [${ids.map(marker).join(',')}].every(marker => {
        if (!marker) return false;
        const r = marker.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        return x >= bounds.left + 31 && x <= card.left - 23 && y >= bounds.top + 31 && y <= bounds.bottom - 31;
      }); })()`;
    const shot = async (stage) => {
      const directory = process.env.PHOTO_SCREENSHOT_DIR;
      if (!directory) return;
      await mkdir(directory, { recursive: true });
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(directory, `batch-a-fit-${stage}-${width}x${height}.png`), Buffer.from(data, 'base64'));
    };
    try {
      const survey = path.join(directory, 'Distant survey.gmi');
      await writeFile(survey, gmiText([{ label: 'Survey west', xyz: '500000 6640000 1' }, { label: 'Survey east', xyz: '500060 6640050 1' }]));
      const [west, east, single, closeWest, closeEast] = await Promise.all([
        photoFile('01-west.png', [10, 26, 4]), photoFile('02-east.png', [10, 26, 11]),
        photoFile('single.png', [10, 40, 0]),
        photoFile('01-close-west.png', [10, 53, 8]), photoFile('02-close-east.png', [10, 53, 9]),
      ]);
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
      await setPhotoFiles(browser, 'input[type=file]', [survey]);
      await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await browser.waitFor(`${map}`);

      const [first, anchor] = await importPhotos([west, east], true);
      await browser.waitFor(pointsAreClear([first, anchor]));
      assert((await viewportAt(anchor)).zoom <= 20, "A1: general automatic fit cap is z20");
      const coverage = await browser.evaluate(`(() => {
        const bounds = ${map}.getBoundingClientRect(), card = document.querySelector('.photo-map-display-card').getBoundingClientRect();
        const a = ${marker(first)}.getBoundingClientRect(), b = ${marker(anchor)}.getBoundingClientRect();
        return Math.abs((a.left + a.width / 2) - (b.left + b.width / 2)) / (card.left - 24 - bounds.left - 32);
      })()`);
      assert(coverage >= 0.8 && coverage <= 1.01, `photo extent uses the clear map width: ${coverage}`);
      assert.equal(await browser.evaluate(`${row(first)}.querySelector('.photo-delivery-pill').innerText`), 'GML');
      await shot('import');

      // Leave the fitted zoom so an accidental refit is observable even if all the markers still fit.
      const fittedZoom = await browser.evaluate(zoom);
      await browser.evaluate('document.querySelector(".leaflet-control-zoom-out").click()');
      await browser.waitFor(`${zoom} === ${Math.round(fittedZoom - 1)}`);
      await settle(browser);
      const beforeSelect = await viewportAt(anchor);
      await selectPhotoRow(browser, first);
      await settle(browser);
      assert.deepEqual(await viewportAt(anchor), beforeSelect, 'selecting an in-view photo does not move the viewport');
      await browser.evaluate(`${row(first)}.querySelector('.photo-delivery-row-button').click()`);
      await browser.waitFor(`${row(first)}.querySelector('.photo-delivery-pill').innerText === 'Ikke'`);
      await settle(browser);
      assert.deepEqual(await viewportAt(anchor), beforeSelect, 'changing delivery does not move the viewport');

      const oldPosition = await browser.evaluate(`${marker(first)}.dataset.lng`);
      await enterEditMode(browser);
      await waitForStableEditTarget(browser);
      const beforeEdit = await viewportAt(anchor);
      await rotateSelected(browser, 90);
      await browser.waitFor(`${editArrow}?.dataset.degrees === '90'`);
      await settle(browser);
      assert.deepEqual(await viewportAt(anchor), beforeEdit, 'direction edits do not move the viewport');
      await dragSelectedMarker(browser, 25, 35);
      await saveEdits(browser);
      await browser.waitFor(`${marker(first)}?.dataset.lng && ${marker(first)}.dataset.lng !== ${JSON.stringify(oldPosition)}`);
      await settle(browser);
      assert.deepEqual(await viewportAt(anchor), beforeEdit, 'manual position edits and save do not move the viewport');

      await closeFoto();
      const [singleId] = await importPhotos([single], false);
      assert.equal(await browser.evaluate(`Boolean(${marker(singleId)})`), false);
      await applyPhotoSourcePositions(browser, 'exif');
      await browser.waitFor(`${zoom} === 18 && ${pointsAreClear([singleId])}`);
      await shot('initial-position');

      await closeFoto();
      const closeIds = await importPhotos([closeWest, closeEast], true);
      // A1: a cluster just over 10 m (≈16 m here) fits at the general cap, z20.
      await browser.waitFor(`${zoom} === 20 && ${pointsAreClear(closeIds)}`);
      await shot('cluster-cap');
    } finally {
      await browser.close();
      if (path.dirname(path.resolve(directory)) !== root || !path.basename(directory).startsWith('photo-map-fit-ui-')) throw new Error('Unsafe temporary fixture directory');
      await rm(directory, { recursive: true, force: true });
    }
  });
