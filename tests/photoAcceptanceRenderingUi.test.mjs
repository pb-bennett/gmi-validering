import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { completionGmlText } from './helpers/photoCompletionFixtures.mjs';
import { buildPreview, downloadZip, exportDialog, openCompletionFromExport, openExport } from './helpers/photoExportWizard.mjs';
import { gpsJpeg } from './helpers/photoGpsFixtures.mjs';
import { addImportFiles, createLayerWithoutPlacement, importDialog, retainGmlInWorkspace } from './helpers/photoImportWizard.mjs';
import { applyPhotoSourcePositions, clickSourceControl, savePhotoSource, sourceWizard, stagePhotoSource } from './helpers/photoSourceWorkflow.mjs';
import { openTool } from './helpers/photoWorkspace.mjs';

// Browser acceptance found two corrections apparently missing from the rendered UI. These tests read the text the browser
// actually renders on those screens, not helper output, and do the same for the positioning review explanations.
const app = process.env.PHOTO_UI_URL;
const hub = 'document.querySelector(".photo-completion-dialog[open]")';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const screenshot = async (browser, name) => {
  if (!process.env.PHOTO_SCREENSHOT_DIR) return;
  await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive: true });
  const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(process.env.PHOTO_SCREENSHOT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
};
const setSelect = (browser, selector, value) => browser.evaluate(`(() => { const element = ${selector};
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event('change', { bubbles: true })); })()`);
const OLD_COPY = /valgfritt for Gemini|ZIP-pakken er laget og sendt|Importer .* i Gemini VA|Pakk ut ZIP-filen|Last ned på nytt gir|nye ID-er/;

async function openApp(browser) {
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
  await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
  await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
}
async function importPhotos(browser, directory, files) {
  const paths = await Promise.all(Object.entries(files).map(async ([name, options]) => {
    const file = path.join(directory, name);
    await writeFile(file, gpsJpeg(options));
    return file;
  }));
  await clickSourceControl(browser, 'Bilder', 'document');
  await browser.waitFor(importDialog);
  await addImportFiles(browser, paths);
  await createLayerWithoutPlacement(browser);
}
const browserTest = (name, run) => test(name, { skip: !chromePath || !app, timeout: 240000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'photo-acceptance-rendering-'));
  const browser = await openTestChrome();
  try { await openApp(browser); await run(browser, directory); } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});

// timed.jpg has a time from GML; blank.jpg has none anywhere, so it is the one missing capture time.
const TIME_FILES = { 'timed.jpg': { noLocation: true, captureTime: '2026:05:12 14:33:02' }, 'blank.jpg': { noLocation: true } };
const TIME_FEATURES = [{ name: 'timed.jpg', time: '2026-05-12T14:33:02', direction: '45' }, { name: 'blank.jpg', direction: '90' }];
async function timeLayer(browser, directory) {
  await importPhotos(browser, directory, TIME_FILES);
  const gml = path.join(directory, 'kilde.gml');
  await writeFile(gml, completionGmlText(TIME_FEATURES));
  await retainGmlInWorkspace(browser, gml);
  await applyPhotoSourcePositions(browser, 'gml');
  await browser.waitFor(`document.querySelectorAll(".photo-camera-marker").length >= 2`, 60000);
}
const missingHint = (browser) => browser.evaluate(`${hub}.querySelector('[data-completion-panel="captureTime"] details[data-group="none"] .photo-completion-requirement-note').innerText`);
const showTimeTask = async (browser) => {
  await browser.evaluate(`${hub}.querySelector('[data-task="captureTime"]').click()`);
  await browser.waitFor(`${hub}.querySelector('[data-completion-panel="captureTime"] details[data-group="none"]')`);
};

