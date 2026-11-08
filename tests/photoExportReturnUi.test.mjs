import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { completionGmlText } from './helpers/photoCompletionFixtures.mjs';
import { backToDelivery, buildPreview, chooseFormat, closeExport, deliveryState, exportDialog, openCompletionFromExport, openExport, packageState, previewNames, returnToExport, selectedFormat, setLabel } from './helpers/photoExportWizard.mjs';
import { gpsJpeg } from './helpers/photoGpsFixtures.mjs';
import { addImportFiles, createLayerWithoutPlacement, importDialog, retainGmlInWorkspace } from './helpers/photoImportWizard.mjs';
import { applyPhotoSourcePositions, clickSourceControl, savePhotoSource, sourceWizard, stagePhotoSource } from './helpers/photoSourceWorkflow.mjs';
import { KEYS, commandBar, elementCentre, openTool, pressKey } from './helpers/photoWorkspace.mjs';

// Export wizard → Fullfør opplysninger → map or positioning wizard → Fullfør opplysninger → export wizard, in the real app:
// native dialogs, trusted mouse and keyboard, and every way of leaving the journey.
const app = process.env.PHOTO_UI_URL;
const hub = 'document.querySelector(".photo-completion-dialog[open]")';
const boundary = 'document.querySelector(".photo-edit-boundary[open]")';
const flowRow = `${commandBar}?.querySelector('.photo-edit-flow-row')`;
const flowCount = `${flowRow}?.querySelector('.photo-edit-flow-count')`;
const shell = 'document.querySelector(".photo-workspace-shell")';
const toolsTrigger = `document.querySelector('.photo-tools-trigger')`;
const advance = `${exportDialog}.querySelector('[data-export-advance]')`;
const completion = `${exportDialog}.querySelector('[data-export-completion]')`;
const buttonIn = (scope, label) => `Array.from(${scope}.querySelectorAll('button')).find((item) => item.innerText.trim() === ${JSON.stringify(label)} || item.getAttribute('aria-label') === ${JSON.stringify(label)})`;
const panel = (key) => `${hub}?.querySelector('[data-completion-panel="${key}"]')`;
const hubBack = buttonIn(hub, 'Tilbake til eksport');
const hubGo = buttonIn(hub, 'Gå til eksport');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const openDialogs = (browser) => browser.evaluate(`document.querySelectorAll('dialog[open]').length`);
const footerStatus = (browser) => browser.evaluate(`${exportDialog}.querySelector('.photo-import-footer [role=status]').innerText`);
const label = (browser) => browser.evaluate(`${exportDialog}.querySelector('[aria-label="Eksportetikett"]').value`);
const excluded = (browser) => browser.evaluate(`${exportDialog}.querySelector('[data-export-excluded]')?.innerText ?? null`);
const onDelivery = async (browser, context) => {
  assert.equal(await browser.evaluate(`${exportDialog}.querySelector('[aria-current="step"]').innerText`), '1. Leveranse', context);
  assert.equal(await browser.evaluate(`Boolean(${exportDialog}.querySelector('[data-export-step="package"], [data-export-zip]'))`), false, context);
};
const hubFooter = (browser) => browser.evaluate(`Array.from(${hub}.querySelectorAll('.photo-import-footer button')).map((item) => item.innerText.trim())`);
const hasFocus = (browser, expression) => browser.evaluate(`document.activeElement === (${expression})`);

const pressAt = async (browser, { x, y }, clickCount = 1) => {
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount });
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount });
};
const realClick = async (browser, expression) => { await browser.evaluate(`(${expression}).scrollIntoView({ block: 'center' })`); await pressAt(browser, await elementCentre(browser, expression)); };
// Carries the text a real key press has: without it Chrome does not activate a focused button.
const pressEnter = async (browser) => {
  const text = String.fromCharCode(13);
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text, unmodifiedText: text });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
};
const escape = (browser) => pressKey(browser, 'Escape', KEYS.Escape);

const showTask = async (browser, key) => { await browser.evaluate(`${hub}.querySelector('[data-task="${key}"]').click()`); await browser.waitFor(panel(key)); };
const openPlacementMap = async (browser) => { await showTask(browser, 'placement'); await realClick(browser, buttonIn(panel('placement'), 'Plasser på kartet')); await browser.waitFor(`${flowRow} && !${hub}`); await delay(700); };
const mapPoint = (browser) => browser.evaluate(`(() => { const box = document.querySelector('.leaflet-container').getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height * .75 }; })()`);
const placeOnMap = async (browser) => { await pressAt(browser, await mapPoint(browser)); await browser.waitFor(`${flowCount}.dataset.flowStaged === '1'`); };
const askToLeaveMap = async (browser) => { await realClick(browser, buttonIn(flowRow, 'Tilbake til opplysninger')); await browser.waitFor(boundary); };
const openStandaloneHub = async (browser) => { await openTool(browser, 'Fullfør opplysninger…'); await browser.waitFor(hub); };
const setHubValue = (browser, selector, value) => browser.evaluate(`(() => { const element = ${selector}, proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); })()`);
const fillMissingTime = async (browser) => {
  await showTask(browser, 'captureTime');
  const form = `${panel('captureTime')}.querySelector('[data-manual-fill="captureTime"]')`;
  await browser.evaluate(`(${form}).open = true`);
  await browser.evaluate(`${panel('captureTime')}.querySelectorAll('[data-group] details, details[data-group]').forEach((item) => { item.open = true; })`);
  await browser.evaluate(`Array.from(${panel('captureTime')}.querySelectorAll('[data-completion-row] input[type=checkbox]:not(:checked)')).forEach((item) => item.click())`);
  await setHubValue(browser, `${form}.querySelector('input[type=date]')`, '2026-07-02');
  await setHubValue(browser, `${form}.querySelector('input[type=time]')`, '11:12:13');
  await setHubValue(browser, `${form}.querySelector('select')`, '+02:00');
  await browser.waitFor(`!${form}.querySelector('button[type=submit]').disabled`);
  await browser.evaluate(`${form}.querySelector('button[type=submit]').click()`);
  await browser.waitFor(`${hub}.querySelector('.photo-import-footer [role=status]').innerText.includes('godtatt for')`);
};
// Counts plan and package file reads, and every hand-over to a download. Holds reads on request.
const watchWork = (browser) => browser.evaluate(`(() => {
  window.__downloads = []; window.__fileReads = 0;
  const click = HTMLAnchorElement.prototype.click, read = Blob.prototype.arrayBuffer;
  HTMLAnchorElement.prototype.click = function () { if (this.download) window.__downloads.push(this.download); click.call(this); };
  Blob.prototype.arrayBuffer = function () { window.__fileReads++; return window.__heldFiles ? new Promise((resolve) => window.__heldFiles.push(resolve)).then(() => read.call(this)) : read.call(this); };
})()`);

