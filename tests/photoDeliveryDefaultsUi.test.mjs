// FOTO correctness slice 1, production browser: GML positioning assigns GML (5 GMI + 9 GML round trip), a saved move away
// from the GMI point proposes and commits GML, and delivery filters react at once.
// Synthetic files only. Needs PHOTO_UI_URL (a running production build); saves screenshots with PHOTO_SCREENSHOT_DIR.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { gpsPng } from './helpers/photoGpsFixtures.mjs';
import { gmiFile } from './helpers/gmiPhotoFixtures.mjs';
import { exportFixture } from './helpers/photoExportFixtures.mjs';
import { serializePhotoExport } from '../src/lib/photos/export/photoExportXml.mjs';
import { createLayerWithoutPlacement, waitForThumbnails } from './helpers/photoImportWizard.mjs';
import { applyPhotoSourcePositions, clickSourceControl as click, savePhotoSource, setPhotoFiles, stagePhotoSource } from './helpers/photoSourceWorkflow.mjs';
import { commandBar, discardEdits, dragSelectedMarker, enterEditMode, rotateSelected, saveEdits } from './helpers/photoWorkspace.mjs';

const app = process.env.PHOTO_UI_URL;
const names = Array.from({ length: 14 }, (_, index) => `foto-${String(index + 1).padStart(2, '0')}.png`);
const GMI_NAMES = names.slice(0, 5), GML_NAMES = names.slice(5);
const inspector = 'document.querySelector(".photo-workspace-inspector")';
const section = `${inspector}.querySelector('section[aria-label="Samlet levering"]')`;
const rows = 'Array.from(document.querySelectorAll(".photo-workspace-list li[data-photo-id]"))';
const rowOf = (text) => `${rows}.find((row) => row.innerText.includes(${JSON.stringify(text)}))`;
const screenshot = async (browser, name) => {
  if (!process.env.PHOTO_SCREENSHOT_DIR) return;
  await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive: true });
  const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(process.env.PHOTO_SCREENSHOT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
};

