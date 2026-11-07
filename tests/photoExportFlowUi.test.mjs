import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { completionGmlText } from './helpers/photoCompletionFixtures.mjs';
import { gmiFile } from './helpers/gmiPhotoFixtures.mjs';
import { buildPreview, closeExport, exportDialog, openExport, selectedFormat } from './helpers/photoExportWizard.mjs';
import { gpsJpeg } from './helpers/photoGpsFixtures.mjs';
import { addImportFiles, createLayerWithoutPlacement, importDialog, retainGmlInWorkspace } from './helpers/photoImportWizard.mjs';
import { applyPhotoSourcePositions, clickSourceControl, savePhotoSource, sourceWizard, stagePhotoSource } from './helpers/photoSourceWorkflow.mjs';
import { KEYS, commandBar, elementCentre, enterEditMode, openTool, pressKey, rotateSelected } from './helpers/photoWorkspace.mjs';

// Fullfør opplysninger to the map or the positioning wizard and back, in the real app: native dialogs, real mouse and keyboard.
const app = process.env.PHOTO_UI_URL, corpus = process.env.PHOTO_GML_FIXTURE;
const hub = 'document.querySelector(".photo-completion-dialog[open]")';
const boundary = 'document.querySelector(".photo-edit-boundary[open]")';
const flowRow = `${commandBar}?.querySelector('.photo-edit-flow-row')`;
const flowCount = `${flowRow}?.querySelector('.photo-edit-flow-count')`;
const panel = (key) => `${hub}?.querySelector('[data-completion-panel="${key}"]')`;
const taskButton = (key) => `${hub}.querySelector('[data-task="${key}"]')`;
const buttonIn = (scope, label) => `Array.from(${scope}.querySelectorAll('button')).find((item) => item.innerText.trim() === ${JSON.stringify(label)} || item.getAttribute('aria-label') === ${JSON.stringify(label)})`;
const rowOf = (name) => `Array.from(${hub}.querySelectorAll('[data-completion-row]')).find((item) => item.querySelector('.photo-completion-filename')?.innerText.includes(${JSON.stringify(name)}))`;

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
const pressAt = async (browser, x, y, clicks) => {
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  for (let clickCount = 1; clickCount <= clicks; clickCount++) {
    await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount });
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount });
  }
};
const realClick = async (browser, expression, clicks = 1) => {
  await browser.evaluate(`(${expression}).scrollIntoView({ block: 'center' })`);
  const { x, y } = await elementCentre(browser, expression);
  await pressAt(browser, x, y, clicks);
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 300));
const openHub = async (browser) => { await openTool(browser, 'Fullfør opplysninger…'); await browser.waitFor(hub); };
const showTask = async (browser, key) => { await browser.evaluate(`${taskButton(key)}.click()`); await browser.waitFor(panel(key)); };
const closeHub = async (browser) => { await browser.evaluate(`${hub}.querySelector('.photo-import-footer .gmi-primary-control').click()`); await browser.waitFor(`!${hub}`); };
const outstanding = (browser, key) => browser.evaluate(`${taskButton(key)}.querySelector('.photo-completion-task-count')?.dataset.outstanding ?? (${taskButton(key)}.querySelector('.photo-completion-task-done') ? 'done' : null)`);
const statusLine = (browser) => browser.evaluate(`${hub}.querySelector('[data-completion-status]').innerText`);
const hubMessage = (browser) => browser.evaluate(`${hub}.querySelector('.photo-import-footer [role=status]').innerText`);
const activeTask = (browser) => browser.evaluate(`${hub}.querySelector('[aria-current="true"]').dataset.task`);
const doneValues = (browser) => browser.evaluate(`Array.from(${panel('direction')}.querySelectorAll('[data-group="done"] [data-accepted-value]')).map((item) => item.innerText)`);
const counts = (browser) => browser.evaluate(`[${flowCount}.dataset.flowOutstanding, ${flowCount}.dataset.flowStaged].map(Number)`);
const listed = (browser) => browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-list li[data-photo-id] .photo-workspace-filename')).map((item) => item.innerText)`);
const activeName = (browser) => browser.evaluate(`document.querySelector('.photo-workspace-active .photo-workspace-filename')?.innerText ?? null`);
const summary = (browser) => browser.evaluate(`document.querySelector('.photo-filter-summary span')?.innerText ?? ''`);
const filterToggle = `document.querySelector('button[aria-label^="Filtrer bilder"]')`;
const filterPlaced = async (browser) => {
  await browser.evaluate(`${filterToggle}.click()`);
  await browser.waitFor('document.querySelector(".photo-filter-panel")');
  await browser.evaluate(`document.querySelector('.photo-filter-panel input[value="placed"]').click()`);
  await browser.evaluate(`${filterToggle}.click()`);
  await browser.waitFor('document.querySelector(".photo-filter-summary")');
};
const defaultCount = async (browser) => { await showTask(browser, 'direction'); return browser.evaluate(`${panel('direction')}.querySelector('[data-count="default"] dd')?.innerText ?? '0'`); };
const manualValues = async (browser) => (await doneValues(browser)).filter((value) => value.includes('Manuell'));
const openDone = (browser) => browser.evaluate(`(() => { const group = ${panel('direction')}.querySelector('[data-group="done"]'); group.open = true; })()`);
// Carries the text a real key press has: without it Chrome does not activate a focused button.
const pressEnter = async (browser) => {
  const text = String.fromCharCode(13);
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text, unmodifiedText: text });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
};
const openDialogs = (browser) => browser.evaluate(`document.querySelectorAll('dialog[open]').length`);

