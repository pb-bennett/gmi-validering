// Batch 2A: shell and analysis correctness with two or more loaded layers (audit F-01 to F-07 and F-18).
// Synthetic files only. The layers share point and line indices and differ in position, so a leak is visible.
import assert from 'node:assert/strict';
import test from 'node:test';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import proj4 from 'proj4';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { GMI_EDIT_FIXTURE_DIR } from './helpers/gmiEditFixtures.mjs';
import { clickGmiTableObject } from './helpers/gmiTableNavigation.mjs';
import { gpsPng } from './helpers/photoGpsFixtures.mjs';
import { createLayerWithPlacement, importDialog, waitForThumbnails } from './helpers/photoImportWizard.mjs';
import { clickSourceControl, setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { KEYS, pressKey } from './helpers/photoWorkspace.mjs';

const app = process.env.PHOTO_UI_URL;
const shots = process.env.GMI_2A_SCREENSHOT_DIR;
const sizes = [[1280, 720], [1366, 768]];
const UTM32 = '+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs';
const UTM33 = '+proj=utm +zone=33 +ellps=GRS80 +units=m +no_defs';
const utm32 = (point) => proj4('EPSG:4326', UTM32, [point.lng, point.lat]);

const gmi = ({ lines = [], points = [], crs = 'COSYS_EPSG 25832' }) => [
  '[GMIFILE_ASCII]', '_VERSION 2', '_FILETYPE GMI', '_INDEX !!!!!!!!!!!!!!!!!!!!', ...(crs ? [crs] : []),
  '[L_]', '_FIELDNAMES S_FCODE;Dimensjon;', '[P_]', '_FIELDNAMES S_FCODE;', '[+L_]',
  ...lines.flatMap((coords, i) => [`:L ${i + 1}`, '_FIELDVALUES SP;160;', '/XYZ', ...coords]), '[+P_]',
  ...points.flatMap(([code, coord], i) => [`:P ${i + 1}`, `_FIELDVALUES ${code};`, '/XYZ', coord]), '[END]', ''].join('\r\n');
const at = (dx, dy, z = '') => `${581940 + dx} ${6566000 + dy}${z === '' ? '' : ` ${z}`}`;
// Alfa: line 0 low fall, line 1 without Z, line 2 low fall. Point 0 is a KUM without LOK and without Z.
const ALFA = gmi({
  lines: [[at(0, 0, 101), at(20, 0, 100.99)], [at(0, 3), at(20, 3)], [at(0, 6, 101), at(20, 6, 100.9)]],
  points: [['KUM', at(1, 1)], ['KUM', at(30, 2, 100)], ['KUM', at(40, 3, 100)]],
});
// Bravo: 500 m east with the same indices; everything has Z.
const BRAVO = gmi({
  lines: [[at(500, 0, 101), at(520, 0, 100)]],
  points: [['KUM', at(501, 1, 99)], ['KUM', at(530, 2, 99)]],
});
// Charlie: point 0 is an outlier about 127 km away; the rest is a valid cluster.
const CHARLIE = gmi({
  lines: [[at(0, 10, 101), at(20, 10, 100)]],
  points: [['KUM', at(90000, 90000, 100)], ...Array.from({ length: 120 }, (_, i) => ['KUM', at(i, 12 + i % 5, 100)])],
});
// Delta declares UTM 33, so a coordinate projected with the wrong layer's CRS lands far away.
const [deltaEast, deltaNorth] = proj4('EPSG:4326', UTM33, proj4(UTM32, 'EPSG:4326', [581990, 6566050]));
const DELTA = gmi({ crs: 'COSYS_EPSG 25833', points: [['KUM', `${deltaEast.toFixed(2)} ${deltaNorth.toFixed(2)} 12`]] });
const NOCRS = gmi({ crs: null, lines: [[at(0, 0, 101), at(20, 0, 100)]], points: [['KUM', at(1, 1, 99)]] });
const INVALID = 'not a survey file';

const init = `localStorage.clear();window.__confirms=0;window.confirm=()=>{window.__confirms++;return true;};
let leaflet;Object.defineProperty(window,'L',{configurable:true,get(){return leaflet;},set(v){leaflet=v;v?.Map?.addInitHook?.(function(){(window.__maps??=[]).push(this);});}});
const originalFetch=window.fetch;window.fetch=(url,options)=>String(url).includes('ws.geonorge.no')?Promise.resolve(new Response('{"punkter":[]}',{status:200,headers:{'Content-Type':'application/json'}})):originalFetch(url,options);
const src=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
Object.defineProperty(HTMLImageElement.prototype,'src',{...src,set(v){src.set.call(this,/kartverket|geonorge|cdnjs/.test(String(v))?'data:image/gif;base64,R0lGODlhAQABAAAAACw=':v);}});`;

const PANEL = '.profile-analysis-panel';
const MAP = 'window.__maps.find(m => m.getContainer().isConnected)';
const addDialog = 'document.querySelector(\'button[aria-label="Lukk legg til lag"]\')';
const height = 'document.querySelector(\'button[aria-label="Lukk høydekontroll"]\')';
const validator = 'document.querySelector("#validation-v2-layer")';
const validatorLayer = `${validator}?.selectedOptions[0].text`;
const plot = `document.querySelector('${PANEL} .profile-analysis-plot svg path')`;
const panelText = `(document.querySelector('${PANEL}')?.innerText || '')`;
const missingZ = `/Kan ikke vise profil/.test(${panelText})`;
const importFailed = '/Feil ved lasting av fil/.test(document.body.innerText)';
const notice = 'document.querySelector("[data-import-error=workspace]")';
const crsDialog = 'document.querySelector("dialog[open][data-gmi-confirm=crs]")';
const rettinger = 'document.querySelector(".gmi-edit-workspace")';
const near = (actual, expected, tolerance = 4) => assert(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

async function session(run) {
  const directory = await mkdtemp(path.join(tmpdir(), 'gmi-2a-ui-'));
  const browser = await openTestChrome();
  const pause = (ms = 300) => browser.evaluate(`new Promise(resolve => setTimeout(resolve, ${ms}))`);
  const key = async (name, code, windowsVirtualKeyCode, text) => {
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code, windowsVirtualKeyCode, text });
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code, windowsVirtualKeyCode });
  };
  const ui = {
    browser, pause,
    file: async (name, content) => { const target = path.join(directory, name); await writeFile(target, content); return target; },
    resize: ([width, viewport]) => browser.send('Emulation.setDeviceMetricsOverride', { width, height: viewport, deviceScaleFactor: 1, mobile: false }),
    enter: () => key('Enter', 'Enter', 13, '\r'),
    space: () => key(' ', 'Space', 32, ' '),
    title: (target) => `document.querySelector(${JSON.stringify(`[title="${path.basename(target)}"]`)})`,
    card: (target) => `${ui.title(target)}.closest('.py-1')`,
    action: (target, name) => `${ui.card(target)}.querySelector(${JSON.stringify(`button[aria-label="${name}"]`)})`,
    button: (label, scope = 'document') => `Array.from(${scope}.querySelectorAll('button')).find(e => e.innerText.trim() === ${JSON.stringify(label)} || e.getAttribute('aria-label') === ${JSON.stringify(label)})`,
    click: async (label, scope) => { await browser.waitFor(ui.button(label, scope), 8000); await browser.evaluate(`${ui.button(label, scope)}.click()`); },
    expand: async (target) => {
      if (!await browser.evaluate(`Boolean(${ui.action(target, 'Høydekontroll')})`)) await browser.evaluate(`${ui.title(target)}.click()`);
      await browser.waitFor(ui.action(target, 'Høydekontroll'));
    },
    act: async (target, name) => { await ui.expand(target); await browser.waitFor(ui.action(target, name), 8000); await browser.evaluate(`${ui.action(target, name)}.click()`); },
    openAdd: async () => { await ui.click('Legg til fil'); await browser.waitFor(addDialog); },
    feed: async (target) => { await pause(200); await setPhotoFiles(browser, 'input[type=file]', [target]); },
    load: async (target) => {
      if (await browser.evaluate('Boolean(document.querySelector(".leaflet-container"))')) await ui.openAdd();
      await ui.feed(target);
      await browser.waitFor(ui.title(target));
      await browser.waitFor(`!${addDialog}`);
      await browser.waitFor(`document.querySelector(".leaflet-container") && ${MAP}`);
      await pause(400);
    },
    remove: async (target) => {
      await browser.evaluate(`${ui.action(target, 'Fjern lag')}.click()`);
      await ui.click('Fjern');
      await browser.waitFor(`!${ui.title(target)}`);
      await pause(400);
    },
    has: (target) => browser.evaluate(`Boolean(${ui.title(target)})`),
    alive: () => browser.evaluate('Boolean(document.querySelector(".leaflet-container")) && Boolean(document.querySelector(".layer-manager-add-actions"))'),
    fatal: () => browser.evaluate('/Application error|client-side exception/.test(document.body.innerText)'),
    rows: () => browser.evaluate(`Array.from(document.querySelectorAll('${PANEL} .overflow-y-auto > div')).map(e => e.innerText.replace(/\\s+/g, ' ').trim())`),
    pickRow: async (index) => { await browser.evaluate(`document.querySelectorAll('${PANEL} .overflow-y-auto > div')[${index}].click()`); await pause(150); },
    centre: async () => {
      const centre = await browser.evaluate(`(() => { const c = ${MAP}.getCenter(); return { lng: c.lng, lat: c.lat }; })()`);
      return utm32(centre);
    },
    // Every drawn point with one local index, whichever layer it belongs to.
    points: (index) => browser.evaluate(`(() => { const out = []; ${MAP}.eachLayer((layer) => { const p = layer.feature?.properties;
      if (p?.featureType === 'Point' && p.id === ${index} && layer.options.pane !== 'gmi-edit-selection') out.push({ layerId: p._layerId,
        lng: layer.getLatLng().lng, lat: layer.getLatLng().lat, hidden: layer.options.opacity === 0, html: layer.options.icon?.options?.html || '' }); }); return out; })()`),
    // UTM 32 eastings of the points whose drawn symbol differs from `before`: the highlighted ones.
    highlighted: async (before, index = 0) => (await ui.points(index)).filter((p) => p.html !== before.find((q) => q.layerId === p.layerId)?.html).map((p) => Math.round(utm32(p)[0])),
    shots: async (name) => {
      if (!shots) return;
      await mkdir(shots, { recursive: true });
      for (const size of sizes) {
        await ui.resize(size);
        await pause(400);
        const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
        await writeFile(path.join(shots, `${name}-${size.join('x')}.png`), Buffer.from(data, 'base64'));
      }
      await pause(200);
    },
  };
  try {
    await ui.resize(sizes[1]);
    await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: init });
    await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
    await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
    await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
    await run(ui);
  } finally {
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
}
const suite = (name, run) => test(name, { skip: !app || !chromePath, timeout: 240000 }, () => session(run));