browserTest('rendered hub: the missing-time explanation follows Mål, and Standard never calls the time optional', async (browser, directory) => {
  await timeLayer(browser, directory);
  const expected = {
    'gemini-legacy2019': 'Ingen kilde har en brukbar tid. Eksporten kan lages uten, men GML-filen følger da ikke Skråfoto 2019-skjemaet.',
    legacy2019: 'Ingen kilde har en brukbar tid. Opptakstid med sekunder kreves for Skråfoto 2019, og må fylles ut før eksport.',
    asbuilt52: 'Ingen kilde har en brukbar tid. Opptakstid med sekunder kreves for AsBuilt 5.2, og må fylles ut før eksport.',
  };
  // The route from acceptance: the hub opened from export.
  await openExport(browser);
  await openCompletionFromExport(browser);
  await showTimeTask(browser);
  assert.equal(await missingHint(browser), expected['gemini-legacy2019']);
  for (const target of ['legacy2019', 'asbuilt52', 'gemini-legacy2019', 'legacy2019']) {
    await setSelect(browser, `${hub}.querySelector('.photo-completion-target select')`, target);
    await browser.waitFor(`${hub}.querySelector('.photo-completion-target select').value === ${JSON.stringify(target)}`);
    await showTimeTask(browser);
    assert.equal(await missingHint(browser), expected[target], target);
    assert.doesNotMatch(await browser.evaluate(`${hub}.innerText`), OLD_COPY, target);
  }
  assert.match(await browser.evaluate(`${hub}.querySelector('[data-completion-status]').innerText`), /må rettes før eksport/, 'Standard blocks on the missing time');
  await screenshot(browser, 'hub-standard-missing-time');
  // The hub on its own renders the same panel.
  await clickSourceControl(browser, 'Tilbake til eksport', hub);
  // Leveranse blocked for Standard: an outlined Phosphor Regular warning circle in the error red, not a filled octagon.
  await browser.waitFor(`${exportDialog}?.querySelector('[data-delivery-state="blocked"]')`);
  const tone = await browser.evaluate(`(() => { const icon = ${exportDialog}.querySelector('[data-export-heading] .photo-export-tone');
    const probe = document.createElement('span'); probe.className = 'text-red-700'; document.body.append(probe); const red = getComputedStyle(probe).color; probe.remove();
    return { tone: icon.dataset.tone, color: getComputedStyle(icon).color, red }; })()`);
  assert.equal(tone.tone, 'stop');
  assert.equal(tone.color, tone.red, 'red-700, the Validator error red (text-red-700)');
  await screenshot(browser, 'leveranse-blocked-icon');
  await clickSourceControl(browser, 'Lukk eksport', exportDialog);
  await browser.waitFor(`!${exportDialog}`);
  await openTool(browser, 'Fullfør opplysninger…');
  await browser.waitFor(hub);
  await showTimeTask(browser);
  assert.equal(await missingHint(browser), expected.legacy2019, 'standalone hub, Standard kept');
});

browserTest('rendered done screen: ZIP-pakken er klar, the filename, the schema warning and two buttons; repeat download is unchanged', async (browser, directory) => {
  await timeLayer(browser, directory);
  await browser.evaluate(`(() => { window.__downloads = []; const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) window.__downloads.push(this.download); click.call(this); }; })()`);
  await openExport(browser);
  await buildPreview(browser);
  const first = await downloadZip(browser, directory);
  const done = `${exportDialog}.querySelector('[data-package-state="done"]')`;
  assert.equal(await browser.evaluate(`${done}.querySelector('[data-export-heading]').innerText.trim()`), 'ZIP-pakken er klar');
  assert.equal(await browser.evaluate(`${done}.querySelector('[data-export-zip]').innerText`), first.zip);
  assert.equal(await browser.evaluate(`${done}.querySelector('[data-export-warning="capture-time-schema"]').innerText`), '1 bilde mangler opptakstid. Pakken følger derfor ikke Skråfoto 2019-skjemaet.');
  assert.equal(await browser.evaluate(`${done}.querySelectorAll('ol, li').length`), 0, 'no numbered import steps');
  assert.doesNotMatch(await browser.evaluate(`${exportDialog}.innerText`), OLD_COPY);
  assert.deepEqual(await browser.evaluate(`Array.from(${exportDialog}.querySelectorAll('.photo-import-footer button')).map((item) => item.innerText.trim())`), ['Last ned på nytt', 'Lukk']);
  await screenshot(browser, 'export-done');
  await clickSourceControl(browser, 'Last ned på nytt', exportDialog);
  await browser.waitFor(`window.__downloads.length === 2 && ${done}`);
  assert.deepEqual(await browser.evaluate('window.__downloads'), [first.zip, first.zip], 'the same package again');
  assert.equal(await browser.evaluate(`${done}.querySelector('[data-export-heading]').innerText.trim()`), 'ZIP-pakken er klar');
});

