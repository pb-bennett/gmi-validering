import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { completionGmlText } from './helpers/photoCompletionFixtures.mjs';
import { backToDelivery, buildPreview, canAdvance, canDownload, chooseFormat, closeExport, deliveryState, downloadZip, exportDialog, openCompletionFromExport, openExport, packageState, previewNames, returnToExport, selectedFormat, setLabel } from './helpers/photoExportWizard.mjs';
import { gpsJpeg } from './helpers/photoGpsFixtures.mjs';
import { addImportFiles, clickImport, createLayerWithoutPlacement, importDialog, retainGmlInWorkspace, waitForThumbnails } from './helpers/photoImportWizard.mjs';
import { applyPhotoSourcePositions, clickSourceControl } from './helpers/photoSourceWorkflow.mjs';
import { KEYS, commandBar, elementCentre, enterEditMode, pressKey } from './helpers/photoWorkspace.mjs';

// The two-screen export wizard in the real app: File objects, chunked exifr, native dialogs, trusted input and real downloads.
// The way to Fullfør opplysninger and back has its own suite, photoExportReturnUi.
const app = process.env.PHOTO_UI_URL;
const hub = 'document.querySelector(".photo-completion-dialog[open]")';
const button = (label) => `Array.from(${exportDialog}.querySelectorAll('button')).find((item) => item.innerText.trim() === ${JSON.stringify(label)})`;
const advance = `${exportDialog}.querySelector('[data-export-advance]')`;
const dialogText = (browser) => browser.evaluate(`${exportDialog}.innerText`);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// timed.jpg and blank.jpg have a position from the GML; only timed.jpg has a time. loose.jpg has no GML feature, so it stays unplaced.
const FILES = { 'timed.jpg': { captureTime: '2026:05:12 14:33:02' }, 'blank.jpg': {}, 'loose.jpg': { captureTime: '2026:05:12 16:00:00' } };
const FEATURES = [{ name: 'timed.jpg', time: '2026-05-12T14:33:02', direction: '45' }, { name: 'blank.jpg' }];

async function openApp(browser) {
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 900, deviceScaleFactor: 1, mobile: false });
  await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
  await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
  await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
}

async function buildLayer(browser, directory, { hold = false } = {}) {
  const paths = await Promise.all(Object.entries(FILES).map(async ([name, options]) => {
    const file = path.join(directory, name);
    await writeFile(file, gpsJpeg({ noLocation: true, ...options }));
    return file;
  }));
  const gml = path.join(directory, 'kilde.gml');
  await writeFile(gml, completionGmlText(FEATURES));
  await clickSourceControl(browser, 'Bilder', 'document');
  await browser.waitFor(importDialog);
  // exifr reads through FileReader, and the plan and package read through arrayBuffer, so this holds only the EXIF read.
  if (hold) await browser.evaluate(`(() => { const read = FileReader.prototype.readAsArrayBuffer; window.__heldReads = [];
    FileReader.prototype.readAsArrayBuffer = function (blob) { if (window.__heldReads) window.__heldReads.push(() => read.call(this, blob)); else read.call(this, blob); }; })()`);
  await addImportFiles(browser, paths);
  if (hold) {
    await waitForThumbnails(browser);
    await clickImport(browser, 'Neste');
    await browser.evaluate(`${importDialog}.querySelector('input[name="import-placement"][value="none"]').click()`);
    await clickImport(browser, await browser.evaluate(`${importDialog}.querySelector('.photo-import-footer .gmi-primary-control').textContent`));
    await browser.waitFor('!document.querySelector(".photo-collection-dialog[open]") && document.querySelector(".photo-workspace-shell")');
  } else await createLayerWithoutPlacement(browser);
  await retainGmlInWorkspace(browser, gml);
  await applyPhotoSourcePositions(browser, 'gml');
  await browser.waitFor(`document.querySelectorAll(".photo-camera-marker").length === ${FEATURES.length}`, 60000);
}

const layerTest = (name, run, { timeout = 240000, hold = false } = {}) => test(name, { skip: !chromePath || !app, timeout }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'photo-export-wizard-ui-'));
  const browser = await openTestChrome();
  try {
    await openApp(browser);
    await buildLayer(browser, directory, { hold });
    await run(browser, directory);
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});

const realClick = async (browser, expression) => {
  const { x, y } = await elementCentre(browser, expression);
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  return { x, y };
};

