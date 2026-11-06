import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'exifr/dist/full.esm.mjs';
import { strFromU8, unzipSync } from 'fflate';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { completionGmlText } from './helpers/photoCompletionFixtures.mjs';
import { assertGeminiConventions } from './helpers/geminiPhotoConventions.mjs';
import { exportedTimes } from './helpers/photoEvidenceFixtures.mjs';
import { gmiFile } from './helpers/gmiPhotoFixtures.mjs';
import { gpsJpeg } from './helpers/photoGpsFixtures.mjs';
import { addImportFiles, clickImport, createLayerWithoutPlacement, importDialog, retainGmlInWorkspace, waitForThumbnails } from './helpers/photoImportWizard.mjs';
import { applyPhotoSourcePositions, clickSourceControl, savePhotoSource, stagePhotoSource } from './helpers/photoSourceWorkflow.mjs';
import { KEYS, commandBar, elementCentre, enterEditMode, openTool, pressKey, rotateSelected } from './helpers/photoWorkspace.mjs';

// Fullfør opplysninger in the real app: File objects, chunked exifr, the browser XML parser, native dialogs and real input.
const app = process.env.PHOTO_UI_URL, corpus = process.env.PHOTO_GML_FIXTURE;
const hub = 'document.querySelector(".photo-completion-dialog[open]")';
const nested = 'document.querySelector(".photo-metadata-dialog[open]")';
const exportDialog = 'document.querySelector(".photo-export-dialog")';
const panel = (key) => `${hub}?.querySelector('[data-completion-panel="${key}"]')`;
const rowOf = (name, scope = hub) => `Array.from(${scope}.querySelectorAll('[data-completion-row]')).find((item) => item.querySelector('.photo-completion-filename')?.innerText.includes(${JSON.stringify(name)}))`;
const taskButton = (key) => `${hub}.querySelector('[data-task="${key}"]')`;

