import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { gmiFieldBatchFixture } from './helpers/gmiFieldBatchFixture.mjs';

const app = process.env.PHOTO_UI_URL;
test('A7 production: column priority reports the visible order, including unavailable fields and empty results',
  { skip: !app || !chromePath, timeout: 120000 }, async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gmi-a7-'));
    const file = path.join(directory, 'Synthetic A7.gmi');
    await writeFile(file, gmiFieldBatchFixture());
    const browser = await openTestChrome();
    const grid = `document.querySelector('[role=grid]')`;
    const toggle = `document.querySelector('[data-gmi-column-focus]')`;
    const click = (label) => browser.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(e => e.innerText.trim() === ${JSON.stringify(label)} || e.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!b || b.disabled) throw new Error('Unavailable: ' + ${JSON.stringify(label)}); b.click(); })()`);
    const search = (value) => browser.evaluate(`(() => { const e = document.querySelector('[aria-label="Søk i data"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    try {
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm=()=>true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")'); await click('Lukk');
      await setPhotoFiles(browser, 'input[type=file]', [file]);
      await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await browser.evaluate(`document.querySelector('[data-gmi-edit-action]').click()`);
      // The Rettinger workspace and its table chrome mount asynchronously; wait for the actual geometry tabs.
      await browser.waitFor('document.querySelector("[data-table-geometry]")');
      await click('Punkter');
      await browser.waitFor(`${grid}?.querySelector('[data-table-row="0"] input')`);
      await browser.evaluate(`${grid}.querySelector('[data-table-row="0"] input').click()`);
      await click('Rediger valgte (1)');
      await browser.waitFor(`document.querySelector('[aria-label="Felt for masseendring"]')`);
      await click('Filtrert visning');
      await browser.waitFor(`${grid}.getAttribute('aria-rowcount') === '6'`);
      const savedPointOrder = () => browser.evaluate(`JSON.stringify(Object.values(JSON.parse(localStorage.getItem('gmi-validator-storage')).state.ui.layerDataTable.columnOrderByLayer).map(order => order.punkter))`);
      const saved = await savedPointOrder();
      await browser.evaluate(`(() => { const e = document.querySelector('[aria-label="Felt for masseendring"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(e, 'InnvendigUtvendig'); e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      await browser.waitFor(`${toggle}?.getAttribute('aria-pressed') === 'true'`);
      await search('no synthetic row matches this');
      await browser.waitFor(`${grid}.getAttribute('aria-rowcount') === '1'`);
      assert.equal(await browser.evaluate(`${toggle}.getAttribute('aria-pressed')`), 'true', 'empty search keeps the focused headers visible');
      await search('');
      await browser.waitFor(`${toggle}.getAttribute('aria-pressed') === 'true'`);
      assert(await browser.evaluate(`${grid}.querySelector('[data-focus-column]')?.innerText.includes('InnvendigUtvendig')`));
      await click('Ledninger');
      await browser.waitFor(`${grid}.getAttribute('aria-rowcount') === '4'`);
      assert.equal(await browser.evaluate(`${toggle}.getAttribute('aria-pressed')`), 'false', 'point-only field is not applied to lines');
      await click('Punkter');
      await browser.waitFor(`${toggle}.getAttribute('aria-pressed') === 'true'`);
      await click('InnvendigUtvendig først');
      await browser.waitFor(`${toggle}.getAttribute('aria-pressed') === 'false'`);
      await click('Original');
      assert.equal(await browser.evaluate(`${toggle}.getAttribute('aria-pressed')`), 'false');
      assert.equal(await savedPointOrder(), saved, 'contextual ordering never rewrites the saved point layout');
      assert.equal(browser.events.filter(e => e.method === 'Runtime.exceptionThrown').length, 0);
    } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
  });
