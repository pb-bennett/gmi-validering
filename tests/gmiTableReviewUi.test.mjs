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
      // Since G4 the inspector starts without a field (deliberate setup fix: this test failed at the Pass 1 baseline).
      const choose = (label, value) => browser.evaluate(`(() => { const e = ${inspector}.querySelector('[aria-label=${JSON.stringify(label)}]');
        const select = e.tagName === 'SELECT'; Object.getOwnPropertyDescriptor(select ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)});
        e.dispatchEvent(new Event(select ? 'change' : 'input', { bubbles: true })); })()`);
      await choose('Felt for masseendring', 'SDR'); await choose('Ny verdi', '11.0');
      await preview();
      await browser.waitFor(`${inspector}.querySelector('[data-gmi-batch-dry-run]')?.innerText.includes('OK')`);
      // S2: an actual change with only unchanged existing findings reads «Ingen nye funn»; existing ones stay in the tooltip.
      const none = await browser.evaluate(`(() => { const e = ${row(2)}.querySelector('.gmi-review-none'); return e && { text: e.innerText, tip: e.title, existing: Number(e.dataset.existingCount) }; })()`);
      assert.equal(none?.text, 'Ingen nye funn');
      if (none.existing) assert.match(none.tip, new RegExp(`${none.existing} eksisterende funn uendret`));
      assert.match(await browser.evaluate(`${inspector}.querySelector('.gmi-batch-severity').innerText`), /0 nye FEIL[\s\S]*0 nye SJEKK[\s\S]*løst/, 'resolved count is visible without expanding');
      await click('Filtrert visning', 'document.querySelector("[data-gmi-selection-bar]")');
      await browser.waitFor(`${grid}.getAttribute('aria-rowcount') === '81'`);
      // The view switch revalidates; S2's «løst» pill appears once the full check is ready again.
      await browser.waitFor(`${inspector}.querySelector('[data-gmi-batch-dry-run]')?.innerText.includes('OK') && ${inspector}.getAttribute('aria-busy') === 'false'`);
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
        // S4: free text is content-sized up to 240 px; codes stay compact; horizontal scrolling stays inside the grid.
        const columnWidth = (label) => browser.evaluate(`[...${grid}.querySelectorAll('[role=columnheader]')].find(h => h.innerText.trim() === ${JSON.stringify(label)})?.getBoundingClientRect().width`);
        assert.equal(await columnWidth('Merknad'), 240, `Merknad at ${width}×${height}`);
        assert((await columnWidth('Nett type')) < 100, 'code column unchanged');
        assert(await browser.evaluate(`${grid}.getBoundingClientRect().right <= ${width}`));
        const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
        await writeFile(path.join(tmpdir(), `gmi-table-review-${width}.png`), Buffer.from(data, 'base64'));
      }
      // S4: widths stay stable when filtering (computed from the complete geometry scope).
      const merknadWidth = () => browser.evaluate(`[...${grid}.querySelectorAll('[role=columnheader]')].find(h => h.innerText.trim() === 'Merknad').getBoundingClientRect().width`);
      const search = (value) => browser.evaluate(`(() => { const i = document.querySelector('[aria-label="Søk i data"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
      const unfiltered = await merknadWidth();
      await search('SP'); await browser.waitFor(`${grid}.getAttribute('aria-rowcount') !== '81'`);
      assert.equal(await merknadWidth(), unfiltered, 'Merknad width is unchanged by filtering');
      await search(''); await browser.waitFor(`${grid}.getAttribute('aria-rowcount') === '81'`);
      // S4: keyboard access to the truncated full value: grid row → full-text region (Tab) → Escape back.
      const key = async (name, code, modifiers = 0) => {
        await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name, windowsVirtualKeyCode: code, modifiers });
        await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: code, modifiers });
      };
      const fullText = `document.querySelector('[data-table-full-text]')`;
      await browser.evaluate(`${grid}.focus()`); await key('ArrowDown', 40); await key('ArrowUp', 38);
      await browser.waitFor(fullText);
      assert.match(await browser.evaluate(`${fullText}.innerText`), /Merknad:\s*En lang merknad som bevarer god plass for vanlige tekstfelt/);
      assert.equal(await browser.evaluate(`${fullText}.getAttribute('aria-label')`), 'Full tekst i aktiv rad');
      const selectedObject = await browser.evaluate(`document.querySelector('[data-gmi-batch-inspector] .gmi-batch-object-detail') !== null`);
      await key('Enter', 13, 8);
      assert.equal(await browser.evaluate(`document.activeElement === ${fullText}`), true, 'Shift+Enter reaches the full text');
      assert.equal(await browser.evaluate(`document.querySelector('[data-gmi-batch-inspector] .gmi-batch-object-detail') !== null`), selectedObject, 'Shift+Enter does not open the object');
      assert.match(await browser.evaluate(`${fullText}.innerText`), /Shift\+Enter i tabellen/, 'the region states how to reach it');
      const region = await browser.evaluate(`(() => { const r = ${fullText}.getBoundingClientRect(), g = ${grid}.getBoundingClientRect(); return { height: r.height, grid: g.height, footer: document.getElementById('layer-table-keyboard-help').getBoundingClientRect().height }; })()`);
      assert(region.height <= 57, `compact region ${JSON.stringify(region)}`);
      assert(region.footer < 16, 'the keyboard hint still fits on one line');
      await key('Escape', 27);
      assert.equal(await browser.evaluate(`document.activeElement === ${grid}`), true, 'Escape returns to the grid');
      const { data: keyboardShot } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(tmpdir(), 'gmi-table-review-fulltext-1280.png'), Buffer.from(keyboardShot, 'base64'));
      assert.equal(browser.events.filter((event) => event.method === 'Runtime.exceptionThrown').length, 0);
      assert.deepEqual(await readFile(file), source);
    } catch (error) {
      const body = await browser.evaluate('document.body.innerText');
      throw new Error(`${error.message}\nRendered page:\n${body}`, { cause: error });
    } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
  });
