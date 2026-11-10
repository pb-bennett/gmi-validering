import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { gmiEditBatchFixture } from './helpers/gmiEditBatchFixture.mjs';

const app = process.env.PHOTO_UI_URL;
const grid = `document.querySelector('[role=grid]')`;
const inspector = `document.querySelector('[data-gmi-batch-inspector]')`;
const row = (index) => `${grid}.querySelector('[data-table-row="${index}"]')`;
const first = `${grid}.querySelector('[data-table-row]').dataset.tableRow`;

test('R4 follow-up production: frozen layout, review sorting, actual severity and ellipsis',
  { skip: !app || !chromePath, timeout: 180000 }, async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gmi-table-review-'));
    const file = path.join(directory, 'Synthetic table review.gmi');
    const fields = ['S_FCODE', 'Tema', 'Material', 'SDR', 'Trykklasse', 'Ringstivhet', 'Nett type', 'InnvendigUtvendig', 'Merknad'];
    const rows = Array.from({ length: 80 }, (_, i) => [i === 0 ? 'SP' : 'VL', i === 0 ? 'SP' : 'VL', i === 0 ? 'PVC' : 'PE', i === 1 ? '11.0' : '', '', i === 0 ? 'SN8' : '', '1', 'ID', 'En lang merknad som bevarer god plass for vanlige tekstfelt']);
    const source = Buffer.from(gmiEditBatchFixture({ rows, fields }));
    await writeFile(file, source);
    const browser = await openTestChrome();
    const click = (label, root = 'document') => browser.evaluate(`(() => { const b = Array.from((${root}).querySelectorAll('button')).find(e => e.innerText.trim() === ${JSON.stringify(label)} || e.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!b || b.disabled) throw new Error('Unavailable: ' + ${JSON.stringify(label)}); b.click(); })()`);
    const preview = async () => {
      await click('Forhåndsvis endringer', inspector);
      await browser.waitFor(`${inspector}.querySelector('[data-gmi-batch-counts][data-state=valid]')`);
    };
    try {
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm = () => true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")'); await click('Lukk');
      await setPhotoFiles(browser, 'input[type=file]', [file]);
      await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await browser.evaluate(`document.querySelector('[data-gmi-edit-action]').click()`);
      await browser.waitFor(`${row(0)}?.querySelector('input[type=checkbox]')`);
      for (const index of [0, 1, 2, 3]) await browser.evaluate(`${row(index)}.querySelector('input[type=checkbox]').click()`);
      await click('Rediger valgte (4)'); await browser.waitFor(inspector);
      await browser.evaluate(`(() => { const i = ${inspector}.querySelector('[aria-label="Ny verdi"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '11'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      await preview();
      await click('Filtrert visning', 'document.querySelector("[data-gmi-selection-bar]")');
      await browser.waitFor(`${grid}.getAttribute('aria-rowcount') === '81'`);
      const counts = await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-counts]').innerText`);
      await click('Sorter etter Status'); await browser.waitFor(`${first} === '2'`);
      assert.equal(await browser.evaluate(`${row(2)}.querySelector('.gmi-object-number').innerText`), '3');
      await click('Sorter etter Status'); await browser.waitFor(`${first} === '0'`);
      await click('Sorter etter Endring'); await browser.waitFor(`${first} === '2'`);
      assert.equal(await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-counts]').innerText`), counts);
      await click('Sorter etter Endring'); await click('Sorter etter Endring');
      await browser.evaluate(`${inspector}.querySelector('.gmi-batch-advanced input').click()`);
      await browser.waitFor(`${row(0)}.querySelector('.gmi-manual-toggle')`);
      await click('Sorter etter Funn etter endring');
      assert.equal(await browser.evaluate(first), '0', 'hypothetical FEIL stays tied with other no-new-finding rows');
      await click('Inkluder manuelt', row(0));
      await browser.waitFor(`${row(0)}.dataset.reviewOutcome === 'manual'`);
      await click('Sorter etter Funn etter endring'); await browser.waitFor(`${first} === '1'`);
      await click('Sorter etter Funn etter endring'); await click('Sorter etter Funn etter endring');
      await browser.waitFor(`${first} === '0'`);
      const truncation = await browser.evaluate(`(() => { const r = ${row(0)}, status = r.querySelector('.gmi-outcome-detail'), finding = r.querySelector('.gmi-review-finding > span'); return { status: { ellipsis: getComputedStyle(status).textOverflow, clipped: status.scrollWidth > status.clientWidth, text: status.textContent, tip: status.parentElement.title }, finding: { ellipsis: getComputedStyle(finding).textOverflow, clipped: finding.scrollWidth > finding.clientWidth, tip: finding.parentElement.title } }; })()`);
      assert.equal(truncation.status.ellipsis, 'ellipsis'); assert(truncation.status.clipped);
      assert.match(truncation.status.text, /SDR anbefales ikke/); assert(truncation.status.tip.length > 20);
      assert.equal(truncation.finding.ellipsis, 'ellipsis'); assert(truncation.finding.clipped); assert.match(truncation.finding.tip, /FEIL/);
      for (const [width, height] of [[1366, 768], [1280, 720]]) {
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        await browser.evaluate(`${grid}.scrollLeft = 500`);
        const layout = await browser.evaluate(`(() => { const g = ${grid}, hs = [...g.querySelectorAll('[role=columnheader]')].slice(0, 4), cs = [...g.querySelector('[data-table-row]').children].slice(0, 4), rect = e => ({ x: e.getBoundingClientRect().x, width: e.getBoundingClientRect().width }); return { headers: hs.map(rect), cells: cs.map(rect), align: getComputedStyle(g.querySelector('.gmi-object-number')).textAlign, scroll: g.scrollWidth > g.clientWidth, page: document.documentElement.scrollWidth }; })()`);
        assert.deepEqual(layout.headers.map((r) => r.width), [32, 32, 40, 56]);
        assert.deepEqual(layout.headers, layout.cells);
        for (let i = 1; i < 4; i++) assert(Math.abs(layout.headers[i].x - layout.headers[i - 1].x - layout.headers[i - 1].width) < 1);
        assert.equal(layout.align, 'left'); assert(layout.scroll); assert(layout.page <= width);
        const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
        await writeFile(path.join(tmpdir(), `gmi-table-review-${width}.png`), Buffer.from(data, 'base64'));
      }
      assert.equal(browser.events.filter((event) => event.method === 'Runtime.exceptionThrown').length, 0);
      assert.deepEqual(await readFile(file), source);
    } catch (error) {
      const body = await browser.evaluate('document.body.innerText');
      throw new Error(`${error.message}\nRendered page:\n${body}`, { cause: error });
    } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
  });