test('FOTO delivery defaults: GML round trip, move away from GMI point, immediate delivery filters', { skip: !chromePath || !app, timeout: 300000 }, async () => {
  const directory = await mkdtemp(path.join(path.resolve(tmpdir()), 'photo-delivery-defaults-ui-'));
  const browser = await openTestChrome();
  const files = names.map((name) => path.join(directory, name));
  const gmiPath = path.join(directory, 'revidert.gmi'), gmlPath = path.join(directory, 'skraafoto.gml');
  await Promise.all(files.map((file) => writeFile(file, gpsPng())));
  await writeFile(gmiPath, Buffer.from(await gmiFile(GMI_NAMES.map((name, index) => ({ guid: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    label: `Kum ${index + 1}`, hyperlink: `h:1(link:"Attachments\\${name}") `, xyz: `${581930 + index * 20} ${6566000 + index * 20} 1` }))).arrayBuffer()));
  // The application's own Skråfoto GML for the nine photographs without a GMI link.
  const fixture = await exportFixture({ names: GML_NAMES });
  await writeFile(gmlPath, serializePhotoExport(await fixture.plan()));
  const pill = (text) => browser.evaluate(`${rowOf(text)}?.querySelector('.photo-delivery-pill')?.innerText || null`);
  const pills = () => browser.evaluate(`${rows}.map((row) => row.querySelector('.photo-delivery-pill')?.innerText)`);
  const tally = (list) => list.reduce((counts, label) => ({ ...counts, [label]: (counts[label] || 0) + 1 }), {});
  const select = async (text) => {
    await browser.evaluate(`${rowOf(text)}.querySelector('button.photo-workspace-row').click()`);
    await browser.waitFor(`${rowOf(text)}.querySelector('button.photo-workspace-row').getAttribute('aria-pressed')==='true' && ${section}`);
  };
  const markerIds = () => browser.evaluate('Array.from(document.querySelectorAll(".leaflet-photo-markers-pane .leaflet-marker-icon[data-photo-id]")).map((e) => e.dataset.photoId)');
  const filterDelivery = async (key) => {
    if (!await browser.evaluate('Boolean(document.querySelector(".photo-filter-panel"))')) {
      await browser.evaluate('document.querySelector("button[aria-label^=\'Filtrer bilder\']").click()');
      await browser.waitFor('document.querySelector(".photo-filter-panel")');
    }
    await browser.evaluate(`document.querySelector('.photo-filter-panel input[value="${key}"][name$="-delivery"]').click()`);
  };
  const deliveryOptions = () => browser.evaluate(`Array.from(document.querySelectorAll('.photo-filter-panel fieldset')).find((item) => item.querySelector('legend').innerText==='Leveringsvalg').innerText`);
  try {
    await browser.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear();' });
    await browser.send('Page.navigate', { url: app + '?testmodus=1' });
    await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
    await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
    await click(browser, 'Bilder', 'document');
    await setPhotoFiles(browser, 'input[aria-label="Velg bildefiler"]', files);
    await waitForThumbnails(browser);
    await createLayerWithoutPlacement(browser);

    // Revised GMI: five linked photographs receive their GMI positions; nine stay unplaced and «Ikke».
    await stagePhotoSource(browser, gmiPath, 'gmi');
    await savePhotoSource(browser, 'gmi');
    await applyPhotoSourcePositions(browser, 'gmi');
    await browser.waitFor(`${rows}.length === 14`);
    assert.deepEqual(tally(await pills()), { GMI: 5, Ikke: 9 });

    // The exported Skråfoto GML: all nine positions match and «Bruk valgte posisjoner» makes them GML.
    await stagePhotoSource(browser, gmlPath, 'gml');
    await savePhotoSource(browser, 'gml');
    await applyPhotoSourcePositions(browser, 'gml');
    await browser.waitFor(`${rows}.filter((row) => row.querySelector('.photo-delivery-pill')?.innerText === 'GML').length === 9`);
    assert.deepEqual(tally(await pills()), { GMI: 5, GML: 9 });
    for (const name of GMI_NAMES) assert.equal(await pill(name), 'GMI', `${name} stays GMI`);
    for (const name of GML_NAMES) assert.equal(await pill(name), 'GML', `${name} is GML`);
    assert.equal(await browser.evaluate('document.querySelector(".photo-delivery-summary")?.innerText'), 'Samlet levering: 9 tas med uten GMI-lenke');
    await screenshot(browser, 'defaults-gml-roundtrip-1366x768');

    // Filter «Beholdes i GMI»: a selected photograph changed to GML leaves the list, its pinned section and the map at once.
    await select('Kum 1');
    const kum1 = await browser.evaluate(`${rowOf('Kum 1')}.dataset.photoId`);
    await filterDelivery('keep-link');
    await browser.waitFor(`${rows}.length === 5`);
    assert((await deliveryOptions()).includes('GMI (5)'));
    await browser.evaluate(`${rowOf('Kum 1')}.querySelector('.photo-delivery-row-button').click()`);
    await browser.waitFor(`${rows}.length === 4`);
    assert.equal(await browser.evaluate('Boolean(document.querySelector(".photo-workspace-pinned-heading"))'), false, 'no «Valgt bilde (skjult av filteret)»');
    assert.equal(await browser.evaluate(`Boolean(${rowOf('Kum 1')})`), false);
    assert((await deliveryOptions()).includes('GMI (4)'));
    // Slice 2: one GML choice for both GML statuses (9 tas med uten lenke + 1 overføres).
    assert((await deliveryOptions()).includes('GML (10)'));
    assert.equal((await markerIds()).includes(kum1), false, 'the map follows the list');
    assert.equal(await browser.evaluate(`${section}.dataset.deliveryStatus`), 'transfer', 'still selected in the inspector');
    await screenshot(browser, 'defaults-filter-left-1366x768');
    // Back to GMI from the inspector: it matches again and returns to the list.
    await browser.evaluate(`${section}.querySelector('[role=radio][data-destination="gmi"]').click()`);
    await browser.waitFor(`${rows}.length === 5 && Boolean(${rowOf('Kum 1')})`);
    await filterDelivery('all');
    await browser.waitFor(`${rows}.length === 14`);
    await browser.evaluate('document.querySelector("button[aria-label^=\'Filtrer bilder\']").click()');
    await browser.waitFor('!document.querySelector(".photo-filter-panel")');

    // Move Kum 2 away from its GMI point: GML is proposed while editing, undo and discard restore GMI.
    await select('Kum 2');
    await enterEditMode(browser);
    await rotateSelected(browser, 90);
    await browser.waitFor(`${rowOf('Kum 2')}.dataset.changed === 'true'`);
    assert.equal(await pill('Kum 2'), 'GMI', 'rotation alone keeps GMI');
    await dragSelectedMarker(browser, 90, 45);
    await browser.waitFor(`${rowOf('Kum 2')}.querySelector('.photo-delivery-pill')?.innerText === 'GML'`);
    assert(await browser.evaluate(`Boolean(${section}.querySelector('[data-delivery-proposed]'))`), 'proposal explained in the inspector');
    assert.equal(await browser.evaluate('document.querySelector(".photo-delivery-summary")?.innerText'), 'Samlet levering: 1 overføres til GML · 9 tas med uten GMI-lenke');
    for (const [width, height] of [[1280, 720], [1366, 768]]) {
      await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      assert(await browser.evaluate(`['.photo-workspace-collection', '.photo-workspace-inspector'].every((selector) => { const e = document.querySelector(selector); return e && e.scrollWidth <= e.clientWidth + 1; })`));
      await screenshot(browser, `defaults-move-proposed-${width}x${height}`);
    }
    await browser.evaluate(`${commandBar}.querySelector('[aria-label="Angre"]').click()`);
    await browser.waitFor(`${rowOf('Kum 2')}.querySelector('.photo-delivery-pill')?.innerText === 'GMI'`);
    assert.equal(await browser.evaluate(`Boolean(${section}.querySelector('[data-delivery-proposed]'))`), false, 'undo removes the proposal');
    await dragSelectedMarker(browser, 90, 45);
    await browser.waitFor(`${rowOf('Kum 2')}.querySelector('.photo-delivery-pill')?.innerText === 'GML'`);
    await discardEdits(browser);
    assert.equal(await pill('Kum 2'), 'GMI', 'discard restores GMI');

    // Saving the move commits position and GML together; Kum 3 (rotated only) stays GMI.
    await enterEditMode(browser);
    await dragSelectedMarker(browser, 90, 45);
    await browser.waitFor(`${rowOf('Kum 2')}.querySelector('.photo-delivery-pill')?.innerText === 'GML'`);
    await select('Kum 3');
    await rotateSelected(browser, 45);
    await saveEdits(browser);
    await browser.waitFor('document.querySelector(".photo-workspace-toast")?.innerText.includes("overføres til GML")');
    assert.equal(await pill('Kum 2'), 'GML');
    assert.equal(await pill('Kum 3'), 'GMI');
    assert.equal(await browser.evaluate('document.querySelector(".photo-delivery-summary")?.innerText'), 'Samlet levering: 1 overføres til GML · 9 tas med uten GMI-lenke');
    await select('Kum 2');
    assert.equal(await browser.evaluate(`Boolean(${section}.querySelector('[data-delivery-proposed]'))`), false, 'a committed choice, no longer a proposal');
    assert.match(await browser.evaluate(`${inspector}.innerText`), /Kum 2/, 'GMI object relationship kept');
    await screenshot(browser, 'defaults-move-saved-1366x768');
  } finally {
    await browser.close();
    if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('photo-delivery-defaults-ui-')) throw new Error('Unsafe temporary fixture directory');
    await rm(directory, { recursive: true, force: true });
  }
});
