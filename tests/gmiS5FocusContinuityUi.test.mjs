// S5 (G4 UI refinements): Data Table column focus from the Felt choice, through staging and
// «Ny masseendring»; an explicit «off» survives the batch → ChangeSet handover; Original → Foreslått
// after object and batch staging unless the user chose Original; keyboard focus is never left on body
// (also after «Angre» from the staged batch view: the undo notice, then «Gjør om»).
// Synthetic fixture only; production build via PHOTO_UI_URL, run serially with the other browser tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { gmiFieldBatchFixture } from './helpers/gmiFieldBatchFixture.mjs';
import { clickGmiTableObject } from './helpers/gmiTableNavigation.mjs';

const app = process.env.PHOTO_UI_URL;
const inspector = `document.querySelector('[data-gmi-batch-inspector]')`;
const workspace = `document.querySelector('.gmi-edit-workspace')`;
const editor = `document.querySelector('[data-gmi-object]')`;
const grid = `document.querySelector('[role=grid]')`;
const table = `document.querySelector('[data-table-geometry]')`;
const bar = `document.querySelector('[data-gmi-selection-bar]')`;
const modes = `document.querySelector('.gmi-edit-table-modes')`;
const toggle = `document.querySelector('[data-gmi-column-focus]')`;
const risk = `document.querySelector('dialog[open][data-gmi-confirm=batch-risk]')`;
const draftDialog = `document.querySelector('dialog[open][data-gmi-confirm=workspace]')`;
const box = (index) => `${grid}.querySelector('[data-table-row="${index}"] input[type=checkbox]')`;