const openDirectionMap = async (browser) => { await realClick(browser, buttonIn(panel('direction'), 'Angi på kartet')); await browser.waitFor(flowRow); };
const startDirection = async (browser) => { await openHub(browser); await showTask(browser, 'direction'); await openDirectionMap(browser); };
const backToHub = async (browser) => { await realClick(browser, buttonIn(flowRow, 'Tilbake til opplysninger')); await browser.waitFor(hub); };
const next = async (browser, name) => { await realClick(browser, buttonIn(flowRow, 'Neste')); await browser.waitFor(`document.querySelector('.photo-workspace-active .photo-workspace-filename')?.innerText === ${JSON.stringify(name)}`); };
const previous = async (browser, name) => { await realClick(browser, buttonIn(flowRow, 'Forrige bilde')); await browser.waitFor(`document.querySelector('.photo-workspace-active .photo-workspace-filename')?.innerText === ${JSON.stringify(name)}`); };
const selectListRow = async (browser, name) => {
  await browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-list li[data-photo-id]')).find((item) => item.querySelector('.photo-workspace-filename').innerText === ${JSON.stringify(name)}).querySelector('button').click()`);
  await browser.waitFor(`document.querySelector('.photo-workspace-active .photo-workspace-filename')?.innerText === ${JSON.stringify(name)}`);
};
// The Edit-mode field, used as a person would: focus, type, Enter.
const typeDirection = async (browser, degrees) => {
  const input = `${commandBar}.querySelector('.photo-edit-direction-field input')`;
  await browser.evaluate(`(() => { const element = ${input}; element.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, ${JSON.stringify(String(degrees))});
    element.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await pressKey(browser, 'Enter', KEYS.Enter);
};

// Each file exercises one state. "unplaced" has no GML feature, so it stays unplaced. Only "north" has a direction from a
// source; the five others get the default, which is what Angi på kartet is for.
const FILES = {
  'match.jpg': { captureTime: '2026:05:12 14:33:02', subsecond: '012' },
  'conflict.jpg': { captureTime: '2026:05:12 14:33:02' },
  'minute.jpg': {},
  'heading.jpg': { captureTime: '2026:05:12 15:00:10' },
  'blank.jpg': {},
  'north.jpg': {},
  'unplaced.jpg': { captureTime: '2026:05:12 16:00:00' },
};
const FEATURES = [
  { name: 'match.jpg', time: '2026-05-12T14:33:02' },
  { name: 'conflict.jpg', time: '2026-05-12T14:40:00' },
  { name: 'minute.jpg', time: '2026-05-12T14:33' },
  { name: 'heading.jpg' },
  { name: 'blank.jpg' },
  { name: 'north.jpg', direction: '0' },
];

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
}

const layerTest = (name, run, { timeout = 240000, viewport } = {}) => test(name, { skip: !chromePath || !app, timeout }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'photo-flow-ui-'));
  const browser = await openTestChrome();
  try {
    await openApp(browser, viewport);
    await buildLayer(browser, directory);
    await run(browser, directory);
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});

layerTest('Angi på kartet: filter, selection, staged counts, Neste and Forrige, then Save returns with updated readiness', async (browser) => {
  // Something to come back to: a filter of the user's own, and a selected occurrence.
  await filterPlaced(browser);
  await selectListRow(browser, 'match.jpg');
  await openHub(browser);
  assert.equal(await defaultCount(browser), '5');
  await openDirectionMap(browser);

  assert.equal(await openDialogs(browser), 0, 'the hub is swapped out, not stacked');
  assert.deepEqual(await listed(browser), ['blank.jpg', 'conflict.jpg', 'heading.jpg', 'match.jpg', 'minute.jpg'], 'the unplaced photo is out of scope');
  assert.equal(await activeName(browser), 'blank.jpg');
  assert.match(await summary(browser), /Standardretning/);
  assert.equal(await browser.evaluate(`document.activeElement === ${flowRow}`), true, 'focus moves to the handoff controls');
  assert.deepEqual(await counts(browser), [5, 0]);
  assert.equal(await browser.evaluate(`${flowRow}.querySelector('.photo-edit-flow-position').innerText`), '1 av 5');
  assert.equal(await browser.evaluate(`Array.from(${commandBar}.querySelectorAll('button')).some((item) => item.innerText.trim() === 'Avslutt redigering')`), false, 'Tilbake takes its place');

  await rotateSelected(browser, 90);
  await browser.waitFor(`${flowCount}.dataset.flowStaged === '1'`);
  assert.deepEqual(await counts(browser), [4, 1], 'staged values are counted apart from saved ones');
  assert.match(await browser.evaluate(`${flowCount}.innerText`), /Standardretning: 4 · 1 ulagret/);
  assert.match(await browser.evaluate(`${flowCount}.getAttribute('aria-label')`), /1 plassering har ulagrede endringer/);
  await screenshot(browser, 'flow-direction-1680');

  await next(browser, 'conflict.jpg');
  assert.deepEqual(await counts(browser), [4, 1], 'moving on commits nothing');
  assert.equal(await browser.evaluate(`${commandBar}.querySelector('[data-edit-count]').innerText`), '1 endret');
  assert(await listed(browser).then((names) => names.includes('blank.jpg')), 'a staged occurrence stays on the list');
  await typeDirection(browser, 200);
  await browser.waitFor(`${flowCount}.dataset.flowStaged === '2'`);
  await previous(browser, 'blank.jpg');
  assert.equal(await browser.evaluate(`${commandBar}.querySelector('.photo-edit-direction-field input').value`), '90', 'Forrige shows the staged value again');
  await next(browser, 'heading.jpg');
  assert.deepEqual(await counts(browser), [3, 2], 'Neste skips what already has a value');

  await realClick(browser, buttonIn(commandBar, 'Lagre endringer'));
  await browser.waitFor(hub);
  assert.equal(await browser.evaluate(`Boolean(${commandBar})`), false);
  assert.equal(await activeTask(browser), 'direction');
  assert.equal(await defaultCount(browser), '3', 'readiness now agrees with the bar');
  assert.equal(await hubMessage(browser), 'Retning: 0 gjenstår. 3 har standardretning.');
  assert.equal(await browser.evaluate(`document.activeElement === ${panel('direction')}.querySelector('[data-completion-heading]')`), true);
  await openDone(browser);
  assert.deepEqual(await manualValues(browser), ['Godtatt: 200° S · Manuell', 'Godtatt: 90° Ø · Manuell']);

  await pressKey(browser, 'Escape', KEYS.Escape);
  await browser.waitFor(`!${hub}`);
  assert.equal(await browser.evaluate(`document.activeElement === document.querySelector('.photo-tools-trigger')`), true, 'closing returns focus to Verktøy');
  assert.equal(await activeName(browser), 'match.jpg', 'the earlier selection is back');
  assert.match(await summary(browser), /^Viser 6 av 7 · Plassert$/, 'and so is the earlier filter');
  await openHub(browser);
  assert.equal(await hubMessage(browser), '', 'an ordinary opening is not a return');
});

layerTest('Discard returns to the original data, and cancelling at the boundary neither saves nor discards', async (browser) => {
  await startDirection(browser);
  await rotateSelected(browser, 90);
  await browser.waitFor(`${flowCount}.dataset.flowStaged === '1'`);

  const askToLeave = async () => { await realClick(browser, buttonIn(flowRow, 'Tilbake til opplysninger')); await browser.waitFor(boundary); };
  await askToLeave();
  assert.equal(await browser.evaluate(`Boolean(${hub})`), false, 'the hub waits for the boundary');
  assert.equal(await browser.evaluate(`document.activeElement.innerText`), 'Fortsett redigering', 'the safe choice has focus');
  await pressKey(browser, 'Escape', KEYS.Escape);
  await browser.waitFor(`!${boundary}`);
  assert.deepEqual(await counts(browser), [4, 1], 'Escape keeps editing, with the staged value and the handoff intact');
  assert.equal(await browser.evaluate(`document.activeElement === ${buttonIn(flowRow, 'Tilbake til opplysninger')}`), true);

  await askToLeave();
  await clickSourceControl(browser, 'Fortsett redigering', boundary);
  await browser.waitFor(`!${boundary}`);
  assert.deepEqual(await counts(browser), [4, 1]);

  await browser.evaluate('document.activeElement.blur()');
  await pressKey(browser, 'Escape', KEYS.Escape);
  await browser.waitFor(boundary);
  await clickSourceControl(browser, 'Forkast endringer', boundary);
  await browser.waitFor(hub);
  assert.equal(await activeTask(browser), 'direction');
  assert.equal(await defaultCount(browser), '5', 'nothing from the working copy');
  assert.deepEqual(await manualValues(browser), []);

  // The command bar's own Forkast asks first, and cancelling that keeps the staged value too.
  await openDirectionMap(browser);
  await rotateSelected(browser, 120);
  await browser.waitFor(`${flowCount}.dataset.flowStaged === '1'`);
  await realClick(browser, buttonIn(commandBar, 'Forkast endringer'));
  await browser.waitFor(boundary);
  await pressKey(browser, 'Escape', KEYS.Escape);
  await browser.waitFor(`!${boundary}`);
  assert.deepEqual(await counts(browser), [4, 1]);
  await realClick(browser, buttonIn(commandBar, 'Forkast endringer'));
  await browser.waitFor(boundary);
  await clickSourceControl(browser, 'Forkast', boundary);
  await browser.waitFor(hub);
  assert.equal(await defaultCount(browser), '5');

  // With nothing staged, every way out goes straight back.
  await openDirectionMap(browser);
  await backToHub(browser);
  await openDirectionMap(browser);
  await pressKey(browser, 'Escape', KEYS.Escape);
  await browser.waitFor(hub);
  assert.equal(await openDialogs(browser), 1);

  // A value still being typed counts: leaving commits it to the working copy, so the boundary asks.
  await openDirectionMap(browser);
  await browser.evaluate(`(() => { const element = ${commandBar}.querySelector('.photo-edit-direction-field input'); element.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, '77');
    element.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await realClick(browser, buttonIn(flowRow, 'Tilbake til opplysninger'));
  await browser.waitFor(boundary);
  assert.deepEqual(await counts(browser), [4, 1], 'the typed value is not lost on the way out');
  await clickSourceControl(browser, 'Forkast endringer', boundary);
  await browser.waitFor(hub);
  assert.equal(await defaultCount(browser), '5');

  // Saving at the boundary is the same commit as the command bar's.
  await openDirectionMap(browser);
  await rotateSelected(browser, 45);
  await browser.waitFor(`${flowCount}.dataset.flowStaged === '1'`);
  await askToLeave();
  await clickSourceControl(browser, 'Lagre endringer', boundary);
  await browser.waitFor(hub);
  assert.equal(await defaultCount(browser), '4');
});

layerTest('Plasser på kartet: a double-click on the way in places nothing; the map places, Save returns to Plassering', async (browser) => {
  await openHub(browser);
  await showTask(browser, 'placement');
  assert.equal(await outstanding(browser, 'placement'), '1');
  assert.equal(await defaultCount(browser), '5');
  await showTask(browser, 'placement');
  await realClick(browser, buttonIn(panel('placement'), 'Plasser på kartet'), 2);
  await browser.waitFor(flowRow);
  await settle();
  assert.deepEqual(await counts(browser), [1, 0], 'the second click must not land on the map as a placement');
  assert.equal(await browser.evaluate(`Boolean(${commandBar}.querySelector('[data-edit-count]'))`), false);
  assert.match(await browser.evaluate(`${flowCount}.innerText`), /Mangler plassering: 1/);
  assert.deepEqual(await listed(browser), ['unplaced.jpg']);
  assert.equal(await activeName(browser), 'unplaced.jpg');
  assert.match(await summary(browser), /Uplassert/);
  assert.equal(await browser.evaluate(`${buttonIn(flowRow, 'Neste')}.getAttribute('aria-disabled')`), 'true', 'nothing else to go to');

  const { x, y, height } = await browser.evaluate(`(() => { const box = document.querySelector('.leaflet-container').getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height * .75, height: box.height }; })()`);
  assert(height > 0);
  await pressAt(browser, x, y, 1);
  await browser.waitFor(`${flowCount}.dataset.flowStaged === '1'`);
  assert.deepEqual(await counts(browser), [0, 1]);
  assert.deepEqual(await listed(browser), ['unplaced.jpg'], 'a staged placement stays in the list');
  await screenshot(browser, 'flow-placement-1680');

  await realClick(browser, buttonIn(commandBar, 'Lagre endringer'));
  await browser.waitFor(hub);
  assert.equal(await activeTask(browser), 'placement');
  assert.equal(await outstanding(browser, 'placement'), 'done');
  assert.equal(await defaultCount(browser), '6', 'a placed photo joins the delivery and needs a direction');
});

layerTest('an accepted GML 0° can be corrected on the map; Discard keeps it, Save replaces it, and no other row changes', async (browser) => {
  await openHub(browser);
  await showTask(browser, 'direction');
  assert.equal(await browser.evaluate(`Boolean(${buttonIn(panel('direction'), 'Kontroller 0° på kartet')})`), false, '0° has no route of its own');
  await openDone(browser);
  await realClick(browser, `${rowOf('north.jpg')}.querySelector('.photo-completion-row-action button')`);
  await browser.waitFor(flowRow);
  assert.match(await browser.evaluate(`${flowCount}.innerText`), /Kontroller retning: 1/);
  assert.deepEqual(await listed(browser), ['north.jpg']);
  assert.equal(await browser.evaluate(`${commandBar}.querySelector('.photo-edit-direction-field input').value`), '0');
  assert.equal(await browser.evaluate(`${buttonIn(flowRow, 'Neste')}.getAttribute('aria-disabled')`), 'true');
  await rotateSelected(browser, 135);
  await browser.waitFor(`${flowCount}.dataset.flowStaged === '1'`);
  await realClick(browser, buttonIn(flowRow, 'Tilbake til opplysninger'));
  await browser.waitFor(boundary);
  await clickSourceControl(browser, 'Forkast endringer', boundary);
  await browser.waitFor(hub);
  await openDone(browser);
  assert.match((await doneValues(browser))[0], /^Godtatt: 0° N · GML/, 'the accepted value stands');

  await realClick(browser, `${rowOf('north.jpg')}.querySelector('.photo-completion-row-action button')`);
  await browser.waitFor(flowRow);
  await rotateSelected(browser, 135);
  await browser.waitFor(`${flowCount}.dataset.flowStaged === '1'`);
  await realClick(browser, buttonIn(commandBar, 'Lagre endringer'));
  await browser.waitFor(hub);
  await openDone(browser);
  assert.equal((await manualValues(browser)).length, 1, 'the correction replaces the GML value');
  assert.equal(await defaultCount(browser), '5', 'correcting one row changes no other');
});

layerTest('the positioning wizard returns to Plassering on cancel, Escape and apply, with its own transaction intact', async (browser, directory) => {
  await filterPlaced(browser);
  const openWizard = async () => {
    await realClick(browser, buttonIn(panel('placement'), 'Koble og posisjoner bilder…'));
    await browser.waitFor(`${sourceWizard}?.open && !${hub}`);
    assert.equal(await openDialogs(browser), 1, 'one workspace dialog at a time');
  };
  await openHub(browser);
  await showTask(browser, 'placement');

  await openWizard();
  await clickSourceControl(browser, 'Avbryt');
  await browser.waitFor(`!${sourceWizard} && ${hub}`);
  assert.equal(await activeTask(browser), 'placement');
  assert.equal(await outstanding(browser, 'placement'), '1');
  assert.equal(await browser.evaluate(`document.activeElement === ${panel('placement')}.querySelector('[data-completion-heading]')`), true);

  await openWizard();
  await pressKey(browser, 'Escape', KEYS.Escape);
  await browser.waitFor(`!${sourceWizard} && ${hub}`);
  assert.equal(await activeTask(browser), 'placement');

  // A kept source survives without positions changing, and the header's close button is a way out as well.
  const extra = path.join(directory, 'ekstra.gml');
  await writeFile(extra, completionGmlText([{ name: 'unplaced.jpg', direction: '75' }]));
  await openWizard();
  await stagePhotoSource(browser, extra, 'gml');
  await savePhotoSource(browser, 'gml');
  await browser.evaluate(`${sourceWizard}.querySelector('header button').click()`);
  await browser.waitFor(`!${sourceWizard} && ${hub}`);
  assert.equal(await outstanding(browser, 'placement'), '1', 'keeping a source places nothing');

  await openWizard();
  await applyPhotoSourcePositions(browser, 'gml', { filename: 'unplaced.jpg', sourceFilename: 'ekstra.gml' });
  await browser.waitFor(hub);
  assert.equal(await activeTask(browser), 'placement');
  assert.equal(await outstanding(browser, 'placement'), 'done', 'readiness is recalculated from the applied position');
  assert.equal(await defaultCount(browser), '5', 'the new GML gave this photo its direction');
  await closeHub(browser);
  assert.match(await summary(browser), /Plassert/, 'the workspace filter is untouched');
});

layerTest('going to another tool leaves the handoff only after the boundary, and export sees canonical data alone', async (browser) => {
  await startDirection(browser);
  await rotateSelected(browser, 90);
  await browser.waitFor(`${flowCount}.dataset.flowStaged === '1'`);
  await openTool(browser, 'Eksporter…');
  await browser.waitFor(boundary);
  assert.equal(await browser.evaluate(`Boolean(${exportDialog})`), false);
  await clickSourceControl(browser, 'Fortsett redigering', boundary);
  await browser.waitFor(`!${boundary}`);
  assert.deepEqual(await counts(browser), [4, 1], 'the handoff survives a cancelled boundary');

  await openTool(browser, 'Eksporter…');
  await browser.waitFor(boundary);
  await clickSourceControl(browser, 'Forkast endringer', boundary);
  await browser.waitFor(exportDialog);
  assert.equal(await browser.evaluate(`Boolean(${hub})`), false, 'one dialog: the hub does not come back on top of export');
  assert.equal(await selectedFormat(browser), 'gemini-legacy2019');
  await buildPreview(browser);
  assert.equal(await browser.evaluate(`Boolean(${exportDialog}.querySelector('[data-diagnostic-code="direction-required"]'))`), false, 'defaults satisfy the direction requirement');
  assert.match(await browser.evaluate(`${exportDialog}.querySelector('[data-export-warning="capture-time-schema"]').innerText`), /Det er ikke verifisert at Gemini VA godtar en slik pakke/);
  await closeExport(browser);
  await settle();
  assert.equal(await browser.evaluate(`Boolean(${hub})`), false, 'closing export does not revive the handoff');
  assert.equal(await summary(browser), '', 'and its filter is gone');

  // Choosing the tool itself during a handoff is a return, not a new start: the task is kept, through the same boundary.
  await openHub(browser);
  await showTask(browser, 'placement');
  await realClick(browser, buttonIn(panel('placement'), 'Plasser på kartet'));
  await browser.waitFor(flowRow);
  await openTool(browser, 'Fullfør opplysninger…');
  await browser.waitFor(hub);
  assert.equal(await activeTask(browser), 'placement');
  assert.equal(await hubMessage(browser), 'Plassering: 1 gjenstår.');
  await closeHub(browser);

  // A plan built after a Save has the saved value.
  await startDirection(browser);
  await rotateSelected(browser, 90);
  await browser.waitFor(`${flowCount}.dataset.flowStaged === '1'`);
  await realClick(browser, buttonIn(commandBar, 'Lagre endringer'));
  await browser.waitFor(hub);
  await closeHub(browser);
  await openExport(browser);
  assert.equal(await selectedFormat(browser), 'gemini-legacy2019');
  await buildPreview(browser);
  assert.equal(await browser.evaluate(`Boolean(${exportDialog}.querySelector('[data-diagnostic-code="direction-required"]'))`), false);
});

layerTest('layer switching, deletion and reset end the handoff without reopening a stale dialog', async (browser, directory) => {
  const exit = async () => { await clickSourceControl(browser, 'Tilbake til appen', 'document'); };
  const shell = 'document.querySelector(".photo-workspace-shell")';
  await exit();
  await browser.waitFor(`!${shell}`);
  await buildLayer(browser, directory);

  // Leaving the workspace from a handoff, with something staged: the boundary first, then no hub anywhere.
  await startDirection(browser);
  await rotateSelected(browser, 90);
  await browser.waitFor(`${flowCount}.dataset.flowStaged === '1'`);
  await exit();
  await browser.waitFor(boundary);
  await clickSourceControl(browser, 'Forkast endringer', boundary);
  await browser.waitFor(`!${shell}`);
  await settle();
  assert.equal(await browser.evaluate(`Boolean(document.querySelector('.photo-completion-dialog'))`), false);

  // The other layer opens clean, with its own data.
  await browser.evaluate(`document.querySelector('button[aria-label^="Åpne bildemodul"]').click()`);
  await browser.waitFor(shell);
  await settle();
  assert.equal(await browser.evaluate(`Boolean(${commandBar}) || Boolean(document.querySelector('.photo-completion-dialog'))`), false);
  assert.equal(await summary(browser), '', 'no work list follows into another layer');
  await openHub(browser);
  assert.equal(await defaultCount(browser), '5');
  await closeHub(browser);

  // Deleting the layer a handoff came from, after leaving it with nothing staged.
  await startDirection(browser);
  await exit();
  await browser.waitFor(`!${shell}`);
  const layers = await browser.evaluate(`document.querySelectorAll('button[aria-label^="Fjern fotokartlag"]').length`);
  assert.equal(layers, 2);
  await browser.evaluate(`document.querySelector('button[aria-label^="Fjern fotokartlag"]').click()`);
  await clickSourceControl(browser, 'Fjern', 'document');
  await browser.waitFor(`document.querySelectorAll('button[aria-label^="Fjern fotokartlag"]').length === 1`);
  assert.equal(await browser.evaluate(`Boolean(document.querySelector('.photo-completion-dialog'))`), false);

  await browser.evaluate(`document.querySelector('button[aria-label^="Åpne bildemodul"]').click()`);
  await browser.waitFor(shell);
  await startDirection(browser);
  await exit();
  await browser.waitFor(`!${shell}`);
  await browser.evaluate(`document.querySelector('[aria-label="Nullstill og åpne ny fil"]').click()`);
  await browser.waitFor(`!document.querySelector('button[aria-label^="Fjern fotokartlag"]')`);
  await settle();
  assert.equal(await browser.evaluate(`Boolean(document.querySelector('.photo-completion-dialog')) || Boolean(${commandBar})`), false);
}, { timeout: 360000 });

layerTest('a selection narrows the work list, survives the trip, and a double-click on the way back accepts nothing', async (browser) => {
  await openHub(browser);
  await showTask(browser, 'direction');
  for (const name of ['blank.jpg', 'minute.jpg']) await browser.evaluate(`${rowOf(name)}.querySelector('input[type=checkbox]').click()`);
  await browser.waitFor(`${panel('direction')}.querySelector('[data-completion-actions="map"]').innerText.includes('Gjelder 2 valgte plasseringer')`);
  await openDirectionMap(browser);
  assert.deepEqual(await listed(browser), ['blank.jpg', 'minute.jpg']);
  assert.deepEqual(await counts(browser), [2, 0]);
  await rotateSelected(browser, 90);
  await browser.waitFor(`${flowCount}.dataset.flowStaged === '1'`);
  await next(browser, 'minute.jpg');
  await typeDirection(browser, 200);
  await browser.waitFor(`${flowCount}.dataset.flowStaged === '2'`);
  assert.equal(await browser.evaluate(`${buttonIn(flowRow, 'Neste')}.getAttribute('aria-disabled')`), 'true');
  assert.equal(await browser.evaluate(`${buttonIn(flowRow, 'Neste')}.title`), 'Ingen flere i listen');

  await realClick(browser, buttonIn(commandBar, 'Lagre endringer'), 2);
  await browser.waitFor(hub);
  await settle();
  assert.equal(await defaultCount(browser), '3', 'only the two saved values, nothing from the second click');
  assert.equal(await browser.evaluate(`${panel('direction')}.querySelector('[data-completion-selection]')?.innerText.includes('Ingen av de valgte gjenstår')`), true, 'the used selection keeps narrowing, as in M3');
  assert.equal(await browser.evaluate(`${buttonIn(panel('direction'), 'Angi på kartet')}.disabled`), true);
  await clickSourceControl(browser, 'Fjern valg', panel('direction'));
  await browser.waitFor(`!${buttonIn(panel('direction'), 'Angi på kartet')}.disabled`);
  assert.equal(await defaultCount(browser), '3');
});

// Where the second click lands depends on the layout, so it is placed on purpose: on the map going out, on a hub action coming back.
layerTest('the second click of a double-click never reaches the screen that replaced the button', async (browser) => {
  const secondClick = async ({ x, y }) => {
    await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 2 });
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 2 });
  };
  const mapPoint = await browser.evaluate(`(() => { const box = document.querySelector('.leaflet-container').getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height * .75 }; })()`);
  await openHub(browser);
  await showTask(browser, 'placement');
  await realClick(browser, buttonIn(panel('placement'), 'Plasser på kartet'));
  await new Promise((resolve) => setTimeout(resolve, 150)); // a person's double-click: the map is ready by then
  await secondClick(mapPoint);
  await browser.waitFor(flowRow);
  await settle();
  assert.deepEqual(await counts(browser), [1, 0], 'a map click here would have placed the photo');
  await new Promise((resolve) => setTimeout(resolve, 700));
  await pressAt(browser, mapPoint.x, mapPoint.y, 1);
  await browser.waitFor(`${flowCount}.dataset.flowStaged === '1'`);
  assert.deepEqual(await counts(browser), [0, 1], 'the guard is gone, and an ordinary click places as usual');
  await realClick(browser, buttonIn(flowRow, 'Tilbake til opplysninger'));
  await browser.waitFor(boundary);
  await clickSourceControl(browser, 'Forkast endringer', boundary);
  await browser.waitFor(hub);

  await showTask(browser, 'direction');
  const action = buttonIn(panel('direction'), 'Angi på kartet');
  const actionPoint = await elementCentre(browser, action);
  await openDirectionMap(browser);
  await new Promise((resolve) => setTimeout(resolve, 700));
  await realClick(browser, buttonIn(flowRow, 'Tilbake til opplysninger'));
  await secondClick(actionPoint);
  await browser.waitFor(hub);
  await settle();
  assert.equal(await browser.evaluate(`document.elementFromPoint(${actionPoint.x}, ${actionPoint.y}) === ${action}`), true, 'the click really was aimed at the action');
  assert.equal(await browser.evaluate(`Boolean(${flowRow})`), false, 'it did not send anyone back to the map');
});

