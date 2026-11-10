import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { GMI_EDIT_FIXTURE_DIR } from './helpers/gmiEditFixtures.mjs';

const app = process.env.PHOTO_UI_URL;
const table = 'document.querySelector("[data-table-geometry]")';
const workspace = 'document.querySelector(".gmi-edit-workspace")';

test('R1: geometry survives Felt and Tema hide/show; explicit scope and inspection actions still work',
  { skip: !chromePath || !app, timeout: 180000 }, async (t) => {
    const browser = await openTestChrome();
    const click = (label, root = 'document', prefix = false) => browser.evaluate(`(() => {
      const button = Array.from((${root}).querySelectorAll('button')).find(e =>
        e.getAttribute('aria-label') === ${JSON.stringify(label)} ||
        (e.innerText.trim()${prefix ? '.startsWith(' + JSON.stringify(label) + ')' : ' === ' + JSON.stringify(label)}));
      if (!button) throw new Error('Missing button: ' + ${JSON.stringify(label)});
      button.click();
    })()`);
    const geometry = (tab) => browser.waitFor(`${table}?.dataset.tableGeometry === '${tab}'`);
    const stored = () => browser.evaluate('JSON.parse(localStorage.getItem("gmi-validator-storage")).state.ui.layerDataTable.activeTabByLayer');
    const rowCount = (n) => browser.waitFor(`${table}.querySelectorAll('.group.flex.cursor-pointer').length === ${n}`);
    const section = (label) => `Array.from(document.querySelectorAll('button')).find(e => e.innerText.trim().startsWith('${label}')).parentElement`;
    const material = `Array.from((${section('Felt')}).querySelectorAll('button')).find(e => e.innerText.trim().startsWith('Material')).parentElement`;
    try {
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm = () => true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
      await click('Lukk');
      await browser.waitFor('document.querySelector("input[type=file]")');
      await setPhotoFiles(browser, 'input[type=file]', [path.join(GMI_EDIT_FIXTURE_DIR, 'core-crlf-latin1.gmi')]);
      await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');

      await t.test('fresh Rettinger entry and explicit table switches retain one geometry context', async () => {
        await browser.evaluate('document.querySelector("[data-gmi-edit-action]").click()');
        await browser.waitFor(workspace);
        await geometry('ledninger');
        assert.equal(await browser.evaluate(`${workspace}.querySelector('[role=tab][aria-selected=true]').innerText`), 'Filter');
        await click('Punkter', table); await geometry('punkter');
        await click('Ledninger', table); await geometry('ledninger');
        await click('Tilbake til appen', workspace);
        await browser.waitFor(`!${workspace}`);
      });

      await t.test('Felt opens on Ledninger; hide/show does not mutate the persisted tab', async () => {
        // Expand the layer card if needed.
        if (!await browser.evaluate(`Boolean(document.querySelector('button[aria-label="Åpne datatabell"]'))`)) {
          await browser.evaluate(`document.querySelector('[data-gmi-edit-action]').closest('.py-1').querySelector('[title$=".gmi"]').click()`);
        }
        await click('Felt', 'document', true);
        await browser.waitFor(`(${section('Felt')}).innerText.includes('Material')`);
        assert.match(await browser.evaluate(`(${section('Felt')}).querySelector('button.border-b-2')?.innerText || ''`), /Ledninger/);
        await click('Material', section('Felt'), true);
        const before = await stored();
        await click('Skjul alle', material); await rowCount(0); await geometry('ledninger');
        assert.match(await browser.evaluate(`${table}.querySelector('[role=status]').innerText`), /Tema\/Felt/);
        assert.deepEqual(await stored(), before);
        await click('Vis alle', material); await rowCount(3); await geometry('ledninger');
        assert.deepEqual(await stored(), before);
      });

      await t.test('Tema hide/show preserves Ledninger, including across close/reopen', async () => {
        await click('Tema', 'document', true);
        const lines = `Array.from((${section('Tema')}).querySelectorAll('h4')).find(e => e.innerText.trim() === 'LEDNINGER').parentElement`;
        const before = await stored();
        await click('Skjul alle', lines); await rowCount(0); await geometry('ledninger');
        assert.deepEqual(await stored(), before);
        await click('Vis alle', lines); await rowCount(3); await geometry('ledninger');
        assert.deepEqual(await stored(), before);
        await click('Lukk datatabell'); await browser.waitFor(`!${table}`);
        await click('Åpne datatabell'); await geometry('ledninger');
      });

      await t.test('ordinary explicit tabs change geometry and persist the choice', async () => {
        await click('Punkter', table); await geometry('punkter'); await rowCount(3);
        assert.deepEqual(Object.values(await stored()), ['punkter']);
        await click('Ledninger', table); await geometry('ledninger'); await rowCount(3);
        assert.deepEqual(Object.values(await stored()), ['ledninger']);
      });
    } finally { await browser.close(); }
  });