test('S5 production: column focus continuity, Foreslått after staging and keyboard focus after staging',
  { skip: !app || !chromePath, timeout: 240000 }, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gmi-s5-ui-'));
    const file = path.join(directory, 'Synthetic S5.gmi');
    await writeFile(file, gmiFieldBatchFixture());
    const browser = await openTestChrome();
    const click = (label, root = 'document') => browser.evaluate(`(() => {
      const b=Array.from((${root}).querySelectorAll('button')).find(e=>e.innerText.trim()===${JSON.stringify(label)} || e.getAttribute('aria-label')===${JSON.stringify(label)});
      if(!b || b.disabled) throw new Error('Unavailable: '+${JSON.stringify(label)}); b.click(); })()`);
    const choose = (label, value) => browser.evaluate(`(() => { const s=${inspector}.querySelector('[aria-label=${JSON.stringify(label)}]'), select=s.tagName==='SELECT';
      Object.getOwnPropertyDescriptor(select?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(s,${JSON.stringify(value)}); s.dispatchEvent(new Event(select?'change':'input',{bubbles:true})); })()`);
    const typeInto = (selector, value) => browser.evaluate(`(() => { const e=${selector};
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    const view = () => browser.evaluate(`${modes}.dataset.gmiTableView`);
    const focusState = () => browser.evaluate(`(() => { const b=${toggle}; const h=${grid}.querySelector('[role=columnheader][data-focus-column]');
      const headers=Array.from(${grid}.querySelectorAll('[role=columnheader]')).map(e=>e.innerText.trim());
      return { fields: b?.dataset.gmiColumnFocus ?? null, active: b?.getAttribute('aria-pressed') ?? null, header: h?.innerText.trim() ?? null, headers }; })()`);
    /** A meaningful, visible element owns keyboard focus (never body). */
    const activeElement = () => browser.evaluate(`(() => { const e=document.activeElement, r=e.getBoundingClientRect();
      return { body: e===document.body, tag: e.tagName, label: e.getAttribute('aria-label'), text: e.innerText?.trim().slice(0,80),
        staged: e.matches('[data-gmi-staged-success]'), message: e.matches('[data-gmi-object-message]'), notice: e.matches('.gmi-edit-notice'),
        visible: r.width>0 && r.height>0 && r.bottom>0 && r.top<innerHeight && r.right>0 && r.left<innerWidth }; })()`);
    const press = async (key, code, windowsVirtualKeyCode, text) => {
      await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, ...(text ? { text } : {}) });
      await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode });
    };
    const counts = () => browser.evaluate(`${workspace}.querySelector('[data-gmi-edit-counts]')?.innerText ?? null`);
    const ready = () => browser.waitFor(`${inspector}.querySelector('[data-gmi-batch-dry-run]')?.innerText.includes('OK') && ${inspector}.getAttribute('aria-busy')==='false'`);
    const stage = async (expectRisk) => {
      await ready(); await click('Legg til masseendring', inspector);
      if (expectRisk) { await browser.waitFor(risk); await click('Godkjenn og legg til', risk); }
      try { await browser.waitFor(`${inspector}.dataset.batchStep==='3'`); } catch (error) {
        throw new Error(`${error.message}\n${await browser.evaluate(`(${risk} ? 'RISK: ' + ${risk}.innerText + '\\n' : '') + ${inspector}.innerText`)}`);
      }
    };
    const load = async () => {
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")'); await click('Lukk');
      await setPhotoFiles(browser, 'input[type=file]', [file]); await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await browser.evaluate(`document.querySelector('[data-gmi-edit-action]').click()`);
      await browser.waitFor(`${workspace}?.querySelector('[data-gmi-edit-status]')?.innerText === 'Redigerbar' && ${modes}`);
    };
    const openBatch = async (indices) => {
      await click('Ledninger', table); await browser.waitFor(box(indices[0]));
      for (const index of indices) await browser.evaluate(`${box(index)}.click()`);
      await click(`Rediger valgte (${indices.length})`, bar); await browser.waitFor(inspector);
    };
    try {
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm=()=>true;' });

      await t.test('object staging switches Original → Foreslått once, then an explicit Original is kept; focus lands on the result', async () => {
        await load();
        assert.equal(await view(), 'original');
        await clickGmiTableObject(browser, 'line:0'); await browser.waitFor(`${editor}?.dataset.gmiObject === 'line:0'`);
        const scrollBefore = await browser.evaluate(`${grid}.scrollTop`);
        await typeInto(`${editor}.querySelector('tr[data-field="Merknad"] input')`, 'Kontrollert');
        await click('Se gjennom (1)', editor); await browser.waitFor(`${editor}.querySelector('.gmi-edit-review')`);
        await click('Legg til retting', editor);
        await browser.waitFor(`${workspace}.querySelector('[data-gmi-edit-counts]')?.innerText.includes('1 retting')`);
        await browser.waitFor(`${modes}.dataset.gmiTableView === 'proposed'`);
        const focused = await activeElement();
        assert(focused.message && focused.visible && !focused.body, JSON.stringify(focused));
        assert.match(focused.text, /Rettingen er lagt til/);
        // Geometry, inspector object and scroll are unchanged by the switch; no draft guard appeared.
        assert.equal(await browser.evaluate(`${table}.dataset.tableGeometry`), 'ledninger');
        assert.equal(await browser.evaluate(`${editor}.dataset.gmiObject`), 'line:0');
        assert.equal(await browser.evaluate(`${grid}.scrollTop`), scrollBefore);
        assert.equal(await browser.evaluate(`Boolean(${draftDialog})`), false);
        // Explicit Original survives the next stage (another object, an empty field).
        await click('Original', modes); await browser.waitFor(`${modes}.dataset.gmiTableView === 'original'`);
        await clickGmiTableObject(browser, 'line:2'); await browser.waitFor(`${editor}?.dataset.gmiObject === 'line:2'`);
        await typeInto(`${editor}.querySelector('tr[data-field="Merknad"] input')`, 'Sjekket');
        await click('Se gjennom (1)', editor); await browser.waitFor(`${editor}.querySelector('.gmi-edit-review')`);
        await click('Legg til retting', editor);
        await browser.waitFor(`${workspace}.querySelector('[data-gmi-edit-counts]')?.innerText.includes('2 rettinger')`);
        assert.equal(await view(), 'original', 'explicit Original kept');
        assert((await activeElement()).message, 'focus on the result again');
      });

      await t.test('batch: the field leads the table from Felt on, survives staging and «Ny masseendring», view switches, focus is placed', async () => {
        await load();
        await openBatch([0, 2]);
        assert.equal((await focusState()).fields, null, 'no focus before a field is chosen');
        await choose('Felt for masseendring', 'Merknad');
        await browser.waitFor(`${toggle}?.dataset.gmiColumnFocus === 'Merknad'`);
        let state = await focusState();
        assert.equal(state.active, 'true'); assert.equal(state.header, 'Merknad');
        assert(state.headers.indexOf('Merknad') < state.headers.indexOf('Material'), JSON.stringify(state.headers));
        assert.equal(await browser.evaluate(`Boolean(${inspector}.querySelector('[data-gmi-batch-counts]'))`), false, 'before any preview');
        // Choosing a field alone is not a draft: closing needs no confirmation and drops the focus.
        await click('Avslutt', inspector); await browser.waitFor(`!${inspector}`);
        assert.equal(await browser.evaluate(`Boolean(${draftDialog})`), false);
        assert.equal((await focusState()).fields, null);
        await click('Rediger valgte (2)', bar); await browser.waitFor(inspector);
        await choose('Felt for masseendring', 'Merknad');
        await typeInto(`${inspector}.querySelector('[aria-label="Ny verdi"]')`, 'Kontrollert');
        await click('Forhåndsvis endringer', inspector);
        await stage(true); // Merknad is not validated: explicit approval.
        await browser.waitFor(`${modes}.dataset.gmiTableView === 'proposed'`);
        state = await focusState();
        assert.deepEqual([state.fields, state.active, state.header], ['Merknad', 'true', 'Merknad'], 'ChangeSet keeps the focus');
        const focused = await activeElement();
        assert(focused.staged && focused.visible && !focused.body, JSON.stringify(focused));
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          const after = await activeElement();
          assert(after.staged && after.visible, `staged result focused and visible at ${width}x${height}`);
          assert(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth'), `no page overflow at ${width}x${height}`);
          const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
          await writeFile(path.join(tmpdir(), `gmi-s5-staged-${width}x${height}.png`), Buffer.from(data, 'base64'));
        }
        // Tab continues inside the inspector.
        await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        assert.equal(await browser.evaluate(`Boolean(document.activeElement.closest('[data-gmi-batch-inspector]'))`), true);
        await click('Ny masseendring for utvalget', inspector);
        await browser.waitFor(`document.activeElement === ${inspector}.querySelector('[aria-label="Felt for masseendring"]')`);
        assert.equal(await browser.evaluate(`document.activeElement.value`), '');
        state = await focusState();
        assert.deepEqual([state.fields, state.active], ['Merknad', 'true'], 'kept until another field is chosen');
      });

      await t.test('an explicit column-focus «off» survives staging; another field applies again; explicit Original is kept for batches', async () => {
        await click('Merknad først'); await browser.waitFor(`${toggle}.getAttribute('aria-pressed') === 'false'`);
        assert.equal((await focusState()).header, null);
        await choose('Felt for masseendring', 'Merknad');
        await typeInto(`${inspector}.querySelector('[aria-label="Ny verdi"]')`, 'Vurdert');
        await browser.evaluate(`${inspector}.querySelectorAll('input[type=radio]')[1].click()`);
        await click('Forhåndsvis endringer', inspector);
        await browser.waitFor(`${inspector}.getAttribute('aria-busy')==='false' && ${inspector}.innerText.includes('Erstatt tidligere rettinger')`);
        await browser.evaluate(`Array.from(${inspector}.querySelectorAll('label')).find(e=>e.innerText.includes('Erstatt tidligere rettinger')).querySelector('input').click()`);
        await ready();
        assert.equal((await focusState()).active, 'false', 'preview keeps the off choice');
        await stage(true);
        let state = await focusState();
        assert.deepEqual([state.fields, state.active, state.header], ['Merknad', 'false', null], 'not reactivated by the ChangeSet');
        await click('Ny masseendring for utvalget', inspector);
        assert.equal((await focusState()).active, 'false');
        // A different field is a new focus.
        await choose('Felt for masseendring', 'Material');
        await browser.waitFor(`${toggle}?.dataset.gmiColumnFocus === 'Material'`);
        state = await focusState();
        assert.deepEqual([state.active, state.header], ['true', 'Material']);
        // Explicit Original: batch staging keeps it.
        await click('Original', modes); await browser.waitFor(`${modes}.dataset.gmiTableView === 'original'`);
        // The previous batch's «Sett verdi» is kept by design; fill only the empty line.
        await browser.evaluate(`${inspector}.querySelectorAll('input[type=radio]')[0].click()`);
        await choose('Ny verdi', 'PE'); await click('Forhåndsvis endringer', inspector);
        await stage(false);
        assert.equal(await view(), 'original', 'explicit Original kept after a batch stage');
        assert((await activeElement()).staged);
        // Undo the just-staged batch: no stale ChangeSet focus; the chosen field's batch focus remains.
        const stagedCounts = await counts();
        await click('Angre', inspector);
        await browser.waitFor(`${inspector}.dataset.batchStep !== '3'`);
        state = await focusState();
        assert.deepEqual([state.fields, state.active], ['Material', 'true']);
        // «Angre» unmounts with the staged details: keyboard focus continues on the visible undo notice.
        await browser.waitFor(`document.activeElement?.matches('.gmi-edit-notice')`);
        let focused = await activeElement();
        assert(focused.notice && focused.visible && !focused.body, JSON.stringify(focused));
        assert.match(focused.text, /^Angret: /);
        assert.notEqual(await counts(), stagedCounts, 'undo removed the batch');
        // Tab reaches the contextual «Gjør om»; the keyboard redo restores the batch and keeps focus on the result.
        await press('Tab', 'Tab', 9);
        assert.equal(await browser.evaluate(`document.activeElement?.dataset.gmiContextRedo ?? null`), 'notice', 'Tab reaches «Gjør om»');
        await press('Enter', 'Enter', 13, '\r');
        await browser.waitFor(`document.activeElement?.matches('.gmi-edit-notice') && document.activeElement.innerText.startsWith('Gjort om: ')`);
        focused = await activeElement();
        assert(focused.notice && focused.visible && !focused.body, JSON.stringify(focused));
        assert.equal(await counts(), stagedCounts, '«Gjør om» restored the batch');
        assert.equal(await browser.evaluate(`Boolean(document.querySelector('[data-gmi-context-redo=notice]'))`), false, 'nothing left to redo in context');
        assert.equal(await browser.evaluate(`${inspector}.dataset.batchStep !== '3'`), true, 'redo does not reopen the staged view');
        await click('Avslutt', inspector); await browser.waitFor(`!${inspector}`);
        assert.equal((await focusState()).fields, null, 'nothing retained after the inspector closes');
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          const overflow = await browser.evaluate('document.documentElement.scrollWidth - innerWidth');
          assert(overflow <= 0, `no horizontal page overflow at ${width}x${height}`);
        }
      });
    } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
  });
