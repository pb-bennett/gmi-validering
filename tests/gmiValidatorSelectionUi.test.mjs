import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { encodeSingleByte } from './helpers/gmiEditFixtures.mjs';

const app = process.env.PHOTO_UI_URL;
const table = 'document.querySelector("[data-table-geometry]")';
const grid = 'document.querySelector("[role=grid]")';
const bar = 'document.querySelector("[data-gmi-selection-bar]")';
const header = `${grid}.querySelector('[role=columnheader] input[type=checkbox]')`;
const box = (index) => `${grid}.querySelector('[data-table-row="${index}"] input[type=checkbox]')`;
const halos = `Array.from(document.querySelectorAll('.leaflet-gmi-edit-selection-pane path.gmi-edit-selection-halo')).filter(e => Number(e.getAttribute('opacity') ?? e.getAttribute('stroke-opacity')) > 0)`;

function fixture(mixed = false) {
  const rows = [
    ['VL', 'PE', '', 'NYTT', 'Alpha'], ['VL', 'PE', '', 'UENDR', 'Beta'],
    ['VL', 'PE', '11.0', 'NYTT', 'Gamma'], ['VL', 'PE', '', 'NYTT', 'Delta'], ['VL', 'PE', '11.0', 'NYTT', 'Epsilon'],
  ];
  const lines = ['[GMIFILE_ASCII]', '_VERSION 2', '_FILETYPE GMI', '_INDEX !!!!!!!!!!!!!!!!!!!!', 'COSYS_EPSG 25832',
    '[L_]', '_FIELDNAMES Tema;Material;SDR;Stedfestingsårsak;Merknad;', '[P_]', '_FIELDNAMES Tema;Type;InnvendigUtvendig;Bredde;Stedfestingsårsak;Merknad;', '[+L_]'];
  rows.forEach((values, index) => lines.push(`:L ${index + 1}`, `_FIELDVALUES ${values.join(';')};`, '/XYZ', `581940 ${6566000 + index} 101`, `581945 ${6566001 + index} 101`));
  lines.push('[+P_]');
  for (let index = 0; index < 2; index++) lines.push(`:P ${index + 1}`, `_FIELDVALUES KUM;KBRE;${index ? 'ID' : ''};1000;NYTT;Point ${index};`, '/XYZ', `581942 ${6566000 + index} 101`);
  lines.push('[END]', '');
  const source = lines.join('\r\n');
  return encodeSingleByte(mixed ? source.replace('\r\n_VERSION', '\n_VERSION') : source);
}

