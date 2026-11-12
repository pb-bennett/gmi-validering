import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { gmiFieldBatchFixture } from './helpers/gmiFieldBatchFixture.mjs';

const app = process.env.PHOTO_UI_URL;
const shots = process.env.GMI_EDIT_SCREENSHOT_DIR || tmpdir();
const inspector = `document.querySelector('[data-gmi-batch-inspector]')`;
const profile = `${inspector}?.querySelector('[data-gmi-selection-profile]')`;
const workspace = `document.querySelector('.gmi-edit-workspace')`;
const grid = `document.querySelector('[role=grid]')`;
const bar = `document.querySelector('[data-gmi-selection-bar]')`;
const confirm = `document.querySelector('dialog[open][data-gmi-confirm=workspace]')`;
const risk = `document.querySelector('dialog[open][data-gmi-confirm=batch-risk]')`;
const box = (index) => `${grid}.querySelector('[data-table-row="${index}"] input[type=checkbox]')`;

// Synthetic lines: Tema, Material, SDR, Trykklasse, Ringstivhet, Dimensjon, Stedfestingsårsak.
const LINE_FIELDS = ['Tema', 'Material', 'SDR', 'Trykklasse', 'Ringstivhet', 'Dimensjon', 'Stedfestingsårsak'];
const LINES = [
  ['VL', 'PE', '', '', '', '110', 'NYTT'], ['VL', 'PE', '', '', '', '110', 'NYTT'], ['VL', 'PVC', '', '', '', '160', 'UENDR'],
  ['SP', '', '', '', '', '160', 'NYTT'], ['VL', '', '', '', '', '110', ''], ['SP', '', '', '', '', '200', 'UENDR'],
];

