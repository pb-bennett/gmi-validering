import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';

const app = process.env.PHOTO_UI_URL;
const grid = `document.querySelector('[role="grid"][aria-label="Objekter i datatabellen"]')`;
const current = `document.getElementById(${grid}.getAttribute('aria-activedescendant'))`;
const editor = 'document.querySelector(".gmi-edit-editor")';

test('R2 production: keyboard rows, virtualization, sorting/search, guarded editing and mouse parity',
  { skip: !chromePath || !app, timeout: 180000 }, async (t) => {
    const directory = await mkdtemp(path.join(path.resolve(tmpdir()), 'gmi-r2-keyboard-'));
    const file = path.join(directory, 'Synthetic keyboard.gmi');
    const source = ['[GMIFILE_ASCII]', '_VERSION 2', '_FILETYPE GMI', '_INDEX !!!!!!!!!!!!!!!!!!!!',
      '_EXTENT 581900 6565900 582100 6566100 !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!', 'COSYS_EPSG 25832',
      '[L_]', '_FIELDNAMES Tema;Material;SDR;Merknad;S_HYPERLINK;', '[P_]', '_FIELDNAMES Tema;Type;', '[+L_]'];
    for (let i = 0; i < 80; i++) source.push(`:L ${i + 1}`, `_FIELDVALUES VL;PE;;Object ${String(i).padStart(3, '0')};h:1(link:"Photo.jpg");`,
      '/XYZ', `581940 ${6566000 + i} 101`, `581945 ${6566001 + i} 101`);
    source.push('[+P_]', ':P 1', '_FIELDVALUES KUM;KBRE;', '/XYZ', '581940 6566000 101', '[END]', '');
    await writeFile(file, source.join('\r\n'), 'ascii');
    const browser = await openTestChrome();
    const key = async (key, modifiers = 0) => {
      const codes = { Tab: 9, Enter: 13, Escape: 27, Home: 36, End: 35, ArrowDown: 40, ArrowUp: 38, ArrowRight: 39, ArrowLeft: 37, F2: 113, ' ': 32 };
      await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key, windowsVirtualKeyCode: codes[key], modifiers,
        ...(key === 'Enter' ? { text: '\r' } : {}) });
      await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode: codes[key], modifiers });
    };
    const tabTo = async (condition, reverse = false) => {
      for (let i = 0; i < 240; i++) {
        if (await browser.evaluate(condition)) return;
        await key('Tab', reverse ? 8 : 0);
      }
      throw new Error(`Cannot Tab to ${condition}: ${await browser.evaluate('JSON.stringify({ active: document.activeElement?.outerHTML.slice(0, 400), dialog: document.querySelector("dialog[open]")?.innerText })')}`);
    };
    const click = (label) => browser.evaluate(`Array.from(document.querySelectorAll('button')).find(e => e.innerText.trim() === ${JSON.stringify(label)} || e.getAttribute('aria-label') === ${JSON.stringify(label)}).click()`);
    const gridFocus = `document.activeElement === ${grid}`;
    const objectIs = (key) => browser.waitFor(`${editor}?.dataset.gmiObject === '${key}'`);
    try {
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm = () => true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")'); await click('Lukk');
      await browser.waitFor('document.querySelector("input[type=file]")');
      await setPhotoFiles(browser, 'input[type=file]', [file]);
      await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await browser.evaluate('document.querySelector("[data-gmi-edit-action]").click()');
      await browser.waitFor(`${grid}?.getAttribute('aria-rowcount') === '81'`);

      await t.test('Tab enters the grid, arrows expose a visible active row and Enter opens its source object', async () => {
        await tabTo(gridFocus);
        await key('Home'); await key('ArrowDown');
        await browser.waitFor(`${current}?.dataset.tableRow === '1'`);
        const appearance = await browser.evaluate(`({ outline: getComputedStyle(${current}).outlineWidth,
          marked: ${current}.dataset.keyboardCurrent, cells: ${current}.querySelectorAll('[role=gridcell]').length,
          selection: ${current}.getAttribute('aria-selected') })`);
        assert.equal(appearance.outline, '2px'); assert.equal(appearance.marked, 'true');
        assert(appearance.cells >= 2); assert.equal(appearance.selection, 'false', 'keyboard navigation alone does not check an object');
        const { nodes } = await browser.send('Accessibility.getFullAXTree');
        const accessibleGrid = nodes.find((node) => node.role?.value === 'grid' && node.name?.value === 'Objekter i datatabellen');
        assert(accessibleGrid && !accessibleGrid.ignored, 'grid is exposed to assistive technology');
        assert(accessibleGrid.properties.some((property) => property.name === 'focused' && property.value.value === true));
        await key('Enter'); await objectIs('line:1');
        assert.equal(await browser.evaluate(`${current}.getAttribute('aria-current')`), 'true');
      });

      await t.test('keyboard editing and row activation retain the existing cancel/confirm draft guard', async () => {
        const input = `${editor}.querySelector('tr[data-field="Merknad"] input')`;
        await tabTo(`document.activeElement === ${input}`, true);
        await browser.send('Input.insertText', { text: 'Keyboard draft' });
        await tabTo(gridFocus);
        await key('ArrowDown'); await key('Enter');
        await browser.waitFor('document.querySelector("dialog[open][data-gmi-confirm=workspace]")');
        await tabTo(`document.activeElement?.innerText.trim() === 'Avbryt'`); await key('Enter');
        await browser.waitFor('!document.querySelector("dialog[open][data-gmi-confirm=workspace]")');
        await objectIs('line:1');
        assert.match(await browser.evaluate(`${input}.value`), /Keyboard draft/);
        await tabTo(gridFocus); await key('Enter');
        await browser.waitFor('document.querySelector("dialog[open][data-gmi-confirm=workspace]")');
        await tabTo(`document.activeElement?.innerText.trim() === 'Forkast skjemaet'`); await key('Enter');
        await objectIs('line:2');
      });

      await t.test('End/Home reach unmounted source rows; scrolling keeps a valid active descendant; F2/Escape reach tools', async () => {
        await tabTo(gridFocus);
        assert.equal(await browser.evaluate(`Boolean(${grid}.querySelector('[data-table-row="79"]'))`), false);
        await key('End'); await browser.waitFor(`${current}?.dataset.tableRow === '79'`);
        await browser.waitFor(`${current}.getBoundingClientRect().bottom <= ${grid}.getBoundingClientRect().bottom + 2`);
        await key('Enter'); await objectIs('line:79');
        await key('F2');
        assert.equal(await browser.evaluate('document.activeElement.getAttribute("aria-label")'), 'Zoom til');
        await key('ArrowRight');
        assert.equal(await browser.evaluate('document.activeElement.getAttribute("aria-label")'), 'Kopier filnavn Photo.jpg');
        await key('ArrowLeft');
        assert.equal(await browser.evaluate('document.activeElement.getAttribute("aria-label")'), 'Zoom til');
        await key('Escape'); assert.equal(await browser.evaluate(gridFocus), true);
        await browser.evaluate(`${grid}.scrollTop = 0`);
        await browser.waitFor(`${grid}.scrollTop === 0`);
        assert.equal(await browser.evaluate(`${current}.dataset.tableRow`), '79', 'cursor source identity survives scroll recycling');
        await key('Home'); await browser.waitFor(`${current}?.dataset.tableRow === '0'`);
      });

      await t.test('native sorting buttons and search preserve results/source identity; mouse row activation remains unchanged', async () => {
        await tabTo('document.activeElement?.getAttribute("aria-label") === "Sorter etter Merknad"');
        await key('Enter');
        await browser.waitFor(`${grid}.querySelector('[aria-sort=ascending]')`);
        await key('Enter');
        await browser.waitFor(`${grid}.querySelector('[aria-sort=descending]')`);
        await tabTo('document.activeElement?.getAttribute("aria-label") === "Søk i data"', true);
        await browser.send('Input.insertText', { text: 'Object 07' });
        await browser.waitFor(`${grid}.getAttribute('aria-rowcount') === '11'`);
        await tabTo(gridFocus); await key('Home');
        await browser.waitFor(`${current}?.dataset.tableRow === '79'`);
        await key('ArrowDown'); await key('Enter'); await objectIs('line:78');
        await browser.evaluate(`${grid}.querySelector('[data-table-row="77"]').click()`); await objectIs('line:77');
        assert.equal(await browser.evaluate(`${grid}.querySelector('[data-table-row="77"]').getAttribute('aria-current')`), 'true');
        assert.equal(await browser.evaluate('document.querySelector("[data-table-geometry]").dataset.tableGeometry'), 'ledninger');
      });
      await t.test('empty search removes the cursor safely; clearing search and explicit point switching keep keyboard navigation usable', async () => {
        await tabTo('document.activeElement?.getAttribute("aria-label") === "Søk i data"', true);
        await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', windowsVirtualKeyCode: 65, modifiers: 2 });
        await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', windowsVirtualKeyCode: 65, modifiers: 2 });
        await browser.send('Input.insertText', { text: 'no matching objects' });
        await browser.waitFor(`${grid}.getAttribute('aria-rowcount') === '1'`);
        await tabTo(gridFocus); await key('ArrowDown'); await key('Enter');
        assert.equal(await browser.evaluate(`${grid}.getAttribute('aria-activedescendant')`), null);
        await tabTo('document.activeElement?.getAttribute("aria-label") === "Tøm søk"', true); await key('Enter');
        await browser.waitFor(`${grid}.getAttribute('aria-rowcount') === '81'`);
        await tabTo(`document.activeElement?.innerText.trim() === 'Punkter' && Boolean(document.activeElement.closest('[data-table-geometry]'))`, true);
        await key('Enter'); await browser.waitFor('document.querySelector("[data-table-geometry]").dataset.tableGeometry === "punkter"');
        await tabTo(gridFocus); await key('Home'); await key('Enter'); await objectIs('point:0');
      });
      assert.equal(browser.events.filter((event) => event.method === 'Runtime.exceptionThrown').length, 0);
    } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
  });
