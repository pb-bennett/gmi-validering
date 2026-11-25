// Batch 2B: keyboard, dialog and layout access in the import, analysis and layer-management shell (audit F-08, F-09, F-12).
// Synthetic files only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import proj4 from 'proj4';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { KEYS, pressKey } from './helpers/photoWorkspace.mjs';

const app = process.env.PHOTO_UI_URL;
const shots = process.env.GMI_2B_SCREENSHOT_DIR;
const sizes = [[1280, 720], [1366, 768]];
const UTM32 = '+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs';

const gmi = ({ lines = [], points = [], crs = 'COSYS_EPSG 25832' }) => [
  '[GMIFILE_ASCII]', '_VERSION 2', '_FILETYPE GMI', '_INDEX !!!!!!!!!!!!!!!!!!!!', ...(crs ? [crs] : []),
  '[L_]', '_FIELDNAMES S_FCODE;Dimensjon;', '[P_]', '_FIELDNAMES S_FCODE;', '[+L_]',
  ...lines.flatMap((coords, i) => [`:L ${i + 1}`, '_FIELDVALUES SP;160;', '/XYZ', ...coords]), '[+P_]',
  ...points.flatMap(([code, coord], i) => [`:P ${i + 1}`, `_FIELDVALUES ${code};`, '/XYZ', coord]), '[END]', ''].join('\r\n');
const at = (dx, dy, z = '') => `${581940 + dx} ${6566000 + dy}${z === '' ? '' : ` ${z}`}`;
// Alfa and Bravo share indices and lie 500 m apart; both miss Z on several points.
const ALFA = gmi({ lines: [[at(0, 0, 101), at(20, 0, 100.99)], [at(0, 3), at(20, 3)]], points: Array.from({ length: 25 }, (_, i) => ['KUM', at(i, 5)]) });
const BRAVO = gmi({ lines: [[at(500, 0, 101), at(520, 0, 100)]], points: [['KUM', at(501, 1)], ['KUM', at(530, 2, 99)]] });
const NOCRS = gmi({ crs: null, lines: [[at(0, 0, 101), at(20, 0, 100)]], points: [['KUM', at(1, 1, 99)]] });
const INVALID = 'not a survey file';

const init = `localStorage.clear();
let leaflet;Object.defineProperty(window,'L',{configurable:true,get(){return leaflet;},set(v){leaflet=v;v?.Map?.addInitHook?.(function(){(window.__maps??=[]).push(this);});}});
const originalFetch=window.fetch;window.fetch=(url,options)=>String(url).includes('ws.geonorge.no')?Promise.resolve(new Response('{"punkter":[]}',{status:200,headers:{'Content-Type':'application/json'}})):originalFetch(url,options);
const src=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
Object.defineProperty(HTMLImageElement.prototype,'src',{...src,set(v){src.set.call(this,/kartverket|geonorge|cdnjs/.test(String(v))?'data:image/gif;base64,R0lGODlhAQABAAAAACw=':v);}});`;

const MAP = 'window.__maps.find(m => m.getContainer().isConnected)';
const button = (label, scope = 'document') => `Array.from(${scope}.querySelectorAll('button')).find(e => e.getAttribute('aria-label') === ${JSON.stringify(label)} || e.innerText.trim() === ${JSON.stringify(label)})`;
const picker = 'document.querySelector("[data-file-picker]")';
const addDialog = 'document.querySelector("dialog[open][aria-labelledby=add-layer-title]")';
const crsDialog = 'document.querySelector("dialog[open][data-gmi-confirm=crs]")';
const removeDialog = 'document.querySelector("dialog[open][data-gmi-confirm=remove-layer]")';
const heightPanel = 'document.querySelector("[data-height-control]")';
const notice = 'document.querySelector("[data-import-error=workspace]")';
const table = 'document.querySelector("[data-table-geometry]")';
const tooltip = 'document.querySelector(".photo-icon-tooltip")';
const rect = (target) => `(() => { const r = ${target}.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; })()`;
// The element (or something in it) is what a pointer at its centre would reach.
const reachable = (target) => `(() => { const e = ${target}, r = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); })()`;

