import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { gmiFieldBatchFixture } from './helpers/gmiFieldBatchFixture.mjs';

const app = process.env.PHOTO_UI_URL;
const grid = 'document.querySelector("[role=grid]")';
const editor = 'document.querySelector("[data-gmi-object]")';
const batch = 'document.querySelector("[data-gmi-batch-inspector]")';
const bar = 'document.querySelector("[data-gmi-selection-bar]")';
const guard = 'document.querySelector(\'dialog[open][data-gmi-confirm="workspace"]\')';
const box = (i) => `${grid}.querySelector('[data-table-row="${i}"] input[type=checkbox]')`;
const row = (i) => `${grid}.querySelector('[data-table-row="${i}"]')`;

for (const [width, height] of [[1280, 720], [1366, 768]]) test(`T3 production ${width}x${height}: soft checkbox focus, draft retention, batch inspection and accepted highlight ownership`,
  { skip: !app || !chromePath, timeout: 180000 }, async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gmi-t3-'));
    const file = path.join(directory, 'Synthetic T3.gmi');
    const bytes = gmiFieldBatchFixture({ lines: Array.from({ length: 6 }, () => ['VL', 'PE', '', '', '', '', '160', 'R', '']) });
    await writeFile(file, bytes);
    const browser = await openTestChrome();
    const click = (label, root = 'document') => browser.evaluate(`(() => {
      const e=Array.from(${root}.querySelectorAll('button')).find(e=>e.innerText.trim()===${JSON.stringify(label)} || e.getAttribute('aria-label')===${JSON.stringify(label)});
      if(!e || e.disabled) throw new Error('Unavailable: '+${JSON.stringify(label)}); e.click(); })()`);
    const input = (selector, value) => browser.evaluate(`(() => {const e=${selector};
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const current = (i) => browser.waitFor(`${editor}?.dataset.gmiObject==='line:${i}' && ${row(i)}?.getAttribute('aria-current')==='true'`);
    const noGuard = async () => assert.equal(await browser.evaluate(`Boolean(${guard})`), false);
    const highlight = () => browser.evaluate(`({ active: ${grid}.querySelector('[aria-current=true]')?.dataset.tableRow,
      paths: Array.from(document.querySelectorAll('.leaflet-overlay-pane path')).map(e=>[e.getAttribute('d'),e.getAttribute('stroke'),e.getAttribute('stroke-width'),e.getAttribute('opacity')]) })`);
    const key = async (key, code, windowsVirtualKeyCode) => {
      await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode });
      await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode });
    };
    try {
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear();window.confirm=()=>true;' });
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
        await browser.waitFor('document.querySelector("button[aria-label=Lukk]")'); await click('Lukk');
        await setPhotoFiles(browser, 'input[type=file]', [file]);
        await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
        await browser.evaluate('document.querySelector("[data-gmi-edit-action]").click()'); await browser.waitFor(box(0));
        // Real pointer check, then native Space on a row checkbox.
        const point = await browser.evaluate(`(() => {const e=${box(0)},r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,reachable:e===document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)};})()`);
        assert(point.reachable);
        await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
        await current(0); await noGuard();
        await browser.evaluate(`${box(1)}.focus()`); await key(' ', 'Space', 32); await current(1);
        assert.equal(await browser.evaluate(`${box(1)}.checked`), true);
        await browser.evaluate(`${box(0)}.click()`); await current(1); // uncheck
        const header = `${grid}.querySelector('[role=columnheader] input[type=checkbox]')`;
        await browser.evaluate(`${header}.click()`); await current(1);
        assert.equal(await browser.evaluate(`${grid}.querySelectorAll('[data-table-row] input:checked').length`), 6);
        await browser.evaluate(`${header}.click()`); await current(1);
        await browser.evaluate(`${grid}.focus()`); await key('End', 'End', 35); await key(' ', 'Space', 32); await current(5);
        assert.equal(await browser.evaluate(`document.activeElement===${grid}`), true, 'soft focus does not steal grid keyboard focus');
        await key(' ', 'Space', 32); await current(5); // keyboard uncheck
        await browser.evaluate(`${box(0)}.click()`); await current(0);
        await click('Velg alle 6 synlige', bar); await current(0);
        await click('Fjern utvalg', bar); await current(0);
        const draft = `${editor}.querySelector('[data-field="Merknad"] input')`;
        await input(draft, 'Unsubmitted correction');
        await browser.waitFor(`${editor}.querySelector('[data-field="Merknad"]').dataset.state==='draft'`);
        await browser.waitFor('document.querySelector(".leaflet-overlay-pane path")');
        const before = await highlight();
        await browser.evaluate(`${box(2)}.click()`); await noGuard(); await current(0);
        assert.equal(await browser.evaluate(`${box(2)}.checked`), true);
        assert.equal(await browser.evaluate(`${draft}.value`), 'Unsubmitted correction');
        await browser.waitFor('document.querySelector("[data-gmi-soft-focus-notice]")');
        assert(await browser.evaluate(`(() => {const e=document.querySelector('[data-gmi-soft-focus-notice]'),r=e.getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight;})()`), 'retained-draft explanation is visible');
        assert.deepEqual(await highlight(), before);
        await browser.evaluate(`${box(4)}.dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}))`);
        assert.deepEqual(await browser.evaluate(`Array.from(${grid}.querySelectorAll('[data-table-row] input:checked')).map(e=>Number(e.closest('[data-table-row]').dataset.tableRow))`), [2,3,4]);
        await noGuard(); await current(0);
        await browser.evaluate(`${box(4)}.click()`); await current(0);
        const shots = process.env.GMI_EDIT_SCREENSHOT_DIR || tmpdir(); await mkdir(shots, { recursive: true });
        const noticeShot = await browser.send('Page.captureScreenshot', { format: 'png' });
        await writeFile(path.join(shots, `t3-notice-${width}x${height}.png`), Buffer.from(noticeShot.data, 'base64'));
        // An ordinary row click still guards; neither pending nor cancelled navigation owns the map.
        await browser.evaluate(`${row(1)}.click()`); await browser.waitFor(guard);
        assert.deepEqual(await highlight(), before);
        await click('Avbryt', guard); await browser.waitFor(`!${guard}`); await current(0);
        assert.deepEqual(await highlight(), before);
        assert.equal(await browser.evaluate(`${draft}.value`), 'Unsubmitted correction');
        assert(await browser.evaluate('document.documentElement.scrollWidth<=innerWidth'));
        const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
        await writeFile(path.join(shots, `t3-dirty-${width}x${height}.png`), Buffer.from(data, 'base64'));
        await browser.evaluate(`${row(1)}.click()`); await browser.waitFor(guard); await click('Forkast skjemaet', guard); await current(1);
        assert.equal(await browser.evaluate('Boolean(document.querySelector("[data-gmi-soft-focus-notice]"))'), false, 'discarded draft clears its explanation');
        // A clean Shift-check focuses only the clicked endpoint. Unchecking it does not move focus.
        await browser.evaluate(`${box(4)}.dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}))`); await current(4);
        await browser.evaluate(`${box(4)}.dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}))`); await current(4);
        await click('Rediger valgte (2)', bar); await browser.waitFor(batch);
        await click('Filtrert visning', bar);
        await browser.evaluate(`(() => {const e=${batch}.querySelector('[aria-label="Felt for masseendring"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'Merknad');e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
        await input(`${batch}.querySelector('[aria-label="Ny verdi"]')`, 'Batch draft');
        await browser.evaluate(`${box(5)}.click()`);
        await browser.waitFor(`${batch}.querySelector('.gmi-batch-object-detail summary')?.innerText.includes('Ledning 6')`);
        assert.equal(await browser.evaluate(`${batch}.querySelector('[aria-label="Ny verdi"]').value`), 'Batch draft');
        assert.match(await browser.evaluate(`${batch}.querySelector('.gmi-batch-object-detail').innerText`), /skrivebeskyttet/);
        await noGuard();
        // Close through the ordinary batch guard, stage one correction, then leave history via a check.
        await click('Avslutt', batch); await browser.waitFor(guard); await click('Forkast skjemaet', guard); await browser.waitFor(`!${batch}`);
        await browser.evaluate(`${row(1)}.click()`); await current(1);
        await input(`${editor}.querySelector('[data-field="Merknad"] input')`, 'Staged value');
        await click('Se gjennom (1)', editor); await browser.waitFor(`${editor}.querySelector('.gmi-edit-review')`);
        await click('Legg til retting', editor); await browser.waitFor(`${editor}.querySelector('[data-gmi-object-message]')`);
        await click('Endringer (1)');
        await browser.evaluate(`Array.from(document.querySelectorAll('.gmi-edit-change-list button')).find(e=>e.innerText.startsWith('Vis detaljer')).click()`);
        await browser.waitFor('document.querySelector("[data-gmi-change-detail][data-variant=history]")');
        await browser.evaluate(`${box(0)}.click()`); await current(0); await noGuard();
        assert.equal(await browser.evaluate('Boolean(document.querySelector("[data-gmi-change-detail][data-variant=history]"))'), false);
        assert.equal(await browser.evaluate(`${box(0)}.checked`), true);
      assert.deepEqual(await readFile(file), Buffer.from(bytes));
      assert.equal(browser.events.filter(e=>e.method==='Runtime.exceptionThrown').length, 0);
    } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
  });