layerTest('keyboard: the controls are reachable and named, and ordinary Edit mode has none of them', async (browser) => {
  await enterEditMode(browser);
  assert.equal(await browser.evaluate(`Boolean(${flowRow})`), false, 'no handoff, no extra row');
  assert.equal(await browser.evaluate(`Array.from(${commandBar}.querySelectorAll('button')).some((item) => item.innerText.trim() === 'Avslutt redigering')`), true);
  await rotateSelected(browser, 90);
  await browser.waitFor(`${commandBar}.querySelector('[data-edit-count]')`);
  await realClick(browser, buttonIn(commandBar, 'Lagre endringer'));
  await browser.waitFor(`!${commandBar}`);
  await settle();
  assert.equal(await browser.evaluate(`Boolean(${hub})`), false, 'an ordinary Save goes nowhere');
  await enterEditMode(browser);
  await realClick(browser, buttonIn(commandBar, 'Avslutt redigering'));
  await browser.waitFor(`!${commandBar}`);
  await settle();
  assert.equal(await browser.evaluate(`Boolean(${hub})`), false);

  await startDirection(browser);
  const forrige = buttonIn(flowRow, 'Forrige bilde');
  assert.equal(await browser.evaluate(`${forrige}.dataset.iconTooltip`), 'Forrige bilde – dette er det første');
  assert.equal(await browser.evaluate(`${forrige}.getAttribute('aria-disabled')`), 'true', 'it stays focusable, so the tooltip can say why');
  await pressKey(browser, 'Tab', KEYS.Tab);
  assert.equal(await browser.evaluate(`document.activeElement.getAttribute('aria-label')`), 'Forrige bilde');
  await pressKey(browser, 'Tab', KEYS.Tab);
  assert.equal(await browser.evaluate(`document.activeElement.innerText.trim()`), 'Neste');
  const first = await activeName(browser);
  await pressEnter(browser);
  await browser.waitFor(`document.querySelector('.photo-workspace-active .photo-workspace-filename')?.innerText !== ${JSON.stringify(first)}`);
  assert.equal(await browser.evaluate(`document.activeElement.innerText.trim()`), 'Neste', 'focus stays for the next press');
  assert.match(await browser.evaluate(`${commandBar}.querySelector('[aria-live]').innerText`), /^Valgte /);
  await pressKey(browser, 'Tab', KEYS.Tab);
  assert.equal(await browser.evaluate(`document.activeElement.getAttribute('aria-label')`), 'Tilbake til opplysninger');
  await pressEnter(browser);
  await browser.waitFor(hub);
  assert.equal(await activeTask(browser), 'direction');
});

