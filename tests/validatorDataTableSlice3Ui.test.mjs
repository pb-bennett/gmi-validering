import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { assertTableRowFill } from './helpers/layerTableStateAssertions.mjs';
import { clickSourceControl, setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { noGpsPng } from './helpers/photoGpsFixtures.mjs';
import { createLayerWithoutPlacement, importDialog } from './helpers/photoImportWizard.mjs';
import { enterEditMode } from './helpers/photoWorkspace.mjs';
import { encodeSingleByte } from './helpers/gmiEditFixtures.mjs';

const app = process.env.PHOTO_UI_URL;
const table = 'document.querySelector("[data-table-geometry]")';
const grid = 'document.querySelector("[role=grid]")';
const bar = 'document.querySelector("[data-gmi-selection-bar]")';
const editor = 'document.querySelector("[data-gmi-object]")';
const box = (index) => `${grid}.querySelector('[data-table-row="${index}"] input[type=checkbox]')`;
const halos = `Array.from(document.querySelectorAll('.leaflet-gmi-edit-selection-pane path.gmi-edit-selection-halo')).filter(e => Number(e.getAttribute('opacity') ?? e.getAttribute('stroke-opacity')) > 0)`;

const POINT_NUMBERS = [3, 4, 5, 6, 11, 13, 15, 17, 20, 22, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35];
const LINE_NUMBERS = [1, 2, 3, 4, 5];

// Synthetic delivery: nonconsecutive point numbers, Ledning 4 (index 3) without Rørform,
// and LOK/TOP covers without Byggemetode next to one KUM that also lacks it.
function fixture() {
  const lines = ['[GMIFILE_ASCII]', '_VERSION 2', '_FILETYPE GMI', '_INDEX !!!!!!!!!!!!!!!!!!!!', 'COSYS_EPSG 25832',
    '[L_]', '_FIELDNAMES Tema;Material;Dimensjon;Rørform;VertikalDimensjon;Stedfestingsårsak;Merknad;',
    '[P_]', '_FIELDNAMES Tema;Byggemetode;Stedfestingsårsak;Merknad;', '[+L_]'];
  LINE_NUMBERS.forEach((number, index) => lines.push(`:L ${number}`,
    `_FIELDVALUES VL;${index === 0 ? 'AN' : 'PE100'};110;${index === 3 ? '' : 'S'};;UENDR;Ledning ${String.fromCharCode(65 + index)};`,
    '/XYZ', `581940 ${6566000 + index * 3} 101`, `581945 ${6566001 + index * 3} 101`));
  lines.push('[+P_]');
  POINT_NUMBERS.forEach((number, index) => {
    const tema = index === 0 ? 'KUM' : index % 2 ? 'LOK' : 'TOP';
    lines.push(`:P ${number}`, `_FIELDVALUES ${tema};${index === 2 ? 'B' : ''};UENDR;Punkt ${index};`, '/XYZ', `581942 ${6566000 + index} 101`);
  });
  lines.push('[END]', '');
  return encodeSingleByte(lines.join('\r\n'));
}

test('Slice 3 production: LOK/TOP Byggemetode, blocked VertikalDimensjon navigation and standard Data Table Nr.',
  { skip: !app || !chromePath, timeout: 240000 }, async (t) => {
    const directory = await mkdtemp(path.join(path.resolve(tmpdir()), 'gmi-slice3-'));
    const file = path.join(directory, 'Synthetic slice3.gmi');
    await writeFile(file, fixture());
    const browser = await openTestChrome();
    const click = (label, root = 'document') => browser.evaluate(`(() => { const e = Array.from((${root}).querySelectorAll('button')).find(e => e.innerText.trim() === ${JSON.stringify(label)} || e.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!e || e.disabled) throw new Error('Unavailable: ' + ${JSON.stringify(label)}); e.click(); })()`);
    const geometry = (label) => browser.evaluate(`Array.from(document.querySelector('[role=tablist][aria-label=Geometri]').querySelectorAll('button')).find(e => e.innerText.startsWith(${JSON.stringify(label)})).click()`);
    const ruleButton = (label) => `document.querySelector('button[aria-label^="${label}:"]')`;
    const field = async (label) => {
      await browser.waitFor(ruleButton(label));
      if (await browser.evaluate(`${ruleButton(label)}.getAttribute('aria-expanded') !== 'true'`)) await browser.evaluate(`${ruleButton(label)}.click()`);
      await click(`Vis detaljer: ${label}`);
      await browser.waitFor(`document.querySelector('button[aria-label="Lukk feltinspektør"], button[aria-label="Lukk feltinformasjon"]')`);
    };
    const rows = () => browser.evaluate(`Array.from(${grid}.querySelectorAll('[data-table-row]')).map(e => Number(e.dataset.tableRow))`);
    const numbers = () => browser.evaluate(`Array.from(${grid}.querySelectorAll('[data-table-row] .gmi-object-number')).map(e => e.innerText.trim())`);
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
      await browser.evaluate(`document.querySelector('[title="Synthetic slice3.gmi"]').click()`);

      await browser.waitFor('document.querySelector(".leaflet-container")');
      const sidebarFacts = () => browser.evaluate(`(() => { const side = document.querySelector('.workspace-left').getBoundingClientRect(), map = document.querySelector('.leaflet-container').getBoundingClientRect(); return [side.width, map.left]; })()`);
      const sharedSidebar = new Map();
      for (const [width, height] of [[1280, 720], [1366, 768]]) {
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        sharedSidebar.set(width, await sidebarFacts());
      }

      await t.test('standard Data Table shows original nonconsecutive point and line numbers', async () => {
        if (!await browser.evaluate(`Boolean(${table})`)) await click('Åpne datatabell');
        await browser.waitFor(table);
        if (await browser.evaluate(`${table}.dataset.tableGeometry !== 'punkter'`)) await click('Punkter', table);
        await browser.waitFor(`${table}.dataset.tableGeometry === 'punkter' && ${grid}?.querySelectorAll('[data-table-row]').length > 0`);
        assert.equal(await browser.evaluate('Boolean(document.querySelector(".gmi-edit-workspace"))'), false, 'ordinary table, not Rettinger');
        const headers = await browser.evaluate(`Array.from(${grid}.querySelectorAll('[role=columnheader]')).map(e => e.innerText.trim())`);
        assert.equal(headers.filter((header) => header === 'Nr.').length, 1, JSON.stringify(headers));
        const visible = await numbers();
        assert.deepEqual(visible, POINT_NUMBERS.slice(0, visible.length).map(String), 'gaps are preserved');
        assert.equal(await browser.evaluate(`${grid}.querySelector('[data-table-row="0"] .gmi-object-number').getAttribute('title')`), 'Punkt 3');
        // Sorting by Nr. reverses by the original number, not by row position.
        // Numeric columns sort descending first in TanStack; descending then ascending by original number.
        await browser.evaluate(`${grid}.querySelector('[role=columnheader] button[aria-label="Sorter etter objektnummer"]').click()`);
        await browser.waitFor(`${grid}.querySelector('[data-table-row] .gmi-object-number')?.innerText.trim() === '35'`);
        assert.deepEqual((await numbers()).slice(0, 3), ['35', '34', '33']);
        await browser.evaluate(`${grid}.querySelector('[role=columnheader] button[aria-label="Sorter etter objektnummer"]').click()`);
        await browser.waitFor(`${grid}.querySelector('[data-table-row] .gmi-object-number')?.innerText.trim() === '3'`);
        assert.deepEqual((await numbers()).slice(0, 4), ['3', '4', '5', '6']);
        // Search by text still filters; identity stays on the source object.
        await browser.evaluate(`(() => { const e = ${table}.querySelector('[aria-label="Søk i data"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, 'Punkt 8'); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        await browser.waitFor(`${grid}.querySelectorAll('[data-table-row]').length === 1`);
        assert.deepEqual(await numbers(), ['20']);
        await browser.evaluate(`(() => { const e = ${table}.querySelector('[aria-label="Søk i data"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ''); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        await click('Ledninger', table);
        await browser.waitFor(`${table}.dataset.tableGeometry === 'ledninger' && ${grid}?.querySelectorAll('[data-table-row]').length === 5`);
        assert.deepEqual([...await numbers()].sort(), LINE_NUMBERS.map(String));
        assert.equal(await browser.evaluate(`${grid}.querySelector('[data-table-row="2"] .gmi-object-number').getAttribute('title')`), 'Ledning 3');
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          await browser.waitFor(`${grid}.querySelectorAll('[data-table-row]').length === 5`);
          const geometryFacts = await browser.evaluate(`(() => {
            const row = ${grid}.querySelector('[data-table-row]');
            const cells = Array.from(row.children);
            const numberCell = row.querySelector('.gmi-object-number').closest('[role=gridcell]');
            const zoomCell = row.querySelector('[role=gridcell]');
            return { page: document.documentElement.scrollWidth, rowHeight: row.getBoundingClientRect().height,
              numberSticky: getComputedStyle(numberCell).position, numberLeft: numberCell.style.left,
              numberAfterZoom: Math.round(numberCell.getBoundingClientRect().left - zoomCell.getBoundingClientRect().right),
              numberOpaque: getComputedStyle(numberCell).backgroundColor !== 'rgba(0, 0, 0, 0)',
              tableBottom: ${table}.getBoundingClientRect().bottom, cellCount: cells.length };
          })()`);
          assert(geometryFacts.page <= width, `no horizontal page scroll at ${width}`);
          assert.equal(Math.round(geometryFacts.rowHeight), 28, '28px virtual rows are preserved');
          assert.equal(geometryFacts.numberSticky, 'sticky', 'Nr. is a sticky identity column');
          assert.equal(geometryFacts.numberLeft, '32px', 'Nr. sticks right after the 32px zoom cell');
          assert.equal(geometryFacts.numberAfterZoom, 0);
          assert(geometryFacts.numberOpaque, 'sticky Nr. cell is opaque');
          assert(geometryFacts.tableBottom <= height + 1);
          await shot(`slice3-standard-table-${width}x${height}`);
        }
        await browser.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
      });

      await t.test('Byggemetode: missing on LOK/TOP gives neither Feil nor Sjekk; KUM still does', async () => {
        await browser.waitFor('document.querySelector("button[aria-label=Validator]")');
        await browser.evaluate(`document.querySelector('button[aria-label=Validator]').click()`);
        await browser.waitFor('document.querySelector("#validation-v2-layer")');
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          assert.deepEqual(await sidebarFacts(), sharedSidebar.get(width), 'Validator shares Layer Manager width and map edge');
        }
        await geometry('Punkter');
        await field('Byggemetode');
        const target = `Array.from(document.querySelectorAll('button[aria-label*="objekter i tabell:"]')).find(e => e.closest('section[data-validation-tone]'))`;
        await browser.waitFor(target);
        assert.equal(await browser.evaluate(`Array.from(document.querySelectorAll('section[data-validation-tone] button[aria-label*="objekter i tabell:"]')).length`), 1);
        await browser.evaluate(`${target}.click()`);
        await browser.waitFor(`${table}?.dataset.tableGeometry === 'punkter' && ${grid}?.querySelectorAll('[data-table-row]').length === 1`);
        assert.deepEqual(await rows(), [0], 'only the KUM is flagged');
        assert.deepEqual(await numbers(), ['3']);
      });

      await t.test('blocked VertikalDimensjon opens and selects the pipe whose Rørform is missing', async () => {
        await geometry('Ledninger');
        await field('Material');
        await browser.waitFor(`document.querySelector('section.gmi-validation-panel[data-validation-tone="warning"]')`);
        // Capture an ordinary CHECK panel for computed-colour parity.
        const checkStyle = await browser.evaluate(`(() => { const e = document.querySelector('section.gmi-validation-panel[data-validation-tone="warning"]');
          if (!e) return null; const s = getComputedStyle(e); return [s.backgroundColor, s.borderTopColor, getComputedStyle(e.querySelector('.gmi-validation-accent')).color]; })()`);
        await field('Rørform');
        const failure = `Array.from(document.querySelectorAll('button[aria-label*="objekter i tabell:"]')).find(e => e.closest('section[data-validation-tone]')?.dataset.validationTone === 'error')`;
        await browser.waitFor(failure);
        await field('VertikalDimensjon');
        const note = `document.querySelector('section[data-dependency-note="PIPE_SHAPE_UNRESOLVED"]')`;
        await browser.waitFor(note);
        assert.equal(await browser.evaluate(`${note}.dataset.validationTone`), 'warning');
        assert.match(await browser.evaluate(`${note}.querySelector('.gmi-validation-accent').innerText`), /Sjekk \u00b7 1 objekt/i);
        const noteStyle = await browser.evaluate(`(() => { const e = ${note}, s = getComputedStyle(e); return [s.backgroundColor, s.borderTopColor, getComputedStyle(e.querySelector('.gmi-validation-accent')).color]; })()`);
        assert(checkStyle, 'ordinary CHECK panel available');
        assert.deepEqual(noteStyle, checkStyle);
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          await shot(`acceptance-sjekk-${width}x${height}`);
        }
        assert.match(await browser.evaluate(`${note}.innerText`), /Rørform/);
        assert.equal(await browser.evaluate(`document.querySelectorAll('section[data-validation-tone="error"]').length`), 0, 'no duplicate Feil on VertikalDimensjon');
        const action = `${note}.querySelector('button[aria-label*="objekter i tabell:"]')`;
        await browser.waitFor(action);
        assert.equal(await browser.evaluate(`${action}.innerText.trim()`), 'Vis 1 objekt');
        assert.equal(await browser.evaluate(`${ruleButton('VertikalDimensjon')}.getAttribute('aria-label')`).then((label) => /Sjekk/.test(label)), true);
        await browser.evaluate(`${action}.click()`);
        await browser.waitFor(`${table}?.dataset.tableGeometry === 'ledninger' && ${grid}?.querySelectorAll('[data-table-row]').length === 1`);
        assert.deepEqual(await rows(), [3]);
        assert.deepEqual(await numbers(), ['4']);
        assert.match(await browser.evaluate(`${table}.innerText`), /VertikalDimensjon kunne ikke vurderes/);
        // Row inspection makes it the active object; the checkbox selects it for the shared handoff.
        await browser.evaluate(`${grid}.querySelector('[data-table-row="3"]').click()`);
        await browser.waitFor(`${grid}.querySelector('[data-table-row="3"]').getAttribute('aria-current') === 'true'`);
        await browser.waitFor(box(3)); await browser.evaluate(`${box(3)}.click()`);
        await browser.waitFor(`${bar}?.innerText.includes('1 valgt')`);
        await browser.waitFor(`${halos}.length === 1`);
        await assertTableRowFill(browser, `${grid}.querySelector('[data-table-row="3"]')`, { selected: true, active: true });
        await shot('slice3-vertical-dependency-selected');
        await click('Åpne i Rettinger (1)', bar);
        await browser.waitFor(`${editor}?.dataset.gmiObject === 'line:3'`);
        await browser.waitFor(`${grid}?.querySelector('[data-table-row="3"][aria-current=true]')`);
        assert.equal(await browser.evaluate('document.querySelector("[data-gmi-validator-provenance]")?.innerText.includes("VertikalDimensjon")'), true);
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          assert.deepEqual(await sidebarFacts(), sharedSidebar.get(width), 'Rettinger shares Layer Manager width and map edge');
          assert(await browser.evaluate(`(() => { const e = ${bar}; return !e || e.scrollWidth <= e.clientWidth + 1; })()`), 'Rettinger table bar fits');
          await shot(`acceptance-rettinger-${width}x${height}`);
        }
        await click('Lukk Rettinger');
        await browser.waitFor('!document.querySelector(".gmi-edit-workspace")');
      });

      await t.test('FOTO shares the sidebar width and map edge at both laptop sizes', async () => {
        if (await browser.evaluate('Boolean(document.querySelector("#validation-v2-layer"))')) await click('Lukk Validator');
        await browser.waitFor('document.querySelector(".layer-manager-add-actions")');
        const photo = path.join(directory, 'synthetic.png');
        await writeFile(photo, noGpsPng());
        await clickSourceControl(browser, 'Bilder', 'document');
        await browser.waitFor(importDialog);
        await setPhotoFiles(browser, 'input[aria-label="Velg bildefiler"]', [photo]);
        await createLayerWithoutPlacement(browser);
        await enterEditMode(browser);
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          assert.deepEqual(await sidebarFacts(), sharedSidebar.get(width), 'FOTO shares Lagbehandling, Validator and Rettinger width and map edge');
          const layout = await browser.evaluate(`(() => {
            const map = document.querySelector('.leaflet-container').getBoundingClientRect();
            const inspector = document.querySelector('.photo-workspace-inspector').getBoundingClientRect();
            const overlays = ['.photo-map-display-card', '.photo-edit-command-bar'].map((selector) => document.querySelector(selector));
            const overlaysFit = overlays.every((element) => { const rect = element.getBoundingClientRect();
              return rect.left >= map.left && rect.right <= map.right && rect.top >= map.top && rect.bottom <= map.bottom && element.scrollWidth <= element.clientWidth + 1; });
            const list = document.querySelector('.photo-workspace-list');
            return { map: map.width, inspector: inspector.width, overlaysFit, listFits: list.scrollWidth <= list.clientWidth + 1 }; })()`);
          assert.equal(Math.round(layout.map), Math.round(width - sharedSidebar.get(width)[0] - width * 0.30));
          assert(Math.abs(layout.inspector - width * 0.30) < 1);
          assert(layout.overlaysFit && layout.listFits, JSON.stringify(layout));
          await shot(`batch-a-shared-sidebar-edit-${width}x${height}`);
        }
        await click('Avslutt redigering');
        await browser.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 700, deviceScaleFactor: 1, mobile: false });
        await browser.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
        const narrow = await browser.evaluate(`(() => { const shell = document.querySelector('.photo-workspace-shell');
          const sidebar = document.querySelector('.workspace-left').getBoundingClientRect();
          const map = document.querySelector('.leaflet-container').getBoundingClientRect();
          const inspector = document.querySelector('.photo-workspace-inspector').getBoundingClientRect();
          return { sidebar: sidebar.width, available: shell.clientWidth, mapTop: map.top, sidebarBottom: sidebar.bottom,
            inspectorTop: inspector.top, mapBottom: map.bottom }; })()`);
        assert(narrow.sidebar === narrow.available && narrow.mapTop >= narrow.sidebarBottom - 1 && narrow.inspectorTop >= narrow.mapBottom - 1,
          `FOTO remains stacked on narrow screens: ${JSON.stringify(narrow)}`);
      });
    } finally {
      await browser.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
