// G8 follow-up production workflow: linked Tema/S_FCODE in the individual object editor and B3 «Rett én og én».
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { clickGmiTableObject } from './helpers/gmiTableNavigation.mjs';
import { gmiFieldBatchFixture } from './helpers/gmiFieldBatchFixture.mjs';
import { loadGmiDocument, verifyCellChanges } from './helpers/gmiEditHarness.mjs';

const app = process.env.PHOTO_UI_URL;
const editor = `document.querySelector('[data-gmi-object]')`, workspace = `document.querySelector('.gmi-edit-workspace')`;
const linkedRow = `${editor}.querySelector('tr[data-gmi-linked-tema-row]')`;
const linkedInput = `${linkedRow}.querySelector('input, select')`;
const review = `${editor}.querySelector('.gmi-edit-review')`;
const linkedConfirm = `${review}.querySelector('[data-gmi-linked-confirm]')`;
const batch = 'document.querySelector("[data-gmi-batch-inspector]")';
const nav = 'document.querySelector("[data-gmi-individual-selection]")';
const bar = 'document.querySelector("[data-gmi-selection-bar]")';
const guard = `document.querySelector('dialog[open][data-gmi-confirm="workspace"]')`;
const grid = 'document.querySelector("[role=grid]")';
const WARNING = 'FOTO bruker Tema fra originalfilen. Endringen påvirker ikke automatisk bildegrupperingen.';

