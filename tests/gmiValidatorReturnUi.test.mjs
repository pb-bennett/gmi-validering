// H4 production browser: Rettinger → Validator return navigation.
// Synthetic fixture only; the input file bytes must remain unchanged.
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { gmiFieldBatchFixture } from './helpers/gmiFieldBatchFixture.mjs';

const app = process.env.PHOTO_UI_URL;
const table = 'document.querySelector("[data-table-geometry]")', grid = 'document.querySelector("[role=grid]")';
const bar = 'document.querySelector("[data-gmi-selection-bar]")', batch = 'document.querySelector("[data-gmi-batch-inspector]")';
const workspace = 'document.querySelector(".gmi-edit-workspace")';
const datasetMenu = `document.querySelector('[aria-label="Datasett i Validator"]')`;
// Docked inspector at laptop widths, modal otherwise; both show «<datasett> · <felt>».
const fieldTitle = 'document.querySelector("#validation-v2-field-inspector-title, #validation-v2-field-info-title")';
const returnLink = `${bar}?.querySelector('[data-gmi-validator-return]')`;
const guardDialog = `document.querySelector('dialog[open][data-gmi-confirm=workspace]')`;
const box = (index) => `${grid}.querySelector('[data-table-row="${index}"] input[type=checkbox]')`;
const sdrRow = `document.querySelector('button[aria-label^="SDR:"]')`;

