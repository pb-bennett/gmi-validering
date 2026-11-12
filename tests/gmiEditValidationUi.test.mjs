import { clickGmiTableObject } from './helpers/gmiTableNavigation.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { gmiEditValidationFixture } from './helpers/gmiEditValidationFixture.mjs';

const app = process.env.PHOTO_UI_URL;
const editor = 'document.querySelector(".gmi-edit-editor")';
const workspace = 'document.querySelector(".gmi-edit-workspace")';
const row = (field) => `${editor}.querySelector('tr[data-field="${field}"]')`;
const exclusive = 'innmaling.line.sdr-ring-stiffness.exclusive';
const finding = (field, ruleId, transition) => `${row(field)}.querySelector('[data-gmi-finding="${ruleId}"]${transition ? `[data-transition="${transition}"]` : ''}')`;

test('M5A: shared Validator findings, effective drafts, severity tooltips, staging and table object types',
  { skip: !chromePath || !app, timeout: 180000 }, async (t) => {
    const directory = await mkdtemp(path.join(path.resolve(tmpdir()), 'gmi-edit-validation-ui-'));
    const file = path.join(directory, 'Syntetisk M5A.gmi');
    const futureDate = `19.11.${new Date().getUTCFullYear() + 1}`;
    const bytes = gmiEditValidationFixture({ captureDate: futureDate });
    await writeFile(file, bytes);
    const browser = await openTestChrome();
    const click = (text, scope = 'document') => browser.evaluate(`(() => {
      const button = Array.from(${scope}.querySelectorAll('button')).find(e => e.innerText.trim() === ${JSON.stringify(text)} || e.getAttribute('aria-label') === ${JSON.stringify(text)});
      if (!button || button.disabled) throw new Error('Unavailable: ' + ${JSON.stringify(text)}); button.click();
    })()`);
    const edit = (field, value) => browser.evaluate(`(() => { const input = ${row(field)}.querySelector('input, select'), select = input.tagName === 'SELECT';
      Object.getOwnPropertyDescriptor(select ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event(select ? 'change' : 'input', { bubbles: true })); })()`);
    const select = async (key) => {
      await clickGmiTableObject(browser, key);
      await browser.waitFor(`${editor}?.dataset.gmiObject === ${JSON.stringify(key)}`);
    };
    const checked = () => browser.waitFor(`${editor}.querySelector('[data-gmi-object-validation]')?.innerText.startsWith('Objektkontroll:')`);
    const checkTooltip = async (selector, tone) => {
      await browser.evaluate(`${selector}.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }))`);
      await browser.waitFor(`document.querySelector('.photo-icon-tooltip[data-validation-tone="${tone}"]')`);
      for (const scheme of ['light', 'dark']) {
        await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
        const appearance = await browser.evaluate(`(() => {
          const button = ${selector}, tip = document.querySelector('.photo-icon-tooltip'), style = getComputedStyle(tip);
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1; const ctx = canvas.getContext('2d');
          const luminance = (colour) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = colour; ctx.fillRect(0, 0, 1, 1);
            const channels = Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
            return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722; };
          const fg = luminance(style.color), bg = luminance(style.backgroundColor), box = button.getBoundingClientRect();
          return { contrast: (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05), border: style.borderTopWidth,
            tone: tip.dataset.validationTone, text: tip.textContent, icon: button.querySelector('svg').getAttribute('width'),
            target: [box.width, box.height], alignment: getComputedStyle(button.parentElement).alignItems };
        })()`);
        assert(appearance.contrast >= 4.5, `${tone} tooltip contrast in ${scheme}: ${appearance.contrast}`);
        assert.equal(appearance.border, '1px');
        assert.equal(appearance.tone, tone);
        assert.doesNotMatch(appearance.text, /innmaling\./);
        assert.equal(appearance.icon, '18');
        assert.deepEqual(appearance.target, [24, 24]);
        assert.equal(appearance.alignment, 'center');
        if (scheme === 'light' && process.env.GMI_EDIT_SCREENSHOT_DIR) {
          const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
          await writeFile(path.join(process.env.GMI_EDIT_SCREENSHOT_DIR, `m5a-polish-${tone}-tooltip.png`), Buffer.from(data, 'base64'));
        }
      }
      await browser.evaluate(`${selector}.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }))`);
      await browser.waitFor('!document.querySelector(".photo-icon-tooltip")');
    };
    const tableType = () => browser.evaluate(`Array.from(document.querySelector('.gmi-edit-table-modes').parentElement.querySelectorAll('button.gmi-selected-control')).map(e => e.innerText.trim())[0]`);
    const stage = async (count) => {
      await browser.evaluate(`Array.from(${editor}.querySelectorAll('.gmi-edit-confirm input')).filter(e => !e.checked).forEach(e => e.click())`);
      await click(`Se gjennom (${count})`, editor);
      await browser.waitFor(`${editor}.querySelector('.gmi-edit-review')`);
      // G5: the explicit review gate is separate from overwrite/replacement confirmation.
      await browser.evaluate(`${editor}.querySelector('[data-gmi-new-errors] input')?.click()`);
      await click('Legg til retting', editor);
      await browser.waitFor(`!${editor}.querySelector('.gmi-edit-review')`);
      await checked();
    };
    try {
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm = () => true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
      await click('Lukk');
      await browser.waitFor('document.querySelector("input[type=file]")');
      await setPhotoFiles(browser, 'input[type=file]', [file]);
      await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await browser.evaluate('document.querySelector("[data-gmi-edit-action]").click()');
      await browser.waitFor(`${workspace}?.querySelector('[data-gmi-edit-status]')?.innerText === 'Redigerbar'`);
      await select('line:0'); await checked();

      await t.test('original FEIL and SJEKK attach to fields with accessible explanatory tooltips', async () => {
        assert.equal(await tableType(), 'Ledninger');
        const back = `${workspace}.querySelector('button[aria-label="Tilbake til appen"]')`;
        await browser.evaluate(`${back}.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }))`);
        await browser.waitFor('document.querySelector(".photo-icon-tooltip")');
        assert.equal(await browser.evaluate('document.querySelector(".photo-icon-tooltip").hasAttribute("data-validation-tone")'), false, 'ordinary FOTO/shared control tooltip keeps its default styling');
        await browser.evaluate(`${back}.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }))`);
        await browser.waitFor('!document.querySelector(".photo-icon-tooltip")');
        assert.equal(await browser.evaluate(`${finding('Dimensjon', 'innmaling.line.dimension.required', 'original')}.dataset.severity`), 'FAIL');
        const warning = finding('Målemetode', 'innmaling.common.measurement-method.required', 'original');
        assert.equal(await browser.evaluate(`${warning}.dataset.severity`), 'CHECK');
        const tooltip = await browser.evaluate(`${warning}.getAttribute('data-icon-tooltip')`);
        assert.match(tooltip, /SJEKK · Finnes i originalen[\s\S]*Målemetode/);
        assert.doesNotMatch(tooltip, /innmaling\./);
        await browser.evaluate(`${warning}.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }))`);
        await browser.waitFor('document.querySelector(".photo-icon-tooltip")');
        assert.equal(await browser.evaluate('document.querySelector(".photo-icon-tooltip").textContent'), tooltip);
        await browser.evaluate(`${warning}.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }))`);
        await browser.waitFor('!document.querySelector(".photo-icon-tooltip")');
        await checkTooltip(warning, 'warning');
        await checkTooltip(finding('Dimensjon', 'innmaling.line.dimension.required', 'original'), 'error');
        // Keyboard modality, focus-visible tooltip and Escape without invoking an action.
        await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        await browser.evaluate(`${warning}.focus()`);
        await browser.waitFor(`${warning}.dataset.tooltipOpen === 'true'`);
        await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await browser.waitFor('!document.querySelector(".photo-icon-tooltip")');
        assert.equal(await browser.evaluate('document.activeElement.classList.contains("gmi-edit-finding")'), true);
        await browser.evaluate('document.activeElement.blur()');
        assert.match(await browser.evaluate(`${finding('Datafangstdato', 'innmaling.common.capture-date.required', 'original')}.getAttribute('data-icon-tooltip')`), new RegExp(`Datafangstdato er ${futureDate.replaceAll('.', '\\.')}, som ligger i fremtiden`));
        assert.equal(await browser.evaluate(`Boolean(${finding('SDR', exclusive)})`), false, 'SP/PVC + SN8 and empty SDR is not a conflict');
      });

      await t.test('draft relationship FEIL, resolved original finding, exact values, debounce and spacing', async () => {
        await edit('SDR', '11'); await edit('Dimensjon', '200'); await checked();
        assert.equal(await browser.evaluate(`${finding('SDR', exclusive, 'introduced')}.dataset.severity`), 'FAIL');
        assert.match(await browser.evaluate(`${finding('Ringstivhet', exclusive, 'introduced')}.getAttribute('aria-label')`), /Både SDR og Ringstivhet/);
        assert.equal(await browser.evaluate(`Boolean(${finding('Dimensjon', 'innmaling.line.dimension.required', 'resolved')})`), true);
        await checkTooltip(finding('Dimensjon', 'innmaling.line.dimension.required', 'resolved'), 'success');
        await checkTooltip(finding('SDR', exclusive, 'introduced'), 'error');
        assert.equal(await browser.evaluate(`(() => { const buttons = Array.from(${row('SDR')}.querySelectorAll('.gmi-edit-finding')).map(e => e.getBoundingClientRect());
          return buttons.every((a, i) => buttons.every((b, j) => i === j || a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)); })()`), true, 'multiple indicators do not overlap');
        assert.equal(await browser.evaluate(`${row('SDR')}.children[1].innerText`), 'tom');
        assert.equal(await browser.evaluate(`${row('SDR')}.querySelector('input').value`), '11');
        assert.equal(await browser.evaluate(`${row('Ringstivhet')}.querySelector('select').value`), 'SN8');
        const spacing = await browser.evaluate(`(() => { const pill = ${row('SDR')}.querySelector('.gmi-edit-state-pill');
          return [getComputedStyle(pill).marginTop, getComputedStyle(pill).marginBottom]; })()`);
        assert.deepEqual(spacing, ['6px', '0px']);
        // All these React input events happen before the debounce can expire.
        for (const value of ['1', '11', '11.0']) await edit('SDR', value);
        await checked();
        assert.equal(await browser.evaluate(`${row('SDR')}.querySelectorAll('[data-gmi-finding="${exclusive}"]').length`), 1);
        await edit('Ringstivhet', ''); await checked();
        assert.equal(await browser.evaluate(`Boolean(${finding('SDR', exclusive)})`), false);
        await click('Forkast skjema', editor); await checked();
      });

      await t.test('FEIL remains advisory: stage a conflict, then resolve it in another correction', async () => {
        await edit('SDR', '11.0'); await checked();
        await stage(1);
        assert.equal(await browser.evaluate(`${finding('SDR', exclusive, 'introduced')}.dataset.severity`), 'FAIL');
        assert.equal(await browser.evaluate(`${row('SDR')}.querySelector('.gmi-edit-state-pill').innerText`), 'Foreslått · cs-1');
        assert.equal(await browser.evaluate(`getComputedStyle(${row('SDR')}.querySelector('.gmi-edit-state-pill')).marginTop`), '6px');
        await edit('Ringstivhet', ''); await stage(1);
        assert.equal(await browser.evaluate(`Boolean(${finding('SDR', exclusive)})`), false);
      });

      await t.test('original conflict resolves in draft; previously staged Material changes applicability', async () => {
        await select('line:1'); await checked();
        assert.equal(await browser.evaluate(`${finding('SDR', exclusive, 'original')}.dataset.severity`), 'FAIL');
        await edit('Ringstivhet', ''); await checked();
        assert.equal(await browser.evaluate(`Boolean(${finding('SDR', exclusive, 'resolved')})`), true);
        await click('Forkast skjema', editor);
        await select('line:2'); await checked();
        assert.equal(await browser.evaluate(`${finding('SDR', 'innmaling.line.sdr.valid', 'original')}.dataset.severity`), 'CHECK');
        await edit('Material', 'PE'); await stage(1);
        assert.equal(await browser.evaluate(`Boolean(${finding('SDR', 'innmaling.line.sdr.valid', 'resolved')})`), true);
        await edit('Merknad', 'Lokal verdi'); await checked();
        assert.equal(await browser.evaluate(`Boolean(${finding('SDR', 'innmaling.line.sdr.valid', 'resolved')})`), true);
        await click('Forkast skjema', editor);
      });

      await t.test('scope switches synchronise the table; object selection still guards the draft', async () => {
        await edit('Merknad', 'Behold utkast');
        await click('Punkter', 'document.querySelector("[data-table-geometry]")');
        assert.equal(await tableType(), 'Punkter', 'explicit table geometry switches the browsing context');
        await clickGmiTableObject(browser, 'point:0');
        await browser.waitFor('document.querySelector("dialog[open][data-gmi-confirm=workspace]")');
        await click('Avbryt', 'document.querySelector("dialog[open]")');
        assert.equal(await tableType(), 'Punkter', 'cancelling object selection keeps the explicit scope');
        assert.equal(await browser.evaluate(`${editor}.dataset.gmiObject`), 'line:2');
        assert.equal(await browser.evaluate(`${row('Merknad')}.querySelector('input').value`), 'Behold utkast');
        await click('Forkast skjema', editor);
        await select('point:0'); await checked();
        assert.equal(await tableType(), 'Punkter');
        await click('Ledninger', 'document.querySelector(".gmi-edit-table-modes").parentElement');
        await select('point:0');
        assert.equal(await tableType(), 'Punkter', 'reselecting the same object restores its table type');
        await click('Ledninger', 'document.querySelector("[data-table-geometry]")'); await select('line:0'); await checked();
        assert.equal(await tableType(), 'Ledninger');
      });

      await t.test('compact warnings and input labels stay inside the inspector at laptop widths', async () => {
        for (const [width, height] of [[1366, 768], [1280, 720]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          await checked();
          assert.equal(await browser.evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
          assert.equal(await browser.evaluate(`(() => { const pane = document.querySelector('.gmi-edit-inspector'); return pane.scrollWidth <= pane.clientWidth + 2; })()`), true);
          assert.equal(await browser.evaluate(`${workspace}.querySelector('.gmi-edit-download').disabled`), false);
          assert.match(await browser.evaluate(`${workspace}.querySelector('.gmi-edit-download').innerText`), /Eksperimentell/);
          if (process.env.GMI_EDIT_SCREENSHOT_DIR) {
            const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
            await writeFile(path.join(process.env.GMI_EDIT_SCREENSHOT_DIR, `m5a-${width}.png`), Buffer.from(data, 'base64'));
          }
        }
        assert.deepEqual(new Uint8Array(await readFile(file)), bytes);
        assert.equal(browser.events.filter((event) => event.method === 'Runtime.exceptionThrown').length, 0);
      });
    } finally {
      await browser.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