async function openApp(browser, { width = 1680, height = 900 } = {}) {
  await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
  await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
  await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
}
const screenshot = async (browser, name) => {
  if (!process.env.PHOTO_SCREENSHOT_DIR) return;
  await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive: true });
  const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(process.env.PHOTO_SCREENSHOT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
};
const setValue = (browser, selector, value) => browser.evaluate(`(() => { const element = ${selector};
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, ${JSON.stringify(value)});
  element.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const setSelect = (browser, selector, value) => browser.evaluate(`(() => { const element = ${selector};
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(element, ${JSON.stringify(value)});
  element.dispatchEvent(new Event('change', { bubbles: true })); })()`);
// A trusted click: it counts as user activation, which native dialog close handling depends on.
const realClick = async (browser, expression) => {
  await browser.evaluate(`(${expression}).scrollIntoView({ block: 'center' })`);
  const { x, y } = await elementCentre(browser, expression);
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
};
// Two presses at one spot, as a real double-click sends them. The button can relabel between the two.
const realDoubleClick = async (browser, expression, { lift = 0 } = {}) => {
  await browser.evaluate(`(${expression}).scrollIntoView({ block: 'center' })`);
  const { x, y: centre } = await elementCentre(browser, expression);
  const y = centre + lift;
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  for (const clickCount of [1, 2]) {
    await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount });
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount });
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
};
const openHub = async (browser) => { await openTool(browser, 'Fullfør opplysninger…'); await browser.waitFor(hub); };
const showTask = async (browser, key) => { await browser.evaluate(`${taskButton(key)}.click()`); await browser.waitFor(panel(key)); };
const closeHub = async (browser) => { await browser.evaluate(`${hub}.querySelector('.photo-import-footer .gmi-primary-control').click()`); await browser.waitFor(`!${hub}`); };
const outstanding = (browser, key) => browser.evaluate(`${taskButton(key)}.querySelector('.photo-completion-task-count')?.dataset.outstanding ?? (${taskButton(key)}.querySelector('.photo-completion-task-done') ? 'done' : null)`);
const panelText = (browser, key) => browser.evaluate(`${panel(key)}.textContent`);
const statusLine = (browser) => browser.evaluate(`${hub}.querySelector('[data-completion-status]').innerText`);
const message = (browser) => browser.evaluate(`${hub}.querySelector('.photo-import-footer [role=status]').innerText`);
const buttonLabels = (browser, scope) => browser.evaluate(`Array.from(${scope}.querySelectorAll('button')).map((item) => item.innerText.trim())`);
const expand = (browser, expression) => browser.evaluate(`(() => { const element = ${expression}; element.open = true; })()`);
const openGroup = (browser, key, group) => expand(browser, `${panel(key)}.querySelector('[data-group="${group}"]')`);

// Each file exercises one state. "unplaced" has no GML feature, so it stays unplaced.
const FILES = {
  'match.jpg': { captureTime: '2026:05:12 14:33:02', subsecond: '012' },
  'conflict.jpg': { captureTime: '2026:05:12 14:33:02' },
  'minute.jpg': {},
  'heading.jpg': { captureTime: '2026:05:12 15:00:10', direction: 45, directionRef: 'T', artist: 'Kari Nordmann' },
  'blank.jpg': {},
  'unplaced.jpg': { captureTime: '2026:05:12 16:00:00' },
};
const FEATURES = [
  { name: 'match.jpg', time: '2026-05-12T14:33:02', direction: '0' },
  { name: 'conflict.jpg', time: '2026-05-12T14:40:00', direction: '90.5' },
  { name: 'minute.jpg', time: '2026-05-12T14:33' },
  { name: 'heading.jpg', direction: '0' },
  { name: 'blank.jpg' },
];

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

const layerTest = (name, run, { timeout = 240000, hold = false, viewport } = {}) => test(name, { skip: !chromePath || !app, timeout }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'photo-completion-ui-'));
  const browser = await openTestChrome();
  try {
    await openApp(browser, viewport);
    await buildLayer(browser, directory, { hold });
    await run(browser, directory);
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});

layerTest('the tool opens on its own from Verktøy, shows every task, and returns focus', async (browser) => {
  await openHub(browser);
  assert.equal(await browser.evaluate(`Boolean(document.querySelector('.photo-tools-popup'))`), false, 'the menu closes');
  assert.equal(await browser.evaluate(`${hub}.querySelector('h2').innerText`), 'Fullfør opplysninger');
  assert.equal(await browser.evaluate(`${hub}.querySelector('.photo-completion-target select').value`), 'gemini-legacy2019');
  assert.deepEqual(await browser.evaluate(`Array.from(${hub}.querySelectorAll('[data-task]')).map((item) => item.dataset.task)`), ['captureTime', 'direction', 'placement', 'photographer']);
  assert.equal(await browser.evaluate(`document.querySelector('.photo-export-dialog')`), null, 'independent of the export dialog');
  assert.equal(await browser.evaluate(`${taskButton('direction')}.getAttribute('aria-current')`), 'true', 'direction blocks Gemini, so it comes first');
  assert.equal(await outstanding(browser, 'captureTime'), '5');
  assert.equal(await outstanding(browser, 'direction'), '5');
  assert.equal(await outstanding(browser, 'placement'), '1');
  assert.equal(await statusLine(browser), '5 må rettes før eksport');
  await screenshot(browser, '01-direction-1680');
  assert.equal(await browser.evaluate(`getComputedStyle(${hub}.querySelector('.photo-import-footer .gmi-primary-control')).color !== getComputedStyle(${hub}.querySelector('.photo-import-footer .gmi-primary-control')).backgroundColor`), true, 'the close button is legible');

  await showTask(browser, 'placement');
  assert.match(await panelText(browser, 'placement'), /1 plassering mangler posisjon og blir ikke med i leveransen/);
  assert.deepEqual(await browser.evaluate(`Array.from(${panel('placement')}.querySelectorAll('[data-completion-row]')).map((item) => item.innerText.trim())`), ['unplaced.jpg']);
  await showTask(browser, 'photographer');
  assert.match(await panelText(browser, 'photographer'), /Fotograf eksporteres ikke til dette målet/);

  await pressKey(browser, 'Escape', KEYS.Escape);
  await browser.waitFor(`!${hub}`);
  assert.equal(await browser.evaluate(`document.activeElement === document.querySelector('.photo-tools-trigger')`), true, 'focus returns to Verktøy');
  // Two quick Escapes: Chrome skips cancel on the second, and the tool must still close and open again.
  await openHub(browser);
  await showTask(browser, 'captureTime');
  await realClick(browser, `Array.from(${rowOf('blank.jpg')}.querySelectorAll('button')).find((item) => item.innerText === 'Rediger…')`);
  await browser.waitFor(nested);
  await pressKey(browser, 'Escape', KEYS.Escape);
  await browser.waitFor(`!${nested}`);
  await pressKey(browser, 'Escape', KEYS.Escape);
  await browser.waitFor(`!${hub} && !document.querySelector('.photo-completion-dialog')`);
  await openHub(browser);
  await showTask(browser, 'placement');
  await clickSourceControl(browser, 'Koble og posisjoner bilder…', panel('placement'));
  await browser.waitFor(`document.querySelector('.photo-positioning-wizard') && !${hub}`);
});

layerTest('a used selection stays narrow: a double-click never reaches the rows left out of it', async (browser) => {
  await openHub(browser);
  await showTask(browser, 'captureTime');
  const exif = `${panel('captureTime')}.querySelector('[data-adopt="exif"]')`;
  await browser.evaluate(`${rowOf('heading.jpg')}.querySelector('input[type=checkbox]').click()`);
  await browser.waitFor(`${exif}.innerText === 'Bruk EXIF-tid for 1 valgt bilde'`);
  await realDoubleClick(browser, exif);
  await browser.waitFor(`${panel('captureTime')}.querySelector('[data-group="done"]')`);
  assert.equal(await browser.evaluate(`${panel('captureTime')}.querySelector('[data-group="done"] summary').innerText`), 'Ferdig (1)', 'the second click must not reach the other row');
  assert.equal(await browser.evaluate(`${rowOf('match.jpg')}.closest('[data-group]').dataset.group`), 'adoptable');
  assert.equal(await browser.evaluate(`${exif}.innerText`), 'Bruk EXIF-tid for 0 valgte bilder');
  assert.equal(await browser.evaluate(`${exif}.disabled`), true);
  assert.match(await browser.evaluate(`${panel('captureTime')}.querySelector('[data-completion-selection]').innerText`), /Ingen av de valgte gjenstår/);

  // Widening is its own step, and a new selection replaces the used one.
  await browser.evaluate(`${rowOf('match.jpg')}.querySelector('input[type=checkbox]').click()`);
  await browser.waitFor(`${exif}.innerText === 'Bruk EXIF-tid for 1 valgt bilde'`);
  await browser.evaluate(`${rowOf('match.jpg')}.querySelector('input[type=checkbox]').click()`);
  await browser.waitFor(`${exif}.innerText === 'Bruk EXIF-tid for 1 bilde' && !${exif}.disabled`);
  await browser.evaluate(`${rowOf('match.jpg')}.querySelector('input[type=checkbox]').click()`);
  await browser.waitFor(`${exif}.innerText === 'Bruk EXIF-tid for 1 valgt bilde'`);
  await browser.evaluate(`${exif}.click()`);
  await browser.waitFor(`${exif}?.disabled !== false`);
  await clickSourceControl(browser, 'Fjern valg', panel('captureTime'));
  await browser.waitFor(`!${panel('captureTime')}.querySelector('[data-completion-selection]')`);
});

layerTest('GML 0° cannot be accepted by the second click of a double-click on the action above it', async (browser) => {
  await openHub(browser);
  await showTask(browser, 'direction');
  await clickSourceControl(browser, 'Bruk EXIF-retning for 1 plassering', panel('direction'));
  const gml = `${panel('direction')}.querySelector('[data-adopt="gml"]')`;
  await browser.waitFor(`${gml} && !${panel('direction')}.querySelector('[data-adopt="exif"]')`);
  // When this block goes, the 0° block moves up, and its button ends under the lower edge of this one.
  await realDoubleClick(browser, gml, { lift: 15 });
  await browser.waitFor(`!${gml}`);
  assert.equal(await browser.evaluate(`${panel('direction')}.querySelectorAll('[data-group="zero-review"] [data-completion-row]').length`), 1, '0° needs its own deliberate click');
  assert.equal(await message(browser), 'GML-retning er godtatt for 1 plassering.');
  await clickSourceControl(browser, 'Godta GML-retning 0° for 1 plassering', `${panel('direction')}.querySelector('[data-completion-zero]')`);
  await browser.waitFor(`!${panel('direction')}.querySelector('[data-completion-zero]')`);
});

layerTest('capture time: real values, selection, conflicts, nested dialog, Escape and genuine zero seconds', async (browser) => {
  await openHub(browser);
  await showTask(browser, 'captureTime');
  await screenshot(browser, '02-time-1680');
  const text = await panelText(browser, 'captureTime');
  assert.match(text, /Kreves av skjemaet, men stopper ikke eksporten/);
  assert.match(text, /EXIF: 12\.05\.2026 14:33:02,012 · tidssone ukjent/);
  assert.match(text, /GML · kilde\.gml: 12\.05\.2026 14:33:02 · tidssone ukjent/);
  assert.match(text, /EXIF og GML stemmer overens/);
  assert.match(await browser.evaluate(`${panel('captureTime')}.querySelector('[data-completion-agreement]').innerText`), /Kildene stemmer overens for 1 bilde/);
  assert.deepEqual(await browser.evaluate(`Array.from(${panel('captureTime')}.querySelectorAll('[data-adopt]')).map((item) => item.innerText)`), ['Bruk EXIF-tid for 2 bilder', 'Bruk GML-tid for 1 bilde']);

  // Selection-scoped: one row out of two, and the other stays unaccepted.
  await browser.evaluate(`${rowOf('heading.jpg')}.querySelector('input[type=checkbox]').click()`);
  await browser.waitFor(`${panel('captureTime')}.querySelector('[data-adopt="exif"]').innerText === 'Bruk EXIF-tid for 1 valgt bilde'`);
  assert.equal(await browser.evaluate(`${panel('captureTime')}.querySelector('[data-adopt="gml"]').disabled`), true, 'nothing selected can use GML');
  assert.match(await browser.evaluate(`${panel('captureTime')}.querySelector('[data-completion-selection]').innerText`), /1 valgt/);
  await browser.evaluate(`${panel('captureTime')}.querySelector('[data-adopt="exif"]').click()`);
  await browser.waitFor(`${panel('captureTime')}.querySelector('[data-group="done"] summary')?.innerText === 'Ferdig (1)'`);
  assert.equal(await message(browser), 'EXIF-tid er godtatt for 1 bilde.');
  assert.equal(await outstanding(browser, 'captureTime'), '4', 'readiness is recalculated at once');
  assert.equal(await browser.evaluate(`${panel('captureTime')}.querySelector('[data-count="selected"] dd').innerText`), '0', 'an accepted row leaves the selection');
  await clickSourceControl(browser, 'Fjern valg', panel('captureTime'));
  await openGroup(browser, 'captureTime', 'done');
  assert.match(await browser.evaluate(`${rowOf('heading.jpg')}.innerText`), /Godtatt: 12\.05\.2026 15:00:10 · tidssone ukjent · EXIF DateTimeOriginal/);

  // EXIF adoption without a selection takes what remains; GML then has nothing left.
  await browser.evaluate(`${panel('captureTime')}.querySelector('[data-adopt="exif"]').click()`);
  await browser.waitFor(`${panel('captureTime')}.querySelector('[data-group="done"] summary')?.innerText === 'Ferdig (2)'`);
  assert.match(await browser.evaluate(`${rowOf('match.jpg')}.innerText`), /GML · kilde\.gml: 12\.05\.2026 14:33:02/, 'source values stay visible after adoption');

  // The conflict goes through the per-photo dialog; Escape closes only that dialog.
  assert.match(await browser.evaluate(`${rowOf('conflict.jpg')}.innerText`), /EXIF: 12\.05\.2026 14:33:02[\s\S]*GML · kilde\.gml: 12\.05\.2026 14:40:00/);
  const choose = `Array.from(${rowOf('conflict.jpg')}.querySelectorAll('button')).find((item) => item.innerText === 'Velg verdi…')`;
  await realClick(browser, choose);
  await browser.waitFor(nested);
  await screenshot(browser, '03-nested-1680');
  await pressKey(browser, 'Escape', KEYS.Escape);
  await browser.waitFor(`!${nested}`);
  assert.equal(await browser.evaluate(`Boolean(${hub})`), true, 'Escape in the nested dialog leaves the hub open');
  assert.equal(await browser.evaluate(`document.activeElement === ${choose}`), true, 'focus returns to the row action');
  await realClick(browser, choose);
  await browser.waitFor(nested);
  await browser.evaluate(`Array.from(${nested}.querySelectorAll('label.photo-metadata-choice')).find((item) => item.innerText.startsWith('GML')).querySelector('input').click()`);
  await clickSourceControl(browser, 'Lagre', nested);
  await browser.waitFor(`!${nested} && ${panel('captureTime')}.querySelector('[data-group="done"] summary')?.innerText === 'Ferdig (3)'`);
  assert.equal(await browser.evaluate(`${hub}.contains(document.activeElement)`), true, 'focus stays in the hub although the row moved');
  assert.equal(await message(browser), 'Opptaksdata lagret for conflict.jpg');
  assert.match(await browser.evaluate(`${rowOf('conflict.jpg')}.innerText`), /Godtatt: 12\.05\.2026 14:40:00 · tidssone ukjent · GML · kilde\.gml/);

  // A source with minutes only: an untouched prefill is refused, and the deliberate confirmation is saved as manual.
  await clickSourceControl(browser, 'Rediger…', rowOf('minute.jpg'));
  await browser.waitFor(nested);
  await browser.evaluate(`${nested}.querySelector('input[value="other"]').click()`);
  await browser.waitFor(`${nested}.querySelector('input[type=time]')`);
  assert.equal(await browser.evaluate(`${nested}.querySelector('input[type=time]').value.slice(0, 5)`), '14:33');
  assert.match(await browser.evaluate(`${nested}.querySelector('.photo-capture-time-help').innerText`), /Bare dato eksporteres ikke til Gemini VA/);
  await clickSourceControl(browser, 'Lagre', nested);
  await browser.waitFor(`${nested}.querySelector('[role=alert]')?.innerText.includes('Kilden har ikke sekunder. Oppgi sekunder.')`);
  await screenshot(browser, '04-zero-seconds-1680');
  assert.equal(await browser.evaluate(`Boolean(${nested})`), true, 'nothing was saved');
  await browser.evaluate(`${nested}.querySelector('.photo-metadata-seconds input').click()`);
  await browser.waitFor(`!${nested}.querySelector('[role=alert]')`);
  await clickSourceControl(browser, 'Lagre', nested);
  await browser.waitFor(`!${nested} && ${panel('captureTime')}.querySelector('[data-group="done"] summary')?.innerText === 'Ferdig (4)'`);
  assert.match(await browser.evaluate(`${rowOf('minute.jpg')}.innerText`), /Godtatt: 12\.05\.2026 14:33:00 · tidssone ukjent · Manuell/, 'the source is not credited with seconds it never gave');
  assert.match(await browser.evaluate(`${rowOf('minute.jpg')}.innerText`), /GML · kilde\.gml: 12\.05\.2026 14:33 · uten sekunder/, 'the source value stays as it was');

  // A changed time needs no confirmation: the box disappears once a real second is entered.
  await clickSourceControl(browser, 'Rediger…', rowOf('blank.jpg'));
  await browser.waitFor(nested);
  await browser.evaluate(`${nested}.querySelector('input[value="other"]').click()`);
  assert.equal(await browser.evaluate(`Boolean(${nested}.querySelector('.photo-metadata-seconds'))`), false, 'no source value, so nothing to confirm');
  await pressKey(browser, 'Escape', KEYS.Escape);
  await browser.waitFor(`!${nested}`);

  // Manual bulk: seconds required, timezone left unknown, and only the selected row is written.
  const form = `${panel('captureTime')}.querySelector('[data-manual-fill="captureTime"]')`;
  await expand(browser, form);
  assert.equal(await browser.evaluate(`${form}.querySelector('button[type=submit]').disabled`), true, 'nothing selected');
  assert.match(await browser.evaluate(`${form}.innerText`), /Velg bilder i listen først/);
  await browser.evaluate(`${rowOf('blank.jpg')}.querySelector('input[type=checkbox]').click()`);
  await browser.waitFor(`${form}.querySelector('button[type=submit]').innerText === 'Bruk på 1 valgt bilde'`);
  assert.match(await browser.evaluate(`${form}.innerText`), /Samme tidspunkt brukes på 1 bilde/);
  await setValue(browser, `${form}.querySelector('input[type=date]')`, '2026-05-12');
  await clickSourceControl(browser, 'Bruk på 1 valgt bilde', form);
  await browser.waitFor(`${form}.querySelector('[role=alert]')?.innerText === 'Oppgi klokkeslett med sekunder.'`);
  await setValue(browser, `${form}.querySelector('input[type=time]')`, '09:15:00');
  assert.equal(await browser.evaluate(`${form}.querySelector('select').value`), '', 'unknown timezone is the default');
  await clickSourceControl(browser, 'Bruk på 1 valgt bilde', form);
  await browser.waitFor(`${panel('captureTime')}.querySelector('[data-group="done"] summary')?.innerText === 'Ferdig (5)'`);
  assert.match(await browser.evaluate(`${rowOf('blank.jpg')}.innerText`), /Godtatt: 12\.05\.2026 09:15:00 · tidssone ukjent · Manuell \(samme verdi for flere\)/);
  assert.equal(await outstanding(browser, 'captureTime'), 'done');
});

layerTest('direction: EXIF, non-zero GML, the separate GML 0° action, manual entry and readiness after each step', async (browser) => {
  await openHub(browser);
  await browser.waitFor(panel('direction'));
  await screenshot(browser, '05-direction-actions-1680');
  assert.deepEqual(await browser.evaluate(`Array.from(${panel('direction')}.querySelectorAll('[data-adopt]')).map((item) => item.innerText)`), ['Bruk EXIF-retning for 1 plassering', 'Bruk GML-retning for 1 plassering']);
  const zero = `${panel('direction')}.querySelector('[data-completion-zero]')`;
  assert.equal(await browser.evaluate(`${zero}.querySelector('p').innerText`), '0° kan bety at retningen mangler i kildesystemet. Godta bare hvis bildene er tatt mot nord.');
  assert.equal(await browser.evaluate(`${zero}.querySelector('button').innerText`), 'Godta GML-retning 0° for 1 plassering');
  assert.match(await browser.evaluate(`${rowOf('heading.jpg')}.innerText`), /GML oppgir 0°, som ikke regnes mot den andre kilden/);
  assert.equal(await browser.evaluate(`${rowOf('heading.jpg')}.closest('[data-group]').dataset.group`), 'adoptable', 'a real EXIF heading is not held back by GML 0°');
  assert.equal(await browser.evaluate(`${rowOf('match.jpg')}.closest('[data-group]').dataset.group`), 'zero-review');

  // The ordinary GML action reaches the 90.5° photo and not the zero.
  await browser.evaluate(`${panel('direction')}.querySelector('[data-adopt="gml"]').click()`);
  await browser.waitFor(`${panel('direction')}.querySelector('[data-group="done"] summary')?.innerText === 'Ferdig (1)'`);
  assert.equal(await message(browser), 'GML-retning er godtatt for 1 plassering.');
  assert.equal(await outstanding(browser, 'direction'), '4');
  assert.equal(await browser.evaluate(`${rowOf('match.jpg')}.closest('[data-group]').dataset.group`), 'zero-review', 'still unaccepted');

  await browser.evaluate(`${panel('direction')}.querySelector('[data-adopt="exif"]').click()`);
  await browser.waitFor(`${panel('direction')}.querySelector('[data-group="done"] summary')?.innerText === 'Ferdig (2)'`);
  await openGroup(browser, 'direction', 'done');
  assert.match(await browser.evaluate(`${rowOf('heading.jpg')}.innerText`), /Godtatt: 45° NØ · EXIF bilderetning \(sann nord\)/);

  // Only the explicit action accepts the zero.
  await clickSourceControl(browser, 'Godta GML-retning 0° for 1 plassering', zero);
  await browser.waitFor(`${panel('direction')}.querySelector('[data-group="done"] summary')?.innerText === 'Ferdig (3)'`);
  assert.equal(await message(browser), 'GML-retning 0° er godtatt for 1 plassering.');
  assert.match(await browser.evaluate(`${rowOf('match.jpg')}.innerText`), /Godtatt: 0° N · GML · kilde\.gml/);
  assert.equal(await browser.evaluate(`Boolean(${zero})`), false, 'nothing is left to accept');

  // Manual: an explicit selection, no default value, and a warning for 0.
  const form = `${panel('direction')}.querySelector('[data-manual-fill="direction"]')`;
  await expand(browser, form);
  assert.equal(await browser.evaluate(`${form}.querySelector('input').value`), '', 'no prefilled value');
  assert.equal(await browser.evaluate(`${form}.querySelector('button[type=submit]').disabled`), true);
  await browser.evaluate(`${rowOf('minute.jpg')}.querySelector('input[type=checkbox]').click()`);
  await setValue(browser, `${form}.querySelector('input')`, '0');
  await browser.waitFor(`${form}.querySelector('[data-zero-direction-note]')?.innerText === '0° betyr nord, ikke ukjent retning.'`);
  await setValue(browser, `${form}.querySelector('input')`, '200');
  await browser.waitFor(`!${form}.querySelector('[data-zero-direction-note]')`);
  await clickSourceControl(browser, 'Bruk på 1 valgt plassering', form);
  await browser.waitFor(`${panel('direction')}.querySelector('[data-group="done"] summary')?.innerText === 'Ferdig (4)'`);
  assert.equal(await outstanding(browser, 'direction'), '1');
  assert.match(await browser.evaluate(`${rowOf('blank.jpg')}.innerText`), /Ingen kildeverdi/);
  assert.equal(await statusLine(browser), '1 må rettes før eksport');
});

layerTest('profiles: requirements change with the target; the choice and AsBuilt context survive, reach export and stay off the photos', async (browser) => {
  await openHub(browser);
  const target = `${hub}.querySelector('.photo-completion-target select')`;
  const taskLabel = (key) => browser.evaluate(`${taskButton(key)}.querySelector('small').innerText`);
  assert.equal(await taskLabel('captureTime'), 'Anbefalt');
  assert.equal(await taskLabel('photographer'), 'Tas ikke med i denne leveransen');
  assert.equal(await browser.evaluate(`${hub}.querySelector('.photo-completion-nav-label').innerText`), 'Andre opplysninger');

  await setSelect(browser, target, 'legacy2019');
  await browser.waitFor(`${taskButton('photographer')}.querySelector('small').innerText === 'Valgfritt'`);
  assert.equal(await taskLabel('captureTime'), 'Påkrevd');
  await showTask(browser, 'photographer');
  await browser.evaluate(`${panel('photographer')}.querySelector('[data-adopt="exif"]').click()`);
  await browser.waitFor(`${panel('photographer')}.querySelector('[data-group="done"] summary')?.innerText === 'Ferdig (1)'`);
  assert.equal(await message(browser), 'EXIF-fotograf er godtatt for 1 bilde.');
  await openGroup(browser, 'photographer', 'done');
  assert.match(await browser.evaluate(`${rowOf('heading.jpg')}.innerText`), /Godtatt: Kari Nordmann · EXIF Artist/);

  await setSelect(browser, target, 'asbuilt52');
  await browser.waitFor(taskButton('context'));
  assert.equal(await taskLabel('direction'), 'Valgfritt');
  await showTask(browser, 'context');
  await screenshot(browser, '06-context-1680');
  assert.equal(await outstanding(browser, 'context'), '7');
  assert.equal(await browser.evaluate(`${panel('context')}.querySelector('[data-context-field="surveyDate"] input').value`), '', 'Datafangstdato is never filled from photos');
  await setValue(browser, `${panel('context')}.querySelector('[data-context-field="surveyDate"] input')`, '2026-05-12');
  await setValue(browser, `${panel('context')}.querySelector('[data-context-field="projectName"] input')`, 'Syntetisk prosjekt');
  await setSelect(browser, `${panel('context')}.querySelector('[data-context-field="horizontalMethod"] select')`, '99');
  await browser.waitFor(`${taskButton('context')}.querySelector('.photo-completion-task-count')?.dataset.outstanding === '4'`);
  assert.equal(await browser.evaluate(`${panel('context')}.querySelector('[data-context-field="surveyDate"]').hasAttribute('data-missing')`), false);
  assert.equal(await browser.evaluate(`${panel('context')}.querySelector('[data-context-field="datasetName"]').hasAttribute('data-missing')`), true);

  // Remembered for the session, and shared with the export dialog.
  await closeHub(browser);
  await openHub(browser);
  assert.equal(await browser.evaluate(`${target}.value`), 'asbuilt52');
  await showTask(browser, 'context');
  assert.equal(await browser.evaluate(`${panel('context')}.querySelector('[data-context-field="projectName"] input').value`), 'Syntetisk prosjekt');
  await closeHub(browser);
  await openTool(browser, 'Eksporter…');
  await browser.waitFor(exportDialog);
  assert.equal(await browser.evaluate(`${exportDialog}.querySelector('[aria-label="Eksportprofil"]').value`), '', 'the export dialog still asks for its profile each time');
  await setSelect(browser, `${exportDialog}.querySelector('[aria-label="Eksportprofil"]')`, 'asbuilt52');
  await browser.waitFor(`${exportDialog}.querySelector('[aria-label="Eksport Prosjektnavn"]')`);
  assert.equal(await browser.evaluate(`${exportDialog}.querySelector('[aria-label="Eksport Prosjektnavn"]').value`), 'Syntetisk prosjekt');
  await setValue(browser, `${exportDialog}.querySelector('[aria-label="Eksport Datasettets navn"]')`, 'Fra eksport');
  await clickSourceControl(browser, 'Lukk eksport', exportDialog);
  await browser.waitFor(`!${exportDialog}`);
  await openHub(browser);
  await showTask(browser, 'context');
  assert.equal(await browser.evaluate(`${panel('context')}.querySelector('[data-context-field="datasetName"] input').value`), 'Fra eksport', 'one set of delivery values');
  await closeHub(browser);

  // Nothing about the delivery reaches browser storage.
  assert.equal(await browser.evaluate(`JSON.stringify({ ...localStorage, ...sessionStorage }).includes('Syntetisk prosjekt')`), false);

  // The export configuration ends with the session.
  await clickSourceControl(browser, 'Tilbake til appen', 'document');
  await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
  await browser.evaluate(`document.querySelector('button[aria-label^="Fjern fotokartlag"]').click()`);
  await clickSourceControl(browser, 'Fjern', 'document');
  await browser.waitFor(`!document.querySelector('section[aria-label^="Fotokartlag"]')`);
});

layerTest('layer deletion and session reset clear the transient configuration', async (browser, directory) => {
  await openHub(browser);
  await setSelect(browser, `${hub}.querySelector('.photo-completion-target select')`, 'legacy2019');
  await closeHub(browser);
  await clickSourceControl(browser, 'Tilbake til appen', 'document');
  await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
  await browser.evaluate(`document.querySelector('button[aria-label^="Fjern fotokartlag"]').click()`);
  await clickSourceControl(browser, 'Fjern', 'document');
  await browser.waitFor(`!document.querySelector('section[aria-label^="Fotokartlag"]')`);

  await buildLayer(browser, directory);
  await openHub(browser);
  assert.equal(await browser.evaluate(`${hub}.querySelector('.photo-completion-target select').value`), 'gemini-legacy2019', 'a new layer starts at the default');
  await setSelect(browser, `${hub}.querySelector('.photo-completion-target select')`, 'asbuilt52');
  await closeHub(browser);
  await clickSourceControl(browser, 'Tilbake til appen', 'document');
  await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
  await browser.evaluate(`document.querySelector('[aria-label="Nullstill og åpne ny fil"]').click()`);
  await browser.waitFor(`!document.querySelector('section[aria-label^="Fotokartlag"]')`);
  await clickSourceControl(browser, 'Bilder', 'document');
  await browser.waitFor(importDialog);
  assert.equal(await browser.evaluate(`document.querySelector('.photo-completion-dialog')`), null);
});

layerTest('the Save/Discard boundary comes first when Edit mode has unsaved changes', async (browser) => {
  await enterEditMode(browser);
  await rotateSelected(browser, 90);
  await browser.waitFor(`${commandBar}.innerText.includes('1')`);
  await openTool(browser, 'Fullfør opplysninger…');
  await browser.waitFor('document.querySelector(".photo-edit-boundary[open]")');
  assert.equal(await browser.evaluate(`Boolean(${hub})`), false, 'the tool waits for the boundary');
  await pressKey(browser, 'Escape', KEYS.Escape);
  await browser.waitFor('!document.querySelector(".photo-edit-boundary[open]")');
  assert.equal(await browser.evaluate(`Boolean(${commandBar})`), true, 'Escape keeps editing, and nothing opens');
  assert.equal(await browser.evaluate(`Boolean(${hub})`), false);

  await openTool(browser, 'Fullfør opplysninger…');
  await browser.waitFor('document.querySelector(".photo-edit-boundary[open]")');
  await clickSourceControl(browser, 'Forkast endringer', 'document.querySelector(".photo-edit-boundary[open]")');
  await browser.waitFor(hub);
  assert.equal(await browser.evaluate(`Boolean(${commandBar})`), false, 'Edit mode ended first');
  assert.equal(await outstanding(browser, 'direction'), '5', 'discarded staged changes count for nothing');
  await closeHub(browser);

  await enterEditMode(browser);
  await rotateSelected(browser, 120);
  await openTool(browser, 'Fullfør opplysninger…');
  await browser.waitFor('document.querySelector(".photo-edit-boundary[open]")');
  await clickSourceControl(browser, 'Lagre endringer', 'document.querySelector(".photo-edit-boundary[open]")');
  await browser.waitFor(hub);
  assert.equal(await outstanding(browser, 'direction'), '4', 'the saved direction is canonical, so readiness sees it');
});

layerTest('pending EXIF: rows say so, source actions wait, and the panel follows the read without reopening', async (browser) => {
  await openHub(browser);
  await showTask(browser, 'captureTime');
  await browser.waitFor(`${panel('captureTime')}.querySelector('[data-recommendation="evidence-pending"]')`);
  assert.match(await panelText(browser, 'captureTime'), /Leser fortsatt bildedata for \d+ bilder/);
  assert.match(await browser.evaluate(`${rowOf('blank.jpg')}.innerText`), /Leser bildedata/);
  assert.equal(await browser.evaluate(`${rowOf('blank.jpg')}.querySelector('input[type=checkbox]')`), null, 'a row still being read cannot be selected');
  assert.equal(await browser.evaluate(`Array.from(${rowOf('blank.jpg')}.querySelectorAll('button')).length`), 0, 'and offers no edit');
  assert.equal(await browser.evaluate(`Boolean(${panel('captureTime')}.querySelector('[data-adopt="gml"]'))`), false, 'GML waits while EXIF might disagree');
  assert.match(await browser.evaluate(`${panel('captureTime')}.querySelector('[data-held-back]').innerText`), /venter på bildedata/);
  await screenshot(browser, '07-pending-1680');
  await browser.evaluate(`(() => { const held = window.__heldReads; window.__heldReads = null; held.forEach((read) => read()); })()`);
  await browser.waitFor(`${panel('captureTime')}.querySelector('[data-adopt="exif"]')?.innerText === 'Bruk EXIF-tid for 2 bilder'`, 60000);
  await browser.waitFor(`!${panel('captureTime')}.querySelector('[data-recommendation="evidence-pending"]')`, 60000);
  assert.match(await browser.evaluate(`${rowOf('blank.jpg')}.innerText`), /Ingen kildeverdi/);
  assert.match(await browser.evaluate(`${rowOf('match.jpg')}.innerText`), /EXIF: 12\.05\.2026 14:33:02,012/);
}, { hold: true });

layerTest('constrained screens: no horizontal scroll, header and footer stay in view, and the panel scrolls', async (browser) => {
  await openHub(browser);
  await showTask(browser, 'captureTime');
  for (const [width, height] of [[1920, 1080], [1366, 768], [1280, 720], [1024, 600], [390, 844]]) {
    await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await browser.waitFor(`innerWidth === ${width} && innerHeight === ${height}`);
    await screenshot(browser, `08-time-${width}x${height}`);
    const layout = await browser.evaluate(`(() => { const box = (selector) => ${hub}.querySelector(selector).getBoundingClientRect().toJSON(); const dialog = ${hub}.getBoundingClientRect().toJSON();
      const panelElement = ${hub}.querySelector('.photo-completion-panel');
      return { dialog, header: box('.photo-collection-header'), footer: box('.photo-import-footer'), nav: box('.photo-completion-nav'), panel: panelElement.getBoundingClientRect().toJSON(),
        panelOverflow: panelElement.scrollWidth - panelElement.clientWidth, bodyOverflow: ${hub}.scrollWidth - ${hub}.clientWidth, frameOverflow: ${hub}.querySelector('.photo-collection-frame').scrollHeight - ${hub}.clientHeight }; })()`);
    const context = `${width}x${height} panel+${layout.panelOverflow} dialog+${layout.bodyOverflow} frame+${layout.frameOverflow}: ${JSON.stringify(layout)}`;
    assert(layout.dialog.right <= width && layout.dialog.bottom <= height && layout.dialog.left >= 0 && layout.dialog.top >= 0, context);
    assert(layout.panelOverflow <= 1 && layout.bodyOverflow <= 1, context);
    assert(layout.frameOverflow <= 1, context);
    assert(layout.header.top >= layout.dialog.top && layout.footer.bottom <= layout.dialog.bottom + 1, context);
    assert(layout.panel.height >= 150, context);
  }
  // At phone width the task list runs along the top and every task stays reachable.
  assert.deepEqual(await browser.evaluate(`(() => { const nav = ${hub}.querySelector('.photo-completion-nav').getBoundingClientRect(), panelBox = ${hub}.querySelector('.photo-completion-panel').getBoundingClientRect(); return [nav.bottom <= panelBox.top + 1, Math.abs(nav.left - panelBox.left) <= 1]; })()`), [true, true]);
  await showTask(browser, 'direction');
  await browser.evaluate(`${panel('direction')}.querySelector('[data-completion-zero] button').scrollIntoView({ block: 'center' })`);
  await screenshot(browser, '09-direction-390');
  const nestedLayout = async () => {
    await browser.evaluate(`Array.from(${hub}.querySelectorAll('[data-task="captureTime"]'))[0].click()`);
    await browser.waitFor(panel('captureTime'));
    await browser.evaluate(`Array.from(${rowOf('conflict.jpg')}.querySelectorAll('button')).find((item) => item.innerText === 'Velg verdi…').click()`);
    await browser.waitFor(nested);
    return browser.evaluate(`(() => { const box = ${nested}.getBoundingClientRect(); return { fits: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight }; })()`);
  };
  assert.deepEqual(await nestedLayout(), { fits: true });
});

test('shared original: one row for time, one per placement for direction, and placements can end up different', { skip: !chromePath || !app, timeout: 180000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'photo-completion-shared-ui-'));
  const browser = await openTestChrome();
  try {
    const photo = path.join(directory, 'delt.jpg'), source = path.join(directory, 'delt.gmi');
    await writeFile(photo, gpsJpeg({ noLocation: true, captureTime: '2026:05:12 14:33:02', direction: 45, directionRef: 'T' }));
    await writeFile(source, Buffer.from(await gmiFile([
      { guid: '00000000-0000-4000-8000-000000000001', label: 'Kum A', tema: 'KUM', type: 'DFOT', hyperlink: 'h:1(link:"delt.jpg") ', xyz: '581930 6566000 1' },
      { guid: '00000000-0000-4000-8000-000000000002', label: 'Kum B', tema: 'KUM', type: 'DOVG', hyperlink: 'h:1(link:"delt.jpg") ', xyz: '582030 6566100 1' },
    ]).arrayBuffer()));
    await openApp(browser);
    await clickSourceControl(browser, 'Bilder', 'document');
    await browser.waitFor(importDialog);
    await addImportFiles(browser, [photo]);
    await createLayerWithoutPlacement(browser);
    await stagePhotoSource(browser, source, 'gmi');
    await savePhotoSource(browser, 'gmi');
    await applyPhotoSourcePositions(browser, 'gmi');
    await browser.waitFor('document.querySelectorAll(".photo-camera-marker").length === 2', 60000);

    await openHub(browser);
    assert.equal(await outstanding(browser, 'captureTime'), '1', 'capture time belongs to the asset');
    assert.equal(await outstanding(browser, 'direction'), '2', 'direction belongs to the occurrence');
    await browser.waitFor(panel('direction'));
    const rows = `Array.from(${panel('direction')}.querySelectorAll('[data-group="adoptable"] [data-completion-row]'))`;
    assert.deepEqual(await browser.evaluate(`${rows}.map((item) => item.querySelector('small').innerText)`), [' · Plassering 1 av 2', ' · Plassering 2 av 2']);
    assert.match(await browser.evaluate(`${panel('direction')}.querySelector('[data-shared-original]').innerText`), /Det dokumenterer ikke separate kameraobservasjoner/);

    await browser.evaluate(`${rows}[0].querySelector('input[type=checkbox]').click()`);
    await browser.waitFor(`${panel('direction')}.querySelector('[data-adopt="exif"]').innerText === 'Bruk EXIF-retning for 1 valgt plassering'`);
    await browser.evaluate(`${panel('direction')}.querySelector('[data-adopt="exif"]').click()`);
    await browser.waitFor(`${panel('direction')}.querySelector('[data-group="done"] summary')?.innerText === 'Ferdig (1)'`);
    assert.equal(await outstanding(browser, 'direction'), '1', 'the other placement is untouched');

    const form = `${panel('direction')}.querySelector('[data-manual-fill="direction"]')`;
    await expand(browser, form);
    await browser.evaluate(`${rows}[0].querySelector('input[type=checkbox]').click()`);
    await setValue(browser, `${form}.querySelector('input')`, '200');
    await clickSourceControl(browser, 'Bruk på 1 valgt plassering', form);
    await browser.waitFor(`${panel('direction')}.querySelector('[data-group="done"] summary')?.innerText === 'Ferdig (2)'`);
    await openGroup(browser, 'direction', 'done');
    assert.deepEqual(await browser.evaluate(`Array.from(${panel('direction')}.querySelectorAll('[data-group="done"] [data-accepted-value]')).map((item) => item.innerText)`),
      ['Godtatt: 45° NØ · EXIF bilderetning (sann nord)', 'Godtatt: 200° S · Manuell (samme verdi for flere)']);

    await showTask(browser, 'captureTime');
    await clickSourceControl(browser, 'Rediger…', rowOf('delt.jpg'));
    await browser.waitFor(nested);
    assert.match(await browser.evaluate(`${nested}.querySelector('footer').innerText`), /Gjelder alle 2 plasseringer av bildet/);
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});

test('private corpus through the hub: explicit time and 0° actions reach the Gemini package', { skip: !chromePath || !app || !corpus, timeout: 420000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'photo-completion-corpus-ui-'));
  const browser = await openTestChrome();
  try {
    const folder = path.join(path.dirname(corpus), 'Attachments');
    const names = (await readdir(folder)).filter((name) => /\.jpe?g$/i.test(name)).sort();
    const total = names.length;
    assert(total);
    await openApp(browser, { width: 1366, height: 768 });
    await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: directory });
    await clickSourceControl(browser, 'Bilder', 'document');
    await browser.waitFor(importDialog);
    await addImportFiles(browser, names.map((name) => path.join(folder, name)));
    await browser.waitFor(`document.querySelectorAll(".photo-collection-card img").length === ${total}`, 120000);
    await createLayerWithoutPlacement(browser);
    await retainGmlInWorkspace(browser, corpus);
    await applyPhotoSourcePositions(browser, 'gml');
    await browser.waitFor(`document.querySelectorAll(".photo-camera-marker").length === ${total}`, 60000);

    await openHub(browser);
    assert.equal(await statusLine(browser), `${total} må rettes før eksport`);
    assert.equal(await outstanding(browser, 'direction'), String(total));
    assert.deepEqual(await browser.evaluate(`Array.from(${panel('direction')}.querySelectorAll('[data-adopt]')).length`), 0, 'no ordinary action reaches GML 0°');
    await browser.evaluate(`${hub}.querySelector('[data-task="captureTime"]').click()`);
    await browser.waitFor(panel('captureTime'));
    assert.match(await browser.evaluate(`${panel('captureTime')}.querySelector('[data-completion-agreement]').innerText`), new RegExp(`Kildene stemmer overens for ${total} bilder`));
    assert.equal(await browser.evaluate(`${panel('captureTime')}.querySelector('[data-count="conflict"] dd').innerText`), '0');
    assert.match(await browser.evaluate(`${panel('captureTime')}.querySelector('.photo-completion-sample').innerText`), /EXIF: \d\d\.\d\d\.\d{4}[\s\S]*GML/, 'real values are shown, not only counts');
    await screenshot(browser, '10-corpus-time');
    await clickSourceControl(browser, `Bruk EXIF-tid for ${total} bilder`, panel('captureTime'));
    await browser.waitFor(`${taskButton('captureTime')}.querySelector('.photo-completion-task-done')`);

    await showTask(browser, 'direction');
    await screenshot(browser, '11-corpus-direction');
    // One placement, double-clicked: nothing else is accepted, and the rest still takes its own explicit action.
    const zeroButton = `${panel('direction')}.querySelector('[data-completion-zero] button')`;
    await browser.evaluate(`${panel('direction')}.querySelector('[data-group="zero-review"] input[type=checkbox]').click()`);
    await browser.waitFor(`${zeroButton}.innerText === 'Godta GML-retning 0° for 1 valgt plassering'`);
    await realDoubleClick(browser, zeroButton);
    assert.equal(await outstanding(browser, 'direction'), String(total - 1), 'a double-click on a selection must not accept the rest');
    await clickSourceControl(browser, 'Fjern valg', panel('direction'));
    await clickSourceControl(browser, `Godta GML-retning 0° for ${total - 1} plasseringer`, `${panel('direction')}.querySelector('[data-completion-zero]')`);
    await browser.waitFor(`${taskButton('direction')}.querySelector('.photo-completion-task-done')`);
    assert.match(await browser.evaluate(`${panel('direction')}.querySelector('[data-recommendation="direction-all-zero"]').innerText`), new RegExp(`${total} bilder peker nøyaktig mot nord`));
    assert.equal(await statusLine(browser), 'Kan eksporteres, men 1 kan forbedres');
    await closeHub(browser);

    await openTool(browser, 'Eksporter…');
    await browser.waitFor(exportDialog);
    await setSelect(browser, `${exportDialog}.querySelector('[aria-label="Eksportprofil"]')`, 'gemini-legacy2019');
    await clickSourceControl(browser, 'Lag eksportforhåndsvisning', exportDialog);
    await browser.waitFor(`${exportDialog}.querySelector('section[aria-label="Eksportforhåndsvisning"]') && !${exportDialog}.innerText.includes('Bygger forhåndsvisning')`, 120000);
    await clickSourceControl(browser, 'Last ned testpakke', exportDialog);
    await browser.waitFor(`${exportDialog}.innerText.includes('ZIP-pakken er klar')`, 120000);

    const file = path.join(directory, 'photos-gemini-legacy2019-5972.zip');
    let zip;
    for (let attempt = 0; attempt < 300 && !zip; attempt++) {
      try { zip = unzipSync(new Uint8Array(await readFile(file))); } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    assert(zip, 'ZIP download not completed');
    const xml = strFromU8(zip['photos.gml']);
    assertGeminiConventions(xml);
    const times = exportedTimes(xml);
    assert.equal(times.size, total);
    let matching = 0;
    for (const name of names) {
      const tags = await parse(await readFile(path.join(folder, name)), { tiff: false, ifd0: false, exif: ['DateTimeOriginal'], reviveValues: false, translateValues: false });
      if (times.get(name) === tags.DateTimeOriginal.trim().replace(/^(\d{4}):(\d{2}):(\d{2}) /, '$1-$2-$3T')) matching++;
    }
    assert.equal(matching, total, 'each exported time equals the JPEG clock, read independently of the app');
    assert.equal((xml.match(/<app:retningsverdi>0<\/app:retningsverdi>/g) || []).length, total, 'the explicitly accepted direction is what is exported');
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});