suite('F-01: Profilanalyse survives repeated Z / no-Z selection in both directions and keeps drawing', async (ui) => {
  const alfa = await ui.file('Alfa.gmi', ALFA);
  await ui.load(alfa);
  await ui.act(alfa, 'Profilanalyse');
  await ui.browser.waitFor(plot);
  for (let round = 0; round < 3; round++) {
    await ui.pickRow(1);
    await ui.pause();
    assert.equal(await ui.fatal(), false, `no crash in round ${round}`);
    await ui.browser.waitFor(missingZ);
    assert.equal(await ui.browser.evaluate(`Boolean(${plot})`), false);
    assert.match(await ui.browser.evaluate(panelText), /Fall: -\D[\s\S]*L: - m[\s\S]*ΔZ: - m/, 'a line without Z shows no invented values');
    if (round === 0) await ui.shots('f01-no-z');
    await ui.pickRow(round % 2 ? 0 : 2);
    await ui.browser.waitFor(plot);
    assert.equal(await ui.browser.evaluate(missingZ), false);
  }
  // Opening straight on the no-Z line must not leave the later plot without a measured size.
  await ui.pickRow(1);
  await ui.click('Lukk analyse');
  await ui.browser.waitFor(`!document.querySelector('${PANEL}')`);
  await ui.act(alfa, 'Profilanalyse');
  await ui.browser.waitFor(missingZ);
  await ui.pickRow(0);
  await ui.browser.waitFor(plot);
  assert.equal(await ui.alive(), true);
});