test('H2 production: Validator checkbox hosts, persistence, map halos, lifecycle and read-only source states',
  { skip: !app || !chromePath, timeout: 240000 }, async (t) => {
    const temporaryRoot = path.resolve(tmpdir()), directory = await mkdtemp(path.join(temporaryRoot, 'gmi-h2-selection-'));
    const file = path.join(directory, 'Synthetic H2.gmi'), bytes = fixture();
    const other = path.join(directory, 'Synthetic other.gmi'), readOnly = path.join(directory, 'Synthetic read-only.gmi'), unreadable = path.join(directory, 'Synthetic unreadable.gmi');
    await writeFile(file, bytes); await writeFile(other, bytes); await writeFile(readOnly, fixture(true)); await writeFile(unreadable, bytes);
    const browser = await openTestChrome();
    const click = (label, root = 'document') => browser.evaluate(`(() => { const e = Array.from((${root}).querySelectorAll('button')).find(e => e.innerText.trim() === ${JSON.stringify(label)} || e.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!e || e.disabled) throw new Error('Unavailable: ' + ${JSON.stringify(label)}); e.click(); })()`);
    const input = (expression, value) => browser.evaluate(`(() => { const e = ${expression}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const choose = (expression, value) => browser.evaluate(`(() => { const e = ${expression}; if (e.value === ${JSON.stringify(value)}) return; e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    const geometry = async (label) => {
      await browser.evaluate(`Array.from(document.querySelector('[role=tablist][aria-label=Geometri]').querySelectorAll('button')).find(e => e.innerText.startsWith(${JSON.stringify(label)})).click()`);
    };
    const field = async (label = 'SDR') => {
      const button = `document.querySelector('button[aria-label^="${label}:"]')`;
      await browser.waitFor(button);
      if (await browser.evaluate(`${button}.getAttribute('aria-expanded') !== 'true'`)) await browser.evaluate(`${button}.click()`);
      await click(`Vis detaljer: ${label}`);
      await browser.waitFor(`document.querySelector('button[aria-label="Lukk feltinspektør"], button[aria-label="Lukk feltinformasjon"]')`);
    };
    const diagnostic = async (tone = 'error') => {
      const target = `Array.from(document.querySelectorAll('button[aria-label*="objekter i tabell:"]')).find(e => e.closest('section[data-validation-tone]')?.dataset.validationTone === ${JSON.stringify(tone)})`;
      await browser.waitFor(target); await browser.evaluate(`${target}.click()`); await browser.waitFor(table);
    };
    const selectFirst = async () => { await geometry('Ledninger'); await field(); await diagnostic(); await browser.waitFor(box(0)); await browser.evaluate(`${box(0)}.click()`); await browser.waitFor(`${bar}?.innerText.includes('1 valgt')`); };
    const checked = () => browser.evaluate(`Array.from(${grid}.querySelectorAll('[data-table-row][aria-selected=true]')).map(e => Number(e.dataset.tableRow)).sort((a,b) => a-b)`);
    const noSelection = async () => { assert.equal(await browser.evaluate(`Boolean(${bar})`), false); await browser.waitFor(`${halos}.length === 0`); };
    const shot = async (name) => {
      if (!process.env.GMI_EDIT_SCREENSHOT_DIR) return;
      await mkdir(process.env.GMI_EDIT_SCREENSHOT_DIR, { recursive: true });
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.GMI_EDIT_SCREENSHOT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
    };
    const addFile = async (filename) => {
      await browser.waitFor(`Array.from(document.querySelectorAll('button')).some(e => e.innerText.trim() === 'Legg til fil' && !e.disabled)`);
      await click('Legg til fil'); await browser.waitFor('document.querySelector("input[type=file]")');
      await setPhotoFiles(browser, 'input[type=file]', [filename]);
      await browser.waitFor(`document.querySelector('[title="${path.basename(filename)}"]')`);
    };
    try {
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm = () => true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")'); await click('Lukk');
      await setPhotoFiles(browser, 'input[type=file]', [file]);
      await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await browser.evaluate(`document.querySelector('[title="Synthetic H2.gmi"]').click()`);
      await browser.waitFor('document.querySelector("button[title=Feltvalidering]")');
      await browser.evaluate(`document.querySelector('button[title=Feltvalidering]').click()`);
      await browser.waitFor('document.querySelector("#validation-v2-layer")'); await geometry('Ledninger');
      const resultSummary = await browser.evaluate('document.querySelector("#validation-v2-geometry-panel").innerText.split(String.fromCharCode(10))[0]');

      await t.test('first inspection opens an editable session without entering Rettinger or selecting/staging', async () => {
        await field(); await diagnostic(); await browser.waitFor(header);
        assert.equal(await browser.evaluate('Boolean(document.querySelector(".gmi-edit-workspace"))'), false);
        assert.deepEqual(await checked(), []); await noSelection();
        assert.equal(await browser.evaluate(`${grid}.querySelectorAll('[data-table-row] input[type=checkbox]').length`), 2);
        assert.equal(await browser.evaluate('Boolean(document.querySelector(".gmi-edit-table-modes"))'), false);
        await browser.evaluate(`${grid}.querySelector('[data-table-row="0"]').click()`);
        assert.deepEqual(await checked(), [], 'row inspection does not select'); await noSelection();
      });

      await t.test('same-field FEIL/SJEKK, Utvalg/Alle, search and sort preserve source selection and halos', async () => {
        await browser.evaluate(`${box(0)}.click()`); await browser.waitFor(`${halos}.length === 1`);
        await diagnostic('warning'); await browser.waitFor(box(1));
        assert.match(await browser.evaluate(`${bar}.innerText`), /1 valgt · 0 synlige · 1 skjult/);
        assert.deepEqual(await checked(), []); assert.equal(await browser.evaluate(`${halos}.length`), 1);
        await browser.evaluate(`${box(1)}.click()`);
        await browser.evaluate(`Array.from(${table}.querySelectorAll('[aria-label="Vis objektutvalg"] button')).find(e => e.innerText.startsWith('Alle')).click()`);
        await browser.waitFor(`${grid}.querySelectorAll('[data-table-row]').length === 5`);
        assert.deepEqual(await checked(), [0, 1]);
        await input(`${table}.querySelector('[aria-label="Søk i data"]')`, 'Alpha');
        await browser.waitFor(`${grid}.querySelectorAll('[data-table-row]').length === 1`);
        assert.match(await browser.evaluate(`${bar}.innerText`), /2 valgt · 1 synlige · 1 skjult/);
        await browser.evaluate(`${header}.click()`);
        assert.match(await browser.evaluate(`${bar}.innerText`), /1 valgt · 0 synlige/);
        await click('Velg alle 1 synlige', bar);
        await input(`${table}.querySelector('[aria-label="Søk i data"]')`, '');
        await browser.waitFor(`${grid}.querySelectorAll('[data-table-row]').length === 5`);
        await browser.evaluate(`Array.from(${grid}.querySelectorAll('[role=columnheader] button')).find(e => e.innerText.trim() === 'Merknad').click()`);
        assert.deepEqual(await checked(), [0, 1]);
        await click('Velg alle 5 synlige', bar); await browser.waitFor(`${halos}.length === 5`);
        assert.deepEqual(await checked(), [0, 1, 2, 3, 4]);
        assert.equal(await browser.evaluate(`${bar}.querySelector('[aria-label="Rader i tabellen"]') !== null`), false);
        assert.doesNotMatch(await browser.evaluate(`${bar}.innerText`), /Rediger valgte|Bare valgte/);
        assert.match(await browser.evaluate(`${bar}.innerText`), /Åpne i Rettinger \(5\)/);
        assert.equal(await browser.evaluate('document.querySelector("#validation-v2-geometry-panel").innerText.split(String.fromCharCode(10))[0]'), resultSummary);
      });

      await t.test('checkbox bar and pinned columns fit both laptop layouts; clear and keyboard ranges reuse the grid', async () => {
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          await browser.waitFor(`!document.querySelector('[role=dialog][aria-modal=true]')`);
          await field(); await diagnostic('warning');
          await browser.waitFor(`!document.querySelector('[role=dialog][aria-modal=true]')`);
          assert.match(await browser.evaluate(`${bar}.innerText`), /5 valgt/, 'same field can reopen at modal widths without clearing');
          await browser.evaluate(`Array.from(${table}.querySelectorAll('[aria-label="Vis objektutvalg"] button')).find(e => e.innerText.startsWith('Alle')).click()`);
          assert.equal(await browser.evaluate(`document.activeElement === ${grid}`), true, 'inspection gives keyboard focus to its grid');
          for (let count = 0; count < 2; count++) {
            // Clearing removes the bar, so find the checkbox again after that layout change.
            const hit = await browser.evaluate(`(() => { const e=${header}, r=e.getBoundingClientRect(), x=r.left+r.width/2, y=r.top+r.height/2; return { x,y, reachable: document.elementFromPoint(x,y) === e }; })()`);
            assert(hit.reachable, 'the checkbox is not covered by the field modal');
            await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: hit.x, y: hit.y, button: 'left', clickCount: 1 });
            await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hit.x, y: hit.y, button: 'left', clickCount: 1 });
            await browser.waitFor(`${header}.checked === ${count === 1}`);
          }
          assert.equal((await checked()).length, 5, 'real pointer selection works at this width');
          const bounds = await browser.evaluate(`({ page: document.documentElement.scrollWidth, bar: ${bar}.getBoundingClientRect().toJSON(), grid: ${grid}.getBoundingClientRect().toJSON() })`);
          assert(bounds.page <= width); assert(bounds.bar.left >= 0 && bounds.bar.right <= width && bounds.bar.bottom <= height);
          assert(bounds.grid.height > 60); await shot(`h2-selected-${width}x${height}`);
        }
        await click('Fjern utvalg', bar); await noSelection();
        await browser.evaluate(`${grid}.focus()`);
        for (const [key, code, modifiers] of [['Home', 36, 0], [' ', 32, 0], ['ArrowDown', 40, 0], [' ', 32, 8]]) {
          await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key, windowsVirtualKeyCode: code, modifiers });
          await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: code, modifiers });
        }
        assert.equal((await checked()).length, 2); await browser.waitFor(`${halos}.length === 2`);
        await click('Fjern utvalg', bar); await noSelection();
      });

      await t.test('field, geometry, table and Validator closure drop selection; point inspections select point halos', async () => {
        await selectFirst();
        await field('Material'); await browser.waitFor(`!${table}`); await noSelection();
        await selectFirst(); await geometry('Punkter'); await browser.waitFor(`!${table}`); await noSelection();
        await field('Innvendig/utvendig'); await diagnostic(); await browser.waitFor(header);
        await browser.evaluate(`${box(0)}.click()`); await browser.waitFor(`${halos}.length === 1`);
        assert.equal(await browser.evaluate(`${table}.dataset.tableGeometry`), 'punkter');
        await click('Lukk feltinspektør'); await browser.waitFor(`!${table}`); await noSelection();
        await geometry('Ledninger'); await selectFirst(); await click('Lukk datatabell'); await browser.waitFor(`!${table}`); await noSelection();
        await diagnostic(); await browser.waitFor(header); assert.deepEqual(await checked(), []);
        await browser.evaluate(`${box(0)}.click()`); await click('Lukk Validator'); await browser.waitFor(`!${table}`); await noSelection();
        await browser.evaluate(`document.querySelector('button[title=Feltvalidering]').click()`); await geometry('Ledninger');
      });

      await t.test('Original/Foreslått changes clear the host and proposed inspection remains source-bound', async () => {
        await selectFirst();
        await choose(`document.querySelector('[aria-label="Datasett i Validator"]')`, 'proposed');
        await browser.waitFor(`!${table}`); await noSelection();
        await geometry('Ledninger');
        await field(); await diagnostic(); await browser.waitFor(header); assert.deepEqual(await checked(), []);
        await browser.evaluate(`${box(0)}.click()`); await browser.waitFor(`${halos}.length === 1`);
        assert.deepEqual(await checked(), [0]);
        await choose(`document.querySelector('[aria-label="Datasett i Validator"]')`, 'original');
        await browser.waitFor(`!${table}`); await noSelection();
      });

      await t.test('layer changes clear selection; read-only and unreadable sources have explanations and no checkboxes', async () => {
        await selectFirst(); await click('Lukk Validator');
        await addFile(other); await addFile(readOnly); await addFile(unreadable);
        await browser.waitFor('document.querySelectorAll("[data-gmi-edit-action]").length === 4');
        await browser.evaluate(`document.querySelector('[title="Synthetic H2.gmi"]').click()`);
        await browser.waitFor('document.querySelector("button[title=Feltvalidering]")');
        await browser.evaluate(`document.querySelector('button[title=Feltvalidering]').click()`); await geometry('Ledninger');
        const layers = await browser.evaluate('Array.from(document.querySelector("#validation-v2-layer").options).map(e => [e.textContent,e.value])');
        const idOf = (name) => layers.find(([label]) => label === name)[1];
        await choose('document.querySelector("#validation-v2-layer")', idOf('Synthetic H2.gmi')); await geometry('Ledninger'); await selectFirst();
        await choose('document.querySelector("#validation-v2-layer")', idOf('Synthetic other.gmi'));
        await browser.waitFor(`!${table}`); await noSelection();
        await geometry('Ledninger'); await selectFirst();
        await choose('document.querySelector("#validation-v2-layer")', idOf('Synthetic read-only.gmi'));
        await geometry('Ledninger'); await field(); await diagnostic();
        await browser.waitFor('document.querySelector("[data-gmi-selection-unavailable]")?.innerText.includes("men ikke rettes")');
        assert.equal(await browser.evaluate(`${grid}.querySelectorAll('input[type=checkbox]').length`), 0); await noSelection();
        await shot('h2-read-only-1366x768');
        await choose('document.querySelector("#validation-v2-layer")', idOf('Synthetic unreadable.gmi'));
        await browser.evaluate(`window.h2ArrayBuffer = File.prototype.arrayBuffer; File.prototype.arrayBuffer = () => Promise.reject(new Error('Synthetic unreadable source'));`);
        await geometry('Ledninger'); await field(); await diagnostic();
        await browser.waitFor('document.querySelector("[data-gmi-selection-unavailable]")?.innerText.includes("kunne ikke leses")');
        assert.equal(await browser.evaluate(`${grid}.querySelectorAll('input[type=checkbox]').length`), 0); await noSelection();
        await browser.evaluate('File.prototype.arrayBuffer = window.h2ArrayBuffer');
        await click('Lukk Validator');
        const originalId = idOf('Synthetic H2.gmi');
        await browser.evaluate(`Array.from(document.querySelectorAll('[data-gmi-edit-action]')).find(e => e.dataset.gmiEditAction === ${JSON.stringify(originalId)}).click()`);
        await browser.waitFor('document.querySelector("[data-gmi-edit-status]")?.innerText === "Redigerbar"');
        assert.equal(await browser.evaluate('document.querySelector("[data-gmi-edit-counts]") !== null'), false, 'selection did not stage corrections');
      });
      assert.deepEqual(new Uint8Array(await readFile(file)), bytes);
      assert.equal(browser.events.filter((event) => event.method === 'Runtime.exceptionThrown').length, 0);
    } catch (error) { await shot('h2-failure'); throw error; }
    finally {
      await browser.close();
      if (path.dirname(path.resolve(directory)) !== temporaryRoot || !path.basename(directory).startsWith('gmi-h2-selection-')) throw new Error('Unsafe temporary fixture directory');
      await rm(directory, { recursive: true, force: true });
    }
  });