// Counts each hand-over to the browser, and holds file reads on request so a ZIP can be caught halfway. The plan reads files
// too, so the hold goes on after the plan is built.
const watchDownloads = (browser) => browser.evaluate(`(() => {
  window.__downloads = []; window.__blobs = [];
  const click = HTMLAnchorElement.prototype.click, createUrl = URL.createObjectURL;
  HTMLAnchorElement.prototype.click = function () { if (this.download) window.__downloads.push(this.download); click.call(this); };
  URL.createObjectURL = (blob) => { if (blob.type === 'application/zip') window.__blobs.push(blob); return createUrl.call(URL, blob); };
  const read = Blob.prototype.arrayBuffer;
  window.__fileReads = 0;
  Blob.prototype.arrayBuffer = function () { window.__fileReads++; return window.__heldFiles ? new Promise((resolve) => window.__heldFiles.push(resolve)).then(() => read.call(this)) : read.call(this); };
})()`);
const holdFiles = (browser) => browser.evaluate('window.__heldFiles = []');
const releaseFiles = (browser) => browser.evaluate(`(() => { const held = window.__heldFiles; window.__heldFiles = null; held.forEach((resume) => resume()); })()`);
const downloads = (browser) => browser.evaluate('window.__downloads');
const fileReads = (browser) => browser.evaluate('window.__fileReads');

layerTest('normal path: Gemini is chosen, the screens agree, and the same package can be downloaded again', async (browser, directory) => {
  await watchDownloads(browser);
  await openExport(browser);
  assert.equal(await browser.evaluate(`${exportDialog}.querySelector('h2').innerText`), 'Eksporter bilder');
  assert.equal(await selectedFormat(browser), 'gemini-legacy2019', 'selected by default');
  assert.equal(await browser.evaluate(`${exportDialog}.querySelector('.photo-export-more').open`), false, 'other formats stay folded');
  assert.equal(await browser.evaluate(`${exportDialog}.querySelector('[aria-current="step"]').innerText`), '1. Leveranse');
  assert.equal(await browser.evaluate(`${exportDialog}.querySelector('[aria-label="Eksport-CRS"]')`), null, 'Gemini is fixed at EPSG:5972');

  // The schema gap is stated and does not block.
  assert.equal(await deliveryState(browser), 'schema-gap');
  assert.match(await browser.evaluate(`${exportDialog}.querySelector('[data-export-warning="capture-time-schema"]').innerText`), /^1 bilde mangler full opptakstid,/);
  assert.equal(await browser.evaluate(`${exportDialog}.querySelector('[data-export-level="generation"] dd').innerText`), 'Kan lages');
  assert.equal(await browser.evaluate(`${advance}.innerText`), 'Fortsett uten opptakstid');
  assert.equal(await browser.evaluate(`${exportDialog}.querySelector('[data-export-excluded]').innerText`), '1 plassering mangler posisjon og blir ikke med.', 'not behind a disclosure');
  assert.equal(await browser.evaluate(`document.activeElement === ${exportDialog}.querySelector('[data-export-heading]')`), true, 'the answer gets focus');

  await browser.evaluate(`${advance}.click()`);
  await browser.waitFor(`${exportDialog}.querySelector('[data-package-state="ready"]')`);
  assert.equal(await browser.evaluate(`${exportDialog}.querySelector('[aria-current="step"]').innerText`), '2. Pakke');
  const names = await previewNames(browser);
  assert.match(names.zip, /^\d{8}-\d{6}\.zip$/);
  assert.equal(names.gml, names.zip.replace(/\.zip$/, '.gml'));
  const text = await dialogText(browser);
  for (const expected of [names.zip, names.gml, 'Gemini-kompatibel Skråfoto 2019', '2 bilder · 2 plasseringer i GML-filen', '1 plassering uten posisjon utelatt']) assert(text.includes(expected), expected);
  assert.match(await browser.evaluate(`${exportDialog}.querySelector('[data-export-format]').innerText`), /Importert i Gemini VA\/GeoFoto i testet oppsett/, 'a past import in a tested setup');
  assert.match(await browser.evaluate(`${exportDialog}.querySelector('[data-export-level="import"] dd').innerText`), /Ikke verifisert for denne pakken/, 'which says nothing about this package');
  assert(await browser.evaluate(`Boolean(${exportDialog}.querySelector('[data-export-warning="capture-time-schema"]'))`), 'the warning follows to the second screen');

  const first = await downloadZip(browser, directory);
  assert.deepEqual(Object.keys(first.entries).sort(), [first.gml, 'Attachments/blank.jpg', 'Attachments/timed.jpg'].sort());
  const done = await dialogText(browser);
  assert.match(done, /ZIP-pakken er klar/);
  assert(done.includes(first.zip), 'the downloaded name');
  assert.equal(await browser.evaluate(`${exportDialog}.querySelector('[data-export-warning="capture-time-schema"]').innerText`), '1 bilde mangler opptakstid. Pakken følger derfor ikke Skråfoto 2019-skjemaet.');
  assert.doesNotMatch(done, /Importer |Pakk ut ZIP-filen|nye ID-er|Kontroller resultatet i Gemini VA/, 'no import steps and no explanation of repeated downloads');
  assert.deepEqual(await browser.evaluate(`Array.from(${exportDialog}.querySelectorAll('.photo-import-footer button')).map((item) => item.innerText.trim())`), ['Last ned på nytt', 'Lukk']);
  assert.deepEqual(await previewNames(browser), { zip: first.zip, gml: first.gml });

  // Again: same plan, so the same name and the same bytes, identifiers included.
  await clickSourceControl(browser, 'Last ned på nytt', exportDialog);
  await browser.waitFor(`window.__downloads.length === 2 && ${exportDialog}.querySelector('[data-package-state="done"]')`);
  assert.deepEqual(await downloads(browser), [first.zip, first.zip]);
  assert.equal(await browser.evaluate(`(async () => { const [one, two] = await Promise.all(window.__blobs.map((blob) => blob.bytes())); return one.length === two.length && one.every((byte, index) => byte === two[index]); })()`), true);

  // Going back discards the plan, so the next one is a new delivery.
  await backToDelivery(browser);
  assert.equal(await browser.evaluate(`Boolean(${exportDialog}.querySelector('[data-export-zip]'))`), false);
  await delay(1100);
  await buildPreview(browser);
  assert.notEqual((await previewNames(browser)).zip, first.zip);
  await closeExport(browser);
});

