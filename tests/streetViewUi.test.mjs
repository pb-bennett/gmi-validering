import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { gmiText } from './helpers/gmiPhotoFixtures.mjs';
import { gpsPng } from './helpers/photoGpsFixtures.mjs';
import { createLayerWithPlacement, importDialog, waitForThumbnails } from './helpers/photoImportWizard.mjs';
import { clickSourceControl, setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { editTarget, enterEditMode } from './helpers/photoWorkspace.mjs';

// Batch F in the real app. window.open is replaced by a recorder, so nothing reaches Google: the test checks the URL
// the app would open, that the map is not selected or panned by the gesture, and the pointer-free alternative.
const app = process.env.PHOTO_UI_URL;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const control = 'document.querySelector(".gmi-street-view")';
const button = `${control}?.querySelector('button[aria-label="Google Street View"]')`;
const visibleSurveyPoint = `Array.from(document.querySelectorAll('.leaflet-marker-pane .leaflet-marker-icon.leaflet-interactive')).find(marker => {
  const r = marker.getBoundingClientRect();
  return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.leaflet-marker-icon') === marker;
})`;
const URL_PATTERN = /^https:\/\/www\.google\.com\/maps\/@\?api=1&map_action=pano&viewpoint=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/;

for (const [width, height] of [[1280, 720], [1366, 768]]) test(`Street View from the shared map at ${width}×${height}`, { skip: !app || !chromePath, timeout: 180000 }, async () => {
  const directory = await mkdtemp(path.join(path.resolve(tmpdir()), 'street-view-ui-'));
  const browser = await openTestChrome();
  const click = (label, scope = 'document') => clickSourceControl(browser, label, scope);
  const opened = () => browser.evaluate('window.__streetViewOpens.slice()');
  const centre = (expression) => browser.evaluate(`(() => { const r = (${expression}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const mapPoint = (fx, fy) => browser.evaluate(`(() => { const r = document.querySelector('.leaflet-container').getBoundingClientRect(); return { x: Math.round(r.left + r.width * ${fx}), y: Math.round(r.top + r.height * ${fy}) }; })()`);
  const mouse = async (type, { x, y }, buttons = 0) => browser.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? (buttons ? 'left' : 'none') : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
  const realClick = async (point) => { await mouse('mousePressed', point, 1); await mouse('mouseReleased', point); };
  // Enter needs its text to activate a focused button, as a real key press does.
  const key = async (name, code) => { for (const type of ['keyDown', 'keyUp']) await browser.send('Input.dispatchKeyEvent', { type, key: name, code: name, windowsVirtualKeyCode: code, ...(type === 'keyDown' && name === 'Enter' ? { text: '\r' } : {}) }); };
  const viewport = () => browser.evaluate(`({ zoom: document.body.innerText.match(/Zoom: (\\d+(?:\\.\\d+)?)/)?.[1] ?? null, pane: document.querySelector('.leaflet-map-pane').style.transform })`);
  const assertOpenedNear = (url) => {
    const match = URL_PATTERN.exec(url);
    assert(match, url);
    const [latitude, longitude] = [Number(match[1]), Number(match[2])];
    assert(latitude > 59 && latitude < 61 && longitude > 8 && longitude < 12, `a position in the loaded area (${latitude}, ${longitude})`);
  };
  const shot = async (stage) => {
    const target = process.env.PHOTO_SCREENSHOT_DIR;
    if (!target) return;
    await mkdir(target, { recursive: true });
    const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(target, `f-street-view-${stage}-${width}x${height}.png`), Buffer.from(data, 'base64'));
  };
  try {
    const tile = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS3cAAAAASUVORK5CYII=';
    await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.clear();
      window.__streetViewOpens = []; window.__blockPopups = false;
      window.open = (url, target) => { window.__streetViewOpens.push(String(url)); return window.__blockPopups ? null : { opener: window, target }; };
      const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      Object.defineProperty(HTMLImageElement.prototype, 'src', { ...source, set(value) {
        source.set.call(this, String(value).includes('cache.kartverket.no/') ? ${JSON.stringify(tile)} : value);
      } });` });
    await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
    await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
    await click('Lukk');
    const survey = path.join(directory, 'Gate.gmi');
    await writeFile(survey, gmiText([{ label: 'Kum A', xyz: '597000 6643000 100' }, { label: 'Kum B', xyz: '597040 6643030 100' }]));
    await setPhotoFiles(browser, 'input[type=file]', [survey]);
    await browser.waitFor(`document.querySelector("[data-gmi-edit-action]") && ${button}`);
    await delay(800);
    const before = await viewport();
    assert.deepEqual(await opened(), [], 'nothing is opened or sent before an explicit action');

    // Click, then a map click: consumed by Street View, so no feature popup, inspector or selection opens.
    await realClick(await centre(button));
    await browser.waitFor(`${button}.getAttribute('aria-pressed') === 'true' && ${control}.querySelector('[role=group]')`);
    assert.equal(await browser.evaluate(`document.querySelector('.leaflet-container').classList.contains('gmi-street-view-picking')`), true);
    await shot('picking');
    await browser.waitFor(visibleSurveyPoint);
    await realClick(await centre(visibleSurveyPoint));
    await browser.waitFor(`${button}.getAttribute('aria-pressed') === 'false'`);
    assert.equal((await opened()).length, 1);
    assertOpenedNear((await opened())[0]);
    await delay(300);
    assert.equal(await browser.evaluate('Boolean(document.querySelector(".leaflet-popup"))'), false, 'no feature popup');
    assert.deepEqual(await viewport(), before, 'no pan or zoom');

    // Keyboard: Enter starts picking and focuses «Bruk kartets midtpunkt»; Enter opens the map centre.
    await browser.evaluate(`${button}.focus()`);
    await key('Enter', 13);
    await browser.waitFor(`document.activeElement?.innerText === 'Bruk kartets midtpunkt'`);
    await key('Enter', 13);
    await browser.waitFor('window.__streetViewOpens.length === 2');
    assertOpenedNear((await opened())[1]);
    // Escape cancels without opening anything.
    await browser.evaluate(`${button}.focus()`);
    await key('Enter', 13);
    await browser.waitFor(`${button}.getAttribute('aria-pressed') === 'true'`);
    await key('Escape', 27);
    await browser.waitFor(`${button}.getAttribute('aria-pressed') === 'false'`);
    assert.equal((await opened()).length, 2);

    // Drag and drop onto the map.
    const start = await centre(button), drop = await mapPoint(0.55, 0.5);
    await mouse('mousePressed', start, 1);
    for (let step = 1; step <= 8; step++) await mouse('mouseMoved', { x: start.x + (drop.x - start.x) * step / 8, y: start.y + (drop.y - start.y) * step / 8 }, 1);
    assert.equal(await browser.evaluate(`${control}.dataset.streetView`), 'dragging');
    assert(await browser.evaluate('Boolean(document.querySelector(".gmi-street-view-ghost"))'));
    await shot('dragging');
    await mouse('mouseReleased', drop);
    await browser.waitFor('window.__streetViewOpens.length === 3');
    assertOpenedNear((await opened())[2]);
    assert.equal(await browser.evaluate(`${button}.getAttribute('aria-pressed')`), 'false', 'a drop does not leave pick mode on');
    assert.deepEqual(await viewport(), before, 'the drag never panned the map');

    // A drop outside the map is cancelled and explained.
    const outside = await browser.evaluate(`(() => { const r = document.querySelector('.leaflet-container').getBoundingClientRect(); return { x: Math.max(4, r.left - 40), y: r.top + 200 }; })()`);
    await mouse('mousePressed', start, 1);
    for (let step = 1; step <= 6; step++) await mouse('mouseMoved', { x: start.x + (outside.x - start.x) * step / 6, y: start.y + (outside.y - start.y) * step / 6 }, 1);
    await mouse('mouseReleased', outside);
    await browser.waitFor(`${control}.querySelector('[data-street-view-notice]')`);
    assert.equal(await browser.evaluate(`${control}.querySelector('[data-street-view-notice] p').innerText`), 'Slipp symbolet på kartet for å åpne Street View der.');
    assert.equal((await opened()).length, 3);

    // A blocked tab offers an explicit link with the same URL instead.
    await browser.evaluate('window.__blockPopups = true');
    await realClick(start);
    await browser.waitFor(`${button}.getAttribute('aria-pressed') === 'true'`);
    await realClick(await mapPoint(0.5, 0.65));
    await browser.waitFor(`${control}.querySelector('[data-street-view-notice] a')`);
    const blocked = await browser.evaluate(`({ text: ${control}.querySelector('[data-street-view-notice] p').innerText, href: ${control}.querySelector('[data-street-view-notice] a').href,
      rel: ${control}.querySelector('[data-street-view-notice] a').rel, target: ${control}.querySelector('[data-street-view-notice] a').target })`);
    assert.equal(blocked.text, 'Nettleseren blokkerte den nye fanen.');
    assert.equal(blocked.href, (await opened())[3]);
    assert.deepEqual([blocked.rel, blocked.target], ['noopener noreferrer', '_blank']);
    await shot('blocked');
    await browser.evaluate('window.__blockPopups = false');

    // Rettinger object selection and editing also stay isolated from the pick.
    await browser.evaluate('document.querySelector("[data-gmi-edit-action]").click()');
    const rettinger = 'document.querySelector(".gmi-edit-workspace")';
    await browser.waitFor(`${rettinger} && ${button}`);
    await delay(450);
    const editState = () => browser.evaluate(`({
      inspector: document.querySelector('.gmi-edit-inspector')?.innerText ?? null,
      selected: Array.from(document.querySelectorAll('.gmi-edit-workspace [aria-current=true], .gmi-edit-workspace [aria-selected=true]')).map(el => el.innerText),
      counts: ${rettinger}.querySelector('[data-gmi-edit-counts]')?.innerText ?? null,
      unsaved: Boolean(${rettinger}.querySelector('[data-download-state=unsaved]'))
    })`);
    // Opening the inspector narrows the map at laptop sizes. Use the map controls if the points are outside it.
    for (let i = 0; i < 2 && !await browser.evaluate(`Boolean(${visibleSurveyPoint})`); i++) {
      await realClick(await centre('document.querySelector(".leaflet-control-zoom-out")'));
      await delay(450);
    }
    await browser.waitFor(visibleSurveyPoint);
    const beforeRettingerPick = await editState();
    await realClick(await centre(button));
    await browser.waitFor(`${button}.getAttribute('aria-pressed') === 'true'`);
    await realClick(await centre(visibleSurveyPoint));
    await browser.waitFor('window.__streetViewOpens.length === 5');
    assert.deepEqual(await editState(), beforeRettingerPick);
    assert.equal(await browser.evaluate('Boolean(document.querySelector(".leaflet-popup"))'), false);
    await click('Lukk Rettinger');
    await browser.waitFor(`!${rettinger}`);

    // The same control in the FOTO workspace map.
    const photo = path.join(directory, 'a.png');
    await writeFile(photo, gpsPng());
    await click('Bilder');
    await browser.waitFor(importDialog);
    await setPhotoFiles(browser, 'input[aria-label="Velg bildefiler"]', [photo]);
    await waitForThumbnails(browser);
    await browser.waitFor(`${importDialog}.dataset.exifPending === '0'`);
    await createLayerWithPlacement(browser, 'exif');
    await browser.waitFor(`document.querySelector(".photo-workspace-shell") && ${button} && document.querySelector('.leaflet-photo-markers-pane .leaflet-marker-icon')`);
    await delay(800); // the initial fit after import settles before the marker position is read
    const selectedBefore = await browser.evaluate('document.querySelector(".photo-workspace-list .photo-workspace-row[aria-pressed=true]")?.closest("li")?.dataset.photoId ?? null');
    await realClick(await centre(button));
    await browser.waitFor(`${button}.getAttribute('aria-pressed') === 'true'`);
    const marker = await browser.evaluate(`(() => { const m = document.querySelector('.leaflet-photo-markers-pane .leaflet-marker-icon'); if (!m) return null; const r = m.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const target = marker || await mapPoint(0.5, 0.5);
    const under = await browser.evaluate(`(() => { const e = document.elementFromPoint(${target.x}, ${target.y}); return e ? e.className?.baseVal ?? e.className : null; })()`);
    await realClick(target);
    await browser.waitFor('window.__streetViewOpens.length === 6').catch((error) => { throw new Error(`${error.message} (marker ${JSON.stringify(marker)}, element ${under})`); });
    assert.match((await opened())[5], URL_PATTERN);
    assert.equal(await browser.evaluate('document.querySelector(".photo-workspace-list .photo-workspace-row[aria-pressed=true]")?.closest("li")?.dataset.photoId ?? null'), selectedBefore, 'a photo marker under the point is not selected');
    assert.equal(await browser.evaluate('Boolean(document.querySelector(".photo-workspace-map-preview"))'), false, 'and no preview opens');

    // The FOTO placement handler captures on the map container. The pick must win even though that handler
    // was installed first. A subsequent normal click still belongs to FOTO.
    await enterEditMode(browser);
    await browser.waitFor(editTarget);
    await click('Flytt med klikk');
    const placementActive = 'document.querySelector(".leaflet-container").classList.contains("photo-edit-click-move")';
    await browser.waitFor(placementActive);
    const placementPoint = await mapPoint(0.6, 0.65);
    await realClick(await centre(button));
    await browser.waitFor(`${button}.getAttribute('aria-pressed') === 'true'`);
    assert(await browser.evaluate(placementActive), 'the Street View button did not place the photo');
    await key('Escape', 27);
    await browser.waitFor(`${button}.getAttribute('aria-pressed') === 'false'`);
    assert(await browser.evaluate(placementActive), 'Escape cancelled the pick and kept the FOTO placement mode');
    await realClick(await centre(button));
    await browser.waitFor(`${button}.getAttribute('aria-pressed') === 'true'`);
    await realClick(placementPoint);
    await browser.waitFor('window.__streetViewOpens.length === 7');
    assert(await browser.evaluate(placementActive), 'the pick did not place the photo or leave click-to-move');
    await realClick(placementPoint);
    await browser.waitFor(`!(${placementActive})`);
    assert.equal((await opened()).length, 7);
    assert.deepEqual(browser.events.filter((event) => event.method === 'Runtime.exceptionThrown').map((event) => event.params.exceptionDetails.text), []);
  } finally {
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});