// far.jpg: GML 45 m from its own EXIF GPS. near.jpg: 5 m, ordinary spread. none.jpg: no source at all.
// The fixture EXIF point is about E 581932.58, N 6566001.89 in UTM 32.
browserTest('rendered Kontroll: each review reason explains itself, and the compared sources and distance are on each row', async (browser, directory) => {
  await importPhotos(browser, directory, { 'far.jpg': {}, 'near.jpg': {}, 'none.jpg': { noLocation: true } });
  const gml = path.join(directory, 'avvik.gml');
  const text = completionGmlText([{ name: 'far.jpg', direction: '10' }, { name: 'near.jpg', direction: '20' }])
    .replace(/<gml:pos srsDimension="3">581930 6566000 0<\/gml:pos>/, '<gml:pos srsDimension="3">581977.58 6566001.89 0</gml:pos>')
    .replace(/<gml:pos srsDimension="3">581950 6566000 0<\/gml:pos>/, '<gml:pos srsDimension="3">581937.58 6566001.89 0</gml:pos>');
  assert.notEqual(text, completionGmlText([{ name: 'far.jpg', direction: '10' }, { name: 'near.jpg', direction: '20' }]));
  await writeFile(gml, text);
  await stagePhotoSource(browser, gml, 'gml');
  await savePhotoSource(browser, 'gml');
  await clickSourceControl(browser, 'Kontroller tilgjengelige posisjoner');
  await browser.waitFor(`${sourceWizard}.querySelector('section[aria-label="Kontroller posisjoner"]')`);
  const rowAction = (name) => browser.evaluate(`Array.from(${sourceWizard}.querySelectorAll('li[data-photo-id]')).find((row) => row.querySelector('.photo-positioning-filename strong').innerText === ${JSON.stringify(name)}).dataset.action`);
  assert.equal(await rowAction('far.jpg'), 'place', 'GML is still preselected');
  assert.equal(await rowAction('near.jpg'), 'place');
  await clickSourceControl(browser, 'Neste');
  const review = (reason) => `${sourceWizard}.querySelector('[data-review-reason="${reason}"]')`;
  await browser.waitFor(review('sources'));
  assert.equal(await browser.evaluate(`${sourceWizard}.querySelector('.photo-positioning-exceptions > p').innerText`), 'Bør kontrolleres (2)');
  assert.equal(await browser.evaluate(`${review('sources')}.querySelector('h4').innerText`), 'Kildene oppgir posisjoner mer enn 20 m fra hverandre (1)');
  assert.equal(await browser.evaluate(`${review('sources')}.querySelector('h4 + p').innerText`),
    'GML er foreslått fordi den prioriteres når den finnes, men det betyr ikke at GML-posisjonen er riktig. Se på bildet og kartet, og velg en annen kilde i Plassering hvis den passer bedre.');
  const farRow = await browser.evaluate(`${review('sources')}.querySelector('li').innerText`);
  assert.match(farRow, /^far\.jpg/);
  assert.match(farRow, /EXIF GPS/);
  assert.match(farRow, /GML: avvik\.gml \(1\)/);
  // 45 m in UTM; the comparison is geodesic, so it may round to 44,9.
  assert.match(farRow, /ca\. (44,9|45,0) m fra hverandre\. Valgt: GML: avvik\.gml \(1\)\./);
  assert.doesNotMatch(await browser.evaluate(`${review('sources')}.innerText`), /near\.jpg/, '5 m is ordinary spread and is not listed');
  assert.equal(await browser.evaluate(`${review('unplaced')}.querySelector('h4').innerText`), 'Forblir uten posisjon (1)');
  assert.equal(await browser.evaluate(`${review('unplaced')}.querySelector('h4 + p').innerText`), 'Disse bildene blir ikke med i leveransen før de får en posisjon.');
  assert.match(await browser.evaluate(`${review('unplaced')}.querySelector('li').innerText`), /^none\.jpg[\s\S]*Ingen kilde har en brukbar posisjon\.$/);
  assert.equal(await browser.evaluate(`Boolean(${review('move')} || ${review('zero')})`), false, 'no other reasons apply');
  await screenshot(browser, 'positioning-kontroll-review');
  // The confirmation is unchanged: both GML positions are applied, none.jpg stays unplaced.
  assert.equal(await browser.evaluate(`${sourceWizard}.querySelector('footer .photo-positioning-primary').innerText`), 'Bruk valgte posisjoner for 2 bilder');
  await clickSourceControl(browser, 'Bruk valgte posisjoner for 2 bilder');
  await browser.waitFor(`!${sourceWizard}`);
  await browser.waitFor(`document.querySelectorAll(".photo-camera-marker").length === 2`, 30000);
  await delay(200);
});