test('H4 production: return to the originating Validator rule, guard cancellation, staged check on Foreslått and dataset defaults',
  { skip: !app || !chromePath, timeout: 240000 }, async (t) => {
    const temporaryRoot = path.resolve(tmpdir()), directory = await mkdtemp(path.join(temporaryRoot, 'gmi-h4-return-'));
    const file = path.join(directory, 'Synthetic H4.gmi');
    const bytes = gmiFieldBatchFixture({ pointFields: ['Tema', 'Type', 'InnvendigUtvendig', 'Bredde', 'Stedfestingsårsak', 'Merknad'],
      points: Array.from({ length: 6 }, (_, i) => ['KUM', 'KBRE', i % 2 ? '' : 'ID', '1000', 'NYTT', `Synthetic ${i}`]),
      lineFields: ['Tema', 'Material', 'SDR', 'Stedfestingsårsak', 'Merknad'],
      lines: Array.from({ length: 5 }, (_, i) => ['VL', 'PE', '', 'NYTT', `Synthetic line ${i}`]) });
    await writeFile(file, bytes);
    const browser = await openTestChrome();
    const click = (label, root = 'document') => browser.evaluate(`(() => { const e=Array.from((${root}).querySelectorAll('button')).find(e=>e.innerText.trim()===${JSON.stringify(label)} || e.getAttribute('aria-label')===${JSON.stringify(label)}); if(!e || e.disabled) throw new Error('Unavailable: '+${JSON.stringify(label)}); e.click(); })()`);
    const change = (element, text) => browser.evaluate(`(() => {
      const e=${element}, select=e.tagName === 'SELECT';
      Object.getOwnPropertyDescriptor(select ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(text)});
      e.dispatchEvent(new Event(select ? 'change' : 'input', { bubbles: true }));
    })()`);
    const shot = async (name) => {
      if (!process.env.GMI_EDIT_SCREENSHOT_DIR) return;
      await mkdir(process.env.GMI_EDIT_SCREENSHOT_DIR, { recursive: true });
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.GMI_EDIT_SCREENSHOT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
    };
    const selected = () => browser.evaluate(`Array.from(${grid}.querySelectorAll('[data-table-row][aria-selected=true]')).map(e=>Number(e.dataset.tableRow)).sort((a,b)=>a-b)`);
    const sdrFailCount = async () => {
      await browser.waitFor(sdrRow);
      const label = await browser.evaluate(`${sdrRow}.getAttribute('aria-label')`);
      return Number(/(\d+) FEIL/.exec(label)[1]);
    };
    const pointer = async (expression) => {
      const hit = await browser.evaluate(`(() => {const e=${expression}, r=e.getBoundingClientRect(), x=r.left+r.width/2,y=r.top+r.height/2;return {x,y,reachable:e.contains(document.elementFromPoint(x,y))};})()`);
      assert(hit.reachable, 'control is pointer reachable');
      await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: hit.x, y: hit.y, button: 'left', clickCount: 1 });
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hit.x, y: hit.y, button: 'left', clickCount: 1 });
    };
    // Validator from the main sidebar; the dataset menu is never touched here (no explicit choice).
    const openSdrInspection = async () => {
      if (await browser.evaluate(`!${datasetMenu}`)) {
        await browser.waitFor('document.querySelector("button[title=Feltvalidering]")');
        await browser.evaluate('document.querySelector("button[title=Feltvalidering]").click()');
        await browser.waitFor(datasetMenu);
      }
      await browser.evaluate(`Array.from(document.querySelector('[role=tablist][aria-label=Geometri]').querySelectorAll('button')).find(e=>e.innerText.startsWith('Ledninger')).click()`);
      await browser.waitFor(sdrRow);
      if (await browser.evaluate(`${sdrRow}.getAttribute('aria-expanded') !== 'true'`)) await browser.evaluate(`${sdrRow}.click()`);
      await click('Vis detaljer: SDR');
      const diagnostic = `Array.from(document.querySelectorAll('button[aria-label*="objekter i tabell:"]')).find(e=>e.closest('[data-validation-tone]')?.dataset.validationTone==='error')`;
      await browser.waitFor(diagnostic); await browser.evaluate(`${diagnostic}.click()`);
      await browser.waitFor(`${table}?.dataset.tableGeometry === 'ledninger' && ${grid}?.querySelector('input[type=checkbox]')`);
    };
    const handoff = async (indices = [1, 3]) => {
      await openSdrInspection();
      for (const index of indices) { await browser.waitFor(box(index)); await browser.evaluate(`${box(index)}.click()`); }
      await browser.waitFor(`${bar}?.innerText.includes('Åpne i Rettinger (2)')`);
      await pointer(`Array.from(${bar}.querySelectorAll('button')).find(e=>e.innerText.trim()==='Åpne i Rettinger (2)')`);
      await browser.waitFor(`${batch}?.dataset.batchStep === '1'`);
      assert.deepEqual(await selected(), indices);
    };
    const expectValidator = async (dataset) => {
      const label = dataset === 'proposed' ? 'Foreslått' : 'Original';
      try { await browser.waitFor(`${datasetMenu}?.value === '${dataset}' && ${fieldTitle}?.innerText === ${JSON.stringify(`${label} · SDR`)}`); }
      catch (error) { console.log('Validator state on failure:', await browser.evaluate(`JSON.stringify({ menu: ${datasetMenu}?.value, title: ${fieldTitle}?.innerText, titles: Array.from(document.querySelectorAll("h2,h3")).map(e=>e.innerText).slice(0,12) })`)); throw error; }
      assert.equal(await browser.evaluate(`Boolean(${workspace})`), false);
      assert.equal(await browser.evaluate(`Array.from(document.querySelector('[role=tablist][aria-label=Geometri]').querySelectorAll('button')).find(e=>e.getAttribute('aria-selected')==='true').innerText.startsWith('Ledninger')`), true, 'originating geometry');
    };
    const changeSetCount = () => browser.evaluate(`document.querySelector('[data-gmi-edit-counts]')?.innerText || ''`);
    try {
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm=()=>true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")'); await click('Lukk');
      await setPhotoFiles(browser, 'input[type=file]', [file]);
      await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await browser.evaluate(`document.querySelector('[title="Synthetic H4.gmi"]').click()`);
      let originalFail;

      await t.test('without corrections the provenance returns to the originating rule on Original', async () => {
        await openSdrInspection();
        originalFail = await sdrFailCount();
        assert(originalFail >= 5, `synthetic SDR FEIL present (${originalFail})`);
        await click('Lukk Validator'); await handoff();
        await browser.waitFor(`${returnLink}?.dataset.gmiValidatorReturn === 'original'`);
        assert.match(await browser.evaluate('document.querySelector("[data-gmi-validator-provenance]").innerText'), /Tilbake til Validator · SDR · 2 objekter valgt i Validator/);
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          await browser.waitFor(returnLink);
          assert(await browser.evaluate(`document.documentElement.scrollWidth <= ${width}`), 'no page overflow');
          await shot(`h4-return-link-${width}`);
        }
        await pointer(returnLink);
        await expectValidator('original');
        assert.equal(await changeSetCount(), '');
        await shot('h4-return-original');
      });

      await t.test('an unsubmitted batch draft: cancelling the guard keeps draft, workspace and selection', async () => {
        await handoff();
        const field = `${batch}.querySelector('[aria-label="Felt for masseendring"]')`, value = `${batch}.querySelector('[aria-label="Ny verdi"]')`;
        await change(field, 'SDR'); await change(value, '11');
        await pointer(returnLink);
        await browser.waitFor(guardDialog); await shot('h4-guard');
        await click('Avbryt', guardDialog);
        await browser.waitFor(`!${guardDialog}`);
        assert.equal(await browser.evaluate(`Boolean(${workspace})`), true);
        assert.equal(await browser.evaluate(`${field}.value`), 'SDR'); assert.equal(await browser.evaluate(`${value}.value`), '11');
        assert.deepEqual(await selected(), [1, 3]);
        assert.equal(await browser.evaluate(`Boolean(${datasetMenu})`), false, 'still in Rettinger');
        assert.equal(await changeSetCount(), '', 'nothing staged by navigation');
      });

      await t.test('after staging, «Kontroller i Validator (Foreslått)» opens the same rule with updated findings', async () => {
        await click('Forhåndsvis endringer', batch);
        await browser.waitFor(`${batch}.getAttribute('aria-busy') === 'false' && ${batch}.querySelector('[data-gmi-batch-dry-run]')?.innerText.includes('OK')`);
        await click('Legg til masseendring', batch); await browser.waitFor(`${batch}.dataset.batchStep === '3'`);
        assert.match(await changeSetCount(), /1 retting/);
        await browser.waitFor(`${returnLink}?.dataset.gmiValidatorReturn === 'proposed'`);
        const check = `${batch}.querySelector('[data-gmi-validator-check]')`;
        await browser.waitFor(check);
        assert.equal(await browser.evaluate(`${check}.innerText.trim()`), 'Kontroller i Validator (Foreslått)');
        await shot('h4-staged-check');
        await pointer(check);
        await expectValidator('proposed');
        assert.equal(await sdrFailCount(), originalFail - 2, 'Foreslått findings reflect the two corrected lines');
        await shot('h4-check-proposed');
      });

      await t.test('the return link with corrections opens Foreslått; ordinary Rettinger has no rule context', async () => {
        // Foreslått now lists only the still-missing lines as FEIL.
        await click('Lukk Validator'); await handoff([0, 2]);
        await browser.waitFor(`${returnLink}?.dataset.gmiValidatorReturn === 'proposed'`);
        await pointer(returnLink); await expectValidator('proposed');
        await click('Lukk Validator');
        await browser.evaluate(`document.querySelector('[data-gmi-edit-action]').click()`);
        await browser.waitFor(`${workspace}?.querySelector('[data-gmi-edit-status]')?.innerText === 'Redigerbar'`);
        assert.equal(await browser.evaluate(`Boolean(document.querySelector('[data-gmi-validator-return], [data-gmi-validator-check]'))`), false);
      });

      await t.test('«Åpne Validator» defaults to Foreslått with corrections and keeps an explicit dataset choice', async () => {
        await click('Åpne Validator', workspace);
        await browser.waitFor(`${datasetMenu}?.value === 'proposed'`);
        await change(datasetMenu, 'original'); await browser.waitFor(`${datasetMenu}.value === 'original'`);
        await click('Lukk Validator');
        await browser.evaluate(`document.querySelector('[data-gmi-edit-action]').click()`);
        await browser.waitFor(`${workspace}?.querySelector('[data-gmi-edit-status]')?.innerText === 'Redigerbar'`);
        await click('Åpne Validator', workspace);
        await browser.waitFor(`${datasetMenu}?.value === 'original'`);
        assert.match(await changeSetCount(), /^$/, 'Validator open, Rettinger closed');
        await shot('h4-explicit-original');
      });

      assert.deepEqual(new Uint8Array(await readFile(file)), bytes);
      assert.equal(browser.events.filter(e => e.method === 'Runtime.exceptionThrown').length, 0);
    } catch (error) { await shot('h4-failure'); throw error; }
    finally {
      await browser.close();
      if (path.dirname(path.resolve(directory)) !== temporaryRoot || !path.basename(directory).startsWith('gmi-h4-return-')) throw new Error('Unsafe temporary fixture directory');
      await rm(directory, { recursive: true, force: true });
    }
  });