layerTest('the bar stays usable at 1080p and on constrained screens', async (browser) => {
  await startDirection(browser);
  for (const [width, height] of [[1920, 1080], [1366, 768], [1280, 720], [1024, 600]]) {
    await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await settle();
    const layout = await browser.evaluate(`(() => { const box = (element) => element.getBoundingClientRect(), bar = box(${commandBar}), map = box(document.querySelector('.leaflet-container'));
      return { bar: bar.toJSON(), map: map.toJSON(), overflow: document.documentElement.scrollWidth - innerWidth,
        controls: Array.from(${flowRow}.querySelectorAll('button')).map((item) => { const rect = box(item); return { left: rect.left, right: rect.right, bottom: rect.bottom, top: rect.top }; }) }; })()`);
    const context = `${width}x${height}: ${JSON.stringify(layout)}`;
    assert(layout.overflow <= 0, context);
    assert(layout.bar.left >= layout.map.left && layout.bar.right <= layout.map.right, context);
    assert(layout.bar.bottom < layout.map.bottom - 120, `the selected photo needs map left below the bar. ${context}`);
    for (const control of layout.controls) assert(control.left >= layout.bar.left && control.right <= layout.bar.right && control.bottom <= layout.bar.bottom, context);
    await screenshot(browser, `flow-bar-${width}`);
  }
});

