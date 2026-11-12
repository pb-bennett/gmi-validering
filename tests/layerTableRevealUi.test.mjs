import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { encodeSingleByte } from './helpers/gmiEditFixtures.mjs';

const app = process.env.PHOTO_UI_URL;
const table = 'document.querySelector("[data-table-geometry]")';
const grid = 'document.querySelector("[role=grid]")';
const editor = 'document.querySelector("[data-gmi-object]")';
const detail = 'document.querySelector("[data-gmi-change-detail]")';
test('T1 production: late sorted row reveal, explicit search/filter reset and inspector/selection continuity',
  { skip: !app || !chromePath, timeout: 180000 }, async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gmi-t1-'));
    const file = path.join(directory, 'Synthetic reveal.gmi');
    const lines = ['[GMIFILE_ASCII]', '_VERSION 2', '_FILETYPE GMI', '_INDEX !!!!!!!!!!!!!!!!!!!!', 'COSYS_EPSG 25832',
      '[L_]', '_FIELDNAMES Tema;Material;SDR;Stedfestingsårsak;Merknad;', '[+L_]'];
    for (let i = 0; i < 300; i++) lines.push(`:L ${i + 1}`, `_FIELDVALUES VL;PE;;NYTT;Row ${String(i + 1).padStart(3, '0')};`, '/XYZ', `581940 ${6566000 + i} 101`, `581945 ${6566001 + i} 101`);
    lines.push('[END]', '');
    await writeFile(file, encodeSingleByte(lines.join('\r\n')));
    const browser = await openTestChrome();
    const click = (label, root = 'document') => browser.evaluate(`(() => { const e = Array.from((${root}).querySelectorAll('button')).find(e => e.innerText.trim() === ${JSON.stringify(label)} || e.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!e || e.disabled) throw new Error('Unavailable: ' + ${JSON.stringify(label)}); e.click(); })()`);
    const input = (expression, value) => browser.evaluate(`(() => { const e = ${expression}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const search = `${table}.querySelector('[aria-label="Søk i data"]')`;
    const reveal = async () => { await click('Vis i Foreslått', detail); };
    const inViewport = async () => {
      await browser.waitFor(`${grid}.querySelector('[data-table-revealed]')`);
      await browser.waitFor(`(() => { const r = ${grid}.querySelector('[data-table-revealed]').getBoundingClientRect(), g = ${grid}.getBoundingClientRect(); return r.top >= g.top && r.bottom <= g.bottom; })()`);
      assert.equal(await browser.evaluate(`${grid}.querySelector('[data-table-revealed]').dataset.tableRow`), '279');
    };
    try {
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm = () => true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")'); await click('Lukk');
      await setPhotoFiles(browser, 'input[type=file]', [file]);
      await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await browser.evaluate('document.querySelector("[data-gmi-edit-action]").click()');
      await browser.waitFor(table); await click('Ledninger', table);
      await input(search, 'Row 280');
      await browser.waitFor(`${grid}.querySelector('[data-table-row="279"]')`);
      await browser.evaluate(`${grid}.querySelector('[data-table-row="279"]').click()`);
      await browser.waitFor(`${editor}?.dataset.gmiObject === 'line:279'`);
      await input(`${editor}.querySelector('tr[data-field=SDR] input')`, '11');
      await click('Se gjennom (1)', editor); await browser.waitFor(`${editor}.querySelector('.gmi-edit-review')`);
      await click('Legg til retting', editor);
      await browser.waitFor('document.querySelector("[data-gmi-edit-counts]")');
      await input(search, 'Row 001');
      await browser.waitFor(`${grid}.querySelector('[data-table-row="0"]')`);
      await browser.evaluate(`${grid}.querySelector('[data-table-row="0"] input').click(); ${grid}.querySelector('[data-table-row="0"]').click()`);
      await browser.waitFor(`${editor}?.dataset.gmiObject === 'line:0'`);
      await click('Endringer (1)', 'document.querySelector(".gmi-edit-workspace")');
      await click('Vis detaljer', 'document.querySelector(".gmi-edit-workspace")'); await browser.waitFor(detail);
      await input(search, '');
      for (const [width, height] of [[1280, 720], [1366, 768]]) {
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        // Actual sort controls, twice for descending; target is far from either edge.
        await browser.evaluate(`(() => { const h = Array.from(${grid}.querySelectorAll('[role=columnheader]')).find(e => e.innerText.includes('Merknad')); h.querySelector('button').click(); })()`);
        await browser.evaluate(`${grid}.scrollTop = 0`);
        await reveal(); await inViewport();
        await input(search, 'Row 001'); await reveal();
        await browser.waitFor('document.querySelector("[data-table-reveal-message]")');
        assert.match(await browser.evaluate('document.querySelector("[data-table-reveal-message]").innerText'), /skjult av søk/);
        assert.equal(await browser.evaluate(`${search}.value`), 'Row 001');
        if (process.env.GMI_EDIT_SCREENSHOT_DIR) {
          await mkdir(process.env.GMI_EDIT_SCREENSHOT_DIR, { recursive: true });
          const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
          await writeFile(path.join(process.env.GMI_EDIT_SCREENSHOT_DIR, `t1-hidden-${width}.png`), Buffer.from(data, 'base64'));
        }
        await click('Nullstill filtre', 'document.querySelector("[data-table-reveal-message]")'); await inViewport();
        assert.equal(await browser.evaluate(`Boolean(${detail})`), true, 'details stay focused');
        assert.match(await browser.evaluate('document.querySelector("[data-gmi-selection-bar]").innerText'), /1 valgt/);
        if (process.env.GMI_EDIT_SCREENSHOT_DIR) {
          const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
          await writeFile(path.join(process.env.GMI_EDIT_SCREENSHOT_DIR, `t1-revealed-${width}.png`), Buffer.from(data, 'base64'));
        }
      }
      await click('Filter', 'document.querySelector(".gmi-edit-workspace")');
      const felt = 'document.querySelector("[data-layer-felt]")';
      const material = 'document.querySelector("[data-layer-field=Material]")';
      for (const e of [felt, material]) await browser.evaluate(`if (${e}.querySelector('button').getAttribute('aria-expanded') !== 'true') ${e}.querySelector('button').click()`);
      await browser.evaluate(`${material}.querySelector('[data-filter-value=PE]').click()`);
      await reveal(); await browser.waitFor('document.querySelector("[data-table-reveal-message]")');
      assert.match(await browser.evaluate('document.querySelector("[data-table-reveal-message]").innerText'), /Tema\/Felt-filtre/);
      assert.equal(await browser.evaluate(`${material}.querySelector('[data-filter-value=PE] input').checked`), false);
      await click('Nullstill filtre', 'document.querySelector("[data-table-reveal-message]")'); await inViewport();
      await click('Bare valgte'); await reveal();
      await browser.waitFor('document.querySelector("[data-table-reveal-message]")');
      assert.match(await browser.evaluate('document.querySelector("[data-table-reveal-message]").innerText'), /Bare valgte/);
      await click('Nullstill filtre', 'document.querySelector("[data-table-reveal-message]")'); await inViewport();
      await click('Lukk detaljer', detail);
      assert.equal(await browser.evaluate(`${editor}.dataset.gmiObject`), 'line:0', 'the previously focused inspector object survives every reveal');
    } finally {
      await browser.close();
      if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('gmi-t1-')) throw new Error('Unsafe fixture cleanup');
      await rm(directory, { recursive: true, force: true });
    }
  });
