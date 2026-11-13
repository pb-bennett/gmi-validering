import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
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
const box = index => `document.querySelector('[role=grid] [data-table-row="${index}"] input[type=checkbox]')`;
const dialog = 'document.querySelector(".delivery-wizard[open]")';

test('G8 production: linked Tema review, ambiguity, explicit/stale consent, point/line history and verified export',
  { skip: !app || !chromePath, timeout: 240000 }, async t => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gmi-g8-ui-'));
    const file = path.join(directory, 'Synthetic G8.gmi');
    const bytes = gmiFieldBatchFixture({ pointFields: ['Tema', 'S_FCODE', 'Kumform'], points: [['LOK', 'ANB', ''], ['LOK', 'LOK', '']],
      lineFields: ['Tema', 'S_FCODE', 'Material', 'SDR', 'Trykklasse', 'Ringstivhet'], lines: [['VL', 'OV', 'PE', '11', '', '']] });
    await writeFile(file, bytes);
    const browser = await openTestChrome();
    const click = (label, root = inspector) => clickSourceControl(browser, label, root);
    const change = (selector, value) => browser.evaluate(`(() => {const e=${selector}; Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
    const field = `${inspector}.querySelector('[aria-label="Felt for masseendring"]')`;
    const value = `${inspector}.querySelector('[aria-label="Ny verdi"]')`;
    const mode = name => browser.evaluate(`Array.from(${inspector}.querySelectorAll('.gmi-batch-modes label')).find(e=>e.innerText.trim()===${JSON.stringify(name)}).querySelector('input').click()`);
    const ready = () => browser.waitFor(`${inspector}.getAttribute('aria-busy')==='false' && ${inspector}.querySelector('[data-gmi-batch-dry-run]')?.innerText.includes('OK')`);
    const preview = async () => { await click('Forhåndsvis endringer'); await ready(); };
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
      await change(field, 'Tema');
    };
    const screenshot = async name => {
      if (!process.env.GMI_EDIT_SCREENSHOT_DIR) return;
      await mkdir(process.env.GMI_EDIT_SCREENSHOT_DIR, { recursive: true });
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.GMI_EDIT_SCREENSHOT_DIR, name), Buffer.from(data, 'base64'));
    };
    try {
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm=()=>true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")'); await click('Lukk', 'document');
      await setPhotoFiles(browser, 'input[type=file]', [file]);
      await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await browser.evaluate('document.querySelector("[data-gmi-edit-action]").click()');

      await t.test('exact replacement excludes disagreeing pairs and proposal changes invalidate approval', async () => {
        await select('Punkter', [0, 1]); await mode('Erstatt verdi'); await change(value, 'KUM');
        const matches = `${inspector}.querySelector('[aria-label="Eksisterende verdi som skal erstattes"]')`;
        assert.match(await browser.evaluate(`${inspector}.innerText`), /1 objekter har ulike Tema-verdier/);
        await change(matches, '0'); await preview();
        assert.equal(await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-changed]').dataset.gmiBatchChanged`), '1');
        assert.match(await browser.evaluate(`document.querySelector('[role=grid] [data-table-row="0"]').innerText`), /Sett verdi/);
        await click('Legg til masseendring'); await browser.waitFor(risk);
        await click('Tilbake til utvalget', risk); await click('Endre oppsett'); await mode('Sett verdi');
        assert.equal(await count(), 0);
        assert.equal(await browser.evaluate(`Boolean(${inspector}.querySelector('[data-gmi-batch-changed]'))`), false);
      });

      await t.test('one logical field, strict domain, original/effective pairs, FOTO warning and new-FEIL review at both sizes', async () => {
        await select('Punkter', [0, 1]);
        const options = await browser.evaluate(`Array.from(${field}.options).map(e=>({value:e.value,text:e.textContent}))`);
        assert.equal(options.filter(option => ['Tema', 'S_FCODE'].includes(option.value)).length, 1);
        assert(options.some(option => option.text.includes('Tema + S_FCODE')));
        await mode('Sett verdi'); await change(value, 'VL');
        assert(await browser.evaluate(`Array.from(${inspector}.querySelectorAll('button')).find(e=>e.innerText==='Forhåndsvis endringer').disabled`));
        await change(value, 'KUM');
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          await browser.evaluate(`${field}.scrollIntoView({block:'center'});${value}.focus()`);
          await screenshot(`g8-editor-${width}x${height}.png`);
        }
        await preview();
        assert.equal(await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-changed]').dataset.gmiBatchChanged`), '2');
        await browser.evaluate(`${inspector}.querySelector('[data-gmi-linked-values]').open=true`);
        const details = await browser.evaluate(`${inspector}.querySelector('[data-gmi-linked-values]').innerText`);
        assert.match(details, /Tema: Original/); assert.match(details, /S_FCODE: Original/);
        assert.match(details, /Ulike verdier/); assert.match(details, /Foreslått nå/);
        assert.match(await browser.evaluate(`${inspector}.querySelector('[data-gmi-linked-tema]').innerText`), /FOTO bruker Tema fra originalfilen\. Endringen påvirker ikke automatisk bildegrupperingen\./);
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          await browser.evaluate(`${inspector}.querySelector('[data-gmi-linked-values]').scrollIntoView({block:'start'})`);
          assert(await browser.evaluate(`document.documentElement.scrollWidth<=${width} && ${inspector}.scrollWidth<=${inspector}.clientWidth`));
          await screenshot(`g8-linked-${width}x${height}.png`);
        }
        await click('Legg til masseendring'); await browser.waitFor(risk);
        assert.equal(await count(), 0);
        assert.match(await browser.evaluate(`${risk}.innerText`), /Tema og S_FCODE oppdateres samlet/);
        assert.match(await browser.evaluate(`${risk}.innerText`), /FEIL/);
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          const bounds = await browser.evaluate(`(()=>{const e=${risk},r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,overflow:e.scrollWidth>e.clientWidth}})()`);
          assert(bounds.top >= 0 && bounds.bottom <= height && !bounds.overflow);
          await screenshot(`g8-confirm-${width}x${height}.png`);
        }
        // Publish a changed selection through the real table while consent is open.
        await browser.evaluate(`${box(1)}.click()`); await click('Godkjenn og legg til', risk);
        await browser.waitFor(`!${risk}`); assert.equal(await count(), 0);
        await ready(); await click('Legg til masseendring'); await browser.waitFor(risk);
        await click('Godkjenn og legg til', risk); await browser.waitFor(`${inspector}.dataset.batchStep==='3'`);
        assert.equal(await count(), 1);
      });

      await t.test('linked undo/redo and GMI download preserve all unapproved bytes', async () => {
        await click('Angre siste retting', workspace); await browser.waitFor(`${workspace}.querySelectorAll('[data-change-set]').length===0`);
        await click('Gjør om retting', workspace); await browser.waitFor(`${workspace}.querySelectorAll('[data-change-set]').length===1`);
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
        assert(output);
        assert.deepEqual(verifyCellChanges(loadGmiDocument(bytes), output, ['Tema', 'S_FCODE'].map(field => ({ scope: 'point', sourceIndex: 0, field, lexeme: 'KUM' }))).failures, []);
        await click('Lukk', dialog);
      });

      await t.test('line domain and downstream hydraulic consequences use the same linked confirmation', async () => {
        await select('Ledninger', [0]); await mode('Sett verdi'); await change(value, 'SP'); await preview();
        await click('Legg til masseendring'); await browser.waitFor(risk);
        assert.match(await browser.evaluate(`${risk}.innerText`), /Tema og S_FCODE oppdateres samlet/);
        await click('Godkjenn og legg til', risk); await browser.waitFor(`${inspector}.dataset.batchStep==='3'`);
        assert.equal(await count(), 2);
      });
      assert.deepEqual(new Uint8Array(await readFile(file)), new Uint8Array(bytes));
      assert.equal(browser.events.filter(event => event.method === 'Runtime.exceptionThrown').length, 0);
    } finally {
      await browser.close();
      if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('gmi-g8-ui-')) throw new Error('Unsafe fixture path');
      await rm(directory, { recursive: true, force: true });
    }
  });