test('repeated photographs: each placement is its own work item and keeps its own value', { skip: !chromePath || !app, timeout: 180000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'photo-flow-shared-ui-'));
  const browser = await openTestChrome();
  try {
    const photo = path.join(directory, 'delt.jpg'), source = path.join(directory, 'delt.gmi');
    await writeFile(photo, gpsJpeg({ noLocation: true, captureTime: '2026:05:12 14:33:02' }));
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

    await startDirection(browser);
    assert.deepEqual(await counts(browser), [2, 0], 'one work item per placement');
    assert.match(await browser.evaluate(`${commandBar}.innerText`), /Dette bildet har 2 plasseringer\. Du endrer bare denne\./);
    assert.match(await browser.evaluate(`${flowCount}.getAttribute('aria-label')`), /2 plasseringer/);
    await typeDirection(browser, 45);
    await browser.waitFor(`${flowCount}.dataset.flowStaged === '1'`);
    await realClick(browser, buttonIn(flowRow, 'Neste'));
    await browser.waitFor(`${flowRow}.querySelector('.photo-edit-flow-position').innerText === '2 av 2'`);
    assert.equal(await browser.evaluate(`${commandBar}.querySelector('.photo-edit-direction-field input').value`), '0', 'the other placement keeps its own default');
    await typeDirection(browser, 200);
    await browser.waitFor(`${flowCount}.dataset.flowStaged === '2'`);
    await realClick(browser, buttonIn(commandBar, 'Lagre endringer'));
    await browser.waitFor(hub);
    assert.equal(await outstanding(browser, 'direction'), 'done');
    await openDone(browser);
    assert.deepEqual(await doneValues(browser), ['Godtatt: 45° NØ · Manuell', 'Godtatt: 200° S · Manuell']);
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});