suite('F-01: an analysis rendering error is contained, can be retried and closed, and keeps map, layers, corrections and FOTO', async (ui) => {
  const { browser } = ui;
  const alfa = await ui.file('Alfa.gmi', ALFA), photo = await ui.file('a.png', gpsPng());
  await ui.load(alfa);
  await clickSourceControl(browser, 'Bilder', 'document');
  await browser.waitFor(importDialog);
  await setPhotoFiles(browser, 'input[aria-label="Velg bildefiler"]', [photo]);
  await waitForThumbnails(browser);
  await createLayerWithPlacement(browser, 'exif');
  await clickSourceControl(browser, 'Lukk FOTO', 'document');
  await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
  const fotoCard = 'Boolean(document.querySelector(\'section[aria-label^="Fotokartlag"]\'))';
  await ui.expand(alfa);
  const broken = 'window.__RO = window.ResizeObserver; window.ResizeObserver = class { constructor() { throw new Error("synthetic analysis failure"); } }; true';
  const repaired = 'window.ResizeObserver = window.__RO; true';
  const alert = 'document.querySelector("[data-analysis-error=profil]")';
  await browser.evaluate(broken);
  await ui.act(alfa, 'Profilanalyse');
  await ui.pause(800);
  assert.equal(await ui.fatal(), false);
  await browser.waitFor(alert, 8000);
  assert.equal(await ui.alive(), true);
  assert.equal(await browser.evaluate(fotoCard), true);
  assert.equal(await browser.evaluate(`${alert}.querySelector('[role=alert]') !== null`), true);
  await ui.shots('f01-contained');
  // Retry while the cause remains: still contained. Retry once it is gone: fresh results from the owning layer.
  await ui.click('Prøv igjen', alert);
  await ui.pause(400);
  await browser.waitFor(alert);
  assert.equal(await ui.alive(), true);
  await browser.evaluate(repaired);
  await ui.click('Prøv igjen', alert);
  await browser.waitFor(plot);
  assert.equal((await ui.rows()).length, 3);
  await ui.click('Lukk analyse');
  await browser.waitFor(`!document.querySelector('${PANEL}')`);
  await browser.evaluate(broken);
  await ui.act(alfa, 'Profilanalyse');
  await browser.waitFor(alert);
  await ui.click('Lukk analyse', alert);
  await browser.waitFor(`!${alert}`);
  assert.equal(await ui.alive(), true);
  await browser.evaluate(repaired);
  await ui.act(alfa, 'Profilanalyse');
  await browser.waitFor(plot);
  assert.equal(await browser.evaluate(fotoCard), true);
});