async function session(run) {
  const directory = await mkdtemp(path.join(tmpdir(), 'gmi-2b-ui-'));
  const browser = await openTestChrome();
  const pause = (ms = 300) => browser.evaluate(`new Promise(resolve => setTimeout(resolve, ${ms}))`);
  const key = async (name, code, windowsVirtualKeyCode, text) => {
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code, windowsVirtualKeyCode, text });
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code, windowsVirtualKeyCode });
  };
  const title = (target) => `document.querySelector(${JSON.stringify(`[title="${path.basename(target)}"]`)})`;
  const ui = {
    browser, pause, title,
    evaluate: browser.evaluate,
    waitFor: (expression, timeout = 8000) => browser.waitFor(expression, timeout),
    file: async (name, content) => { const target = path.join(directory, name); await writeFile(target, content); return target; },
    resize: async ([width, height]) => { await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await pause(350); },
    enter: () => key('Enter', 'Enter', 13, '\r'),
    space: () => key(' ', 'Space', 32, ' '),
    tab: () => pressKey(browser, 'Tab', KEYS.Tab),
    shiftTab: () => pressKey(browser, 'Tab', { ...KEYS.Tab, modifiers: 8 }),
    escape: () => pressKey(browser, 'Escape', KEYS.Escape),
    card: (target) => `${title(target)}.closest('.py-1')`,
    action: (target, name) => `${title(target)}.closest('.py-1').querySelector(${JSON.stringify(`button[aria-label="${name}"]`)})`,
    focus: (target) => browser.evaluate(`${target}.focus()`),
    focused: (target) => browser.evaluate(`document.activeElement === ${target}`),
    click: async (target) => { await browser.waitFor(target, 8000); await browser.evaluate(`${target}.click()`); },
    load: async (target) => {
      if (await browser.evaluate('Boolean(document.querySelector(".leaflet-container"))')) { await ui.click(button('Legg til fil')); await ui.waitFor(addDialog); }
      await pause(200);
      await setPhotoFiles(browser, 'input[type=file]', [target]);
      await browser.waitFor(title(target));
      await browser.waitFor(`!${addDialog} && document.querySelector('.leaflet-container') && ${MAP.replace('window.__maps', '(window.__maps || [])')}`);
      await pause(500);
    },
    expand: async (target) => {
      if (!await browser.evaluate(`Boolean(${ui.action(target, 'Høydekontroll')})`)) await browser.evaluate(`${title(target)}.click()`);
      await ui.waitFor(ui.action(target, 'Høydekontroll'));
    },
    // Tabs until the target has focus; a real keyboard path, not a scripted focus.
    tabTo: async (target, limit = 40) => {
      for (let i = 0; i < limit; i++) { await ui.tab(); if (await browser.evaluate(`document.activeElement === ${target}`)) return true; }
      return false;
    },
    // Keyboard activation must reach the browser's own file chooser.
    opensChooser: async (press) => {
      const seen = browser.events.length;
      await press();
      const until = Date.now() + 4000;
      while (Date.now() < until) {
        if (browser.events.slice(seen).some((event) => event.method === 'Page.fileChooserOpened')) return true;
        await pause(50);
      }
      return false;
    },
    hover: async (target) => {
      const point = await browser.evaluate(`(() => { const r = ${target}.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point, pointerType: 'mouse' });
    },
    away: async () => { await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 760, y: 5, pointerType: 'mouse' }); await ui.waitFor(`!${tooltip}`); },
    centre: async () => proj4('EPSG:4326', UTM32, Object.values(await browser.evaluate(`(() => { const c = ${MAP}.getCenter(); return { lng: c.lng, lat: c.lat }; })()`))),
    shot: async (name) => {
      if (!shots) return;
      await mkdir(shots, { recursive: true });
      const [width, height] = await browser.evaluate('[innerWidth, innerHeight]');
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(shots, `${name}-${width}x${height}.png`), Buffer.from(data, 'base64'));
    },
    // Everything in a modal is inside the viewport, or can be scrolled into it.
    assertReachable: async (dialog, label) => {
      const clipped = await browser.evaluate(`(() => {
        const d = ${dialog}, panel = d.firstElementChild.matches('h2') ? d : d.firstElementChild, box = panel.getBoundingClientRect();
        const bad = [];
        if (box.top < 0 || box.left < 0 || box.bottom > innerHeight || box.right > innerWidth) bad.push('panel ' + JSON.stringify(box));
        for (const e of d.querySelectorAll('button, a[href], input, select')) {
          if (!e.getClientRects().length) continue;
          e.scrollIntoView({ block: 'nearest' });
          const r = e.getBoundingClientRect();
          if (r.top < box.top - 1 || r.bottom > box.bottom + 1 || r.left < box.left - 1 || r.right > box.right + 1) bad.push((e.getAttribute('aria-label') || e.innerText || e.type) + ' ' + [r.top, r.bottom]);
          else if (!e.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))) bad.push('covered: ' + (e.getAttribute('aria-label') || e.innerText || e.type));
        }
        return bad; })()`);
      assert.deepEqual(clipped, [], `${label}: every control is inside the viewport`);
    },
    // Opens by keyboard from `opener`; checks name, initial focus, containment, inertness, layout, Escape and restoration.
    checkModal: async ({ name, opener, dialog, heading, initial, whileOpen }) => {
      await ui.focus(opener);
      await ui.enter();
      await ui.waitFor(dialog);
      await pause(250);
      assert.equal(await browser.evaluate(`document.getElementById(${dialog}.getAttribute('aria-labelledby'))?.innerText.trim()`), heading, `${name}: accessible name`);
      assert.equal(await browser.evaluate(`${dialog}.matches(':modal')`), true, `${name}: modal`);
      assert.equal(await browser.evaluate(`${dialog}.contains(document.activeElement)`), true, `${name}: focus moves in`);
      if (initial) assert.equal(await ui.focused(initial), true, `${name}: initial focus`);
      for (const step of [ui.tab, ui.shiftTab]) {
        for (let i = 0; i < 12; i++) {
          await step();
          assert.equal(await browser.evaluate(`document.activeElement === document.body || ${dialog}.contains(document.activeElement)`), true, `${name}: Tab stays out of the workspace`);
        }
      }
      // Inert: scripted focus and pointer input cannot reach the workspace either.
      await browser.evaluate(`document.querySelector('[data-gmi-edit-action]').focus()`);
      assert.equal(await browser.evaluate(`document.activeElement.matches('[data-gmi-edit-action]')`), false, `${name}: background is inert`);
      assert.equal(await browser.evaluate(reachable('document.querySelector("[data-gmi-edit-action]")')), false, `${name}: background takes no pointer input`);
      for (const size of sizes) {
        await ui.resize(size);
        await ui.assertReachable(dialog, `${name} ${size}`);
        await browser.evaluate(`${dialog}.querySelectorAll('*').forEach(e => { e.scrollTop = 0; })`);
        await ui.shot(`dialog-${name}`);
      }
      await whileOpen?.();
      await ui.escape();
      await ui.waitFor(`!${dialog}`);
      await pause(100);
      assert.equal(await ui.focused(opener), true, `${name}: focus returns to the opener`);
    },
  };
  try {
    await ui.resize(sizes[0]);
    await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: init });
    await browser.send('Page.setInterceptFileChooserDialog', { enabled: true });
    await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
    await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
    await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
    await pause(300);
    await run(ui);
    assert.deepEqual(browser.events.filter((event) => event.method === 'Runtime.exceptionThrown').map((event) => event.params.exceptionDetails.exception?.description), []);
  } finally {
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
}
const suite = (name, run) => test(name, { skip: !app || !chromePath, timeout: 240000 }, () => session(run));

suite('F-08: the initial upload is reached and operated by keyboard, and a failed first import can be retried by keyboard', async (ui) => {
  const bad = await ui.file('Ugyldig.gmi', INVALID), good = await ui.file('Alfa.gmi', ALFA);
  assert.equal(await ui.tabTo(picker), true, 'Tab reaches «Velg fil»');
  assert.equal(await ui.evaluate(`${picker}.matches(':focus-visible') && getComputedStyle(${picker}).boxShadow !== 'none'`), true, 'visible focus');
  const { nodes } = await ui.browser.send('Accessibility.getFullAXTree');
  const node = nodes.find((entry) => entry.role?.value === 'button' && entry.name?.value === 'Velg fil');
  assert.match(node.description.value, /Støtter \.gmi, \.sos\/\.sosi og \.kof/);
  await ui.shot('upload-focus');
  assert.equal(await ui.opensChooser(ui.enter), true, 'Enter opens the file chooser');
  assert.equal(await ui.opensChooser(ui.space), true, 'Space opens the file chooser');
  await setPhotoFiles(ui.browser, 'input[type=file]', [bad]);
  await ui.waitFor(`Array.from(document.querySelectorAll('[role=alert]')).some(e => /Feil ved lasting av fil/.test(e.innerText))`);
  assert.equal(await ui.tabTo(picker), true, 'the picker stays available after the failure');
  assert.equal(await ui.opensChooser(ui.enter), true);
  await setPhotoFiles(ui.browser, 'input[type=file]', [good]);
  await ui.waitFor(ui.title(good), 15000);
});

suite('F-08: «Legg til fil» works by keyboard; a failed import keeps the layers and offers retry and cancel; nested CRS choice', async (ui) => {
  const alfa = await ui.file('Alfa.gmi', ALFA), bravo = await ui.file('Bravo.gmi', BRAVO);
  const bad = await ui.file('Ugyldig.gmi', INVALID), nocrs = await ui.file('UtenCrs.gmi', NOCRS);
  await ui.load(alfa);
  const opener = button('Legg til fil');
  await ui.checkModal({ name: 'legg-til-fil', opener, dialog: addDialog, heading: 'Legg til nytt lag', initial: picker,
    whileOpen: async () => {
      await ui.focus(picker);
      assert.equal(await ui.opensChooser(ui.enter), true, 'Enter opens the file chooser');
      // Dismissing the operating system's file chooser sends a bubbling `cancel` from the input: the dialog stays.
      await ui.evaluate(`document.querySelector('input[type=file]').dispatchEvent(new Event('cancel', { bubbles: true }))`);
      await ui.pause(150);
      assert.equal(await ui.evaluate(`Boolean(${addDialog})`), true, 'a dismissed file chooser does not close the dialog');
      // The window's drop feedback is drawn over the modal dialog, not underneath it.
      const zone = { x: 200, y: 200, modifiers: 0, data: { items: [], files: [alfa], dragOperationsMask: 1 } };
      for (const type of ['dragEnter', 'dragOver']) await ui.browser.send('Input.dispatchDragEvent', { type, ...zone });
      await ui.waitFor(`${addDialog}.querySelector('.file-drop-overlay')`);
      await ui.browser.send('Input.dispatchDragEvent', { type: 'dragCancel', ...zone });
      await ui.waitFor(`!document.querySelector('.file-drop-overlay')`);
    } });

  await ui.focus(opener);
  await ui.enter();
  await ui.waitFor(addDialog);
  await setPhotoFiles(ui.browser, 'input[type=file]', [bad]);
  await ui.waitFor(`${addDialog}.querySelector('[role=alert]')`);
  assert.equal(await ui.evaluate(`Boolean(${ui.title(alfa)}) && Boolean(document.querySelector('.leaflet-container'))`), true, 'layers and map are kept');
  for (const size of sizes) { await ui.resize(size); await ui.assertReachable(addDialog, `failed import ${size}`); await ui.shot('failed-import-dialog'); }
  assert.equal(await ui.evaluate(`${addDialog}.contains(document.activeElement)`), true, 'focus stays in the dialog for the retry');
  await ui.focus(picker);
  assert.equal(await ui.opensChooser(ui.space), true, 'retry by keyboard');
  // Cancel: the workspace states the failure and offers a retry of its own.
  await ui.escape();
  await ui.waitFor(`!${addDialog} && ${notice}`);
  assert.equal(await ui.focused(opener), true);
  await ui.focus(button('Prøv igjen', notice));
  await ui.enter();
  await ui.waitFor(addDialog);
  await ui.escape();
  await ui.waitFor(`!${addDialog}`);
  assert.equal(await ui.focused(opener), true, 'the notice was replaced, so focus goes to «Legg til fil»');
  await ui.focus(button('Lukk feilmelding'));
  await ui.enter();
  await ui.waitFor(`!${notice}`);

  // The CRS question is on top of the dialog. Escape answers the question only.
  await ui.focus(opener);
  await ui.enter();
  await ui.waitFor(addDialog);
  await setPhotoFiles(ui.browser, 'input[type=file]', [nocrs]);
  await ui.waitFor(crsDialog);
  await ui.shot('crs-over-add-dialog');
  assert.equal(await ui.evaluate(`${crsDialog}.contains(document.activeElement)`), true);
  await ui.escape();
  await ui.waitFor(`!${crsDialog}`);
  assert.equal(await ui.evaluate(`Boolean(${addDialog})`), true);
  assert.equal(await ui.evaluate(`Boolean(${ui.title(nocrs)})`), false, 'cancel imports nothing');
  assert.equal(await ui.evaluate(`${addDialog}.contains(document.activeElement)`), true, 'focus returns to the dialog underneath');
  await setPhotoFiles(ui.browser, 'input[type=file]', [nocrs]);
  await ui.waitFor(crsDialog);
  await ui.evaluate(`${crsDialog}.querySelector('input[type=radio][value="25832"]').focus()`);
  await ui.space();
  await ui.focus(button('Importer', crsDialog));
  await ui.enter();
  await ui.waitFor(`${ui.title(nocrs)} && !${addDialog}`, 15000);
  await ui.load(bravo);
});

suite('F-08: layer cards are disclosed by keyboard, and the visibility checkbox does not toggle the card', async (ui) => {
  const alfa = await ui.file('Alfa.gmi', ALFA);
  await ui.load(alfa);
  const name = `${ui.title(alfa)}.closest('button')`, box = `${ui.card(alfa)}.querySelector('input[type=checkbox]')`;
  const open = () => ui.evaluate(`Boolean(${ui.action(alfa, 'Høydekontroll')})`);
  const state = async () => [await open(), await ui.evaluate(`${name}.getAttribute('aria-expanded')`)];
  const initial = await open();
  assert.equal(await ui.tabTo(name), true, 'Tab reaches the card disclosure');
  assert.equal(await ui.evaluate(`${name}.matches(':focus-visible') && getComputedStyle(${name}).boxShadow !== 'none'`), true);
  for (const [press, expected] of [[ui.enter, !initial], [ui.space, initial], [ui.enter, !initial], [ui.enter, initial]]) {
    await press();
    await ui.pause(150);
    assert.deepEqual(await state(), [expected, String(expected)]);
  }
  await ui.expand(alfa);
  assert.equal(await ui.evaluate(`Boolean(document.getElementById(${name}.getAttribute('aria-controls'))?.contains(${ui.action(alfa, 'Høydekontroll')}))`), true);
  // The pointer target is unchanged: one click on the name is one toggle.
  await ui.evaluate(`${ui.title(alfa)}.click()`);
  await ui.pause(150);
  assert.equal(await open(), false);
  await ui.expand(alfa);
  await ui.focus(box);
  for (const checked of [false, true]) {
    await ui.space();
    await ui.pause(150);
    assert.deepEqual([await ui.evaluate(`${box}.checked`), await open()], [checked, true]);
  }
});

suite('F-09: shell dialogs have a name, contain focus, fit laptop viewports, close on Escape and restore focus', async (ui) => {
  const alfa = await ui.file('Alfa.gmi', ALFA);
  await ui.load(alfa);
  await ui.expand(alfa);
  await ui.resize(sizes[1]);
  await ui.checkModal({ name: 'del-app', opener: `Array.from(document.querySelectorAll('button')).find(e => /^Del( app)?$/.test(e.innerText.trim()) || e.getAttribute('aria-label') === 'Del app')`,
    dialog: 'document.querySelector("dialog[open][aria-labelledby=share-app-title]")', heading: 'Del app' });
  await ui.checkModal({ name: 'wms', opener: button('Legg til Gemini WMS'), dialog: 'document.querySelector("dialog[open][aria-labelledby=wms-dialog-title]")',
    heading: 'Legg til Gemini WMS', initial: 'document.querySelector("#wms-url")',
    whileOpen: async () => {
      await ui.evaluate(`Array.from(document.querySelectorAll('dialog[open] button')).find(e => /Avanserte innstillinger/.test(e.innerText)).click()`);
      for (const size of sizes) { await ui.resize(size); await ui.assertReachable('document.querySelector("dialog[open]")', `wms advanced ${size}`); }
    } });
  await ui.checkModal({ name: 'datautforsker', opener: button('Inspiser data'), dialog: 'document.querySelector("dialog[open][aria-labelledby=data-inspector-title]")', heading: 'Datautforsker' });
  await ui.checkModal({ name: 'fjern-lag', opener: ui.action(alfa, 'Fjern lag'), dialog: removeDialog, heading: 'Fjern lag', initial: button('Avbryt', removeDialog) });
  assert.equal(await ui.evaluate(`Boolean(${ui.title(alfa)})`), true, 'Escape removes nothing');
  const stats = 'document.querySelector("dialog[open][aria-labelledby=stats-dialog-title]")';
  await ui.checkModal({ name: 'statistikk', opener: button('Vis bruksstatistikk'), dialog: stats, heading: 'Bruksstatistikk',
    whileOpen: async () => {
      const selector = `${stats}.querySelector('button[aria-haspopup=dialog]')`;
      await ui.focus(selector);
      await ui.enter();
      await ui.waitFor(`${stats}.querySelector('[aria-label="Velg kommuner"]')`);
      await ui.escape();
      await ui.waitFor(`!${stats}.querySelector('[aria-label="Velg kommuner"]')`);
      assert.equal(await ui.evaluate(`Boolean(${stats})`), true, 'the first Escape closes the selector only');
    } });
  await ui.evaluate(`${ui.action(alfa, 'Profilanalyse')}.click()`);
  await ui.waitFor('document.querySelector(".profile-analysis-panel")');
  const standards = 'document.querySelector("dialog[open][aria-labelledby=standards-info-title]")';
  await ui.checkModal({ name: 'krav-til-selvfall', opener: button('Innstillinger'), dialog: standards, heading: 'Krav til selvfall (Norsk Vann)' });
  // Backdrop clicks still close, and the analysis underneath is untouched.
  await ui.click(button('Innstillinger'));
  await ui.waitFor(standards);
  await ui.evaluate(`${standards}.click()`);
  await ui.waitFor(`!${standards}`);
  assert.equal(await ui.evaluate('Boolean(document.querySelector(".profile-analysis-panel"))'), true);
});

suite('F-09: removing a layer by keyboard continues from the layer manager', async (ui) => {
  const alfa = await ui.file('Alfa.gmi', ALFA), bravo = await ui.file('Bravo.gmi', BRAVO);
  await ui.load(alfa);
  await ui.load(bravo);
  for (const [target, after] of [[bravo, button('Legg til fil')], [alfa, button('Åpne fil')]]) {
    await ui.focus(ui.action(target, 'Fjern lag'));
    await ui.enter();
    await ui.waitFor(removeDialog);
    await ui.focus(button('Fjern', removeDialog));
    await ui.enter();
    await ui.waitFor(`!${ui.title(target)} && !${removeDialog}`);
    await ui.waitFor(`document.activeElement === ${after}`);
  }
});

suite('Høydekontroll is docked clear of the sidebar, keeps the centred object visible and goes to its own layer', async (ui) => {
  const alfa = await ui.file('Alfa.gmi', ALFA), bravo = await ui.file('Bravo.gmi', BRAVO);
  await ui.load(alfa);
  await ui.load(bravo);
  await ui.expand(alfa);
  const opener = ui.action(alfa, 'Høydekontroll');
  const layout = async (label) => {
    for (const size of sizes) {
      await ui.resize(size);
      const at = await ui.evaluate(rect(heightPanel)), map = await ui.evaluate(rect('document.querySelector(".leaflet-container")'));
      assert(at.left >= map.left && at.right <= map.right + 1 && at.top >= map.top && at.bottom <= map.bottom + 1, `${label} ${size}: inside the map pane ${JSON.stringify({ at, map })}`);
      assert(at.left > (map.left + map.right) / 2, `${label} ${size}: the map centre is not covered`);
      assert.equal(await ui.evaluate(`${ui.card(alfa)}.getBoundingClientRect().right <= ${at.left}`), true);
      for (const e of [button('Lukk høydekontroll', heightPanel), button('Vis i kart', heightPanel)]) {
        await ui.evaluate(`${e}.scrollIntoView({ block: 'nearest' })`);
        assert.equal(await ui.evaluate(reachable(e)), true, `${label} ${size}: controls are not covered`);
      }
      assert(at.height >= 120, `${label} ${size}: usable height ${at.height}`);
      await ui.evaluate(`${heightPanel}.querySelectorAll('*').forEach(e => { e.scrollTop = 0; })`);
      await ui.shot(`hoydekontroll-${label}`);
    }
  };
  await ui.focus(opener);
  await ui.enter();
  await ui.waitFor(heightPanel);
  assert.equal(await ui.evaluate(`${heightPanel}.contains(document.activeElement)`), true, 'focus moves into the control');
  assert.equal(await ui.evaluate(`document.getElementById(${heightPanel}.getAttribute('aria-labelledby')).innerText`), 'Høydekontroll (Z)');
  assert.equal(await ui.evaluate(`${heightPanel}.innerText.includes('Alfa.gmi')`), true);
  assert.equal(await ui.evaluate(`/Fant objekter uten høyde/.test(document.body.innerText)`), false, 'the load prompt waits while the control is open');
  await layout('kart');
  // «Vis i kart» by keyboard, repeatedly: the control stays open and goes to its own layer's objects.
  const show = `${heightPanel}.querySelectorAll('tbody button')`;
  await ui.focus(`${show}[0]`);
  await ui.enter();
  await ui.pause(900);
  const near = (point, [east, north]) => assert(Math.abs(point[0] - east) < 4 && Math.abs(point[1] - north) < 4, `${point} is not near ${[east, north]}`);
  near(await ui.centre(), [581940, 6566005]);
  assert.equal(await ui.focused(`${show}[0]`), true, 'the list keeps focus, so the next object is one key away');
  await ui.shot('hoydekontroll-vis-i-kart');
  await ui.focus(`${show}[3]`);
  await ui.enter();
  await ui.pause(900);
  near(await ui.centre(), [581943, 6566005]);
  // Not modal: the other layer's control can be opened from its card, and replaces this one.
  await ui.evaluate(`${ui.title(bravo)}.click()`);
  await ui.waitFor(ui.action(bravo, 'Høydekontroll'));
  await ui.focus(ui.action(bravo, 'Høydekontroll'));
  await ui.enter();
  await ui.waitFor(`${heightPanel}.innerText.includes('Bravo.gmi')`);
  assert.equal(await ui.evaluate(`${heightPanel}.contains(document.activeElement)`), true);
  await ui.focus(`${show}[0]`);
  await ui.enter();
  await ui.pause(900);
  near(await ui.centre(), [582441, 6566001]);
  await ui.escape();
  await ui.waitFor(`!${heightPanel}`);
  assert.equal(await ui.focused(ui.action(bravo, 'Høydekontroll')), true, 'Escape closes and focus returns');
  // Escape pressed outside the control belongs to the map or sidebar.
  await ui.enter();
  await ui.waitFor(heightPanel);
  await ui.focus(ui.action(bravo, 'Zoom til lag'));
  await ui.escape();
  await ui.pause(150);
  await ui.escape();
  await ui.pause(150);
  assert.equal(await ui.evaluate(`Boolean(${heightPanel})`), true);
  await ui.click(button('Lukk høydekontroll'));
  await ui.expand(alfa);
  // With the data table, and with Profilanalyse, the map pane is shorter: the control stays inside it.
  await ui.evaluate(`${ui.action(alfa, 'Åpne datatabell')}.click()`);
  await ui.waitFor(table);
  await ui.evaluate(`${opener}.click()`);
  await ui.waitFor(heightPanel);
  await layout('datatabell');
  await ui.click(button('Lukk datatabell'));
  await ui.evaluate(`${ui.action(alfa, 'Profilanalyse')}.click()`);
  await ui.waitFor('document.querySelector(".profile-analysis-panel")');
  await layout('profilanalyse');
  assert.equal(await ui.evaluate('Boolean(document.querySelector(".profile-analysis-panel"))'), true);
});

suite('Layer-card icon controls show their tooltip above the sidebar, on hover and focus, and «Åpne datatabell» works by keyboard', async (ui) => {
  const alfa = await ui.file('Alfa.gmi', ALFA);
  await ui.load(alfa);
  await ui.expand(alfa);
  const toolbar = await ui.evaluate(`Array.from(${ui.action(alfa, 'Åpne datatabell')}.parentElement.querySelectorAll('button')).map(e => e.getAttribute('aria-label'))`);
  assert.deepEqual(toolbar, ['Nullstill filtre', 'Åpne datatabell', 'Marker alt i laget', 'Profilanalyse', 'Høydekontroll', 'Validator', 'Topplok']);
  const onTop = (target) => ui.evaluate(`(() => { const t = ${tooltip}, e = ${target}, r = t.getBoundingClientRect();
    return { text: t.textContent, expected: e.dataset.iconTooltip, native: e.getAttribute('title'), top: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === t,
      inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; })()`);
  for (const size of sizes) {
    await ui.resize(size);
    for (const label of [...toolbar, 'Rettinger: rett feltverdier', 'Zoom til lag', 'Fjern lag']) {
      const target = ui.action(alfa, label);
      await ui.hover(target);
      await ui.waitFor(`${target}.dataset.tooltipOpen === 'true' && ${tooltip}`, 3000);
      const seen = await onTop(target);
      assert.deepEqual([seen.text, seen.native, seen.top, seen.inside], [seen.expected, null, true, true], `${label} ${size}`);
      if (label === 'Åpne datatabell') { assert.equal(seen.text, 'Åpne datatabell'); await ui.shot('tooltip-datatabell'); }
      await ui.away();
    }
  }
  const data = ui.action(alfa, 'Åpne datatabell');
  await ui.focus(ui.action(alfa, 'Nullstill filtre'));
  await ui.tab();
  assert.equal(await ui.focused(data), true);
  await ui.waitFor(tooltip);
  assert.deepEqual([(await onTop(data)).text, (await onTop(data)).top], ['Åpne datatabell', true], 'keyboard focus shows it at once');
  await ui.escape();
  assert.equal(await ui.evaluate(`!${tooltip} && document.activeElement === ${data}`), true);
  await ui.enter();
  await ui.waitFor(table);
  assert.equal(await ui.evaluate(`document.body.innerText.includes('Alfa.gmi')`), true);
});

suite('F-12: the map controls at the bottom left never cover each other', async (ui) => {
  const alfa = await ui.file('Alfa.gmi', ALFA);
  await ui.load(alfa);
  for (const size of sizes) {
    await ui.resize(size);
    const names = ['Åpne Gemini WFS', 'Legg til Gemini WMS', 'Inspiser data', 'Vis bruksstatistikk'];
    for (const label of names) assert.equal(await ui.evaluate(reachable(button(label))), true, `${label} ${size}`);
    const boxes = [];
    for (const label of names) boxes.push(await ui.evaluate(rect(button(label))));
    for (let i = 1; i < boxes.length; i++) assert(boxes[i].left >= boxes[i - 1].right, `${names[i]} follows ${names[i - 1]} at ${size}`);
    await ui.shot('kartknapper');
  }
});