test('private corpus: 148 occurrences need nothing by hand, and one can still be corrected with Discard and Save', { skip: !chromePath || !app || !corpus, timeout: 420000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'photo-flow-corpus-ui-'));
  const browser = await openTestChrome();
  try {
    const folder = path.join(path.dirname(corpus), 'Attachments');
    const names = (await readdir(folder)).filter((name) => /\.jpe?g$/i.test(name)).sort();
    const total = names.length;
    assert(total);
    await openApp(browser, { width: 1366, height: 768 });
    await clickSourceControl(browser, 'Bilder', 'document');
    await browser.waitFor(importDialog);
    await addImportFiles(browser, names.map((name) => path.join(folder, name)));
    await browser.waitFor(`document.querySelectorAll(".photo-collection-card img").length === ${total}`, 120000);
    await createLayerWithoutPlacement(browser);
    await retainGmlInWorkspace(browser, corpus);
    await applyPhotoSourcePositions(browser, 'gml');
    await browser.waitFor(`document.querySelectorAll(".photo-camera-marker").length === ${total}`, 60000);

    const correct = async () => {
      await openDone(browser);
      await realClick(browser, `${rowOf(names[0])}.querySelector('.photo-completion-row-action button')`);
      await browser.waitFor(flowRow);
      assert.deepEqual(await counts(browser), [1, 0]);
      await typeDirection(browser, 90);
      await browser.waitFor(`${flowCount}.dataset.flowStaged === '1'`);
    };
    await openHub(browser);
    assert.equal(await statusLine(browser), 'Ingen opplysninger mangler for dette målet', 'nothing had to be accepted by hand');
    await showTask(browser, 'direction');
    assert.equal(await outstanding(browser, 'direction'), 'done');
    assert.equal(await browser.evaluate(`Boolean(${buttonIn(panel('direction'), 'Angi på kartet')})`), false, 'nothing is missing, so nothing is asked for');

    await correct();
    await realClick(browser, buttonIn(flowRow, 'Tilbake til opplysninger'));
    await browser.waitFor(boundary);
    await clickSourceControl(browser, 'Forkast endringer', boundary);
    await browser.waitFor(hub);
    await openDone(browser);
    assert.deepEqual(await manualValues(browser), [], 'Discard leaves all of them as they were');

    await correct();
    await screenshot(browser, 'flow-corpus-1366');
    await realClick(browser, buttonIn(commandBar, 'Lagre endringer'));
    await browser.waitFor(hub);
    await openDone(browser);
    assert.equal((await manualValues(browser)).length, 1);
    assert.equal((await doneValues(browser)).length, total);
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});