suite('F-02: Høydekontroll «Vis i kart» goes to the analysed layer, with several layers and different CRS', async (ui) => {
  const alfa = await ui.file('Alfa.gmi', ALFA), bravo = await ui.file('Bravo.gmi', BRAVO), delta = await ui.file('Delta.gmi', DELTA);
  const check = async () => {
    await ui.act(alfa, 'Høydekontroll');
    await ui.browser.waitFor(height);
    const before = await ui.points(0);
    await ui.click('Vis i kart');
    await ui.pause(1300);
    const [east, north] = await ui.centre();
    near(east, 581941); near(north, 6566001);
    return ui.highlighted(before);
  };
  await ui.load(alfa);
  assert.deepEqual(await check(), [581941], 'one layer');
  await ui.click('Lukk høydekontroll');
  // Loading a file clears the previous highlight (existing behaviour), so each layer count starts clean.
  await ui.load(bravo);
  assert.deepEqual(await check(), [581941], 'two layers with the same indices');
  await ui.shots('f02-height');
  await ui.click('Lukk høydekontroll');
  await ui.load(delta);
  assert.deepEqual(await check(), [581941], 'the last file uses another CRS');
  await ui.click('Lukk høydekontroll');
  // The load prompt belongs to the file that raised it, also after another layer's control was opened.
  const ekko = await ui.file('Ekko.gmi', gmi({ points: [['KUM', at(700, 0)], ['KUM', at(701, 0)]] }));
  await ui.load(ekko);
  await ui.act(alfa, 'Høydekontroll');
  await ui.browser.waitFor(height);
  await ui.click('Lukk høydekontroll');
  await ui.click('Åpne kontroll');
  await ui.browser.waitFor(height);
  assert.match(await ui.browser.evaluate('document.body.innerText'), /Punkter uten Z \(2\)/);
});