layerTest('format, CRS and label stay for the session, a choice is never folded away, and blockers hold Neste', async (browser) => {
  await openExport(browser);
  await setLabel(browser, '  Grøft / nord  ');
  assert.match(await browser.evaluate(`${exportDialog}.querySelector('[data-export-name-format]').innerText`), /^Filnavn: ÅÅÅÅMMDD-TTmmss-Groeft-nord\.zip og \.gml\./);
  await setLabel(browser, '///');
  assert.match(await browser.evaluate(`${exportDialog}.querySelector('[data-export-name-format]').innerText`), /Bare tidspunktet brukes/);
  await setLabel(browser, 'Nord');

  await chooseFormat(browser, 'legacy2019');
  assert.equal(await browser.evaluate(`${exportDialog}.querySelector('.photo-export-more').open`), true);
  await browser.evaluate(`${exportDialog}.querySelector('.photo-export-more summary').click()`);
  await delay(50);
  assert.equal(await browser.evaluate(`${exportDialog}.querySelector('.photo-export-more').open`), true, 'the selected format cannot be folded away');
  const crs = `${exportDialog}.querySelector('[aria-label="Eksport-CRS"]')`;
  await browser.evaluate(`(() => { const select = ${crs}; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'EPSG:25833'); select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await browser.waitFor(`${crs}.value === 'EPSG:25833'`);

  // Legacy requires the time that Gemini only warns about, and the status follows at once.
  await browser.waitFor(`${exportDialog}.querySelector('[data-delivery-state="blocked"]')`);
  assert.equal(await browser.evaluate(`${exportDialog}.querySelector('[data-diagnostic-code="capture-time-required"] summary').innerText`), 'Mangler godtatt opptakstid — 1');
  assert.equal(await canAdvance(browser), false);
  assert.equal(await browser.evaluate(`Boolean(${exportDialog}.querySelector('[data-export-warning]'))`), false, 'required, so it blocks and is not a warning');
  assert.match(await browser.evaluate(`${exportDialog}.querySelector('.photo-import-footer [role=status]').innerText`), /Rett det som mangler for å gå videre/);
  assert.match(await browser.evaluate(`${exportDialog}.querySelector('[data-export-completion]').className`), /gmi-primary-control/, 'correcting is now the main action');

  await closeExport(browser);
  await openExport(browser);
  assert.equal(await selectedFormat(browser), 'legacy2019');
  assert.equal(await browser.evaluate(`${crs}.value`), 'EPSG:25833');
  assert.equal(await browser.evaluate(`${exportDialog}.querySelector('[aria-label="Eksportetikett"]').value`), 'Nord');
  assert.equal(await browser.evaluate(`JSON.stringify({ ...localStorage, ...sessionStorage }).includes('Nord')`), false, 'nothing reaches browser storage');
});

layerTest('Fullfør opplysninger replaces the wizard and stays open, and a double-click goes no further than one step', async (browser) => {
  await openExport(browser);
  // A double-click on Neste: the plan is ready within it, so the second click lands on Last ned ZIP in the same place.
  await watchDownloads(browser);
  const { x, y } = await realClick(browser, advance);
  await browser.waitFor(`${exportDialog}.querySelector('[data-package-state="ready"]')`);
  const { x: downloadX, y: downloadY } = await elementCentre(browser, button('Last ned ZIP'));
  assert(Math.abs(downloadX - x) < 60 && Math.abs(downloadY - y) < 10, 'the two buttons share a place, which is the risk');
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: downloadX, y: downloadY, button: 'left', buttons: 1, clickCount: 2 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: downloadX, y: downloadY, button: 'left', buttons: 0, clickCount: 2 });
  await delay(200);
  assert.equal(await packageState(browser), 'ready', 'the second click of a double-click is ignored');
  assert.deepEqual(await downloads(browser), []);
  await backToDelivery(browser);

  await realClick(browser, `${exportDialog}.querySelector('[data-export-completion]')`);
  await browser.waitFor(`${hub} && !${exportDialog}`);
  await delay(800);
  assert(await browser.evaluate(`Boolean(${hub})`), 'a late close event from the wizard does not close the hub');
  assert.equal(await browser.evaluate(`${hub}.querySelector('.photo-completion-target select').value`), 'gemini-legacy2019');
  await returnToExport(browser);
  await closeExport(browser);
  assert.equal(await browser.evaluate(`document.activeElement === document.querySelector('.photo-tools-trigger')`), true, 'focus returns to Verktøy');
});

layerTest('pending EXIF: no false blockers on any format, Neste waits, and the screen follows the read by itself', async (browser) => {
  await openExport(browser);
  assert.equal(await deliveryState(browser), 'reading');
  const noFalseBlocker = async (context) => {
    const text = await browser.evaluate(`${exportDialog}.textContent`);
    assert.match(await browser.evaluate(`${exportDialog}.querySelector('[data-export-heading]').innerText`), /^Leser bildedata …$/, context);
    assert.doesNotMatch(text, /må rettes|Kan ikke lages|Rett det som mangler/, context);
    assert.equal(await browser.evaluate(`${exportDialog}.querySelectorAll('[data-export-level], [data-export-warning], [data-export-blockers], [data-diagnostic-code]').length`), 0, context);
    assert.equal(await canAdvance(browser), false, context);
  };
  await noFalseBlocker('Gemini');
  assert(await browser.evaluate(`Boolean(${exportDialog}.querySelector('[data-export-status-reading]'))`));
  assert.match(await browser.evaluate(`${exportDialog}.querySelector('.photo-import-footer [role=status]').innerText`), /3 bilder er ikke ferdig lest\. Kontrollen oppdateres av seg selv\./, 'the unplaced photo counts too');
  assert.equal(await browser.evaluate(`${exportDialog}.querySelector('[data-export-excluded]').innerText`), '1 plassering mangler posisjon og blir ikke med.', 'still true while reading');
  assert.equal(await browser.evaluate(`${exportDialog}.querySelector('[data-export-completion]').disabled`), false, 'corrections stay available');
  await chooseFormat(browser, 'legacy2019');
  await noFalseBlocker('Legacy');
  await chooseFormat(browser, 'asbuilt52');
  await noFalseBlocker('AsBuilt');
  await chooseFormat(browser, 'gemini-legacy2019');

  // The hub shows the same component, so it holds back the same answer.
  await openCompletionFromExport(browser);
  await browser.evaluate(`${hub}.querySelector('[data-task="captureTime"]').click()`);
  await browser.waitFor(`${hub}.querySelector('[data-completion-panel="captureTime"] [data-export-status-reading]')`);
  assert.equal(await browser.evaluate(`${hub}.querySelectorAll('[data-export-level]').length`), 0);
  await returnToExport(browser);
  assert.equal(await deliveryState(browser), 'reading');
  await browser.evaluate(`(() => { const held = window.__heldReads; window.__heldReads = null; held.forEach((read) => read()); })()`);
  await browser.waitFor(`${exportDialog}.querySelector('[data-delivery-state]').dataset.deliveryState !== 'reading'`, 60000);
  assert.equal(await deliveryState(browser), 'schema-gap');
  assert(await canAdvance(browser), 'released without reopening');
  assert.equal(await browser.evaluate(`${exportDialog}.querySelector('[data-export-level="generation"] dd').innerText`), 'Kan lages');
  await buildPreview(browser);
  assert.equal(await packageState(browser), 'ready', 'a plan built after the read does not go stale');
}, { hold: true });

layerTest('pending EXIF in the hub: a neutral wait instead of a false blocker, on any format, and it settles with the hub still open', async (browser) => {
  const footer = `${hub}.querySelector('.photo-import-footer')`;
  const status = `${footer}.querySelector('[data-completion-status]')`;
  const waiting = async (context) => {
    assert.equal(await browser.evaluate(`${status}.dataset.completionStatus`), 'reading', context);
    assert.equal(await browser.evaluate(`${status}.innerText`), 'Leser bildedata …', context);
    assert.equal(await browser.evaluate(`${footer}.querySelector('[role=status]').innerText`), '3 bilder er ikke ferdig lest. Kontrollen oppdateres av seg selv.', context);
    assert.doesNotMatch(await browser.evaluate(`${hub}.innerText`), /må rettes|Kan ikke lages/, context);
  };
  await openExport(browser);
  await openCompletionFromExport(browser);
  await waiting('Gemini');
  const target = (value) => browser.evaluate(`(() => { const select = ${hub}.querySelector('.photo-completion-target select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(value)}); select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await target('legacy2019');
  await waiting('Legacy, where a missing time would block');
  await target('gemini-legacy2019');
  await browser.evaluate(`(() => { const held = window.__heldReads; window.__heldReads = null; held.forEach((read) => read()); })()`);
  await browser.waitFor(`${status}.dataset.completionStatus !== 'reading'`, 60000);
  assert.equal(await browser.evaluate(`${status}.dataset.completionStatus`), 'schema-gap', 'follows the read without reopening');
  assert.equal(await browser.evaluate(`${status}.innerText`), 'Kan eksporteres, men følger ikke Skråfoto 2019-skjemaet');
  assert.equal(await browser.evaluate(`${footer}.querySelector('[role=status]').innerText`), '', 'the wait is over');
  await returnToExport(browser);
  assert.equal(await deliveryState(browser), 'schema-gap');
}, { hold: true });

// The ticket stays registered after an invalid change. If the page forgets it, the session goes on holding metadata for this layer.
layerTest('a commit refused as invalid releases the edit session, so metadata held back during it arrives', async (browser) => {
  await browser.evaluate(`document.querySelector('.photo-workspace-list li[data-photo-id] .photo-workspace-row').click()`);
  await enterEditMode(browser);
  await browser.evaluate(`(() => { const bar = ${commandBar}; let fiber = bar[Object.keys(bar).find((key) => key.startsWith('__reactFiber'))];
    while (fiber && !fiber.memoizedProps?.onStage) fiber = fiber.return;
    const { onStage, photo } = fiber.memoizedProps; onStage(photo.id, 'position', { crs: 'EPSG:4326', longitude: 10.5, latitude: 59.5 }); })()`);
  await browser.evaluate(`(() => { const held = window.__heldReads; window.__heldReads = null; held.forEach((read) => read()); })()`);
  await delay(1500);
  // No screen can cause this, so position validation fails for this one click. photoExportReturnUi has the same fault.
  await browser.evaluate(`(() => { const finite = Number.isFinite; Number.isFinite = () => false; try { Array.from(${commandBar}.querySelectorAll('button')).find((item) => item.innerText.trim() === 'Lagre endringer' || item.getAttribute('aria-label') === 'Lagre endringer').click(); } finally { Number.isFinite = finite; } })()`);
  await browser.waitFor(`!${commandBar}`);
  assert.match(await browser.evaluate('document.body.innerText'), /Redigeringen ble avsluttet fordi fotolaget ble endret\./);
  await openExport(browser);
  assert.equal(await deliveryState(browser), 'schema-gap', 'blank.jpg got its default direction once the session was released');
}, { hold: true });

layerTest('closing during ZIP generation: the finished ZIP reaches no download, by any way of closing', async (browser) => {
  await watchDownloads(browser);
  const closings = {
    '✕': () => clickSourceControl(browser, 'Lukk eksport', exportDialog),
    Avbryt: () => clickSourceControl(browser, 'Avbryt', exportDialog),
    Escape: async () => { await browser.evaluate(`${exportDialog}.focus()`); await pressKey(browser, 'Escape', KEYS.Escape); },
  };
  for (const [name, close] of Object.entries(closings)) {
    await openExport(browser);
    await buildPreview(browser);
    await holdFiles(browser);
    const before = await fileReads(browser);
    await clickSourceControl(browser, 'Last ned ZIP', exportDialog);
    await browser.waitFor(`${exportDialog}.querySelector('[data-package-state="packaging"]')`);
    await browser.waitFor(`window.__heldFiles.length === 1`);
    assert.equal(await browser.evaluate(`${button('Last ned ZIP')}.disabled && ${button('Tilbake')}.disabled`), true, name);
    await close();
    await browser.waitFor(`!${exportDialog}`);
    await releaseFiles(browser);
    // The package reads and hashes both originals, so this waits until the abandoned ZIP has really finished.
    await browser.waitFor(`window.__fileReads >= ${before + 2}`);
    await delay(300);
    assert.deepEqual(await downloads(browser), [], name);
  }

  // The control: the same hold, left open, gives exactly one download.
  await openExport(browser);
  await buildPreview(browser);
  await holdFiles(browser);
  const { zip } = await previewNames(browser);
  await clickSourceControl(browser, 'Last ned ZIP', exportDialog);
  await browser.waitFor(`window.__heldFiles.length === 1`);
  await releaseFiles(browser);
  await browser.waitFor(`${exportDialog}.querySelector('[data-package-state="done"]')`);
  assert.deepEqual(await downloads(browser), [zip]);
});

layerTest('repeated clicks in one tick give one plan and one download', async (browser) => {
  await watchDownloads(browser);
  await openExport(browser);
  await browser.evaluate(`(() => { const next = ${advance}; next.click(); next.click(); next.click(); })()`);
  await browser.waitFor(`${exportDialog}.querySelector('[data-package-state="ready"]')`);
  await delay(200);
  assert.equal(await fileReads(browser), 2, 'two originals hashed once: a second plan would read them again');
  assert.equal(await packageState(browser), 'ready');
  const { zip } = await previewNames(browser);
  await browser.evaluate(`(() => { const download = ${button('Last ned ZIP')}; download.click(); download.click(); download.click(); })()`);
  await browser.waitFor(`${exportDialog}.querySelector('[data-package-state="done"]')`);
  await delay(300);
  assert.deepEqual(await downloads(browser), [zip]);
  assert.equal(await fileReads(browser), 4, 'one package');
});

layerTest('a change during Pakke removes the download, says so, and only an explicit click builds a new plan', async (browser) => {
  await watchDownloads(browser);
  await openExport(browser);
  await buildPreview(browser);
  const { zip } = await previewNames(browser);

  // The wizard is modal, so a person cannot get here. A script can, which changes accepted data the same way any late event would.
  await clickSourceControl(browser, 'Fjern bilder fra laget', 'document');
  await browser.waitFor('document.querySelector(".photo-removal-bar")');
  await browser.evaluate(`document.querySelector('.photo-workspace-list input').click()`);
  await browser.evaluate('document.querySelector(".photo-removal-primary").click()');
  await browser.waitFor('document.querySelector(".photo-remove-confirmation[open]")');
  await clickSourceControl(browser, 'Fjern fra lag', 'document.querySelector(".photo-remove-confirmation")');

  await browser.waitFor(`${exportDialog}.querySelector('[data-package-state="stale"]')`);
  assert.match(await browser.evaluate(`${exportDialog}.querySelector('[role=alert]').innerText`), /Bildene er endret etter at forhåndsvisningen ble laget\./);
  assert.equal(await canDownload(browser), false);
  assert.equal(await browser.evaluate(`Boolean(${exportDialog}.querySelector('[data-export-zip]'))`), false, 'no name from a plan that no longer applies');
  await delay(1100);
  assert.equal(await packageState(browser), 'stale', 'not rebuilt silently');

  await clickSourceControl(browser, 'Oppdater forhåndsvisning', exportDialog);
  await browser.waitFor(`${exportDialog}.querySelector('[data-package-state="ready"]')`);
  assert.notEqual((await previewNames(browser)).zip, zip, 'a new plan is a new package');
  assert(await canDownload(browser));
});
