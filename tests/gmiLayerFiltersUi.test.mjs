import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { gmiEditBatchFixture } from './helpers/gmiEditBatchFixture.mjs';

const app = process.env.PHOTO_UI_URL;
const workspace = 'document.querySelector(".gmi-edit-workspace")';
const panel = 'document.querySelector("[data-gmi-layer-filters]")';
const table = 'document.querySelector("[data-table-geometry]")';
const felt = 'document.querySelector("[data-layer-felt]")';
const tema = 'document.querySelector("[data-layer-tema]")';
const inspector = 'document.querySelector("[data-gmi-batch-inspector]")';
const field = (name) => `document.querySelector('[data-layer-field=${JSON.stringify(name)}]')`;

test('R6A production: shared Tema/Felt hosts, geometry, selection, preview, proposed basis and laptop layout',
  { skip: !app || !chromePath, timeout: 180000 }, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gmi-r6a-ui-'));
    const file = path.join(directory, 'R6A filters.gmi');
    const bytes = Buffer.from(gmiEditBatchFixture({ fields: ['S_FCODE', 'Material', 'SDR', 'Trykklasse', 'Ringstivhet'],
      rows: [['VL', 'PE', '', '', ''], ['SP', 'PVC', '', '', ''], ['VL', 'PE', '', '', '']] })).toString('latin1')
      .replace('[+L_]', '[P_]\r\n_FIELDNAMES S_FCODE;Type;\r\n[+L_]')
      .replace('[END]', '[+P_]\r\n:P 101\r\n_FIELDVALUES KUM;R;\r\n/XYZ\r\n581940 6566000 101\r\n[END]');
    await writeFile(file, Buffer.from(bytes, 'latin1'));
    const browser = await openTestChrome();
    const click = (label, root = 'document') => browser.evaluate(`(() => {
      const e = Array.from((${root}).querySelectorAll('button')).find(e => e.innerText.trim() === ${JSON.stringify(label)} || e.getAttribute('aria-label') === ${JSON.stringify(label)});
      if (!e || e.disabled) throw new Error('Unavailable: ' + ${JSON.stringify(label)}); e.click(); })()`);
    const open = async (root) => {
      await browser.evaluate(`(() => { const e = (${root}).querySelector('button'); if (e.getAttribute('aria-expanded') !== 'true') e.click(); })()`);
    };
    const value = (text) => browser.evaluate(`(() => { const e = ${inspector}.querySelector('[aria-label="Ny verdi"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(text)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const count = (n) => browser.waitFor(`${table}.querySelectorAll('[data-table-row]').length === ${n}`);
    const selected = () => browser.evaluate(`Array.from(${table}.querySelectorAll('[aria-selected=true][data-table-row]')).map(e => Number(e.dataset.tableRow))`);
    const hideMaterial = async () => {
      await open(felt); await open(field('Material'));
      await browser.evaluate(`${field('Material')}.querySelector('[data-filter-value="PE"]').click()`);
    };
    const stageDisabled = () => browser.evaluate(`Array.from(${inspector}.querySelectorAll('button')).find(e => e.innerText === 'Legg til masseendring').disabled`);
    const shot = async (name) => {
      if (!process.env.GMI_EDIT_SCREENSHOT_DIR) return;
      await mkdir(process.env.GMI_EDIT_SCREENSHOT_DIR, { recursive: true });
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.GMI_EDIT_SCREENSHOT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
    };
    try {
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm = () => true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")'); await click('Lukk');
      await setPhotoFiles(browser, 'input[type=file]', [file]);
      await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      if (!await browser.evaluate(`Boolean(${tema})`)) await browser.evaluate(`document.querySelector('[title="R6A filters.gmi"]').click()`);
      await click('Åpne datatabell'); await browser.waitFor(table); await click('Ledninger', table); await count(3);

      await t.test('ordinary Tema and Felt filters are retained on entering the Filter tab', async () => {
        await open(tema);
        await browser.evaluate(`Array.from(${tema}.querySelectorAll('div.cursor-pointer')).find(e => e.querySelector('span.font-mono')?.textContent === 'SP').click()`);
        await count(2);
        await hideMaterial(); await count(0);
        assert.equal(await browser.evaluate(`${table}.dataset.tableGeometry`), 'ledninger');
        await browser.evaluate(`document.querySelector('[data-gmi-edit-action]').click()`);
        await browser.waitFor(workspace); await click('Filter', workspace); await browser.waitFor(panel);
        assert.match(await browser.evaluate(`${panel}.innerText`), /Filtrert på: Original/);
        await open(tema);
        assert.equal(await browser.evaluate(`Array.from(${tema}.querySelectorAll('div.cursor-pointer')).find(e => e.querySelector('span.font-mono')?.textContent === 'SP').querySelector('input').checked`), false);
        await open(felt); assert.equal(await browser.evaluate(`${felt}.dataset.feltGeometry`), 'ledninger');
        await open(field('Material'));
        assert.equal(await browser.evaluate(`${field('Material')}.querySelector('[data-filter-value=PE] input').checked`), false);
        await click('Nullstill filtre', panel); await count(3);
      });

      await t.test('filter visibility never mutates selection or geometry; Felt follows explicit table/context switches', async () => {
        await browser.evaluate(`${table}.querySelector('[data-table-row="0"] input').click(); ${table}.querySelector('[data-table-row="2"] input').click()`);
        assert.deepEqual(await selected(), [0, 2]);
        await hideMaterial(); await count(1);
        assert.match(await browser.evaluate(`document.querySelector('[data-gmi-selection-bar]').innerText`), /2 valgt/);
        assert.equal(await browser.evaluate(`${table}.dataset.tableGeometry`), 'ledninger');
        await click('Punkter', table); await browser.waitFor(`${felt}.dataset.feltGeometry === 'punkter'`);
        assert(await browser.evaluate(`Boolean(${field('Type')})`));
        await browser.evaluate(`Array.from(${felt}.querySelectorAll('button')).find(e => e.innerText.startsWith('Ledninger (')).click()`);
        await browser.waitFor(`${table}.dataset.tableGeometry === 'ledninger'`);
        await click('Bare valgte'); await count(2); assert.deepEqual(await selected(), [0, 2]);
        assert.equal(await browser.evaluate(`${workspace}.querySelectorAll('[data-object-key]').length`), 0);
        await click('Filter', workspace); await click('Nullstill filtre', panel);
      });

      await t.test('shared filters do not stale an existing batch review and approved staging remains explicit', async () => {
        await click('Rediger valgte (2)'); await browser.waitFor(inspector);
        await value('11'); await click('Forhåndsvis endringer', inspector);
        await browser.waitFor(`${inspector}.querySelector('[data-gmi-batch-counts]')?.dataset.state === 'valid'`);
        await hideMaterial();
        assert.equal(await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-counts]').dataset.state`), 'valid');
        assert.equal(await stageDisabled(), false);
        assert.deepEqual(await selected(), [0, 2]);
        await click('Nullstill filtre', panel);
        await click('Legg til masseendring', inspector);
        await browser.waitFor(`${inspector}.dataset.batchStep === '3'`);
        await click('Filter', workspace); await open(felt); await open(field('SDR'));
      });

      await t.test('Foreslått/Kun endrede and Original use the table basis without modifying shared filters', async () => {
        await click('Foreslått', table);
        await browser.waitFor(`${panel}.innerText.includes('Filtrert på: Foreslått')`);
        assert.equal(await browser.evaluate(`${field('SDR')}.querySelector('[data-filter-value="11"] td:nth-child(3)').innerText`), '2');
        await browser.evaluate(`${field('SDR')}.querySelector('[data-filter-value="11"]').click()`);
        await click('Filtrert visning'); await count(1);
        await click('Kun endrede', table); await count(0);
        assert.match(await browser.evaluate(`${panel}.innerText`), /Filtrert på: Foreslått/);
        await click('Original', table); await count(3);
        assert.match(await browser.evaluate(`${panel}.innerText`), /Filtrert på: Original/);
        assert.equal(await browser.evaluate(`${field('SDR')}.querySelectorAll('[data-filter-value="11"]').length`), 0);
        // The hidden proposed value persists; switching basis does not rewrite the filter.
        await click('Foreslått', table); await count(1);
        assert.equal(await browser.evaluate(`${field('SDR')}.querySelector('[data-filter-value="11"] input').checked`), false);
        await click('Nullstill filtre', panel); await count(3);
      });

      await t.test('laptop filter controls stay within the sidebar and filters survive returning to the ordinary host', async () => {
        await open(field('Material'));
        for (const [width, height] of [[1366, 768], [1280, 720]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          const bounds = await browser.evaluate(`({ page: document.documentElement.scrollWidth, sidebar: ${workspace}.getBoundingClientRect().toJSON(),
            body: ${workspace}.querySelector('.gmi-edit-body').getBoundingClientRect().toJSON(), filters: ${panel}.getBoundingClientRect().toJSON(),
            overflow: ${workspace}.querySelector('.gmi-edit-body').scrollWidth - ${workspace}.querySelector('.gmi-edit-body').clientWidth })`);
          assert(bounds.page <= width); assert(bounds.sidebar.right <= width); assert(bounds.body.height > 150); assert(bounds.overflow <= 1);
          assert(await browser.evaluate(`${field('Material')}.querySelector('thead').getBoundingClientRect().height < 30`), 'value table headings fit on one line');
          await shot(`r6a-filter-${width}x${height}`);
        }
        await hideMaterial(); await count(1);
        await click('Avslutt', inspector);
        await click('Tilbake til appen', workspace); await browser.waitFor(`!${workspace}`);
        // The ordinary host still displays Original, even when Rettinger used Foreslått.
        await open(felt); await open(field('Material'));
        assert.equal(await browser.evaluate(`${field('Material')}.querySelector('[data-filter-value=PE] input').checked`), false);
        await count(1);
        await browser.evaluate(`${field('Material')}.querySelector('[data-filter-value=PE]').click()`); await count(3);
        await open(tema);
        await browser.evaluate(`Array.from(${tema}.querySelectorAll('div.cursor-pointer')).find(e => e.querySelector('span.font-mono')?.textContent === 'SP').click()`); await count(2);
        await browser.evaluate(`document.querySelector('[data-gmi-edit-action]').click()`); await browser.waitFor(workspace);
        await click('Filter', workspace); await browser.waitFor(panel); await count(2);
        assert.match(await browser.evaluate(`${panel}.innerText`), /1 skjult/);
        await open(tema);
        await browser.evaluate(`Array.from(${tema}.querySelectorAll('div.cursor-pointer')).find(e => e.querySelector('span.font-mono')?.textContent === 'VL').click()`);
        await count(0);
        assert.equal(await browser.evaluate(`${table}.dataset.tableGeometry`), 'ledninger');
        await click('Tilbake til appen', workspace); await browser.waitFor(`!${workspace}`);
        await open(tema);
        assert.equal(await browser.evaluate(`Array.from(${tema}.querySelectorAll('div.cursor-pointer')).find(e => e.querySelector('span.font-mono')?.textContent === 'VL').querySelector('input').checked`), false);
        await count(0);
      });
      assert.deepEqual(await readFile(file), Buffer.from(bytes, 'latin1'));
      assert.equal(browser.events.filter((event) => event.method === 'Runtime.exceptionThrown').length, 0);
    } catch (error) { console.log(await browser.evaluate('document.body.innerText')); throw error; }
    finally {
      await browser.close();
      if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('gmi-r6a-ui-')) throw new Error('Unsafe temp path');
      await rm(directory, { recursive: true, force: true });
    }
  });
