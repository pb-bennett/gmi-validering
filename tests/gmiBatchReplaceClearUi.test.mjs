import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles, clickSourceControl } from './helpers/photoSourceWorkflow.mjs';
import { gmiFieldBatchFixture } from './helpers/gmiFieldBatchFixture.mjs';
import { loadGmiDocument, verifyCellChanges } from './helpers/gmiEditHarness.mjs';

const app = process.env.PHOTO_UI_URL;
const inspector = 'document.querySelector("[data-gmi-batch-inspector]")';
const workspace = 'document.querySelector(".gmi-edit-workspace")';
const bar = 'document.querySelector("[data-gmi-selection-bar]")';
const risk = 'document.querySelector("dialog[open][data-gmi-confirm=batch-risk]")';
const guard = 'document.querySelector("dialog[open][data-gmi-confirm=workspace]")';
const grid = 'document.querySelector("[role=grid]")';
const box = (index) => `${grid}.querySelector('[data-table-row="${index}"] input[type=checkbox]')`;
const dialog = 'document.querySelector(".delivery-wizard[open]")';

test('G6 production: exact replacement, clearing, required-field consent, selection invalidation, history and verified export',
  { skip: !app || !chromePath, timeout: 240000 }, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gmi-g6-ui-'));
    const file = path.join(directory, 'Synthetic G6.gmi');
    const notes = ['x', ' x', 'x ', 'X', 'x', '', ' '];
    const bytes = gmiFieldBatchFixture({ pointFields: ['Tema', 'Merknad', 'InnvendigUtvendig', 'Bredde'],
      points: notes.map((note, index) => ['LOK', note, index < 5 ? 'OD' : index === 5 ? '' : ' ', '100']),
      lineFields: ['Tema', 'Merknad', 'Material'], lines: [['VL', 'old', 'PE'], ['VL', ' old', 'PVC'], ['VL', 'old', '']] });
    await writeFile(file, bytes);
    const browser = await openTestChrome();
    const click = (label, root = inspector) => clickSourceControl(browser, label, root);
    const change = (selector, value) => browser.evaluate(`(() => { const e=${selector}, select=e.tagName==='SELECT';
      Object.getOwnPropertyDescriptor(select?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});
      e.dispatchEvent(new Event(select?'change':'input',{bubbles:true})); })()`);
    const field = `${inspector}.querySelector('[aria-label="Felt for masseendring"]')`;
    const match = `${inspector}.querySelector('[aria-label="Eksisterende verdi som skal erstattes"]')`;
    const value = `${inspector}.querySelector('[aria-label="Ny verdi"]')`;
    const mode = (name) => browser.evaluate(`Array.from(${inspector}.querySelectorAll('.gmi-batch-modes label')).find(e=>e.innerText.trim()===${JSON.stringify(name)}).querySelector('input').click()`);
    const ready = () => browser.waitFor(`${inspector}.getAttribute('aria-busy')==='false' && ${inspector}.querySelector('[data-gmi-batch-dry-run]')?.innerText.includes('OK')`);
    const preview = async () => { await click('Forhåndsvis endringer'); await ready(); };
    const stage = async () => { await click('Legg til masseendring'); await browser.waitFor(risk); await click('Godkjenn og legg til', risk); await browser.waitFor(`${inspector}.dataset.batchStep==='3'`); };
    const count = () => browser.evaluate(`${workspace}.querySelectorAll('[data-change-set]').length`);
    const select = async (scope, indices) => {
      if (await browser.evaluate(`Boolean(${inspector})`)) {
        await click('Avslutt');
        if (await browser.evaluate(`Boolean(${guard})`)) await click('Forkast skjemaet', guard);
      }
      if (await browser.evaluate(`Boolean(${bar})`)) await click('Fjern utvalg', bar);
      await click(scope, 'document.querySelector("[data-table-geometry]")');
      await browser.waitFor(box(indices[0]));
      for (const index of indices) await browser.evaluate(`${box(index)}.click()`);
      await click(`Rediger valgte (${indices.length})`, bar); await browser.waitFor(inspector);
    };
    try {
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm=()=>true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")'); await click('Lukk', 'document');
      await setPhotoFiles(browser, 'input[type=file]', [file]);
      await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await browser.evaluate('document.querySelector("[data-gmi-edit-action]").click()');

      await t.test('distinct values/counts, visible whitespace and exact-only replacement at laptop sizes', async () => {
        await select('Punkter', [0, 1, 2, 3, 4, 5, 6]);
        await change(field, 'Merknad'); await mode('Erstatt verdi'); await change(value, 'new');
        const options = await browser.evaluate(`Array.from(${match}.options).map(o=>o.textContent.trim())`);
        assert(options.some(text => text.startsWith('"x"') && text.includes('2 punkter')));
        assert(options.some(text => text.startsWith('"·x"') && text.includes('1 punkt')));
        assert(options.some(text => text.startsWith('"x·"')));
        assert(options.some(text => text.startsWith('"X"')));
        assert(options.some(text => text.startsWith('(tom streng)')));
        assert(await browser.evaluate(`Array.from(${inspector}.querySelectorAll('button')).find(b=>b.innerText==='Forhåndsvis endringer').disabled`));
        await browser.evaluate(`${match}.focus()`);
        await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
        await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
        assert.equal(await browser.evaluate(`${match}.value`), '0', 'native keyboard selection chooses the exact offered lexeme');
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          assert(await browser.evaluate(`document.documentElement.scrollWidth<=${width}`));
          if (process.env.GMI_EDIT_SCREENSHOT_DIR) {
            await mkdir(process.env.GMI_EDIT_SCREENSHOT_DIR, { recursive: true });
            await browser.evaluate(`${match}.scrollIntoView({block:'center'});${match}.focus()`);
            const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
            await writeFile(path.join(process.env.GMI_EDIT_SCREENSHOT_DIR, `g6-replace-${width}x${height}.png`), Buffer.from(data, 'base64'));
          }
        }
        await preview();
        assert.equal(await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-changed]').dataset.gmiBatchChanged`), '2');
        await stage();
        assert.match(await browser.evaluate(`${inspector}.querySelector('.gmi-change-detail-title').innerText`), /^Erstatt /);
      });

      await t.test('required-field clearing reports already-empty values and refuses approval after a selection change', async () => {
        await click('Ny masseendring for utvalget'); await change(field, 'InnvendigUtvendig'); await mode('Tøm verdi');
        assert.equal(await browser.evaluate(`Boolean(${value})`), false);
        await preview();
        assert.match(await browser.evaluate(`${inspector}.innerText`), /Allerede tomme: 2/);
        assert.equal(await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-changed]').dataset.gmiBatchChanged`), '5');
        await click('Legg til masseendring'); await browser.waitFor(risk);
        assert.match(await browser.evaluate(`${risk}.innerText`), /5 nye FEIL/);
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          const bounds = await browser.evaluate(`(() => {const e=${risk},r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,overflow:e.scrollWidth>e.clientWidth};})()`);
          assert(bounds.top >= 0 && bounds.bottom <= height && !bounds.overflow);
          if (process.env.GMI_EDIT_SCREENSHOT_DIR) {
            const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
            await writeFile(path.join(process.env.GMI_EDIT_SCREENSHOT_DIR, `g6-clear-risk-${width}x${height}.png`), Buffer.from(data, 'base64'));
          }
        }
        assert.equal(await count(), 1);
        // Simulate a selection publication while the risk review is open, using the table's own checkbox path.
        await browser.evaluate(`${box(0)}.click()`);
        await click('Godkjenn og legg til', risk);
        await browser.waitFor(`!${risk}`);
        assert.equal(await count(), 1, 'stale risk review cannot stage');
        await ready(); await stage();
        assert.equal(await count(), 2);
        assert.match(await browser.evaluate(`${inspector}.querySelector('.gmi-change-detail-title').innerText`), /^Tøm /);
      });

      await t.test('undo/redo preserves operation history and a GMI-only download changes only explicit cells', async () => {
        await click('Angre siste retting', workspace); await browser.waitFor(`${workspace}.querySelectorAll('[data-change-set]').length===1`);
        await click('Gjør om retting', workspace); await browser.waitFor(`${workspace}.querySelectorAll('[data-change-set]').length===2`);
        await browser.evaluate(`${workspace}.querySelector('.gmi-edit-download').click()`); await browser.waitFor(dialog);
        await click('Kontroller leveransen', dialog); await browser.waitFor(`${dialog}.dataset.exportPhase==='ready'`);
        await click('Til pakke', dialog);
        const downloads = await mkdtemp(path.join(directory, 'download-'));
        await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
        await click('Last ned GMI', dialog); await browser.waitFor(`${dialog}.dataset.exportPhase==='done'`);
        const name = await browser.evaluate(`${dialog}.querySelector('[data-downloaded-filename]').innerText`);
        let output;
        for (let attempt = 0; attempt < 100; attempt++) {
          try { output = new Uint8Array(await readFile(path.join(downloads, name))); break; } catch { await new Promise(resolve => setTimeout(resolve, 50)); }
        }
        assert(output, 'actual downloaded file');
        const edits = [0, 4].map(sourceIndex => ({ scope: 'point', sourceIndex, field: 'Merknad', lexeme: 'new' }))
          .concat([1, 2, 3, 4].map(sourceIndex => ({ scope: 'point', sourceIndex, field: 'InnvendigUtvendig', lexeme: '' })));
        assert.deepEqual(verifyCellChanges(loadGmiDocument(bytes), output, edits).failures, []);
        await click('Lukk', dialog);
      });

      await t.test('line exact replacement and required Material clearing use the same inspector and risk gate', async () => {
        await select('Ledninger', [0, 1, 2]); await change(field, 'Merknad'); await mode('Erstatt verdi');
        await change(match, '1'); await change(value, 'line new'); await preview();
        assert.equal(await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-changed]').dataset.gmiBatchChanged`), '1');
        await stage();
        await click('Ny masseendring for utvalget'); await change(field, 'Material'); await mode('Tøm verdi'); await preview();
        assert.equal(await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-changed]').dataset.gmiBatchChanged`), '2');
        await click('Legg til masseendring'); await browser.waitFor(risk);
        assert(await browser.evaluate(`${risk}.querySelector('[data-validation-tone=error] li') !== null`));
        await click('Godkjenn og legg til', risk); await browser.waitFor(`${inspector}.dataset.batchStep==='3'`);
      });
      assert.deepEqual(new Uint8Array(await readFile(file)), new Uint8Array(bytes));
      assert.equal(browser.events.filter(event => event.method === 'Runtime.exceptionThrown').length, 0);
    } finally {
      await browser.close();
      if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('gmi-g6-ui-')) throw new Error('Unsafe fixture path');
      await rm(directory, { recursive: true, force: true });
    }
  });
