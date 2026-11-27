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
    assert.equal(await browser.evaluate('Boolean(document.querySelector(".photo-delivery-summary"))'), false);
      assert.match(await browser.evaluate('document.querySelector(".photo-delivery-counts").innerText'), /GML 9\b/);
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

    // Batch 2C: rotating Kum 2 proposes GML like a move (a GMI hyperlink cannot carry a direction); discard restores GMI.
    await select('Kum 2');
    await enterEditMode(browser);
    await rotateSelected(browser, 90);
    await browser.waitFor(`${rowOf('Kum 2')}.dataset.changed === 'true'`);
    await browser.waitFor(`${rowOf('Kum 2')}.querySelector('.photo-delivery-pill')?.innerText === 'GML'`);
    assert.match(await browser.evaluate(`${section}.querySelector('[data-delivery-proposed]')?.innerText || ''`), /retningen er endret/, 'rotation proposal explained in the inspector');
    await screenshot(browser, 'defaults-rotation-proposed-1366x768');
    await discardEdits(browser);
    assert.equal(await pill('Kum 2'), 'GMI', 'discarding the rotation restores GMI');

    // Move Kum 2 away from its GMI point: GML is proposed while editing, undo and discard restore GMI.
    await enterEditMode(browser);
    await dragSelectedMarker(browser, 90, 45);
    await browser.waitFor(`${rowOf('Kum 2')}.querySelector('.photo-delivery-pill')?.innerText === 'GML'`);
    assert(await browser.evaluate(`Boolean(${section}.querySelector('[data-delivery-proposed]'))`), 'proposal explained in the inspector');
    assert.equal(await browser.evaluate('Boolean(document.querySelector(".photo-delivery-summary"))'), false);
      assert.match(await browser.evaluate('document.querySelector(".photo-delivery-counts").innerText'), /GML 10\b/);
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

    // Saving commits position or direction and GML together: Kum 2 (moved) and, since Batch 2C, Kum 3 (rotated only).
    await enterEditMode(browser);
    await dragSelectedMarker(browser, 90, 45);
    await browser.waitFor(`${rowOf('Kum 2')}.querySelector('.photo-delivery-pill')?.innerText === 'GML'`);
    await select('Kum 3');
    await rotateSelected(browser, 45);
    await browser.waitFor(`${rowOf('Kum 3')}.querySelector('.photo-delivery-pill')?.innerText === 'GML'`);
    await saveEdits(browser);
    await browser.waitFor('document.querySelector(".photo-workspace-toast")?.innerText.includes("2 plasseringer overføres til GML")');
    assert.equal(await pill('Kum 2'), 'GML');
    assert.equal(await pill('Kum 3'), 'GML');
    assert.equal(await browser.evaluate('Boolean(document.querySelector(".photo-delivery-summary"))'), false);
      assert.match(await browser.evaluate('document.querySelector(".photo-delivery-counts").innerText'), /GML 11\b/);
    await select('Kum 2');
    assert.equal(await browser.evaluate(`Boolean(${section}.querySelector('[data-delivery-proposed]'))`), false, 'a committed choice, no longer a proposal');
    assert.match(await browser.evaluate(`${inspector}.innerText`), /Kum 2/, 'GMI object relationship kept');
    await screenshot(browser, 'defaults-move-saved-1366x768');

    // Batch 2C follow-up: «Fyll inn manglende» with a direction for two untouched GMI defaults (Kum 4, Kum 5, standard
    // 0°) transfers them to GML in the same write and says so; Kum 1 (not selected) stays GMI.
    const hub = 'document.querySelector(".photo-completion-dialog[open]")';
    const panel = `${hub}.querySelector('[data-completion-panel="direction"]')`;
    const form = `${panel}.querySelector('[data-manual-fill="direction"]')`;
    const hubRow = (name) => `Array.from(${hub}.querySelectorAll('[data-completion-row]')).find((item) => item.querySelector('.photo-completion-filename')?.innerText.includes(${JSON.stringify(name)}))`;
    assert.deepEqual([await pill('Kum 1'), await pill('Kum 4'), await pill('Kum 5')], ['GMI', 'GMI', 'GMI']);
    await click(browser, 'Fullfør opplysninger…', 'document');
    await browser.waitFor(hub);
    await browser.evaluate(`${hub}.querySelector('[data-task="direction"]').click()`);
    await browser.waitFor(panel);
    await browser.evaluate(`${panel}.querySelectorAll('[data-group] details, details[data-group]').forEach((item) => { item.open = true; })`);
    for (const name of ['foto-04.png', 'foto-05.png']) await browser.evaluate(`${hubRow(name)}.querySelector('input[type=checkbox]').click()`);
    await browser.evaluate(`${form}.open = true`);
    await browser.evaluate(`(() => { const input = ${form}.querySelector('input[type=number]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '45'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await browser.waitFor(`${form}.querySelector('button[type=submit]')?.innerText === 'Bruk på 2 valgte plasseringer'`);
    await browser.evaluate(`${form}.querySelector('button[type=submit]').click()`);
    const status = `${hub}.querySelector('.photo-import-footer [role=status]')?.innerText || ''`;
    await browser.waitFor(`(${status}).includes('godtatt for')`);
    assert.equal(await browser.evaluate(status), 'Manuell retning er godtatt for 2 plasseringer. 2 plasseringer overføres til GML, fordi retningen ikke kan leveres i GMI.');
    await screenshot(browser, 'defaults-bulk-direction-1366x768');
    await browser.evaluate(`${hub}.querySelector('.photo-import-footer .gmi-primary-control').click()`);
    await browser.waitFor(`!${hub}`);
    await browser.waitFor(`${rowOf('Kum 5')}.querySelector('.photo-delivery-pill')?.innerText === 'GML'`);
    assert.deepEqual([await pill('Kum 1'), await pill('Kum 4'), await pill('Kum 5')], ['GMI', 'GML', 'GML']);
    assert.match(await browser.evaluate('document.querySelector(".photo-delivery-counts").innerText'), /GML 13\b/);
    await select('Kum 4');
    assert.match(await browser.evaluate(`${inspector}.innerText`), /Retning 45° NØ/);
    assert.equal(await browser.evaluate(`Boolean(${section}.querySelector('[data-delivery-proposed]'))`), false, 'committed, not a proposal');
  } finally {
    await browser.close();
    if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('photo-delivery-defaults-ui-')) throw new Error('Unsafe temporary fixture directory');
    await rm(directory, { recursive: true, force: true });
  }
});