async function openApp(browser) {
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 900, deviceScaleFactor: 1, mobile: false });
  await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
  await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
  await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
}

// timed.jpg and blank.jpg are placed by the GML, and only blank.jpg lacks a time, so Gemini shows the schema gap. loose.jpg
// has no GML feature, so it is the one placement export leaves out: placing it changes what Leveranse says.
const FILES = { 'timed.jpg': { captureTime: '2026:05:12 14:33:02' }, 'blank.jpg': {}, 'loose.jpg': { captureTime: '2026:05:12 16:00:00' } };
const FEATURES = [{ name: 'timed.jpg', time: '2026-05-12T14:33:02', direction: '45' }, { name: 'blank.jpg' }];
const LEFT_OUT = '1 plassering mangler posisjon og blir ikke med.';

async function buildLayer(browser, directory) {
  const paths = await Promise.all(Object.entries(FILES).map(async ([name, options]) => {
    const file = path.join(directory, name);
    await writeFile(file, gpsJpeg({ noLocation: true, ...options }));
    return file;
  }));
  const gml = path.join(directory, 'kilde.gml');
  await writeFile(gml, completionGmlText(FEATURES));
  await clickSourceControl(browser, 'Bilder', 'document');
  await browser.waitFor(importDialog);
  await addImportFiles(browser, paths);
  await createLayerWithoutPlacement(browser);
  await retainGmlInWorkspace(browser, gml);
  await applyPhotoSourcePositions(browser, 'gml');
  await browser.waitFor(`document.querySelectorAll(".photo-camera-marker").length >= ${FEATURES.length}`, 60000);
  await browser.waitFor(`document.querySelector('.photo-tools-trigger')`);
}

const layerTest = (name, run, { timeout = 240000 } = {}) => test(name, { skip: !chromePath || !app, timeout }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'photo-export-return-ui-'));
  const browser = await openTestChrome();
  try {
    await openApp(browser);
    await buildLayer(browser, directory);
    await run(browser, directory);
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});

