import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';

const app = process.env.PHOTO_UI_URL;
const grid = `document.querySelector('[role="grid"]')`;
const workspace = `document.querySelector('.gmi-edit-workspace')`;
const bar = `document.querySelector('[data-gmi-selection-bar]')`;
const editor = `document.querySelector('.gmi-edit-editor')`;
const header = `${grid}.querySelector('[role=columnheader] input[type=checkbox]')`;
const box = (index) => `${grid}.querySelector('[data-table-row="${index}"] input[type=checkbox]')`;
const halos = `Array.from(document.querySelectorAll('.leaflet-gmi-edit-selection-pane path.gmi-edit-selection-halo')).filter(e => Number(e.getAttribute('opacity') ?? e.getAttribute('stroke-opacity')) > 0)`;

test('R3 production: source-bound snapshot selection, full filtered model, teal controls, independent navigation and lifecycle',
  { skip: !app || !chromePath, timeout: 240000 }, async (t) => {
    const directory = await mkdtemp(path.join(path.resolve(tmpdir()), 'gmi-r3-selection-'));
    const file = path.join(directory, 'Synthetic selection.gmi');
    const source = ['[GMIFILE_ASCII]', '_VERSION 2', '_FILETYPE GMI', '_INDEX !!!!!!!!!!!!!!!!!!!!',
      '_EXTENT 581900 6565900 582100 6566100 !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!', 'COSYS_EPSG 25832',
      '[L_]', '_FIELDNAMES Tema;Material;SDR;Merknad;', '[P_]', '_FIELDNAMES Tema;Type;', '[+L_]'];
    for (let i = 0; i < 80; i++) source.push(`:L ${i + 1}`, `_FIELDVALUES VL;${i % 2 ? 'PVC' : 'PE'};;Object ${String(i).padStart(3, '0')};`, '/XYZ', `581940 ${6566000 + i} 101`, `581945 ${6566001 + i} 101`);
    source.push('[+P_]', ':P 1', '_FIELDVALUES KUM;KBRE;', '/XYZ', '581940 6566000 101', '[END]', '');
    await writeFile(file, source.join('\r\n'), 'ascii');
    const browser = await openTestChrome();
    const click = (label, root = 'document', prefix = false) => browser.evaluate(`(() => {
      const button = Array.from((${root}).querySelectorAll('button')).find(e => e.getAttribute('aria-label') === ${JSON.stringify(label)} ||
        ${prefix ? `e.innerText.trim().startsWith(${JSON.stringify(label)})` : `e.innerText.trim() === ${JSON.stringify(label)}`});
      if (!button) throw new Error('Missing ' + ${JSON.stringify(label)}); button.click();
    })()`);
    const input = (expression, value) => browser.evaluate(`(() => { const input = ${expression}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const key = async (name, modifiers = 0) => {
      const codes = { ' ': 32, Enter: 13, F2: 113, Escape: 27, ArrowDown: 40, ArrowLeft: 37 };
      await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, windowsVirtualKeyCode: codes[name], modifiers, ...(name === 'Enter' ? { text: '\r' } : {}) });
      await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, windowsVirtualKeyCode: codes[name], modifiers });
    };
    const selectionText = () => browser.evaluate(`${bar}?.innerText || ''`);
    const checkedRows = () => browser.evaluate(`Array.from(${grid}.querySelectorAll('[data-table-row][aria-selected=true]')).map(e => Number(e.dataset.tableRow)).sort((a,b) => a-b)`);
    const waitTotal = (total) => browser.waitFor(`${bar}?.innerText.includes('${total} valgt')`);
    try {
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm = () => true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")'); await click('Lukk');
      await setPhotoFiles(browser, 'input[type=file]', [file]);
      await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await browser.evaluate(`document.querySelector('[title="Synthetic selection.gmi"]').click()`);
      await click('Åpne datatabell'); await click('Ledninger', `document.querySelector('[data-table-geometry]')`);
      assert.equal(await browser.evaluate(`${grid}.querySelectorAll('[data-table-row] input').length`), 0, 'base table has no selection controls');
      await click('Felt', 'document', true); await click('Material', 'document', true);
      await browser.evaluate(`Array.from(document.querySelectorAll('tr')).find(e => e.innerText.includes('PVC')).click()`);
      await browser.evaluate(`document.querySelector('[data-gmi-edit-action]').click()`);
      await browser.waitFor(header);
      await browser.waitFor(`${grid}.getAttribute('aria-rowcount') === '41'`);

      await t.test('individual checkboxes do not open objects; rendered checked/indeterminate controls are teal and centred', async () => {
        for (const index of [0, 2, 12]) await browser.evaluate(`${box(index)}.click()`);
        await waitTotal(3);
        assert.equal(await browser.evaluate(`${editor}?.dataset.gmiObject || null`), null);
        await browser.waitFor(`${header}.indeterminate`);
        const appearance = await browser.evaluate(`(() => {
          const elements = [${header}, ${box(0)}];
          return elements.map(e => { const r=e.getBoundingClientRect(), c=e.parentElement.getBoundingClientRect(); return {
            accent: getComputedStyle(e).accentColor, x: Math.abs((r.left+r.right-c.left-c.right)/2), y: Math.abs((r.top+r.bottom-c.top-c.bottom)/2), checked: e.checked, indeterminate: e.indeterminate }; });
        })()`);
        assert(appearance.every((e) => e.accent === 'rgb(0, 117, 149)' && e.x <= 1 && e.y <= 1));
        assert.equal(appearance[0].indeterminate, true); assert.equal(appearance[1].checked, true);
        const bounds = await browser.evaluate(`${grid}.getBoundingClientRect().toJSON()`);
        const { data } = await browser.send('Page.captureScreenshot', { format: 'png', clip: { x: bounds.x, y: bounds.y, width: Math.min(bounds.width, 650), height: Math.min(bounds.height, 200), scale: 1 } });
        await writeFile(path.join(tmpdir(), 'gmi-r3-rendered-checkboxes.png'), Buffer.from(data, 'base64'));
        await browser.waitFor(`${halos}.length === 3`);
        assert.equal(await browser.evaluate(`getComputedStyle(${halos}[0]).stroke`), 'rgb(0, 117, 149)');
        const paths = await browser.evaluate(`${halos}.map(e => e.getAttribute('d')).sort()`);
        await browser.evaluate(`${box(12)}.click(); ${box(4)}.click()`);
        await waitTotal(3);
        await browser.waitFor(`JSON.stringify(${halos}.map(e => e.getAttribute('d')).sort()) !== ${JSON.stringify(JSON.stringify(paths))}`);
        await browser.evaluate(`${box(4)}.click(); ${box(12)}.click()`); await waitTotal(3);
      });

      await t.test('search hides one selection; show-only restores all selected rows without changing Felt/search', async () => {
        await input(`document.querySelector('[aria-label="Søk i data"]')`, 'Object 00');
        await browser.waitFor(`${grid}.getAttribute('aria-rowcount') === '6'`);
        assert.match(await selectionText(), /3 valgt · 2 synlige · 1 skjult/);
        await click('Bare valgte', bar);
        await browser.waitFor(`${grid}.getAttribute('aria-rowcount') === '4'`);
        assert.deepEqual(await checkedRows(), [0, 2, 12]);
        assert.match(await selectionText(), /3 valgt · 3 vises · 2 treffer filter\/søk\/visning · 1 utenfor/);
        assert.match(await browser.evaluate(`document.querySelector('[data-table-geometry]').innerText`), /3 valgte ledninger/);
        assert.equal(await browser.evaluate(`document.querySelector('[aria-label="Søk i data"]').value`), 'Object 00');
        await click('Filtrert visning', bar);
        await browser.waitFor(`${grid}.getAttribute('aria-rowcount') === '6'`);
        assert.match(await selectionText(), /3 valgt · 2 synlige · 1 skjult/);
      });

      await t.test('selection bypasses draft guard; keyboard Space selects while Enter still navigates through the guard', async () => {
        await browser.evaluate(`${grid}.querySelector('[data-table-row="0"]').click()`);
        await browser.waitFor(`${editor}?.dataset.gmiObject === 'line:0'`);
        await input(`${editor}.querySelector('tr[data-field="Merknad"] input')`, 'Selection draft');
        await browser.evaluate(`${box(2)}.click()`); await waitTotal(2);
        assert.equal(await browser.evaluate('Boolean(document.querySelector("dialog[open]"))'), false);
        await browser.evaluate(`${grid}.focus()`); await key(' '); await waitTotal(1); await key(' '); await waitTotal(2);
        await key('ArrowDown'); await key(' ', 8); await waitTotal(3);
        assert.equal(await browser.evaluate('Boolean(document.querySelector("dialog[open]"))'), false);
        await key('Enter'); await browser.waitFor('document.querySelector("dialog[open][data-gmi-confirm=workspace]")');
        await click('Avbryt', `document.querySelector('dialog[open]')`);
        assert.match(await browser.evaluate(`${editor}.querySelector('tr[data-field="Merknad"] input').value`), /Selection draft/);
        await click('Forkast skjema', editor);
      });

      await t.test('bulk selection spans the full virtualized filtered model; sorting, stage, proposed, undo/redo preserve identity', async () => {
        await input(`document.querySelector('[aria-label="Søk i data"]')`, '');
        await browser.waitFor(`${grid}.getAttribute('aria-rowcount') === '41'`);
        assert(await browser.evaluate(`${grid}.querySelectorAll('[data-table-row]').length < 40`));
        await browser.evaluate(`${header}.click()`); await waitTotal(40);
        await browser.waitFor(`${header}.checked && !${header}.indeterminate`);
        await click('Sorter etter Merknad'); await click('Sorter etter Merknad');
        await waitTotal(40);
        await input(`${editor}.querySelector('tr[data-field="SDR"] input')`, '11.0');
        await click('Se gjennom (1)', editor); await click('Legg til retting', editor);
        await click('Foreslått', `document.querySelector('.gmi-edit-table-modes')`); await waitTotal(40);
        await click('Angre siste retting', workspace); await waitTotal(40);
        await click('Gjør om retting', workspace); await waitTotal(40);
        const persisted = await browser.evaluate('JSON.stringify(JSON.parse(localStorage.getItem("gmi-validator-storage")).state)');
        assert(!persisted.includes('gmiEditSelection'));
      });

      await t.test('geometry changes preserve selection; cross-geometry replacement is explicit; map updates and clear remove the channel', async () => {
        await click('Punkter', `document.querySelector('[data-table-geometry]')`);
        await browser.waitFor(`${grid}.getAttribute('aria-rowcount') === '2'`);
        await waitTotal(40);
        await browser.evaluate(`${box(0)}.click()`);
        await browser.waitFor('document.querySelector("dialog[open][data-gmi-confirm=selection]")');
        const wording = await browser.evaluate('document.querySelector("dialog[open][data-gmi-confirm=selection]").innerText');
        assert.match(wording, /Erstatt 40 valgte ledninger med ett punkt\?/);
        assert.match(wording, /fjernes de 40 valgte ledningene fra utvalget/);
        await click('Avbryt', `document.querySelector('dialog[open]')`); await waitTotal(40);
        await browser.evaluate(`${box(0)}.click()`);
        await click('Erstatt utvalget', `document.querySelector('dialog[open]')`); await waitTotal(1);
        await browser.waitFor(`${halos}.length === 1`);
        await click('Fjern utvalg', bar); await browser.waitFor(`!${bar}`);
        await browser.waitFor(`${halos}.length === 0`);
      });

      await t.test('exit and source removal/reimport clear selection and restore the ordinary table', async () => {
        await browser.evaluate(`${box(0)}.click()`); await waitTotal(1);
        await click('Tilbake til appen', workspace); await browser.waitFor(`!${workspace}`);
        await browser.waitFor(`!${bar}`);
        assert.equal(await browser.evaluate(`${grid}.querySelectorAll('[data-table-row] input').length`), 0);
        await browser.evaluate(`document.querySelector('[data-gmi-edit-action]').click()`);
        await browser.waitFor(header); assert.equal(await browser.evaluate(`Boolean(${bar})`), false);
        await click('Forkast alle', workspace);
        await click('Forkast alle', `document.querySelector('dialog[open]')`);
        await click('Tilbake til appen', workspace);
        await click('Fjern lag');
        await click('Fjern');
        await click('Åpne fil'); await setPhotoFiles(browser, 'input[type=file]', [file]);
        await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
        await browser.evaluate(`document.querySelector('[data-gmi-edit-action]').click()`);
        await browser.waitFor(header); assert.equal(await browser.evaluate(`Boolean(${bar})`), false);
      });
      assert.equal(browser.events.filter((event) => event.method === 'Runtime.exceptionThrown').length, 0);
    } finally { await browser.close(); assert.equal(path.dirname(directory), path.resolve(tmpdir())); await rm(directory, { recursive: true, force: true }); }
  });
