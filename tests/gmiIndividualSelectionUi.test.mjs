import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { gmiFieldBatchFixture } from './helpers/gmiFieldBatchFixture.mjs';

const app = process.env.PHOTO_UI_URL;
const grid = 'document.querySelector("[role=grid]")';
const batch = 'document.querySelector("[data-gmi-batch-inspector]")';
const nav = 'document.querySelector("[data-gmi-individual-selection]")';
const editor = 'document.querySelector("[data-gmi-object]")';
const dialog = 'document.querySelector(\'dialog[open][data-gmi-confirm="workspace"]\')';
const bar = 'document.querySelector("[data-gmi-selection-bar]")';
const halos = `Array.from(document.querySelectorAll('.leaflet-gmi-edit-selection-pane path.gmi-edit-selection-halo')).filter(e => Number(e.getAttribute('opacity') ?? e.getAttribute('stroke-opacity')) > 0)`;

test('B3 production: Validator five points, source order, draft cancellation, independent stages and retained selection at laptop sizes',
  { skip: !app || !chromePath, timeout: 240000 }, async () => {
    const root = path.resolve(tmpdir()), directory = await mkdtemp(path.join(root, 'gmi-b3-'));
    const file = path.join(directory, 'Synthetic B3.gmi');
    const bytes = gmiFieldBatchFixture({ pointFields: ['Tema', 'Type', 'InnvendigUtvendig', 'Bredde', 'Stedfestingsårsak', 'Merknad'],
      points: Array.from({ length: 5 }, () => ['KUM', 'KBRE', '', '1000', 'NYTT', '']) });
    await writeFile(file, bytes);
    const browser = await openTestChrome();
    const click = async (text, scope = 'document') => {
      const expression = `Array.from(${scope}.querySelectorAll('button')).find(e=>e.innerText.trim()===${JSON.stringify(text)} || e.getAttribute('aria-label')===${JSON.stringify(text)})`;
      await browser.waitFor(expression); await browser.evaluate(`${expression}.click()`);
    };
    const current = (i) => browser.waitFor(`${editor}?.dataset.gmiObject === 'point:${i}' && ${nav}?.innerText.includes('Objekt ${i + 1} av 5 i utvalget')
      && ${grid}?.querySelector('[data-table-row="${i}"][aria-current=true]')`);
    const membership = async () => {
      assert.deepEqual(await browser.evaluate(`Array.from(${grid}.querySelectorAll('[data-table-row][aria-selected=true]')).map(e=>Number(e.dataset.tableRow)).sort((a,b)=>a-b)`), [0, 1, 2, 3, 4]);
      await browser.waitFor(`${halos}.length === 5`);
    };
    const edit = (value) => browser.evaluate(`(() => { const e=${editor}.querySelector('[data-field="Merknad"] input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const stage = async () => {
      await click('Se gjennom (1)', editor); await browser.waitFor(`${editor}.querySelector('.gmi-edit-review')`);
      await click('Legg til retting', editor); await browser.waitFor(`${editor}.querySelector('[data-gmi-object-message]')`);
    };
    try {
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm=()=>true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")'); await click('Lukk');
      await setPhotoFiles(browser, 'input[type=file]', [file]);
      await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await browser.evaluate(`document.querySelector('[title="Synthetic B3.gmi"]').click()`);
      await browser.waitFor('document.querySelector("button[title=Feltvalidering]")');
      await browser.evaluate('document.querySelector("button[title=Feltvalidering]").click()');
      await browser.waitFor('document.querySelector(\'[role=tablist][aria-label=Geometri]\')');
      await browser.evaluate(`Array.from(document.querySelector('[role=tablist][aria-label=Geometri]').querySelectorAll('button')).find(e=>e.innerText.startsWith('Punkter')).click()`);
      const field = `document.querySelector('button[aria-label^="Innvendig/utvendig:"]')`;
      await browser.waitFor(field); await browser.evaluate(`${field}.click()`); await click('Vis detaljer: Innvendig/utvendig');
      const diagnostic = `Array.from(document.querySelectorAll('button[aria-label*="objekter i tabell:"]')).find(e=>e.closest('[data-validation-tone]')?.dataset.validationTone==='error')`;
      await browser.waitFor(diagnostic); await browser.evaluate(`${diagnostic}.click()`);
      for (const index of [4, 1, 3, 0, 2]) {
        const box = `${grid}?.querySelector('[data-table-row="${index}"] input[type=checkbox]')`;
        await browser.waitFor(box); await browser.evaluate(`${box}.click()`);
      }
      await click('Åpne i Rettinger (5)', bar); await browser.waitFor(batch);
      assert.match(await browser.evaluate(`${batch}.innerText`), /SDR, Trykklasse og Ringstivhet kan bare masseendres på ledninger/);
      await browser.evaluate(`(() => { const e=${batch}.querySelector('[aria-label="Felt for masseendring"]');e.value='Merknad';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await browser.evaluate(`(() => { const e=${batch}.querySelector('[aria-label="Ny verdi"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Batch draft');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await click('Rett én og én', batch); await browser.waitFor(dialog); await click('Avbryt', dialog);
      assert.equal(await browser.evaluate(`${batch}.querySelector('[aria-label="Ny verdi"]').value`), 'Batch draft');
      await click('Rett én og én', batch); await browser.waitFor(dialog); await click('Forkast skjemaet', dialog);
      await current(0); await membership();
      assert.equal(await browser.evaluate(`${nav}.querySelectorAll('button')[1].disabled`), true);
      await edit('First independent'); await stage();
      await click('Neste', nav); await current(1); await edit('Draft kept');
      for (const action of ['Neste', 'Forrige', 'Tilbake til utvalget']) {
        await click(action, nav); await browser.waitFor(dialog); await click('Avbryt', dialog);
        await browser.waitFor(`!${dialog}`); await current(1);
        assert.equal(await browser.evaluate(`${editor}.querySelector('[data-field="Merknad"] input').value`), 'Draft kept');
        await membership();
      }
      await stage(); await click('Neste', nav); await current(2);
      assert.match(await browser.evaluate(`document.querySelector('[data-gmi-edit-counts]').innerText`), /2 rettinger.*2 felt i 2 objekter/);
      assert.equal(await browser.evaluate(`${editor}.querySelector('[data-field="Merknad"] input').value`), '');
      for (const [width, height] of [[1280, 720], [1366, 768]]) {
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        await membership();
        assert(await browser.evaluate(`document.documentElement.scrollWidth <= ${width}`));
        const reachable = await browser.evaluate(`Array.from(${nav}.querySelectorAll('button')).every(e=>{const r=e.getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight && e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})`);
        assert(reachable, 'navigation remains pointer reachable');
        if (process.env.GMI_EDIT_SCREENSHOT_DIR) {
          await mkdir(process.env.GMI_EDIT_SCREENSHOT_DIR, { recursive: true });
          const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
          await writeFile(path.join(process.env.GMI_EDIT_SCREENSHOT_DIR, `b3-${width}.png`), Buffer.from(data, 'base64'));
        }
      }
      await edit('Discard only with approval'); await click('Neste', nav); await browser.waitFor(dialog);
      await click('Forkast skjemaet', dialog); await current(3);
      await click('Forrige', nav); await current(2);
      assert.equal(await browser.evaluate(`${editor}.querySelector('[data-field="Merknad"] input').value`), '');
      await click('Neste', nav); await current(3); await click('Neste', nav); await current(4);
      assert.equal(await browser.evaluate(`${nav}.querySelectorAll('button')[2].disabled`), true);
      await click('Forrige', nav); await current(3); await membership();
      await click('Tilbake til utvalget', nav); await browser.waitFor(batch); await membership();
      await click('Rett én og én', batch); await current(0);
      assert.equal(await browser.evaluate(`${editor}.querySelector('[data-field="Merknad"] input').value`), 'First independent');
      await click('Neste', nav); await current(1);
      assert.equal(await browser.evaluate(`${editor}.querySelector('[data-field="Merknad"] input').value`), 'Draft kept');
      // Removing current membership must not silently switch the editor or select a replacement.
      await browser.evaluate(`${grid}.querySelector('[data-table-row="1"] input[type=checkbox]').click()`);
      await browser.waitFor(`${nav}.innerText.includes('ikke lenger')`);
      assert.equal(await browser.evaluate(`${editor}.dataset.gmiObject`), 'point:1');
      assert(await browser.evaluate(`Array.from(${nav}.querySelectorAll('button')).slice(1).every(e=>e.disabled)`));
      await browser.evaluate(`${bar}.querySelector('[data-gmi-validator-return]').click()`);
      await browser.waitFor(`document.querySelector('[aria-label="Datasett i Validator"]')?.value === 'proposed'
        && document.querySelector('#validation-v2-field-inspector-title, #validation-v2-field-info-title')?.innerText === 'Foreslått · Innvendig/utvendig'`);
      assert.deepEqual(await readFile(file), Buffer.from(bytes));
      assert.equal(browser.events.filter(e => e.method === 'Runtime.exceptionThrown').length, 0);
    } finally {
      await browser.close();
      if (path.dirname(directory) !== root || !path.basename(directory).startsWith('gmi-b3-')) throw new Error('Unsafe temporary directory');
      await rm(directory, { recursive: true, force: true });
    }
  });