layerTest('wizard → hub → wizard: settings stay, the hub says where it leads, and Leveranse follows what was fixed', async (browser) => {
  await openExport(browser);
  await setLabel(browser, 'Nord');
  assert.equal(await deliveryState(browser), 'schema-gap');
  assert.doesNotMatch(await footerStatus(browser), /Kontrollen er oppdatert/, 'an ordinary opening is not a return');

  await realClick(browser, completion);
  await browser.waitFor(`${hub} && !${exportDialog}`);
  assert.deepEqual(await hubFooter(browser), ['Tilbake til eksport']);
  assert.equal(await openDialogs(browser), 1, 'swapped, not stacked');
  assert.equal(await browser.evaluate(`${hub}.querySelector('.photo-import-footer [role=status]').innerText`), '', 'this is an arrival, not a return from a handoff');
  assert.equal(await browser.evaluate(`document.activeElement.hasAttribute('data-completion-heading')`), true, 'focus takes the heading');

  await fillMissingTime(browser);
  await realClick(browser, hubBack);
  await browser.waitFor(`${exportDialog} && !${hub}`);
  await onDelivery(browser, 'always back on Leveranse');
  assert.equal(await selectedFormat(browser), 'gemini-legacy2019');
  assert.equal(await label(browser), 'Nord');
  assert.notEqual(await deliveryState(browser), 'schema-gap', 'the time filled in the hub counts at once');
  assert.equal(await browser.evaluate(`Boolean(${exportDialog}.querySelector('[data-export-warning="capture-time-schema"]'))`), false);
  assert.match(await footerStatus(browser), /^Kontrollen er oppdatert\. /);
  assert.equal(await hasFocus(browser, `${exportDialog}.querySelector('[data-export-heading]')`), true);

  await closeExport(browser);
  assert.equal(await hasFocus(browser, toolsTrigger), true, 'focus goes back to the original opener');
  await openExport(browser);
  assert.doesNotMatch(await footerStatus(browser), /Kontrollen er oppdatert/, 'the note belongs to the return alone');
  assert.equal(await label(browser), 'Nord');

  // Format and CRS too. A target changed in the hub is the same setting, so that is what comes back.
  await chooseFormat(browser, 'legacy2019');
  await browser.evaluate(`(() => { const select = ${exportDialog}.querySelector('[aria-label="Eksport-CRS"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'EPSG:25833'); select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await browser.waitFor(`${exportDialog}.querySelector('[aria-label="Eksport-CRS"]').value === 'EPSG:25833'`);
  await openCompletionFromExport(browser);
  assert.equal(await browser.evaluate(`${hub}.querySelector('.photo-completion-target select').value`), 'legacy2019');
  await returnToExport(browser);
  assert.equal(await selectedFormat(browser), 'legacy2019');
  assert.equal(await browser.evaluate(`${exportDialog}.querySelector('[aria-label="Eksport-CRS"]').value`), 'EPSG:25833');
  await openCompletionFromExport(browser);
  await setHubValue(browser, `${hub}.querySelector('.photo-completion-target select')`, 'asbuilt52');
  await browser.waitFor(`${hub}.querySelector('.photo-completion-target select').value === 'asbuilt52'`);
  await returnToExport(browser);
  assert.equal(await selectedFormat(browser), 'asbuilt52');
  assert.equal(await deliveryState(browser), 'blocked', 'recalculated for the target chosen in the hub');
  assert.equal(await label(browser), 'Nord');
});

// Acceptance defect: with the hub opened from export, choosing another Mål showed `Gå til eksport` and `Lukk`. The target is
// chosen by key, a trusted input, as a person would, and the journey must outlast any number of changes.
const hubTarget = `${hub}.querySelector('.photo-completion-target select')`;
const chooseHubTarget = async (browser, value) => {
  const [from, to] = await browser.evaluate(`(() => { const values = Array.from(${hubTarget}.options).map((item) => item.value); return [values.indexOf(${hubTarget}.value), values.indexOf(${JSON.stringify(value)})]; })()`);
  await browser.evaluate(`${hubTarget}.focus()`);
  for (let step = 0; step < Math.abs(to - from); step++) await pressKey(browser, to > from ? 'ArrowDown' : 'ArrowUp', to > from ? KEYS.ArrowDown : KEYS.ArrowUp);
  await browser.waitFor(`${hubTarget}.value === ${JSON.stringify(value)}`);
  await delay(200);
};
const hubStatus = (browser) => browser.evaluate(`${hub}.querySelector('[data-completion-status]').dataset.completionStatus`);

layerTest('changing Mål in a hub opened from export keeps the way back, and Leveranse follows the target chosen there', async (browser) => {
  await openExport(browser);
  await setLabel(browser, 'Mål');
  assert.equal(await selectedFormat(browser), 'gemini-legacy2019');
  await realClick(browser, completion);
  await browser.waitFor(`${hub} && !${exportDialog}`);
  assert.deepEqual(await hubFooter(browser), ['Tilbake til eksport']);

  await chooseHubTarget(browser, 'legacy2019');
  assert.deepEqual(await hubFooter(browser), ['Tilbake til eksport'], 'Skråfoto 2019 (standard): still the way back');
  assert.equal(await hubStatus(browser), 'blocked', 'the hub recalculates: a missing time blocks Standard');
  await chooseHubTarget(browser, 'asbuilt52');
  await chooseHubTarget(browser, 'legacy2019');
  assert.deepEqual(await hubFooter(browser), ['Tilbake til eksport'], 'after several changes');
  assert.equal(await browser.evaluate(`${buttonIn(hub, 'Lukk Fullfør opplysninger')}.getAttribute('aria-label')`), 'Lukk Fullfør opplysninger');

  await realClick(browser, hubBack);
  await browser.waitFor(`${exportDialog}?.open && !${hub}`);
  await onDelivery(browser, 'the footer');
  assert.equal(await selectedFormat(browser), 'legacy2019', 'the target chosen in the hub');
  assert.equal(await browser.evaluate(`${exportDialog}.querySelector('[aria-label="Eksport-CRS"]').value`), 'EPSG:25832');
  assert.equal(await label(browser), 'Mål');
  assert.equal(await deliveryState(browser), 'blocked', 'readiness for Standard');

  // ✕ and Escape after a change are the same way back.
  await openCompletionFromExport(browser);
  await chooseHubTarget(browser, 'gemini-legacy2019');
  await realClick(browser, buttonIn(hub, 'Lukk Fullfør opplysninger'));
  await browser.waitFor(`${exportDialog}?.open && !${hub}`);
  assert.equal(await selectedFormat(browser), 'gemini-legacy2019');
  assert.equal(await deliveryState(browser), 'schema-gap');
  await openCompletionFromExport(browser);
  await chooseHubTarget(browser, 'legacy2019');
  await escape(browser);
  await browser.waitFor(`${exportDialog}?.open && !${hub}`);
  assert.equal(await selectedFormat(browser), 'legacy2019');

  // Closing ends the journey, and a hub on its own stays on its own whatever the target.
  await closeExport(browser);
  await openStandaloneHub(browser);
  assert.deepEqual(await hubFooter(browser), ['Gå til eksport', 'Lukk']);
  await chooseHubTarget(browser, 'gemini-legacy2019');
  assert.deepEqual(await hubFooter(browser), ['Gå til eksport', 'Lukk']);
  await realClick(browser, buttonIn(hub, 'Lukk'));
  await browser.waitFor(`!${hub}`);
  await delay(200);
  assert.equal(await openDialogs(browser), 0, 'Lukk does not lead to export');
});

layerTest('export → hub → map → hub → export with Mål changed on the way: Save and Discard both keep the way back', async (browser) => {
  await openExport(browser);
  await setLabel(browser, 'Tur');
  await openCompletionFromExport(browser);
  await chooseHubTarget(browser, 'legacy2019');
  await openPlacementMap(browser);
  await placeOnMap(browser);
  await realClick(browser, buttonIn(commandBar, 'Lagre endringer'));
  await browser.waitFor(hub);
  await delay(300);
  assert.deepEqual(await hubFooter(browser), ['Tilbake til eksport'], 'Save');
  assert.equal(await browser.evaluate(`${hubTarget}.value`), 'legacy2019', 'the target outlasts the map');
  await chooseHubTarget(browser, 'gemini-legacy2019');
  assert.deepEqual(await hubFooter(browser), ['Tilbake til eksport'], 'a change after the map');
  await returnToExport(browser);
  await onDelivery(browser, 'after Save');
  assert.equal(await selectedFormat(browser), 'gemini-legacy2019');
  assert.equal(await excluded(browser), null, 'the saved placement counts');
  assert.equal(await label(browser), 'Tur');
});

layerTest('the same journey with Discard: nothing saved, and the way back holds after a change of Mål', async (browser) => {
  await openExport(browser);
  await setLabel(browser, 'Tur');
  await openCompletionFromExport(browser);
  await openPlacementMap(browser);
  await placeOnMap(browser);
  await askToLeaveMap(browser);
  await clickSourceControl(browser, 'Forkast endringer', boundary);
  await browser.waitFor(hub);
  await delay(300);
  await chooseHubTarget(browser, 'legacy2019');
  assert.deepEqual(await hubFooter(browser), ['Tilbake til eksport'], 'Discard, then a change');
  await realClick(browser, hubBack);
  await browser.waitFor(`${exportDialog}?.open && !${hub}`);
  await onDelivery(browser, 'after Discard');
  assert.equal(await selectedFormat(browser), 'legacy2019');
  assert.equal(await excluded(browser), LEFT_OUT, 'a discarded placement never counted');
  assert.equal(await label(browser), 'Tur');
});

layerTest('no navigation brings back a plan: not a finished one, and not one still being built', async (browser) => {
  await watchWork(browser);
  await openExport(browser);
  await buildPreview(browser);
  const { zip } = await previewNames(browser);
  await backToDelivery(browser);
  await openCompletionFromExport(browser);
  await returnToExport(browser);
  await onDelivery(browser, 'a finished plan stays discarded');
  await delay(1100);
  await buildPreview(browser);
  assert.notEqual((await previewNames(browser)).zip, zip, 'a new plan, with a new timestamp');
  await backToDelivery(browser);

  // Hold the build, leave for the hub, and let it finish there: nothing may come of it.
  await browser.evaluate('window.__heldFiles = []');
  await browser.evaluate(`${advance}.click()`);
  await browser.waitFor(`${exportDialog}.querySelector('[data-package-state="building"]') && window.__heldFiles.length > 0`);
  await backToDelivery(browser);
  await openCompletionFromExport(browser);
  await browser.evaluate(`(() => { const held = window.__heldFiles; window.__heldFiles = null; held.forEach((resume) => resume()); })()`);
  await delay(300);
  assert(await browser.evaluate(`Boolean(${hub})`), 'the late result does not disturb the hub');
  await returnToExport(browser);
  await delay(300);
  await onDelivery(browser, 'and does not arrive afterwards');
  assert.deepEqual(await browser.evaluate('window.__downloads'), []);
});

layerTest('wizard → hub → map → Save → hub → wizard: back to the hub first, and the saved placement counts', async (browser) => {
  await openExport(browser);
  await setLabel(browser, 'Kart');
  assert.equal(await excluded(browser), LEFT_OUT);
  await openCompletionFromExport(browser);
  await openPlacementMap(browser);
  assert.equal(await openDialogs(browser), 0, 'the map has no dialog over it');
  await placeOnMap(browser);

  await realClick(browser, buttonIn(commandBar, 'Lagre endringer'));
  await browser.waitFor(hub);
  await delay(300);
  assert.equal(await browser.evaluate(`Boolean(${exportDialog})`), false, 'the map returns to the hub, not to export');
  assert.deepEqual(await hubFooter(browser), ['Tilbake til eksport'], 'the way back survived the map');
  assert.equal(await browser.evaluate(`${hub}.querySelector('.photo-import-footer [role=status]').innerText`), 'Plassering: 0 gjenstår.', 'M4: the return note');

  await returnToExport(browser);
  await onDelivery(browser, 'after Save');
  assert.equal(await excluded(browser), null, 'the saved placement joined the delivery');
  assert.match(await footerStatus(browser), /3 bilder i pakken/);
  assert.equal(await label(browser), 'Kart');
  assert.equal(await selectedFormat(browser), 'gemini-legacy2019');
  await buildPreview(browser);
  assert.equal(await packageState(browser), 'ready');
  assert.match((await previewNames(browser)).zip, /-Kart\.zip$/);
});

layerTest('the same route with Discard and Fortsett redigering: nothing is altered, and the way back holds through both', async (browser) => {
  await openExport(browser);
  await setLabel(browser, 'Forkast');
  await openCompletionFromExport(browser);
  await openPlacementMap(browser);
  await placeOnMap(browser);

  // Fortsett redigering: still on the map, with the staged value and the journey.
  await askToLeaveMap(browser);
  await clickSourceControl(browser, 'Fortsett redigering', boundary);
  await browser.waitFor(`!${boundary}`);
  assert.equal(await browser.evaluate(`${flowCount}.dataset.flowStaged`), '1');
  assert.equal(await browser.evaluate(`Boolean(${hub}) || Boolean(${exportDialog})`), false);
  await browser.evaluate('document.activeElement.blur()');
  await escape(browser);
  await browser.waitFor(boundary);
  await escape(browser);
  await browser.waitFor(`!${boundary}`);
  assert.equal(await browser.evaluate(`${flowCount}.dataset.flowStaged`), '1', 'Escape at the boundary is the same choice');

  await askToLeaveMap(browser);
  await clickSourceControl(browser, 'Forkast endringer', boundary);
  await browser.waitFor(hub);
  assert.deepEqual(await hubFooter(browser), ['Tilbake til eksport']);
  await returnToExport(browser);
  await onDelivery(browser, 'after Discard');
  assert.equal(await excluded(browser), LEFT_OUT, 'a discarded placement never counted');
  assert.match(await footerStatus(browser), /2 bilder i pakken/);
  assert.equal(await label(browser), 'Forkast');

  // Nothing staged: Escape and the tool itself both go back through the hub, and the way back stays.
  await openCompletionFromExport(browser);
  await openPlacementMap(browser);
  await escape(browser);
  await browser.waitFor(hub);
  assert.deepEqual(await hubFooter(browser), ['Tilbake til eksport'], 'Escape on the map');
  await openPlacementMap(browser);
  await openTool(browser, 'Fullfør opplysninger…');
  await browser.waitFor(hub);
  assert.deepEqual(await hubFooter(browser), ['Tilbake til eksport'], 'during a handoff the tool is the way back');

  // Saving at the boundary is the same commit.
  await openPlacementMap(browser);
  await placeOnMap(browser);
  await askToLeaveMap(browser);
  await clickSourceControl(browser, 'Lagre endringer', boundary);
  await browser.waitFor(hub);
  await returnToExport(browser);
  assert.equal(await excluded(browser), null);
  assert.equal(await label(browser), 'Forkast');
});

layerTest('wizard → hub → positioning wizard → hub → wizard, cancelled and applied', async (browser, directory) => {
  const openPositioning = async () => {
    await showTask(browser, 'placement');
    await realClick(browser, buttonIn(panel('placement'), 'Koble og posisjoner bilder…'));
    await browser.waitFor(`${sourceWizard}?.open && !${hub}`);
    assert.equal(await openDialogs(browser), 1, 'one workspace dialog at a time');
  };
  await openExport(browser);
  await setLabel(browser, 'Kilde');
  await openCompletionFromExport(browser);

  await openPositioning();
  await clickSourceControl(browser, 'Avbryt');
  await browser.waitFor(`!${sourceWizard} && ${hub}`);
  assert.deepEqual(await hubFooter(browser), ['Tilbake til eksport']);
  await returnToExport(browser);
  assert.equal(await excluded(browser), LEFT_OUT, 'cancelling changes nothing');
  assert.equal(await label(browser), 'Kilde');

  const extra = path.join(directory, 'ekstra.gml');
  await writeFile(extra, completionGmlText([{ name: 'loose.jpg', direction: '75' }]));
  await openCompletionFromExport(browser);
  await openPositioning();
  await stagePhotoSource(browser, extra, 'gml');
  await savePhotoSource(browser, 'gml');
  await applyPhotoSourcePositions(browser, 'gml', { filename: 'loose.jpg', sourceFilename: 'ekstra.gml' });
  await browser.waitFor(`${hub} && !${sourceWizard}`);
  assert.deepEqual(await hubFooter(browser), ['Tilbake til eksport'], 'the way back survived the positioning wizard');
  await returnToExport(browser);
  await onDelivery(browser, 'after applying positions');
  assert.equal(await excluded(browser), null, 'the applied position counts');
  assert.equal(await label(browser), 'Kilde');
  assert.equal(await selectedFormat(browser), 'gemini-legacy2019');
});

// The event from a dialog's own cleanup comes in a later task. The real ones are waited out, and one is then sent by hand to
// the old element, so this does not rest on when the browser happens to fire it. The old hub's handler is the risky one: it
// leads back to export, so a late event from the swap to the map would open the wizard over Edit mode.
layerTest('dialog swaps: a late close event from the old dialog never reaches the new screen, in any direction', async (browser) => {
  const keep = (expression) => browser.evaluate(`window.__old = ${expression}; undefined`);
  const lateClose = async () => { await delay(800); await browser.evaluate(`window.__old.dispatchEvent(new Event('close')); undefined`); await delay(300); };

  await openExport(browser);
  await keep(exportDialog);
  await openCompletionFromExport(browser);
  await lateClose();
  assert(await browser.evaluate(`Boolean(${hub})`), 'wizard → hub');
  assert.equal(await browser.evaluate(`Boolean(${exportDialog})`), false);

  await keep(hub);
  await returnToExport(browser);
  await lateClose();
  assert(await browser.evaluate(`Boolean(${exportDialog}?.open)`), 'hub → wizard');
  assert.equal(await browser.evaluate(`Boolean(${hub})`), false);
  await onDelivery(browser, 'hub → wizard');

  await openCompletionFromExport(browser);
  await showTask(browser, 'placement');
  await keep(hub);
  await openPlacementMap(browser);
  await lateClose();
  assert.equal(await openDialogs(browser), 0, 'hub → map: nothing opens over Edit mode');
  assert(await browser.evaluate(`Boolean(${flowRow})`), 'the handoff is intact');
  await escape(browser);
  await browser.waitFor(hub);
  assert.deepEqual(await hubFooter(browser), ['Tilbake til eksport'], 'and so is the way back');

  await showTask(browser, 'placement');
  await keep(hub);
  await realClick(browser, buttonIn(panel('placement'), 'Koble og posisjoner bilder…'));
  await browser.waitFor(`${sourceWizard}?.open && !${hub}`);
  await lateClose();
  assert.equal(await openDialogs(browser), 1, 'hub → positioning wizard');
  assert.equal(await browser.evaluate(`Boolean(${exportDialog})`), false);
  await clickSourceControl(browser, 'Avbryt');
  await browser.waitFor(hub);

  // The other side of the guard: a close the browser makes by itself still counts, and leads the same way as every other exit.
  await browser.evaluate(`${hub}.close()`);
  await browser.waitFor(`${exportDialog} && !${hub}`);
  await onDelivery(browser, 'a browser close of the hub');
  await browser.evaluate(`${exportDialog}.close()`);
  await browser.waitFor(`!${exportDialog}`);
  assert.equal(await openDialogs(browser), 0, 'a browser close of the wizard');
});

// No screen can make a commit fail this way: staging validates each value, and the subscriber clears a ticket that has ended. So the
// fault is injected at the commit: a real staged change and a real Save, with position validation failing for that one click. The
// session then refuses it with the ticket still live. The retry after a conflict shares this code, and no screen can reach it.
layerTest('a failed commit ends the journey, by the bar and by the boundary: nothing is saved, and nothing reopens', async (browser) => {
  const refusedClick = (expression) => browser.evaluate(`(() => { const finite = Number.isFinite; Number.isFinite = () => false; try { (${expression}).click(); } finally { Number.isFinite = finite; } })()`);
  const assertAbandoned = async (context) => {
    await browser.waitFor(`!${commandBar}`);
    await delay(300);
    assert.equal(await openDialogs(browser), 0, `${context}: nothing opens`);
    assert.match(await browser.evaluate('document.body.innerText'), /Redigeringen ble avsluttet fordi fotolaget ble endret\./, context);
    // With a handoff left over, this tool would go back into the journey instead.
    await openStandaloneHub(browser);
    assert.deepEqual(await hubFooter(browser), ['Gå til eksport', 'Lukk'], `${context}: the way back is gone`);
    await browser.evaluate(`${hub}.querySelector('[data-task="placement"]').click()`);
    assert.equal(await browser.evaluate(`${hub}.querySelector('[data-task="placement"] [data-outstanding]').dataset.outstanding`), '1', `${context}: nothing was saved`);
    await clickSourceControl(browser, 'Gå til eksport', hub);
    await browser.waitFor(`${exportDialog} && !${hub}`);
    assert.equal(await excluded(browser), LEFT_OUT, context);
    assert.equal(await label(browser), 'Svikt', `${context}: settings stay`);
  };
  await openExport(browser);
  await setLabel(browser, 'Svikt');
  await openCompletionFromExport(browser);
  await openPlacementMap(browser);
  await placeOnMap(browser);
  await refusedClick(buttonIn(commandBar, 'Lagre endringer'));
  await assertAbandoned('the bar');

  await openCompletionFromExport(browser);
  await openPlacementMap(browser);
  await placeOnMap(browser);
  await askToLeaveMap(browser);
  await refusedClick(buttonIn(boundary, 'Lagre endringer'));
  await assertAbandoned('the boundary');
});

// Where the second click lands depends on the layout, so it is aimed at the real next control, in the position measured there.
layerTest('double-clicks: the second click never activates the next dialog, and an ordinary click there still works', async (browser) => {
  await watchWork(browser);
  const secondClick = (point) => pressAt(browser, point, 2);
  const under = (point, expression) => browser.evaluate(`document.elementFromPoint(${point.x}, ${point.y}) === (${expression})`);

  await openExport(browser);
  const nextPoint = await elementCentre(browser, advance);
  await openCompletionFromExport(browser);
  const backPoint = await elementCentre(browser, hubBack);
  await returnToExport(browser);

  // Fullfør opplysninger… → the hub's Tilbake til eksport.
  await delay(700);
  await realClick(browser, completion);
  await browser.waitFor(`${hub} && !${exportDialog}`);
  await delay(100);
  assert(await under(backPoint, hubBack), 'the second click is aimed at the real control');
  await secondClick(backPoint);
  await delay(300);
  assert(await browser.evaluate(`Boolean(${hub})`), 'the second click did not send the user straight back');

  // Tilbake til eksport → Neste. A build would read the two originals.
  await delay(700);
  await realClick(browser, hubBack);
  await browser.waitFor(`${exportDialog} && !${hub}`);
  await delay(100);
  assert(await under(nextPoint, advance), 'the second click is aimed at the real control');
  await secondClick(nextPoint);
  await delay(300);
  await onDelivery(browser, 'the second click did not build a plan');
  assert.equal(await browser.evaluate('window.__fileReads'), 0);

  // Gå til eksport → Neste.
  await closeExport(browser);
  await openStandaloneHub(browser);
  await delay(700);
  await realClick(browser, hubGo);
  await browser.waitFor(`${exportDialog} && !${hub}`);
  await delay(100);
  assert(await under(nextPoint, advance));
  await secondClick(nextPoint);
  await delay(300);
  await onDelivery(browser, 'Gå til eksport');
  assert.equal(await browser.evaluate('window.__fileReads'), 0);

  // The guard is gone, and a click of its own does what it should.
  await delay(700);
  await pressAt(browser, nextPoint);
  await browser.waitFor(`${exportDialog}.querySelector('[data-package-state="ready"]')`);
});

layerTest('every way out of a hub opened from export leads to Leveranse, and repeated Escape walks out one step at a time', async (browser) => {
  await openExport(browser);
  await setLabel(browser, 'Ut');
  const arrived = async (context) => {
    await browser.waitFor(`${exportDialog}?.open && !${hub}`);
    await onDelivery(browser, context);
    assert.equal(await label(browser), 'Ut', context);
    assert.equal(await hasFocus(browser, `${exportDialog}.querySelector('[data-export-heading]')`), true, context);
  };

  await openCompletionFromExport(browser);
  await realClick(browser, buttonIn(hub, 'Tilbake til eksport'));
  await arrived('footer');
  await openCompletionFromExport(browser);
  await realClick(browser, buttonIn(hub, 'Lukk Fullfør opplysninger'));
  await arrived('✕');
  await openCompletionFromExport(browser);
  await escape(browser);
  await arrived('Escape');

  // Escape without a user action since the last one: Chrome then closes without cancel, which is the case onClose covers.
  await openCompletionFromExport(browser);
  await escape(browser);
  await arrived('first Escape');
  await escape(browser);
  await browser.waitFor(`!${exportDialog}`);
  assert.equal(await hasFocus(browser, toolsTrigger), true, 'the second leaves the wizard, focus on Verktøy');
  await escape(browser);
  await delay(300);
  assert.equal(await openDialogs(browser), 0, 'a third has nothing to close');
  assert.equal(await hasFocus(browser, toolsTrigger), true);

  // The wizard's own exits are unchanged after a return.
  for (const [name, leave] of Object.entries({
    '✕': () => clickSourceControl(browser, 'Lukk eksport', exportDialog),
    Avbryt: () => clickSourceControl(browser, 'Avbryt', exportDialog),
  })) {
    await openExport(browser);
    await openCompletionFromExport(browser);
    await returnToExport(browser);
    await leave();
    await browser.waitFor(`!${exportDialog}`);
    assert.equal(await hasFocus(browser, toolsTrigger), true, name);
    assert.equal(await openDialogs(browser), 0, name);
  }

  // After all of that the journey is over: the hub on its own is the hub on its own.
  await openStandaloneHub(browser);
  assert.deepEqual(await hubFooter(browser), ['Gå til eksport', 'Lukk']);
});

layerTest('keyboard: the whole trip works by key, focus is always somewhere sensible, and a second Enter does nothing', async (browser) => {
  await openExport(browser);
  await browser.evaluate(`${completion}.focus()`);
  await pressEnter(browser);
  await browser.waitFor(`${hub} && !${exportDialog}`);
  assert.equal(await browser.evaluate(`document.activeElement.hasAttribute('data-completion-heading')`), true);
  await pressEnter(browser);
  await delay(200);
  assert(await browser.evaluate(`Boolean(${hub})`), 'Enter on the heading does nothing');

  await browser.evaluate(`${hubBack}.focus()`);
  await pressEnter(browser);
  await browser.waitFor(`${exportDialog} && !${hub}`);
  assert.equal(await hasFocus(browser, `${exportDialog}.querySelector('[data-export-heading]')`), true);
  await pressEnter(browser);
  await delay(200);
  await onDelivery(browser, 'Enter on the heading builds nothing');

  // Tab stays inside the dialog that is open, so nothing behind it can be reached.
  await pressKey(browser, 'Tab', KEYS.Tab);
  assert.equal(await browser.evaluate(`${exportDialog}.contains(document.activeElement)`), true);

  // Tilbake til opplysninger on the map, then the hub, then export, all by key.
  await browser.evaluate(`${completion}.focus()`);
  await pressEnter(browser);
  await browser.waitFor(hub);
  await openPlacementMap(browser);
  await browser.evaluate(`${buttonIn(flowRow, 'Tilbake til opplysninger')}.focus()`);
  await pressEnter(browser);
  await browser.waitFor(hub);
  assert.equal(await browser.evaluate(`document.activeElement.hasAttribute('data-completion-heading')`), true);
  await escape(browser);
  await browser.waitFor(`${exportDialog} && !${hub}`);
  await onDelivery(browser, 'Escape from the hub');
  await escape(browser);
  await browser.waitFor(`!${exportDialog}`);
  assert.equal(await hasFocus(browser, toolsTrigger), true, 'the original opener, after the whole trip');
});

layerTest('the hub on its own: Gå til eksport, not Tilbake, on every return, and Lukk stays in the workspace', async (browser) => {
  await openExport(browser);
  await setLabel(browser, 'Egen');
  await closeExport(browser);

  await openStandaloneHub(browser);
  assert.deepEqual(await hubFooter(browser), ['Gå til eksport', 'Lukk']);
  for (const [name, leave] of Object.entries({
    Lukk: () => browser.evaluate(`${buttonIn(hub, 'Lukk')}.click()`),
    '✕': () => browser.evaluate(`${buttonIn(hub, 'Lukk Fullfør opplysninger')}.click()`),
    Escape: () => escape(browser),
  })) {
    await leave();
    await browser.waitFor(`!${hub}`);
    await delay(200);
    assert.equal(await browser.evaluate(`Boolean(${exportDialog})`), false, `${name} does not lead to export`);
    await openStandaloneHub(browser);
  }

  // A trip to the map keeps it the hub on its own.
  await openPlacementMap(browser);
  await escape(browser);
  await browser.waitFor(hub);
  assert.deepEqual(await hubFooter(browser), ['Gå til eksport', 'Lukk']);

  await realClick(browser, hubGo);
  await browser.waitFor(`${exportDialog} && !${hub}`);
  await onDelivery(browser, 'Gå til eksport');
  assert.equal(await label(browser), 'Egen');
  assert.doesNotMatch(await footerStatus(browser), /Kontrollen er oppdatert/, 'going is not a return');
  assert.equal(await hasFocus(browser, `${exportDialog}.querySelector('[data-export-heading]')`), true);

  // From there the wizard is an ordinary one: its hub leads back, and closing it leads out.
  await openCompletionFromExport(browser);
  assert.deepEqual(await hubFooter(browser), ['Tilbake til eksport']);
  await returnToExport(browser);
  await closeExport(browser);
  assert.equal(await hasFocus(browser, toolsTrigger), true);
  assert.equal(await openDialogs(browser), 0);
});

layerTest('another tool ends the journey, only after the boundary, and nothing comes back afterwards', async (browser) => {
  const startJourney = async () => { await openExport(browser); await openCompletionFromExport(browser); await openPlacementMap(browser); };
  const assertEnded = async (context) => {
    await delay(300);
    await openStandaloneHub(browser);
    assert.deepEqual(await hubFooter(browser), ['Gå til eksport', 'Lukk'], context);
    await browser.evaluate(`${buttonIn(hub, 'Lukk')}.click()`);
    await browser.waitFor(`!${hub}`);
  };

  // Passing the boundary ends it. Export opens as an ordinary opening, and the choices are still there.
  await openExport(browser);
  await setLabel(browser, 'Verktøy');
  await closeExport(browser);
  await startJourney();
  await openTool(browser, 'Eksporter…');
  await browser.waitFor(`${exportDialog} && !${commandBar}`);
  assert.doesNotMatch(await footerStatus(browser), /Kontrollen er oppdatert/);
  assert.equal(await label(browser), 'Verktøy', 'settings stay in config');
  await closeExport(browser);
  assert.equal(await hasFocus(browser, toolsTrigger), true);
  await assertEnded('Eksporter…');

  await startJourney();
  await openTool(browser, 'Kilder og koblinger');
  await browser.waitFor(`!${commandBar} && document.querySelector('dialog[open]')`);
  await browser.evaluate(`document.querySelector('dialog[open]').close()`);
  await browser.waitFor(`!document.querySelector('dialog[open]')`);
  await assertEnded('Kilder og koblinger');

  await startJourney();
  await openTool(browser, 'Koble og posisjoner bilder…');
  await browser.waitFor(`${sourceWizard}?.open`);
  await clickSourceControl(browser, 'Avbryt');
  await browser.waitFor(`!${sourceWizard}`);
  await delay(300);
  assert.equal(await browser.evaluate(`Boolean(${hub}) || Boolean(${exportDialog})`), false, 'a positioning trip of its own returns nowhere');
  await assertEnded('Koble og posisjoner bilder…');

  // Eksporter… during the trip, with something staged: stopped at the boundary, and Fortsett redigering loses nothing.
  await startJourney();
  await placeOnMap(browser);
  await openTool(browser, 'Eksporter…');
  await browser.waitFor(boundary);
  await clickSourceControl(browser, 'Fortsett redigering', boundary);
  await browser.waitFor(`!${boundary}`);
  await realClick(browser, buttonIn(commandBar, 'Lagre endringer'));
  await browser.waitFor(hub);
  assert.deepEqual(await hubFooter(browser), ['Tilbake til eksport'], 'the journey survived the cancelled boundary');
  await returnToExport(browser);
  assert.equal(await browser.evaluate(`Boolean(${exportDialog}.querySelector('[data-export-excluded]'))`), false);
  await closeExport(browser);
});

layerTest('leaving FOTO, removing the layer and resetting the session clear the journey, and nothing reopens', async (browser, directory) => {
  const exit = () => clickSourceControl(browser, 'Tilbake til appen', 'document');
  const openLayer = async () => { await browser.evaluate(`document.querySelector('button[aria-label^="Åpne bildemodul"]').click()`); await browser.waitFor(shell); };
  const nothingOpen = async (context) => { await delay(300); assert.equal(await openDialogs(browser), 0, context); assert.equal(await browser.evaluate(`Boolean(${commandBar})`), false, context); };

  // Leaving from the hub. The hub is modal, so a person gets out through the map; the script covers the state itself.
  await openExport(browser);
  await setLabel(browser, 'Lag');
  await openCompletionFromExport(browser);
  await exit();
  await browser.waitFor(`!${shell}`);
  await nothingOpen('leaving from the hub');
  await openLayer();
  await nothingOpen('entering again');
  await openStandaloneHub(browser);
  assert.deepEqual(await hubFooter(browser), ['Gå til eksport', 'Lukk'], 'the journey did not survive leaving');
  await browser.evaluate(`${buttonIn(hub, 'Lukk')}.click()`);
  await browser.waitFor(`!${hub}`);

  // Leaving from the map with something staged: the boundary first.
  await openExport(browser);
  await openCompletionFromExport(browser);
  await openPlacementMap(browser);
  await placeOnMap(browser);
  await exit();
  await browser.waitFor(boundary);
  await clickSourceControl(browser, 'Fortsett redigering', boundary);
  await browser.waitFor(`!${boundary}`);
  assert(await browser.evaluate(`Boolean(${shell})`), 'still in FOTO');
  await exit();
  await browser.waitFor(boundary);
  await clickSourceControl(browser, 'Forkast endringer', boundary);
  await browser.waitFor(`!${shell}`);
  await nothingOpen('leaving from the map');

  // A second layer, then a journey on it, and the first layer removed from outside. Settings go with their layer.
  await buildLayer(browser, directory);
  await openExport(browser);
  assert.equal(await label(browser), '', 'each layer has its own settings');
  await setLabel(browser, 'Andre');
  await openCompletionFromExport(browser);
  await openPlacementMap(browser);
  await exit();
  await browser.waitFor(`!${shell}`);
  await nothingOpen('leaving the second layer');
  assert.equal(await browser.evaluate(`document.querySelectorAll('button[aria-label^="Fjern fotokartlag"]').length`), 2);
  await browser.evaluate(`document.querySelectorAll('button[aria-label^="Fjern fotokartlag"]')[1].click()`);
  await clickSourceControl(browser, 'Fjern', 'document');
  await browser.waitFor(`document.querySelectorAll('button[aria-label^="Fjern fotokartlag"]').length === 1`);
  await nothingOpen('removing the layer');
  await openLayer();
  await nothingOpen('entering the remaining layer');
  await openStandaloneHub(browser);
  assert.deepEqual(await hubFooter(browser), ['Gå til eksport', 'Lukk']);
  await browser.evaluate(`${buttonIn(hub, 'Lukk')}.click()`);
  await browser.waitFor(`!${hub}`);

  // Reset, with a journey under way until the workspace was left.
  await openExport(browser);
  const kept = await label(browser);
  await setLabel(browser, 'Nullstill');
  await openCompletionFromExport(browser);
  await openPlacementMap(browser);
  await exit();
  await browser.waitFor(`!${shell}`);
  await browser.evaluate(`document.querySelector('[aria-label="Nullstill og åpne ny fil"]').click()`);
  await browser.waitFor(`!document.querySelector('button[aria-label^="Fjern fotokartlag"]')`);
  await nothingOpen('reset');
  assert.notEqual(kept, 'Nullstill');

  // The next session starts from nothing.
  await buildLayer(browser, directory);
  await openExport(browser);
  assert.equal(await label(browser), '', 'no setting survives a reset');
  assert.doesNotMatch(await footerStatus(browser), /Kontrollen er oppdatert/);
  await closeExport(browser);
  await openStandaloneHub(browser);
  assert.deepEqual(await hubFooter(browser), ['Gå til eksport', 'Lukk']);
}, { timeout: 420000 });

// A person cannot reach either control inside FOTO, so leaving comes first and the test above ends the journey that way. These
// take the real click handlers from outside the workspace and run them mid-journey, which is what a late session change does.
for (const where of ['hub', 'map', 'positioning wizard']) for (const how of ['remove', 'reset']) {
  layerTest(`${how === 'remove' ? 'the layer is removed' : 'the session is reset'} while the journey is on the ${where}: everything closes and nothing comes back`, async (browser, directory) => {
    const capture = (expression, name) => browser.evaluate(`(() => { const element = ${expression}, key = Object.keys(element).find((item) => item.startsWith('__reactProps')); window.${name} = element[key].onClick; })()`);
    await clickSourceControl(browser, 'Tilbake til appen', 'document');
    await browser.waitFor(`!${shell}`);
    await browser.evaluate(`document.querySelector('button[aria-label^="Fjern fotokartlag"]').click()`);
    await browser.waitFor(`Array.from(document.querySelectorAll('button')).some((item) => item.innerText.trim() === 'Fjern')`);
    await capture(`Array.from(document.querySelectorAll('button')).find((item) => item.innerText.trim() === 'Fjern')`, '__remove');
    await capture(`document.querySelector('[aria-label="Nullstill og åpne ny fil"]')`, '__reset');
    await browser.evaluate(`document.querySelector('button[aria-label^="Åpne bildemodul"]').click()`);
    await browser.waitFor(shell);

    await openExport(browser);
    await setLabel(browser, 'Borte');
    await openCompletionFromExport(browser);
    if (where === 'map') { await openPlacementMap(browser); await placeOnMap(browser); }
    if (where === 'positioning wizard') {
      await showTask(browser, 'placement');
      await realClick(browser, buttonIn(panel('placement'), 'Koble og posisjoner bilder…'));
      await browser.waitFor(`${sourceWizard}?.open && !${hub}`);
    }

    await browser.evaluate(`window.${how === 'remove' ? '__remove' : '__reset'}(); undefined`);
    await browser.waitFor(`!${shell}`);
    await delay(800);
    assert.equal(await openDialogs(browser), 0, 'nothing is left open');
    assert.equal(await browser.evaluate(`Boolean(${commandBar}) || Boolean(document.querySelector('.photo-edit-boundary'))`), false, 'and Edit mode is over');
    assert.equal(await browser.evaluate(`document.querySelectorAll('button[aria-label^="Fjern fotokartlag"]').length`), 0);

    await buildLayer(browser, directory);
    await delay(300);
    assert.equal(await openDialogs(browser), 0, 'a new layer opens clean');
    await openStandaloneHub(browser);
    assert.deepEqual(await hubFooter(browser), ['Gå til eksport', 'Lukk'], 'no way back to a layer that is gone');
    await realClick(browser, hubGo);
    await browser.waitFor(`${exportDialog} && !${hub}`);
    assert.equal(await label(browser), '', 'its settings went with it');
    assert.doesNotMatch(await footerStatus(browser), /Kontrollen er oppdatert/);
  });
}