suite('F-03: Profilanalyse «Innstillinger» keeps the analysed layer, and selection never follows a bare index into another', async (ui) => {
  const alfa = await ui.file('Alfa.gmi', ALFA), bravo = await ui.file('Bravo.gmi', BRAVO);
  const requirement = async (value) => {
    await ui.click('Innstillinger');
    const input = `document.querySelector('input[name=inclineRequirement][value=${value}]')`;
    await ui.browser.waitFor(input);
    await ui.browser.evaluate(`${input}.click()`);
    await ui.pause();
    await ui.click('Lukk krav til selvfall');
    await ui.pause();
  };
  await ui.load(alfa);
  await ui.act(alfa, 'Profilanalyse');
  await ui.browser.waitFor(plot);
  await requirement('variable');
  assert.equal((await ui.rows()).length, 3, 'one layer');
  await ui.load(bravo);
  await ui.act(alfa, 'Profilanalyse');
  await ui.browser.waitFor(`document.querySelector('${PANEL}')`);
  await ui.pause();
  for (const value of ['fixed10', 'variable', 'fixed10']) {
    await requirement(value);
    const rows = await ui.rows();
    assert.equal(rows.length, 3, `the list still shows Alfa after ${value}`);
    assert(rows.some((row) => /Mangler Z/.test(row)));
  }
  await ui.shots('f03-settings');
  await ui.pickRow(2);
  await ui.act(bravo, 'Profilanalyse');
  await ui.pause(500);
  assert.equal((await ui.rows()).length, 1);
  assert.match(await ui.browser.evaluate(panelText), /Ledning #0/, 'Bravo starts with its own selection');
  // The last file is not an authority either: changing settings on Bravo, then opening Alfa, shows Alfa.
  await requirement('variable');
  await ui.remove(bravo);
  assert.equal(await ui.browser.evaluate(`Boolean(document.querySelector('${PANEL}'))`), false, 'removing the analysed layer closes its analysis');
  await ui.act(alfa, 'Profilanalyse');
  await ui.pause();
  assert.equal((await ui.rows()).length, 3);
});

suite('F-07: a Topplok result centres and highlights only the object in its own layer', async (ui) => {
  const alfa = await ui.file('Alfa.gmi', ALFA), bravo = await ui.file('Bravo.gmi', BRAVO);
  const result = (target) => `${ui.card(target)}.querySelector('.max-h-48 button')`;
  const pick = async (target) => {
    await ui.expand(target);
    if (!await ui.browser.evaluate(`Boolean(${result(target)})`)) await ui.act(target, 'Topplok');
    await ui.browser.waitFor(result(target));
    await ui.browser.evaluate(`${result(target)}.click()`);
    await ui.pause(1300);
  };
  await ui.load(alfa);
  let before = await ui.points(0);
  await pick(alfa);
  near((await ui.centre())[0], 581941);
  assert.deepEqual(await ui.highlighted(before), [581941], 'one layer');
  await ui.load(bravo);
  before = await ui.points(0);
  assert.equal(before.length, 2);
  await pick(alfa);
  near((await ui.centre())[0], 581941);
  assert.deepEqual(await ui.highlighted(before), [581941]);
  await ui.shots('f07-topplok');
  await pick(bravo);
  near((await ui.centre())[0], 582441);
  assert.deepEqual(await ui.highlighted(before), [582441]);
});

suite('F-04: «Ignorer» hides only the outlier of its own layer and can be undone from that layer', async (ui) => {
  const { browser } = ui;
  const alfa = await ui.file('Alfa.gmi', ALFA), charlie = await ui.file('Charlie.gmi', CHARLIE), bravo = await ui.file('Bravo.gmi', BRAVO);
  const hidden = async () => (await ui.points(0)).filter((p) => p.hidden).map((p) => utm32(p)[0] > 600000);
  await ui.load(alfa); await ui.load(charlie);
  assert.match(await browser.evaluate('document.body.innerText'), /avviker/);
  await ui.shots('f04-prompt');
  assert.deepEqual(await hidden(), []);
  await ui.click('Ignorer');
  await ui.pause(800);
  assert.deepEqual(await hidden(), [true], 'only the outlier; the point with the same index in Alfa stays visible');
  await ui.expand(charlie);
  const restore = ui.button('Vis avvikere', ui.card(charlie));
  await browser.waitFor(restore, 8000);
  assert.match(await browser.evaluate(`${ui.card(charlie)}.innerText`), /1 avviker skjult i kartet/);
  assert.doesNotMatch(await browser.evaluate(`${ui.card(alfa)}.innerText`), /avvik/i);
  await ui.shots('f04-ignored');
  await ui.load(bravo);
  assert.equal((await ui.points(0)).length, 3);
  assert.deepEqual(await hidden(), [true], 'loading another file neither restores nor spreads the choice');
  // «Ignorer» never touched the data: the layer still validates and lists every object.
  await ui.expand(charlie);
  assert.match(await browser.evaluate(`${ui.card(charlie)}.innerText`), /121 punkt, 1 ledn\./);
  await browser.evaluate(`${restore}.focus()`);
  await ui.enter();
  await ui.pause(700);
  assert.deepEqual(await hidden(), []);
  assert.equal(await browser.evaluate(`document.activeElement === ${ui.button('Ignorer avvikere', ui.card(charlie))}`), true, 'keyboard focus stays on the toggle');
  await ui.enter();
  await ui.pause(700);
  assert.deepEqual(await hidden(), [true]);
  await ui.remove(charlie);
  assert.equal((await ui.points(0)).length, 2);
  assert.deepEqual(await hidden(), [], 'removing the layer leaves no ignore state behind');
  await ui.load(charlie);
  assert.deepEqual(await hidden(), [], 'a reloaded file starts with its outlier visible');
});

suite('F-05: a failed additional import keeps the workspace and can be retried or dismissed', async (ui) => {
  const { browser } = ui;
  const alfa = await ui.file('Alfa.gmi', ALFA), bravo = await ui.file('Bravo.gmi', BRAVO), bad = await ui.file('Ugyldig.gmi', INVALID);
  // Initial failure: the upload screen and its retry are unchanged.
  await ui.feed(bad);
  await browser.waitFor(importFailed);
  assert.equal(await browser.evaluate('Boolean(document.querySelector(".leaflet-container"))'), false);
  await browser.waitFor(ui.button('Prøv igjen med en annen fil'));
  assert.match(await browser.evaluate('document.body.innerText'), /Ugyldig GMI-fil/, 'a malformed .gmi keeps its GMI error');
  // Batch 2C: an unsupported type on the upload screen gets its own message; the picker stays usable.
  await ui.feed(await ui.file('Tegning.dwg', 'AC1032'));
  await browser.waitFor('/Filtypen \\.dwg støttes ikke/.test(document.body.innerText)');
  assert.doesNotMatch(await browser.evaluate('document.body.innerText'), /Ugyldig GMI-fil/);
  await ui.shots('2c-unsupported-upload');
  await ui.load(alfa);
  await browser.evaluate(`window.__kept = ${MAP}; true`);
  await ui.openAdd();
  await ui.feed(bad);
  await browser.waitFor(importFailed);
  assert.equal(await ui.alive(), true);
  assert.equal(await ui.has(alfa), true);
  assert.equal(await browser.evaluate('window.__kept.getContainer().isConnected'), true, 'the map was not rebuilt');
  assert.equal(await browser.evaluate('Boolean(document.querySelector("[data-import-error=dialog][role=alert]"))'), true, 'the error is stated where the retry is');
  await ui.shots('f05-dialog');
  await ui.feed(bravo);
  await browser.waitFor(ui.title(bravo));
  await browser.waitFor(`!${addDialog}`);
  assert.equal(await ui.has(alfa), true);
  assert.equal(await browser.evaluate(importFailed), false, 'a successful retry clears the error');
  await ui.openAdd(); await ui.feed(bad);
  await browser.waitFor(importFailed);
  await ui.click('Lukk legg til lag');
  // Batch 2C: the dialog stated the error, so closing it dismisses the error instead of repeating it in the workspace.
  await browser.waitFor(`!${addDialog}`);
  await ui.pause(300);
  assert.equal(await browser.evaluate(`Boolean(${notice})`), false, 'no stale workspace notice after the dialog is closed');
  assert.equal(await browser.evaluate(importFailed), false);
  // Batch 2C: an unsupported type and unrecognised .txt content get their own messages, not «Ugyldig GMI-fil».
  const dialogError = '(document.querySelector("[data-import-error=dialog]")?.innerText || "")';
  for (const [name, content, message] of [['Liste.xlsx', 'PK', /Filtypen \.xlsx støttes ikke/], ['Notat.txt', INVALID, /Innholdet i tekstfilen ble ikke gjenkjent som GMI eller SOSI/]]) {
    const target = await ui.file(name, content);
    await ui.openAdd(); await ui.feed(target);
    await browser.waitFor(`new RegExp(${JSON.stringify(message.source)}).test(${dialogError})`);
    assert.doesNotMatch(await browser.evaluate(dialogError), /Ugyldig GMI-fil/);
    assert.equal(await ui.has(alfa) && await ui.has(bravo), true, `${name}: layers kept`);
    await ui.shots(`2c-${path.extname(name).slice(1)}-dialog`);
    await ui.click('Lukk legg til lag');
    await browser.waitFor(`!${addDialog}`);
  }
  assert.equal(await browser.evaluate(`Boolean(${notice})`), false);
  // An error that arrives while the dialog is closed (a window drop) is stated in the workspace, with retry and dismissal.
  const drop = () => browser.evaluate(`(() => { const transfer = new DataTransfer();
    transfer.items.add(new File([${JSON.stringify(INVALID)}], 'Ugyldig.gmi'));
    document.body.dispatchEvent(new DragEvent('dragenter', { dataTransfer: transfer, bubbles: true, cancelable: true }));
    document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true })); })()`);
  await drop();
  await browser.waitFor(notice);
  assert.equal(await browser.evaluate(`${notice}.getAttribute('role')`), 'alert');
  assert.match(await browser.evaluate(`${notice}.innerText`), /Ugyldig GMI-fil/, 'a malformed GMI keeps its GMI-specific message');
  await ui.shots('f05-notice');
  await ui.click('Lukk feilmelding', notice);
  await browser.waitFor(`!${notice}`);
  await drop();
  await browser.waitFor(notice);
  await ui.click('Prøv igjen', notice);
  await browser.waitFor(addDialog);
  assert.equal(await browser.evaluate('Boolean(document.querySelector("[data-import-error=dialog][role=alert]"))'), true, 'the retry dialog states the error');
  await ui.click('Lukk legg til lag');
  await browser.waitFor(`!${addDialog}`);
  await ui.pause(300);
  assert.equal(await browser.evaluate(`Boolean(${notice})`), false, 'closing the retry dialog dismisses the error');
  assert.equal(await ui.alive(), true);
  assert.equal(await ui.has(alfa) && await ui.has(bravo), true);
  await ui.act(alfa, 'Profilanalyse');
  await browser.waitFor(plot);
});

suite('F-05: a failed additional import keeps corrections, FOTO layers and an open Rettinger workspace', async (ui) => {
  const { browser } = ui;
  const core = await ui.file('Leveranse.gmi', ''), bad = await ui.file('Ugyldig.gmi', INVALID), photo = await ui.file('a.png', gpsPng());
  await copyFile(path.join(GMI_EDIT_FIXTURE_DIR, 'core-crlf-latin1.gmi'), core);
  await ui.load(core);
  const editor = 'document.querySelector(".gmi-edit-inspector .gmi-edit-editor")';
  const open = async () => {
    await browser.evaluate('document.querySelector("[data-gmi-edit-action]").click()');
    await browser.waitFor(`${rettinger}?.querySelector('[data-gmi-edit-status]')?.innerText === 'Redigerbar'`);
  };
  const edit = async (field, value) => {
    await clickGmiTableObject(browser, 'line:1');
    await browser.waitFor(`${editor}?.dataset.gmiObject === 'line:1'`);
    await browser.evaluate(`(() => { const input = ${editor}.querySelector('tr[data-field="${field}"] input');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  };
  const staged = `${rettinger}?.querySelector('[data-download-state]')?.dataset.downloadState === 'unsaved'`;
  const drop = () => browser.evaluate(`(() => { const transfer = new DataTransfer();
    transfer.items.add(new File([${JSON.stringify(INVALID)}], 'Ugyldig.gmi'));
    document.body.dispatchEvent(new DragEvent('dragenter', { dataTransfer: transfer, bubbles: true, cancelable: true }));
    document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true })); })()`);
  await open();
  await edit('SDR', '11.0');
  await ui.click('Forhåndsvis endringer (1)', editor);
  await ui.click('Legg til retting', editor);
  await browser.waitFor(staged);
  // A dropped invalid file while Rettinger is open: the same workspace stays, with its correction.
  await browser.evaluate(`window.__rettinger = ${rettinger}; true`);
  await drop();
  await browser.waitFor(importFailed);
  await browser.waitFor(notice);
  assert.equal(await browser.evaluate(`window.__rettinger === ${rettinger} && ${staged}`), true);
  await ui.click('Lukk feilmelding', notice);
  // With unsubmitted values the drop is still refused (existing draft guard).
  await edit('Merknad', 'Utkast');
  await drop();
  await ui.pause(700);
  assert.equal(await browser.evaluate(importFailed), false);
  assert.equal(await browser.evaluate(`${editor}.querySelector('tr[data-field="Merknad"]').dataset.state`), 'draft');
  await ui.click('Lukk Rettinger', rettinger);
  await ui.click('Forkast skjemaet', 'document.querySelector("dialog[open][data-gmi-confirm=workspace]")');
  await browser.waitFor(`!${rettinger}`);
  const pill = 'document.querySelector("[data-gmi-layer-pill]")?.innerText';
  for (const foto of [false, true]) {
    if (foto) {
      await clickSourceControl(browser, 'Bilder', 'document');
      await browser.waitFor(importDialog);
      await setPhotoFiles(browser, 'input[aria-label="Velg bildefiler"]', [photo]);
      await waitForThumbnails(browser);
      await createLayerWithPlacement(browser, 'exif');
      await clickSourceControl(browser, 'Lukk FOTO', 'document');
      await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
    }
    await ui.openAdd(); await ui.feed(bad);
    await browser.waitFor(importFailed);
    await ui.click('Lukk legg til lag');
    assert.equal(await ui.alive(), true);
    assert.match(await browser.evaluate(pill), /1 retting · ikke lastet ned/);
    assert.equal(await browser.evaluate('Boolean(document.querySelector(\'section[aria-label^="Fotokartlag"]\'))'), foto);
    // The session-loss guard still protects the kept work.
    assert.equal(await browser.evaluate('(() => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; })()'), true);
    // Batch 2C: the dialog stated the error; closing it left no workspace notice.
    assert.equal(await browser.evaluate(`Boolean(${notice})`), false);
  }
  await open();
  assert.equal(await browser.evaluate(staged), true);
});

suite('F-06: the layer-card «Validator» opens its own layer after Rettinger and Validator navigation', async (ui) => {
  const { browser } = ui;
  const alfa = await ui.file('Alfa.gmi', ALFA), bravo = await ui.file('Bravo.gmi', BRAVO);
  await ui.load(alfa); await ui.load(bravo);
  const close = async () => {
    await browser.evaluate('document.querySelector(\'[data-workspace-close="validator"]\').click()');
    await browser.waitFor(`!${validator}`);
    await browser.waitFor(ui.title(bravo));
  };
  const opens = async (target, name) => {
    await ui.act(target, 'Validator');
    await browser.waitFor(validator);
    await ui.pause(400);
    assert.match(await browser.evaluate(validatorLayer), name);
  };
  await opens(alfa, /Alfa/); await close();
  await opens(bravo, /Bravo/); await close();
  for (let visit = 0; visit < 2; visit++) {
    await browser.evaluate(`${ui.card(alfa)}.querySelector('[data-gmi-edit-action]').click()`);
    await browser.waitFor(rettinger);
    await ui.pause(500);
    await ui.click('Åpne Validator');
    await browser.waitFor(validator);
    await ui.pause(400);
    assert.match(await browser.evaluate(validatorLayer), /Alfa/, 'Rettinger still opens its own layer');
    await close();
    await opens(bravo, /Bravo/);
    if (!visit) await ui.shots('f06-validator');
    await close();
  }
  await opens(alfa, /Alfa/); await close();
});

suite('F-18: a file without CRS asks explicitly, and «Avbryt» or Escape imports nothing', async (ui) => {
  const { browser } = ui;
  const alfa = await ui.file('Alfa.gmi', ALFA), nocrs = await ui.file('UtenCrs.gmi', NOCRS), bad = await ui.file('Ugyldig.gmi', INVALID);
  await ui.feed(nocrs);
  await browser.waitFor(crsDialog, 8000);
  assert.equal(await browser.evaluate('window.__confirms'), 0, 'no native prompt');
  assert.match(await browser.evaluate(`${crsDialog}.innerText`), /UtenCrs\.gmi[\s\S]*koordinatsystem/);
  assert.deepEqual(await browser.evaluate(`Array.from(${crsDialog}.querySelectorAll('input[type=radio]')).map(e => [e.value, e.checked, getComputedStyle(e).accentColor])`),
    [['25832', false, 'rgb(0, 117, 149)'], ['25833', false, 'rgb(0, 117, 149)']], 'nothing is preselected');
  assert.equal(await browser.evaluate(`${ui.button('Importer', crsDialog)}.disabled`), true);
  await ui.shots('f18-dialog');
  await ui.click('Avbryt', crsDialog);
  await browser.waitFor(`!${crsDialog}`);
  assert.equal(await browser.evaluate(`Boolean(document.querySelector(".leaflet-container")) || ${importFailed}`), false, 'the start screen is unchanged');
  await ui.load(alfa);
  await ui.openAdd(); await ui.feed(nocrs);
  await browser.waitFor(crsDialog);
  await pressKey(browser, 'Escape', KEYS.Escape);
  await browser.waitFor(`!${crsDialog}`);
  assert.equal(await ui.alive(), true);
  assert.equal(await ui.has(alfa), true);
  assert.equal(await ui.has(nocrs), false);
  // Cancelling after an earlier failure does not bring the old error back or hide the workspace.
  await ui.feed(bad);
  await browser.waitFor(importFailed);
  await ui.feed(nocrs);
  await browser.waitFor(crsDialog);
  await ui.click('Avbryt', crsDialog);
  await browser.waitFor(`!${crsDialog}`);
  assert.equal(await ui.alive(), true);
  assert.equal(await browser.evaluate(importFailed), false);
  // Explicit UTM 33 with the keyboard; the same file can be chosen again.
  await ui.feed(nocrs);
  await browser.waitFor(crsDialog);
  await browser.evaluate(`${crsDialog}.querySelector('input[value="25833"]').focus()`);
  await ui.space();
  await browser.waitFor(`${ui.button('Importer', crsDialog)}.disabled === false`);
  await ui.shots('f18-dialog-chosen');
  await ui.click('Importer', crsDialog);
  await browser.waitFor(ui.title(nocrs));
  await ui.pause(700);
  const placed = (await ui.points(0)).map((p) => proj4('EPSG:4326', UTM33, [p.lng, p.lat]).map(Math.round));
  assert.equal(placed.length, 2);
  assert(placed.some(([east, north]) => east === 581941 && north === 6566001), `UTM 33 was used: ${JSON.stringify(placed)}`);
  assert.equal(await browser.evaluate('window.__confirms'), 0);
});

suite('F-18: an explicit UTM 32 choice places a first file in UTM 32', async (ui) => {
  const nocrs = await ui.file('UtenCrs.gmi', NOCRS);
  await ui.feed(nocrs);
  await ui.browser.waitFor(crsDialog, 8000);
  await ui.browser.evaluate(`${crsDialog}.querySelector('input[value="25832"]').click()`);
  await ui.click('Importer', crsDialog);
  await ui.browser.waitFor(ui.title(nocrs));
  await ui.browser.waitFor(`document.querySelector(".leaflet-container") && ${MAP}`);
  await ui.pause(700);
  assert.deepEqual(utm32((await ui.points(0))[0]).map(Math.round), [581941, 6566001]);
  // A window drop uses the same question; parsing disables the drop region, but not the dialog.
  await ui.browser.evaluate(`(() => { const transfer = new DataTransfer();
    transfer.items.add(new File([${JSON.stringify(NOCRS)}], 'Sluppet.gmi'));
    document.body.dispatchEvent(new DragEvent('dragenter', { dataTransfer: transfer, bubbles: true, cancelable: true }));
    document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true })); })()`);
  await ui.browser.waitFor(crsDialog, 8000);
  assert.match(await ui.browser.evaluate(`${crsDialog}.innerText`), /Sluppet\.gmi/);
  await ui.click('Avbryt', crsDialog);
  await ui.browser.waitFor(`!${crsDialog}`);
  assert.equal(await ui.alive(), true);
  assert.equal((await ui.points(0)).length, 1);
});
