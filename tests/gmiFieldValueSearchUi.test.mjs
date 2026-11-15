// A6 production workflow: live S_FCODE/Tema search in the individual editor, «Forhåndsvis endringer» naming and
// B3 «Rett én og én» navigation icons. Synthetic line fixture only.
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
import { getGmiFieldValueDomain } from '../src/lib/validation-v2/fieldValueDomain.js';
import { rankGmiFieldValueOptions } from '../src/lib/gmiEditFields.mjs';

const app = process.env.PHOTO_UI_URL;
const editor = `document.querySelector('[data-gmi-object]')`, workspace = `document.querySelector('.gmi-edit-workspace')`;
const linkedRow = `${editor}.querySelector('tr[data-gmi-linked-tema-row]')`;
const linkedInput = `${linkedRow}.querySelector('input:not([type=checkbox]), select')`;
const listbox = `${linkedRow}.querySelector('[role=listbox]')`;
const review = `${editor}.querySelector('.gmi-edit-review')`;
const previewButton = `${editor}.querySelector('[data-gmi-object-preview]')`;
const batch = 'document.querySelector("[data-gmi-batch-inspector]")';
const nav = 'document.querySelector("[data-gmi-individual-selection]")';
const bar = 'document.querySelector("[data-gmi-selection-bar]")';
const guard = `document.querySelector('dialog[open][data-gmi-confirm="workspace"]')`;
const grid = 'document.querySelector("[role=grid]")';
const TEAL = 'rgb(0, 117, 149)';