test('G8 object editor production: one linked Tema control, explicit consent, B3 step-through, undo/redo and verified download',
  { skip: !app || !chromePath, timeout: 240000 }, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gmi-g8-object-ui-'));
    const file = path.join(directory, 'Synthetic G8 object.gmi'), downloads = path.join(directory, 'downloads');
    await mkdir(downloads);
    // Bredde is populated so the LOK reconciliation introduces no FEIL, only SJEKK.
    const bytes = gmiFieldBatchFixture({ pointFields: ['Tema', 'S_FCODE', 'Kumform', 'Bredde', 'Merknad'],
      points: [['LOK', 'ANB', '', '1000', ''], ['LOK', 'LOK', '', '1000', ''], ['LOK', 'LOK', '', '1000', '']] });
    await writeFile(file, bytes);
    const browser = await openTestChrome();
    const click = (label, root = editor) => browser.evaluate(`(() => {
      const b = Array.from((${root}).querySelectorAll('button')).find(e => e.innerText.trim() === ${JSON.stringify(label)} || e.getAttribute('aria-label') === ${JSON.stringify(label)});
      if (!b || b.disabled) throw new Error('Unavailable: ' + ${JSON.stringify(label)}); b.click();
    })()`);
    const waitClick = async (label, root = editor) => {
      await browser.waitFor(`Array.from((${root})?.querySelectorAll('button') || []).some(e => !e.disabled && (e.innerText.trim() === ${JSON.stringify(label)} || e.getAttribute('aria-label') === ${JSON.stringify(label)}))`);
      await click(label, root);
    };
    const setLinked = (text) => browser.evaluate(`(() => {
      const e = ${linkedInput}, select = e.tagName === 'SELECT';
      Object.getOwnPropertyDescriptor(select ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(text)});
      e.dispatchEvent(new Event(select ? 'change' : 'input', { bubbles: true }));
    })()`);
    const key = async (name, code, keyCode) => {
      await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code, windowsVirtualKeyCode: keyCode });
      await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code, windowsVirtualKeyCode: keyCode });
    };
    const select = async (object) => { await clickGmiTableObject(browser, object); await browser.waitFor(`${editor}?.dataset.gmiObject === ${JSON.stringify(object)}`); };
    const confirmForm = () => browser.evaluate(`Array.from(${editor}.querySelectorAll('.gmi-edit-form .gmi-edit-confirm input')).filter(e => !e.checked).forEach(e => e.click())`);
    const openReview = async () => { await confirmForm(); await click('Se gjennom (1)'); await browser.waitFor(review); };
    const corrections = () => browser.evaluate(`Number((document.querySelector('[data-gmi-edit-counts]')?.innerText.match(/(\\d+) retting/) || [0, 0])[1])`);
    const stageButton = `Array.from(${review}.querySelectorAll('button')).find(e => e.innerText.trim() === 'Legg til retting')`;
    const physical = (where, field) => browser.evaluate(`${linkedRow}.querySelector('[data-gmi-linked-${where}="${field}"], [data-gmi-linked-${where}] [data-gmi-linked-physical="${field}"]')?.innerText || null`);
    const screenshot = async (name) => {
      if (!process.env.GMI_EDIT_SCREENSHOT_DIR) return;
      await mkdir(process.env.GMI_EDIT_SCREENSHOT_DIR, { recursive: true });
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.GMI_EDIT_SCREENSHOT_DIR, name), Buffer.from(data, 'base64'));
    };
    const laptop = async (name, element) => {
      for (const [width, height] of [[1280, 720], [1366, 768]]) {
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        await browser.evaluate(`${element}.scrollIntoView({ block: 'center' })`);
        const layout = await browser.evaluate(`(() => { const e = ${element}, r = e.getBoundingClientRect(), s = e.closest('.gmi-edit-inspector') || e.parentElement;
          return { page: document.documentElement.scrollWidth <= ${width}, inside: r.left >= 0 && r.right <= ${width} + 0.5, overflow: s.scrollWidth > s.clientWidth + 1 }; })()`);
        assert(layout.page, `${name}: no page horizontal overflow at ${width}x${height}`);
        assert(layout.inside && !layout.overflow, `${name}: content fits the inspector at ${width}x${height}`);
        await screenshot(`${name}-${width}x${height}.png`);
      }
    };
    try {
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
      await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm = () => true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")'); await click('Lukk', 'document');
      await setPhotoFiles(browser, 'input[type=file]', [file]);
      await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await browser.evaluate('document.querySelector("[data-gmi-edit-action]").click()');
      await browser.waitFor(`${workspace}.querySelector('[data-gmi-edit-status]')?.innerText === 'Redigerbar'`);

      await t.test('one logical control shows both physical values; keyboard edit, FOTO warning and explicit consent', async () => {
        await select('point:0');
        assert.equal(await browser.evaluate(`${editor}.querySelectorAll('tr[data-gmi-linked-tema-row]').length`), 1);
        assert.equal(await browser.evaluate(`Boolean(${editor}.querySelector('tr[data-field="S_FCODE"]'))`), false, 'no independent S_FCODE row');
        assert.equal(await browser.evaluate(`${linkedRow}.querySelectorAll('input:not([type=checkbox]), select').length`), 1);
        assert.equal(await browser.evaluate(`document.querySelector('label[for="' + ${linkedInput}.id + '"]').innerText`), 'Tema');
        assert.match(await physical('physical', 'Tema'), /Tema\s+LOK/);
        assert.match(await physical('physical', 'S_FCODE'), /S_FCODE\s+ANB/);
        assert.match(await physical('current', 'S_FCODE'), /S_FCODE nå\s+ANB/);
        assert(await browser.evaluate(`Boolean(${linkedRow}.querySelector('[data-gmi-linked-disagreement]'))`));
        assert.match(await browser.evaluate(`${linkedRow}.querySelector('[data-gmi-linked-note]').innerText`), /oppdateres sammen/);
        assert.equal(await browser.evaluate(`${linkedInput}.value`), '', 'no common value is invented for a disagreeing pair');
        // Keyboard: focus the control and type; typed codes are upper-cased by the existing control.
        await browser.evaluate(`${linkedInput}.focus()`);
        await browser.send('Input.insertText', { text: 'lok' });
        await key('Escape', 'Escape', 27);
        await browser.waitFor(`${linkedInput}.value === 'LOK' && ${linkedRow}.dataset.state === 'draft'`);
        assert.equal(await browser.evaluate(`${linkedRow}.querySelector('[data-gmi-photo-tema-warning]').innerText`), WARNING);
        await laptop('g8o-form', linkedRow);
        await openReview();
        const cells = await browser.evaluate(`Array.from(${review}.querySelectorAll('tbody tr')).map(r => r.innerText.replace(/\\s+/g, ' ').trim())`);
        assert(cells.some(text => /^S_FCODE ANB LOK/.test(text)), cells.join(' | '));
        assert(cells.some(text => /^Tema LOK LOK Allerede riktig/.test(text)), cells.join(' | '));
        assert.equal(await browser.evaluate(`${review}.querySelector('[data-gmi-photo-tema-warning]').innerText`), WARNING);
        assert.equal(await browser.evaluate(`${review}.querySelectorAll('[data-gmi-resolved-findings] li').length`), 1, 'TEMA_CONFLICT resolution is shown');
        assert(await browser.evaluate(`Boolean(${review}.querySelector('[data-gmi-unblocked-checks]'))`));
        assert.equal(await browser.evaluate(`${review}.querySelectorAll('[data-gmi-new-checks] li').length`), 1, 'new SJEKK from the Tema change is shown');
        assert.equal(await browser.evaluate(`Boolean(${review}.querySelector('[data-gmi-new-errors]'))`), false, 'no new FEIL, yet consent is still required');
        assert(await browser.evaluate(`${stageButton}.disabled`), 'consent required even without new FEIL');
        await browser.evaluate(`${linkedConfirm}.focus()`); await key(' ', 'Space', 32);
        await browser.waitFor(`${linkedConfirm}.checked && !${stageButton}.disabled`);
        await laptop('g8o-review', review);
        await click('Legg til retting');
        await browser.waitFor(`${editor}.querySelector('[data-gmi-object-message]')`);
        assert.equal(await corrections(), 1);
        await browser.waitFor(`${linkedRow}.dataset.state === 'proposed'`);
        assert.match(await physical('current', 'Tema'), /Tema nå\s+LOK/);
        assert.match(await physical('current', 'S_FCODE'), /S_FCODE nå\s+LOK/);
        assert.match(await physical('physical', 'S_FCODE'), /S_FCODE\s+ANB/, 'original stays visible');
        assert.equal(await browser.evaluate(`Boolean(${linkedRow}.querySelector('[data-gmi-linked-disagreement]'))`), false);
      });

      await t.test('new FEIL and linked consent are separate gates; changing the proposal voids consent', async () => {
        await select('point:1');
        await setLinked('KUM'); await openReview();
        assert(await browser.evaluate(`Boolean(${review}.querySelector('[data-gmi-new-errors]'))`), 'Kumform requirement surfaces as new FEIL');
        await browser.evaluate(`${linkedConfirm}.click()`);
        assert(await browser.evaluate(`${stageButton}.disabled`), 'linked consent does not bypass the new-FEIL gate');
        await browser.evaluate(`${review}.querySelector('[data-gmi-new-errors] input').click()`);
        await browser.waitFor(`!${stageButton}.disabled`);
        await browser.evaluate(`${linkedConfirm}.click()`);
        assert(await browser.evaluate(`${stageButton}.disabled`), 'new-FEIL consent does not bypass linked consent');
        await browser.evaluate(`${linkedConfirm}.click()`);
        await click('Tilbake');
        await browser.waitFor(`!${review} && ${linkedInput}.value === 'KUM'`);
        await setLinked('ANB'); await openReview();
        assert.equal(await browser.evaluate(`${linkedConfirm}.checked`), false, 'a new proposal requires new consent');
        assert.match(await browser.evaluate(`${linkedConfirm}.closest('label').innerText`), /«ANB»/);
        assert(await browser.evaluate(`${stageButton}.disabled`));
        await browser.evaluate(`${linkedConfirm}.click()`); await click('Legg til retting');
        await browser.waitFor(`${editor}.querySelector('[data-gmi-object-message]')`);
        assert.equal(await corrections(), 2);
      });

      await t.test('B3 «Rett én og én» uses the same linked control, preserves selection and draft guards', async () => {
        for (const index of [0, 1, 2]) {
          const box = `${grid}?.querySelector('[data-table-row="${index}"] input[type=checkbox]')`;
          await browser.waitFor(box); await browser.evaluate(`${box}.click()`);
        }
        await waitClick('Rediger valgte (3)', bar); await browser.waitFor(batch);
        const head = await browser.evaluate(`(() => { const a = ${batch}.querySelector('[data-gmi-individual-entry]').getBoundingClientRect();
          const b = Array.from(${batch}.querySelectorAll('button')).find(e => e.innerText.trim() === 'Avslutt').getBoundingClientRect(); return Math.abs(a.top - b.top); })()`);
        assert(head < 2, 'compact batch header retained');
        await waitClick('Rett én og én', batch);
        const current = (i) => browser.waitFor(`${editor}?.dataset.gmiObject === 'point:${i}' && ${nav}?.innerText.includes('Objekt ${i + 1} av 3 i utvalget')`);
        await current(0);
        assert.equal(await browser.evaluate(`${editor}.querySelectorAll('tr[data-gmi-linked-tema-row]').length`), 1);
        assert.equal(await browser.evaluate(`Boolean(${editor}.querySelector('tr[data-field="S_FCODE"]'))`), false);
        await click('Neste', nav); await current(1);
        assert.equal(await browser.evaluate(`Boolean(${editor}.querySelector('tr[data-field="S_FCODE"]'))`), false);
        await setLinked('KUM');
        await click('Neste', nav); await browser.waitFor(guard); await click('Avbryt', guard);
        await browser.waitFor(`!${guard}`); await current(1);
        assert.equal(await browser.evaluate(`${linkedInput}.value`), 'KUM', 'draft kept after cancelling');
        await click('Neste', nav); await browser.waitFor(guard); await click('Forkast skjemaet', guard); await current(2);
        await setLinked('ANB'); await openReview();
        assert(await browser.evaluate(`${stageButton}.disabled`));
        await browser.evaluate(`${linkedConfirm}.click()`); await click('Legg til retting');
        await browser.waitFor(`${editor}.querySelector('[data-gmi-object-message]')`);
        assert.equal(await corrections(), 3);
        await laptop('g8o-b3', linkedRow);
        assert(await browser.evaluate(`Array.from(${nav}.querySelectorAll('button')).every(e => { const r = e.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= innerHeight && e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })`), 'step navigation stays reachable');
        assert.equal(await browser.evaluate(`${editor}.dataset.gmiObject`), 'point:2', 'selected object identity retained');
        await click('Tilbake til utvalget', nav); await browser.waitFor(batch);
        assert.deepEqual(await browser.evaluate(`Array.from(${grid}.querySelectorAll('[data-table-row][aria-selected=true]')).map(e => Number(e.dataset.tableRow)).sort((a, b) => a - b)`), [0, 1, 2]);
        await click('Avslutt', batch);
        if (await browser.evaluate(`Boolean(${guard})`)) await click('Forkast skjemaet', guard);
        if (await browser.evaluate(`Boolean(${bar})`)) await click('Fjern utvalg', bar);
      });

      await t.test('undo/redo restores both physical fields together and the verified download has only approved spans', async () => {
        await waitClick('Angre siste retting', workspace);
        await browser.waitFor(`document.querySelector('[data-gmi-edit-counts]')?.innerText.match(/(\\d+) retting/)?.[1] === '2'`);
        await select('point:2');
        await browser.waitFor(`${linkedInput}.value === 'LOK' && !${linkedRow}.dataset.state`);
        await waitClick('Gjør om retting', workspace);
        await browser.waitFor(`document.querySelector('[data-gmi-edit-counts]')?.innerText.match(/(\\d+) retting/)?.[1] === '3'`);
        await browser.waitFor(`${editor}?.dataset.gmiObject === 'point:2' && ${linkedInput}.value === 'ANB' && ${linkedRow}.dataset.state === 'proposed'`);
        assert.match(await physical('current', 'S_FCODE'), /S_FCODE nå\s+ANB/);
        await browser.evaluate(`${workspace}.querySelector('.gmi-edit-download').click()`);
        const dialog = `document.querySelector('dialog[open].delivery-wizard')`;
        await browser.waitFor(dialog); await click('Kontroller leveransen', dialog);
        await browser.waitFor(`${dialog}.dataset.exportPhase === 'ready'`);
        await click('Til pakke', dialog); await click('Last ned GMI', dialog);
        await browser.waitFor(`${dialog}?.dataset.exportPhase === 'done'`);
        const filename = await browser.evaluate(`${dialog}.querySelector('[data-downloaded-filename]').innerText`);
        let output;
        for (let attempt = 0; attempt < 100 && !output; attempt++) {
          if ((await readdir(downloads)).includes(filename)) output = new Uint8Array(await readFile(path.join(downloads, filename)));
          else await new Promise(resolve => setTimeout(resolve, 50));
        }
        assert(output, 'verified GMI download');
        const edits = [{ sourceIndex: 0, field: 'S_FCODE', lexeme: 'LOK' }, { sourceIndex: 1, field: 'Tema', lexeme: 'ANB' },
          { sourceIndex: 1, field: 'S_FCODE', lexeme: 'ANB' }, { sourceIndex: 2, field: 'Tema', lexeme: 'ANB' }, { sourceIndex: 2, field: 'S_FCODE', lexeme: 'ANB' }]
          .map(edit => ({ scope: 'point', ...edit }));
        assert.deepEqual(verifyCellChanges(loadGmiDocument(bytes), output, edits).failures, []);
        await click('Lukk', dialog);
      });
      assert.deepEqual(new Uint8Array(await readFile(file)), new Uint8Array(bytes), 'contractor file unchanged');
      assert.equal(browser.events.filter(event => event.method === 'Runtime.exceptionThrown').length, 0);
    } finally {
      await browser.close();
      if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('gmi-g8-object-ui-')) throw new Error('Unsafe fixture path');
      await rm(directory, { recursive: true, force: true });
    }
  });