test('B1 production: selection profile, shrink-only narrowing, preview validity, undo/redo and retained gates',
  { skip: !app || !chromePath, timeout: 240000 }, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gmi-b1-ui-'));
    const file = path.join(directory, 'Synthetic B1.gmi');
    const bytes = gmiFieldBatchFixture({ lineFields: LINE_FIELDS, lines: LINES });
    await writeFile(file, bytes);
    const browser = await openTestChrome();
    const click = (label, root = 'document') => browser.evaluate(`(() => {
      const b=Array.from((${root}).querySelectorAll('button')).find(e=>e.innerText.trim()===${JSON.stringify(label)} || e.getAttribute('aria-label')===${JSON.stringify(label)});
      if(!b || b.disabled) throw new Error('Unavailable: '+${JSON.stringify(label)}); b.click(); })()`);
    const choose = (label, value) => browser.evaluate(`(() => { const s=${inspector}.querySelector('[aria-label=${JSON.stringify(label)}]'), select=s.tagName==='SELECT';
      Object.getOwnPropertyDescriptor(select?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(s,${JSON.stringify(value)}); s.dispatchEvent(new Event(select?'change':'input',{bubbles:true})); })()`);
    const ready = () => browser.waitFor(`${inspector}.querySelector('[data-gmi-batch-dry-run]')?.innerText.includes('OK') && ${inspector}.getAttribute('aria-busy')==='false'`);
    const preview = async () => { await click('Forhåndsvis endringer', inspector); await browser.waitFor(`${inspector}.querySelector('[data-gmi-batch-counts]')`); };
    const rowText = (id) => browser.evaluate(`${profile}?.querySelector('[data-profile-field="${id}"]')?.innerText.replace(/\\s+/g,' ').trim()`);
    const groups = (id) => browser.evaluate(`Array.from(${profile}.querySelectorAll('[data-profile-field="${id}"] li')).map(li=>[li.querySelector('.gmi-profile-value').textContent, Number(li.dataset.count)])`);
    const total = () => browser.evaluate(`Number(${profile}?.dataset.total)`);
    const selectedCount = () => browser.evaluate(`Array.from(${grid}.querySelectorAll('[data-table-row] input[type=checkbox]')).filter(e=>e.checked).length`);
    const selectLines = async (indices) => {
      if (await browser.evaluate(`Boolean(${inspector})`)) {
        await click('Avslutt', inspector);
        if (await browser.evaluate(`Boolean(${confirm})`)) await click('Forkast skjemaet', confirm);
        await browser.waitFor(`!${inspector}`);
      }
      if (await browser.evaluate(`Boolean(${bar})`)) await click('Fjern utvalg', bar);
      await click('Ledninger', `document.querySelector('[data-table-geometry]')`);
      await browser.waitFor(box(indices[0]));
      for (const index of indices) await browser.evaluate(`${box(index)}.click()`);
      await click(`Rediger valgte (${indices.length})`, bar); await browser.waitFor(`${profile}`);
    };
    try {
      await browser.send('Runtime.enable');
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm=()=>true;' });
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")'); await click('Lukk');
      await setPhotoFiles(browser, 'input[type=file]', [file]); await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await browser.evaluate(`document.querySelector('[data-gmi-edit-action]').click()`); await browser.waitFor(workspace);

      await t.test('profile distributions, missing values, keyboard narrowing keeps the preview valid; widening invalidates', async () => {
        await selectLines([0, 1, 2, 3, 4]);
        assert.equal(await total(), 5);
        assert.match(await browser.evaluate(`${profile}.innerText`), /Utvalget: 5 ledninger/);
        assert.match(await rowText('tema'), /VL \(4\) · SP \(1\)/);
        assert.match(await rowText('material'), /PE \(2\) · \(tom\) \(2\) · PVC \(1\)|PE \(2\) · PVC \(1\) · \(tom\) \(2\)/);
        assert.deepEqual(await groups('material'), [['PE', 2], ['PVC', 1], ['(tom)', 2]]);
        assert.deepEqual(await groups('dimension'), [['110', 3], ['160', 2]]);
        assert.deepEqual(await groups('positioningCause'), [['NYTT', 3], ['UENDR', 1], ['(tom)', 1]]);
        // A field choice alone is no draft and does not alter the profile.
        await choose('Felt for masseendring', 'SDR'); await choose('Ny verdi', '11');
        await preview(); await ready();
        assert.equal(await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-counts]').dataset.state`), 'valid');
        assert(await browser.evaluate(`Boolean(${profile}.querySelector('[data-profile-field="hydraulicClass"][data-profile-kind=rule]'))`), 'rule context after preview');
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          const measure = () => browser.evaluate(`(() => { const a=${inspector}.closest('aside').getBoundingClientRect(), p=${profile}.getBoundingClientRect();
            return { page: document.documentElement.scrollWidth, left: p.left, right: p.right, asideLeft: a.left, asideRight: a.right, height: p.height,
              overflow: Array.from(${profile}.querySelectorAll('li, dt, dd')).some(e=>e.getBoundingClientRect().right>p.right+1) }; })()`);
          const fits = (bounds) => bounds.page <= width && bounds.right <= bounds.asideRight + 1 && bounds.left >= bounds.asideLeft - 1 && !bounds.overflow;
          // Collapsed by default: one line per field.
          await browser.evaluate(`${profile}.querySelectorAll('details').forEach(d=>d.open=false)`);
          const collapsed = await measure();
          assert(fits(collapsed) && collapsed.height < 170, JSON.stringify(collapsed));
          let { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
          await writeFile(path.join(shots, `gmi-b1-profile-${width}x${height}.png`), Buffer.from(data, 'base64'));
          await browser.evaluate(`${profile}.querySelectorAll('details').forEach(d=>d.open=true)`);
          const open = await measure();
          assert(fits(open), JSON.stringify(open));
          ({ data } = await browser.send('Page.captureScreenshot', { format: 'png' }));
          await writeFile(path.join(shots, `gmi-b1-profile-open-${width}x${height}.png`), Buffer.from(data, 'base64'));
        }
        // Keyboard: Enter on «Behold bare disse» for Material PE.
        await browser.evaluate(`${profile}.querySelector('[aria-label="Behold bare Material PE: 2 ledninger"]').focus()`);
        for (const type of ['keyDown', 'keyUp']) await browser.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r' } : {}) });
        await browser.waitFor(`${profile}?.dataset.total==='2'`);
        assert.equal(await selectedCount(), 2);
        assert.equal(await browser.evaluate(`document.activeElement?.id`), 'gmi-selection-profile-heading');
        assert.match(await rowText('material'), /PE \(alle\)/);
        assert.match(await rowText('tema'), /VL \(alle\)/);
        assert.match(await browser.evaluate(`${profile}.innerText`), /innsnevret til 2 ledninger \(Material: PE\)/);
        // Narrowing is a shrink: the preview stays valid and is recomputed for exactly the subset.
        assert.equal(await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-counts]').dataset.state`), 'valid');
        await ready();
        assert.match(await browser.evaluate(`${inspector}.innerText`), /av 2 ledninger endres/);
        // No «Behold bare» for a uniform field, so nothing can widen through the profile.
        assert.equal(await browser.evaluate(`${profile}.querySelectorAll('[data-profile-field=material] button').length`), 0);
        // Widening through the table still invalidates the preview (existing gate).
        await click('Filtrert visning', bar); await browser.waitFor(box(2));
        await browser.evaluate(`${box(2)}.click()`);
        await browser.waitFor(`${inspector}.querySelector('[data-gmi-batch-counts]')?.dataset.state==='stale'`);
        assert.equal(await total(), 3);
        assert.match(await browser.evaluate(`${inspector}.innerText`), /Utvalget er utvidet etter forhåndsvisningen/);
        assert(await browser.evaluate(`Array.from(${inspector}.querySelectorAll('button')).find(b=>b.innerText.trim()==='Legg til masseendring').disabled`));
        assert.equal(await browser.evaluate(`${profile}.querySelector('[data-profile-field="hydraulicClass"]')`), null, 'no rule context from a stale preview');
      });

      await t.test('mixed gate retained; narrowing resolves the mix; staged values and undo/redo update counts', async () => {
        await selectLines([3, 4, 5]);
        assert.match(await rowText('material'), /\(tom\) \(alle\)/);
        await choose('Felt for masseendring', 'Material'); await choose('Ny verdi', 'PE');
        await preview(); await ready();
        assert.match(await browser.evaluate(`${inspector}.innerText`), /3 av 3 ledninger endres/);
        await click('Legg til masseendring', inspector);
        await browser.waitFor(risk);
        assert.match(await browser.evaluate(`${risk}.innerText`), /Blandet blant objektene som endres: Tema/);
        await click('Tilbake til utvalget', risk); await browser.waitFor(`!${risk}`);
        await browser.evaluate(`(${profile}).querySelector('[data-profile-field=tema] details').open=true`);
        await click('Behold bare Tema SP: 2 ledninger', profile);
        await browser.waitFor(`${profile}?.dataset.total==='2'`);
        assert.equal(await selectedCount(), 2);
        assert.equal(await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-counts]').dataset.state`), 'valid');
        await ready();
        assert.match(await browser.evaluate(`${inspector}.innerText`), /2 av 2 ledninger endres/);
        await click('Legg til masseendring', inspector);
        // B2 (deliberate update): the two SP lines still differ in Dimensjon and Stedfestingsårsak, so the
        // dialog may remain; Tema is no longer part of the mix after narrowing.
        if (await browser.evaluate(`Boolean(${risk})`)) {
          assert.doesNotMatch(await browser.evaluate(`${risk}.innerText`), /Blandet blant objektene som endres:[^.]*Tema/);
          await click('Godkjenn og legg til', risk);
        }
        await browser.waitFor(`${inspector}.dataset.batchStep==='3'`);
        assert.equal(await browser.evaluate(`${workspace}.querySelectorAll('[data-change-set]').length`), 1);
        await click('Ny masseendring for utvalget', inspector);
        await browser.waitFor(`${profile}`);
        assert.match(await rowText('material'), /PE \(alle\)/, 'proposed value after staging');
        await click('Angre siste retting', workspace);
        await browser.waitFor(`${workspace}.querySelectorAll('[data-change-set]').length===0`);
        await browser.waitFor(`/\\(tom\\) \\(alle\\)/.test(${profile}?.querySelector('[data-profile-field=material]')?.innerText || '')`);
        assert.equal(await total(), 2);
        await click('Gjør om retting', workspace);
        await browser.waitFor(`${workspace}.querySelectorAll('[data-change-set]').length===1`);
        await browser.waitFor(`/PE \\(alle\\)/.test(${profile}?.querySelector('[data-profile-field=material]')?.innerText || '')`);
        assert.equal(await selectedCount(), 2);
      });

      assert.deepEqual(new Uint8Array(await readFile(file)), new Uint8Array(bytes), 'input file unchanged');
      assert.equal(browser.events.filter((event) => event.method === 'Runtime.exceptionThrown').length, 0);
    } finally {
      await browser.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