test('A6 production: live linked Tema/S_FCODE search, preview naming and B3 navigation controls',
  { skip: !app || !chromePath, timeout: 240000 }, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gmi-a6-search-ui-'));
    const file = path.join(directory, 'Synthetic A6 search.gmi'), downloads = path.join(directory, 'downloads');
    await mkdir(downloads);
    const bytes = gmiFieldBatchFixture({ pointFields: ['Tema', 'Merknad'], points: [['KUM', '']],
      lineFields: ['Tema', 'S_FCODE', 'Material', 'Dimensjon', 'Merknad'],
      lines: [['SP', 'SP', 'PE', '160', ''], ['AF', 'SP', 'PE', '160', ''], ['SP', 'SP', 'PE', '160', '']] });
    await writeFile(file, bytes);
    const lineTema = getGmiFieldValueDomain({ canonicalFieldId: 'tema', geometryScope: 'line' }).options;
    const browser = await openTestChrome();
    const click = (label, root = editor) => browser.evaluate(`(() => {
      const b = Array.from((${root}).querySelectorAll('button')).find(e => e.innerText.trim() === ${JSON.stringify(label)} || e.getAttribute('aria-label') === ${JSON.stringify(label)});
      if (!b || b.disabled) throw new Error('Unavailable: ' + ${JSON.stringify(label)}); b.click();
    })()`);
    const waitClick = async (label, root = editor) => {
      await browser.waitFor(`Array.from((${root})?.querySelectorAll('button') || []).some(e => !e.disabled && (e.innerText.trim() === ${JSON.stringify(label)} || e.getAttribute('aria-label') === ${JSON.stringify(label)}))`);
      await click(label, root);
    };
    const key = async (name, code, keyCode) => { // Enter and Space carry text, so native buttons and forms react as to a real key
      const text = { Enter: String.fromCharCode(13), ' ': ' ' }[name];
      await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code, windowsVirtualKeyCode: keyCode, ...(text ? { text, unmodifiedText: text } : {}) });
      await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code, windowsVirtualKeyCode: keyCode });
    };
    const clear = async () => { // real keyboard: select all, delete
      await browser.evaluate(`${linkedInput}.focus(); ${linkedInput}.select()`);
      await key('Backspace', 'Backspace', 8);
      await browser.waitFor(`${linkedInput}.value === ''`);
    };
    const type = (text) => browser.send('Input.insertText', { text });
    const offered = () => browser.evaluate(`Array.from(${listbox}?.querySelectorAll('[role=option]') || []).map(e => e.innerText.split(' – ')[0])`);
    const expected = (query) => rankGmiFieldValueOptions(lineTema, query).map(({ value }) => value);
    const mouseClick = async (element) => {
      const { x, y } = await browser.evaluate(`(() => { const r = (${element}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await browser.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    };
    const hover = async (element) => {
      const { x, y } = await browser.evaluate(`(() => { const r = (${element}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    };
    const select = async (object) => { await clickGmiTableObject(browser, object); await browser.waitFor(`${editor}?.dataset.gmiObject === ${JSON.stringify(object)}`); };
    const confirmForm = () => browser.evaluate(`Array.from(${editor}.querySelectorAll('.gmi-edit-form .gmi-edit-confirm input')).filter(e => !e.checked).forEach(e => e.click())`);
    const stageButton = `Array.from(${review}.querySelectorAll('button')).find(e => e.innerText.trim() === 'Legg til retting')`;
    const screenshot = async (name) => {
      if (!process.env.GMI_EDIT_SCREENSHOT_DIR) return;
      await mkdir(process.env.GMI_EDIT_SCREENSHOT_DIR, { recursive: true });
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.GMI_EDIT_SCREENSHOT_DIR, name), Buffer.from(data, 'base64'));
    };
    const stageReviewed = async () => {
      await browser.evaluate(`${review}.querySelector('[data-gmi-linked-confirm]').click()`);
      if (await browser.evaluate(`Boolean(${review}.querySelector('[data-gmi-new-errors] input'))`)) await browser.evaluate(`${review}.querySelector('[data-gmi-new-errors] input').click()`);
      await browser.waitFor(`!${stageButton}.disabled`); await click('Legg til retting');
      await browser.waitFor(`${editor}.querySelector('[data-gmi-object-message]')`);
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

      await t.test('typing «V» and «VL» narrows the linked Tema/S_FCODE list immediately, code prefixes first', async () => {
        await select('line:0');
        assert.equal(await browser.evaluate(`${linkedInput}.getAttribute('role')`), 'combobox', 'linked Tema uses the searchable combobox');
        assert.equal(await browser.evaluate(`Boolean(${editor}.querySelector('tr[data-field="S_FCODE"]'))`), false);
        await clear();
        await browser.waitFor(`${linkedInput}.getAttribute('aria-expanded') === 'true'`);
        assert.equal((await offered()).length, lineTema.length, 'focus with an empty query offers the whole list');
        await type('v');
        await browser.waitFor(`${linkedInput}.value === 'V'`);
        assert.deepEqual(await offered(), expected('V'), 'typed «v» is upper-cased and filters live');
        assert.equal((await offered())[0], 'VL');
        await type('l');
        await browser.waitFor(`${linkedInput}.value === 'VL'`);
        const vl = await offered();
        assert.deepEqual(vl, expected('VL'));
        assert(vl.length < lineTema.length);
        assert.equal(vl[0], 'VL', 'exact code first');
        const firstWeak = vl.findIndex(code => !code.startsWith('VL'));
        assert(firstWeak > 1 && vl.slice(firstWeak).every(code => !code.startsWith('VL')), 'code-prefix matches before description matches');
        assert.match(await browser.evaluate(`${listbox}.querySelector('[role=option]').innerText`), /^VL – Vannledning/);
        await screenshot('a6-linked-search-1280x720.png');
        await browser.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
        assert(await browser.evaluate('document.documentElement.scrollWidth <= 1366'));
        assert(await browser.evaluate(`(() => { const l = ${listbox}; return l.scrollHeight > l.clientHeight && l.clientHeight <= 160; })()`), 'list scrolls inside its own box');
        await screenshot('a6-linked-search-1366x768.png');
        await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
        assert(await browser.evaluate('document.documentElement.scrollWidth <= 1280'));
      });

      await t.test('ArrowDown/ArrowUp/Enter choose, Escape closes only the list, mouse selection works', async () => {
        const activeCode = () => browser.evaluate(`document.getElementById(${linkedInput}.getAttribute('aria-activedescendant'))?.innerText.split(' – ')[0] ?? null`);
        await key('ArrowDown', 'ArrowDown', 40); assert.equal(await activeCode(), 'VL');
        await key('ArrowDown', 'ArrowDown', 40); assert.equal(await activeCode(), expected('VL')[1]);
        await key('ArrowUp', 'ArrowUp', 38); assert.equal(await activeCode(), 'VL');
        await key('Enter', 'Enter', 13);
        await browser.waitFor(`${linkedInput}.getAttribute('aria-expanded') === 'false' && ${linkedInput}.value === 'VL'`);
        assert.equal(await browser.evaluate(`Boolean(${review})`), false, 'Enter in the list chooses, it does not submit the form');
        // Escape: closes the list, keeps the typed value and the editor.
        await clear(); await type('vlp');
        await browser.waitFor(`${linkedInput}.value === 'VLP' && ${linkedInput}.getAttribute('aria-expanded') === 'true'`);
        assert.deepEqual(await offered(), ['VLP']);
        await key('Escape', 'Escape', 27);
        await browser.waitFor(`${linkedInput}.getAttribute('aria-expanded') === 'false'`);
        assert.equal(await browser.evaluate(`${linkedInput}.value`), 'VLP');
        assert.equal(await browser.evaluate(`${editor}?.dataset.gmiObject`), 'line:0');
        assert.equal(await browser.evaluate(`Boolean(document.querySelector('dialog[open]'))`), false);
        // Mouse: a real pointer click on an offered option.
        await clear(); await type('vl');
        await browser.waitFor(`${listbox}?.querySelectorAll('[role=option]').length > 2`);
        const target = expected('VL')[2];
        await mouseClick(`Array.from(${listbox}.querySelectorAll('[role=option]')).find(e => e.innerText.startsWith(${JSON.stringify(`${target} –`)}))`);
        await browser.waitFor(`${linkedInput}.value === ${JSON.stringify(target)} && ${linkedInput}.getAttribute('aria-expanded') === 'false'`);
        assert.equal(await browser.evaluate(`document.activeElement === ${linkedInput}`), true, 'focus stays in the control');
      });

      await t.test('strictListed: an unlisted code shows no offers and cannot be previewed', async () => {
        await clear(); await type('vlx');
        await browser.waitFor(`${linkedInput}.value === 'VLX'`);
        assert.deepEqual(await offered(), []);
        assert.match(await browser.evaluate(`${linkedRow}.innerText`), /Ingen treff\. Velg en verdi fra kodelisten\./);
        await key('Escape', 'Escape', 27);
        await confirmForm(); // the populated-value overwrite gate is satisfied, so only the domain refusal remains
        await browser.waitFor(`${previewButton}.disabled`);
        assert.equal(await browser.evaluate(`Array.from(${editor}.querySelectorAll('.gmi-edit-form .gmi-edit-confirm input')).every(e => e.checked)`), true);
        assert.match(await browser.evaluate(`${linkedRow}.querySelector('.gmi-edit-problem')?.innerText || ''`), /kodelisten/);
      });

      await t.test('«Forhåndsvis endringer (1)» opens the preview; linked consent is still required; exact bytes are exported', async () => {
        await clear(); await type('vl'); await key('Escape', 'Escape', 27);
        await browser.waitFor(`${linkedInput}.value === 'VL'`); await confirmForm();
        await browser.waitFor(`!${previewButton}.disabled`);
        assert.equal(await browser.evaluate(`${previewButton}.innerText.trim()`), 'Forhåndsvis endringer (1)');
        assert.equal(await browser.evaluate(`${previewButton}.type`), 'submit');
        await click('Forhåndsvis endringer (1)'); await browser.waitFor(review);
        assert.equal(await browser.evaluate(`${review}.querySelector('h3').innerText`), 'Forhåndsvis før du legger til');
        assert.equal(await browser.evaluate(`${review}.getAttribute('aria-label')`), 'Forhåndsvisning av retting');
        const cells = await browser.evaluate(`Array.from(${review}.querySelectorAll('tbody tr')).map(r => r.innerText.replace(/\\s+/g, ' ').trim())`);
        assert(cells.some(text => /^Tema SP VL/.test(text)) && cells.some(text => /^S_FCODE SP VL/.test(text)), cells.join(' | '));
        assert(await browser.evaluate(`${stageButton}.disabled`), 'linked consent required');
        assert.match(await browser.evaluate(`${review}.querySelector('[data-gmi-linked-confirm]').closest('label').innerText`), /Sett både Tema og S_FCODE til «VL»/);
        assert.equal(await browser.evaluate(`getComputedStyle(${review}.querySelector('[data-gmi-linked-confirm]')).accentColor`), TEAL);
        await screenshot('a6-preview-1280x720.png');
        await stageReviewed();
        await browser.waitFor(`${linkedRow}.dataset.state === 'proposed'`);
        assert.match(await browser.evaluate(`${linkedRow}.querySelector('[data-gmi-linked-current="S_FCODE"]').innerText`), /S_FCODE nå\s+VL/);
      });

      await t.test('B3: back/previous/next carry icons, names, hover, focus and disabled states; guards and selection kept', async () => {
        for (const index of [0, 1, 2]) {
          const box = `${grid}?.querySelector('[data-table-row="${index}"] input[type=checkbox]')`;
          await browser.waitFor(box); await browser.evaluate(`${box}.click()`);
        }
        await waitClick('Rediger valgte (3)', bar); await browser.waitFor(batch);
        await waitClick('Rett én og én', bar);
        const current = (i) => browser.waitFor(`${editor}?.dataset.gmiObject === 'line:${i}' && ${nav}?.innerText.includes('Objekt ${i + 1} av 3 i utvalget')`);
        await current(0);
        const controls = await browser.evaluate(`Array.from(${nav}.querySelectorAll('button')).map(b => ({ name: b.innerText.trim(), icon: b.querySelectorAll('svg[aria-hidden=true]').length,
          title: b.hasAttribute('title'), iconFirst: b.firstElementChild?.tagName === 'svg', iconLast: b.lastElementChild?.tagName === 'svg', disabled: b.disabled }))`);
        assert.deepEqual(controls.map(c => c.name), ['Tilbake til utvalget', 'Forrige', 'Neste']);
        assert(controls.every(c => c.icon === 1 && !c.title), 'one decorative Phosphor icon per control; names are the visible labels');
        assert(controls[0].iconFirst && controls[1].iconFirst && controls[2].iconLast);
        assert.deepEqual(controls.map(c => c.disabled), [false, true, false]);
        const prev = `Array.from(${nav}.querySelectorAll('button')).find(b => b.innerText.trim() === 'Forrige')`;
        const next = `Array.from(${nav}.querySelectorAll('button')).find(b => b.innerText.trim() === 'Neste')`;
        const back = `${nav}.querySelector('[data-gmi-individual-back]')`;
        const style = (element) => browser.evaluate(`(() => { const s = getComputedStyle(${element}); return { cursor: s.cursor, opacity: s.opacity, border: s.borderTopColor, color: s.color, deco: s.textDecorationThickness }; })()`);
        assert.deepEqual([(await style(prev)).cursor, (await style(prev)).opacity], ['not-allowed', '0.5'], 'disabled Forrige is visibly disabled');
        const nextBefore = await style(next); await hover(next);
        await browser.waitFor(`getComputedStyle(${next}).borderTopColor === ${JSON.stringify(TEAL)}`);
        assert.notEqual(nextBefore.border, TEAL, 'hover feedback on Neste');
        const backBefore = await style(back); await hover(back);
        await browser.waitFor(`getComputedStyle(${back}).color !== ${JSON.stringify(backBefore.color)}`);
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 });
        // Keyboard: focus-visible ring and Enter/Space activation.
        await browser.evaluate(`${next}.focus()`); await key('Enter', 'Enter', 13); await current(1);
        await browser.evaluate(`${next}.focus()`);
        assert(await browser.evaluate(`${next}.matches(':focus-visible') && getComputedStyle(${next}).boxShadow !== 'none'`), 'visible focus ring');
        await key(' ', 'Space', 32); await current(2);
        await browser.evaluate(`${prev}.focus()`); await key('Enter', 'Enter', 13); await current(1);
        // Draft guard unchanged.
        await clear(); await type('vlp'); await key('Escape', 'Escape', 27);
        await click('Neste', nav); await browser.waitFor(guard); await click('Avbryt', guard);
        await browser.waitFor(`!${guard}`); await current(1);
        assert.equal(await browser.evaluate(`${linkedInput}.value`), 'VLP', 'draft kept after cancelling');
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          assert(await browser.evaluate(`document.documentElement.scrollWidth <= ${width}`));
          assert(await browser.evaluate(`Array.from(${nav}.querySelectorAll('button')).every(e => { const r = e.getBoundingClientRect();
            return r.top >= 0 && r.bottom <= innerHeight && e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })`), 'navigation reachable');
          assert(await browser.evaluate(`(() => { const [a, b] = Array.from(${nav}.querySelectorAll('.gmi-edit-history button')).map(e => e.getBoundingClientRect().height); return Math.abs(a - b) < 0.5; })()`), 'one row height');
          await screenshot(`a6-b3-nav-${width}x${height}.png`);
        }
        await click('Tilbake til utvalget', nav); await browser.waitFor(guard); await click('Forkast skjemaet', guard);
        await browser.waitFor(batch);
        assert.deepEqual(await browser.evaluate(`Array.from(${grid}.querySelectorAll('[data-table-row][aria-selected=true]')).map(e => Number(e.dataset.tableRow)).sort((a, b) => a - b)`), [0, 1, 2]);
        await browser.evaluate(`${batch}.querySelector('[data-gmi-batch-cancel]').click()`);
        if (await browser.evaluate(`Boolean(${guard})`)) await click('Forkast skjemaet', guard);
        if (await browser.evaluate(`Boolean(${bar})`)) await click('Fjern utvalg', bar);
      });

      await t.test('verified download changes only the approved linked spans', async () => {
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
        assert.deepEqual(verifyCellChanges(loadGmiDocument(bytes), output, [
          { scope: 'line', sourceIndex: 0, field: 'Tema', lexeme: 'VL' }, { scope: 'line', sourceIndex: 0, field: 'S_FCODE', lexeme: 'VL' }]).failures, []);
        await click('Lukk', dialog);
      });
      assert.deepEqual(new Uint8Array(await readFile(file)), new Uint8Array(bytes), 'contractor file unchanged');
      assert.equal(browser.events.filter(event => event.method === 'Runtime.exceptionThrown').length, 0);
    } finally {
      await browser.close();
      if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('gmi-a6-search-ui-')) throw new Error('Unsafe fixture path');
      await rm(directory, { recursive: true, force: true });
    }
  });
