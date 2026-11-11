import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { GMI_EDIT_FIXTURE_DIR } from './helpers/gmiEditFixtures.mjs';
import { clickGmiTableObject } from './helpers/gmiTableNavigation.mjs';
const app = process.env.PHOTO_UI_URL;
const workspace = 'document.querySelector(".gmi-edit-workspace")';
const table = 'document.querySelector("[data-table-geometry]")';
const editor = 'document.querySelector("[data-gmi-object]")';

test('R6B production: Filter default, table-only object navigation, GUID search, editing/history, guards and three layouts',
  { skip: !chromePath || !app, timeout: 180000 }, async (t) => {
    const browser = await openTestChrome();
    const file = path.join(GMI_EDIT_FIXTURE_DIR, 'core-crlf-latin1.gmi'), bytes = await readFile(file);
    const click = (label, root = 'document') => browser.evaluate(`(() => { const e = Array.from((${root}).querySelectorAll('button')).find(e => e.innerText.trim() === ${JSON.stringify(label)} || e.getAttribute('aria-label') === ${JSON.stringify(label)});
      if (!e || e.disabled) throw new Error('Unavailable: ' + ${JSON.stringify(label)}); e.click(); })()`);
    const input = (selector, value) => browser.evaluate(`(() => { const e = ${selector}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const edit = (field, value) => input(`${editor}.querySelector('tr[data-field="${field}"] input')`, value);
    const text = (expression) => browser.evaluate(`${expression}.innerText`);
    const focus = async (key) => { await clickGmiTableObject(browser, key); await browser.waitFor(`${editor}?.dataset.gmiObject === ${JSON.stringify(key)}`); };
    const open = async () => {
      await browser.evaluate(`document.querySelector('[data-gmi-edit-action]').click()`);
      await browser.waitFor(`${workspace}?.querySelector('[data-gmi-edit-status]')?.innerText === 'Redigerbar'`);
    };
    const tabs = () => browser.evaluate(`Array.from(${workspace}.querySelectorAll('[role=tab]')).map(e => ({ text: e.innerText, selected: e.getAttribute('aria-selected') }))`);
    try {
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm = () => true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")'); await click('Lukk');
      await setPhotoFiles(browser, 'input[type=file]', [file]);
      await browser.waitFor('document.querySelector("[data-gmi-edit-action]")'); await open();

      await t.test('only Filter and Endringer remain; geometry survives leaving/re-entering', async () => {
        assert.deepEqual(await tabs(), [{ text: 'Filter', selected: 'true' }, { text: 'Endringer', selected: 'false' }]);
        assert.equal(await browser.evaluate(`${workspace}.querySelectorAll('[data-object-key], [aria-label="Objekttype"], [aria-label="Søk etter objekt"]').length`), 0);
        assert.equal(await browser.evaluate(`${table}.dataset.tableGeometry`), 'ledninger');
        await click('Punkter', table);
        await click('Tilbake til appen', workspace); await browser.waitFor(`!${workspace}`);
        await open();
        assert.equal(await browser.evaluate(`${table}.dataset.tableGeometry`), 'punkter');
        assert.equal((await tabs())[0].selected, 'true');
        await click('Ledninger', table);
      });

      await t.test('the table retains top-level GUID search and opens the exact object for a source-safe correction', async () => {
        const search = `${table}.querySelector('[aria-label="Søk i data"]')`;
        await input(search, '5EC0E000-0000-4000-8000-0000000003EA');
        await browser.waitFor(`${table}.querySelectorAll('[data-table-row]').length === 1`);
        assert.equal(await browser.evaluate(`${table}.querySelector('[data-table-row]').dataset.tableRow`), '1');
        await browser.evaluate(`${table}.querySelector('[data-table-row="1"]').click()`);
        await browser.waitFor(`${editor}?.dataset.gmiObject === 'line:1'`);
        assert.equal(await browser.evaluate(`${editor}.querySelector('h2').innerText`), 'Ledning 2');
        await input(search, '0000000003ea');
        await browser.waitFor(`${table}.querySelectorAll('[data-table-row]').length === 1`);
        await input(search, '4000');
        await browser.waitFor(`${table}.querySelectorAll('[data-table-row]').length === 0`);
        await input(search, '');
        await edit('SDR', '11'); await click('Se gjennom (1)', editor);
        await browser.waitFor(`${editor}.querySelector('.gmi-edit-review')`); await click('Legg til retting', editor);
        await browser.waitFor(`${workspace}.querySelector('[data-gmi-edit-counts]')?.innerText.includes('1 retting')`);
      });

      await t.test('Endringer still navigates to objects and details; undo/redo and table modes retain identity', async () => {
        await click('Endringer (1)', workspace);
        await focus('line:2');
        await click('Ledning 2', `${workspace}.querySelector('.gmi-edit-change-objects')`);
        await browser.waitFor(`${editor}?.dataset.gmiObject === 'line:1'`);
        await click('Vis detaljer', workspace);
        await click('Vis i Foreslått', 'document.querySelector(".gmi-edit-inspector")');
        assert.equal(await browser.evaluate(`document.querySelector('.gmi-edit-table-modes').dataset.gmiTableView`), 'proposed');
        await focus('line:1');
        await click('Angre siste retting', workspace);
        await browser.waitFor(`!${workspace}.querySelector('[data-gmi-edit-counts]')`);
        await click('Gjør om retting', workspace);
        await browser.waitFor(`${workspace}.querySelector('[data-gmi-edit-counts]')?.innerText.includes('1 retting')`);
        await click('Original', table);
      });

      await t.test('S6: contextual «Gjør om» after undo restores the same entry, keeps the draft guard and disappears on a new stage', async () => {
        const redoButtons = () => browser.evaluate(`Array.from(${workspace}.querySelectorAll('[data-gmi-context-redo]')).map(e => [e.dataset.gmiContextRedo, e.innerText.trim(), e.tabIndex, e.disabled])`);
        const entry = () => browser.evaluate(`${workspace}.querySelector('[data-change-set]')?.dataset.changeSet ?? null`);
        const id = await entry(), label = await text(`${workspace}.querySelector('.gmi-edit-change-label')`);
        assert(id && label);
        assert.deepEqual(await redoButtons(), []);
        // 1. Footer undo: notice and Endringer both offer the redo; keyboard Enter activates it.
        await click('Angre siste retting', workspace);
        await browser.waitFor(`!${workspace}.querySelector('[data-gmi-edit-counts]')`);
        assert((await text(`${workspace}.querySelector('.gmi-edit-notice')`)).startsWith(`Angret: ${label}`));
        assert.deepEqual(await redoButtons(), [['notice', 'Gjør om', 0, false], ['changes', `Gjør om: ${label}`, 0, false]]);
        await browser.evaluate(`${workspace}.querySelector('[data-gmi-context-redo=notice]').focus()`);
        await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
        await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
        await browser.waitFor(`${workspace}.querySelector('[data-gmi-edit-counts]')?.innerText.includes('1 retting')`);
        assert.equal(await entry(), id, 'the same ChangeSet id is restored');
        assert.deepEqual(await redoButtons(), [], 'nothing left to redo');
        assert.match(await text(`${workspace}.querySelector('.gmi-edit-notice')`), /^Gjort om: /);
        assert.equal(await browser.evaluate(`document.activeElement === ${workspace}.querySelector('.gmi-edit-notice')`), true, 'focus is not dropped to body');
        // 2. Undo from the ChangeSet details; redo from Endringer goes through the same draft guard as the footer.
        await click('Vis detaljer', workspace);
        await click('Angre', 'document.querySelector(".gmi-edit-inspector")');
        await browser.waitFor(`!${workspace}.querySelector('[data-gmi-edit-counts]')`);
        assert.equal((await redoButtons()).length, 2);
        await focus('line:0'); await edit('Merknad', 'S6-utkast');
        await click(`Gjør om: ${label}`, workspace);
        const confirm = 'document.querySelector("dialog[open][data-gmi-confirm=workspace]")';
        await browser.waitFor(confirm); await click('Avbryt', confirm);
        assert.equal(await entry(), id, 'redo applied before the guard, exactly as the footer redo');
        assert.equal(await browser.evaluate(`${editor}.dataset.gmiObject`), 'line:0');
        assert.equal(await browser.evaluate(`${editor}.querySelector('tr[data-field=Merknad] input').value`), 'S6-utkast', 'draft kept');
        await click('Forkast skjema', editor);
        // 3. A new stage clears the redo stack: both contextual actions disappear.
        await click('Angre siste retting', workspace);
        await browser.waitFor(`${workspace}.querySelector('[data-gmi-context-redo=notice]')`);
        await focus('line:1');
        await edit('SDR', '11'); await click('Se gjennom (1)', editor);
        await browser.waitFor(`${editor}.querySelector('.gmi-edit-review')`); await click('Legg til retting', editor);
        await browser.waitFor(`${workspace}.querySelector('[data-gmi-edit-counts]')?.innerText.includes('1 retting')`);
        assert.notEqual(await entry(), id);
        assert.deepEqual(await redoButtons(), []);
        assert.equal(await browser.evaluate(`${workspace}.querySelector('.gmi-edit-history [aria-label="Gjør om retting"]').getAttribute('aria-disabled')`), 'true');
      });

      await t.test('row navigation still guards drafts; table closure has an accessible reopen path', async () => {
        await edit('Merknad', 'Behold R6B-utkast');
        await clickGmiTableObject(browser, 'line:0');
        const confirm = 'document.querySelector("dialog[open][data-gmi-confirm=workspace]")';
        await browser.waitFor(confirm); await click('Avbryt', confirm);
        assert.equal(await browser.evaluate(`${editor}.dataset.gmiObject`), 'line:1');
        assert.equal(await browser.evaluate(`${editor}.querySelector('tr[data-field=Merknad] input').value`), 'Behold R6B-utkast');
        await click('Forkast skjema', editor);
        await click('Lukk datatabell'); await browser.waitFor(`!${table}`);
        await click('Åpne datatabell', workspace); await browser.waitFor(table);
        await focus('point:1'); await focus('line:1');
        await click('Filter', workspace);
      });

      await t.test('Filter, Endringer, inspector and footer remain usable at all target sizes', async () => {
        for (const [width, height] of [[1280, 720], [1366, 768], [1920, 1080]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          const geometry = await browser.evaluate(`(() => { const ws = ${workspace}, body = ws.querySelector('.gmi-edit-body'), footer = ws.querySelector('.gmi-edit-footer');
            return { page: document.documentElement.scrollWidth, sidebarOverflow: body.scrollWidth - body.clientWidth, bodyHeight: body.clientHeight, footer: footer.getBoundingClientRect().toJSON() }; })()`);
          assert(geometry.page <= width); assert(geometry.sidebarOverflow <= 1); assert(geometry.bodyHeight > 150);
          assert(geometry.footer.bottom <= height && geometry.footer.top > 0);
          if (process.env.GMI_EDIT_SCREENSHOT_DIR) {
            await mkdir(process.env.GMI_EDIT_SCREENSHOT_DIR, { recursive: true });
            const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
            await writeFile(path.join(process.env.GMI_EDIT_SCREENSHOT_DIR, `r6b-filter-${width}x${height}.png`), Buffer.from(data, 'base64'));
          }
          await click('Endringer (1)', workspace); assert(await browser.evaluate(`Boolean(${workspace}.querySelector('[data-change-set]'))`));
          await click('Filter', workspace);
        }
      });
      assert.deepEqual(await readFile(file), bytes);
      assert.equal(browser.events.filter((e) => e.method === 'Runtime.exceptionThrown').length, 0);
    } catch (error) { console.log(await browser.evaluate('document.body.innerText')); throw error; }
    finally { await browser.close(); }
  });
