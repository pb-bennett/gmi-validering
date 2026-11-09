import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { BATCH_ROWS, gmiEditBatchFixture } from './helpers/gmiEditBatchFixture.mjs';

const app = process.env.PHOTO_UI_URL;
const workspace = 'document.querySelector(".gmi-edit-workspace")';
const dialog = 'document.querySelector("dialog[open].gmi-batch-dialog")';
test('M5B production: configure, bounded review, exclusions, confirmation, history, conflicts and cancellation',
  { skip: !chromePath || !app, timeout: 180000 }, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gmi-batch-ui-'));
    const file = path.join(directory, 'Syntetisk M5B.gmi');
    await writeFile(file, gmiEditBatchFixture({ rows: [...BATCH_ROWS, ...Array.from({ length: 120 }, () => ['VL', 'PE', '', '', ''])] }));
    const browser = await openTestChrome();
    const click = (text, scope = 'document') => browser.evaluate(`(() => { const button = Array.from(${scope}.querySelectorAll('button')).find(e => e.innerText.trim() === ${JSON.stringify(text)} || e.getAttribute('aria-label') === ${JSON.stringify(text)});
      if (!button || button.disabled) throw new Error('Unavailable: ' + ${JSON.stringify(text)}); button.click(); })()`);
    const input = (selector, value) => browser.evaluate(`(() => { const input = ${selector}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const text = () => browser.evaluate(`${dialog}.innerText`);
    const waitStep = (step) => browser.waitFor(`${dialog}?.dataset.gmiBatchStep === '${step}' && ${dialog}.getAttribute('aria-busy') === 'false'`);
    const shot = async (name) => {
      if (!process.env.GMI_EDIT_SCREENSHOT_DIR) return;
      await mkdir(process.env.GMI_EDIT_SCREENSHOT_DIR, { recursive: true });
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.GMI_EDIT_SCREENSHOT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
    };
    try {
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm = () => true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")'); await click('Lukk');
      await browser.waitFor('document.querySelector("input[type=file]")');
      await setPhotoFiles(browser, 'input[type=file]', [file]);
      await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await browser.evaluate('document.querySelector("[data-gmi-edit-action]").click()');
      await browser.waitFor(`${workspace}?.querySelector('[data-gmi-edit-status]')?.innerText === 'Redigerbar'`);

      await t.test('empty default configuration, unsafe values, overwrite warning and draft cancellation guard', async () => {
        await click('Masseendringer', workspace); await waitStep('configure');
        assert.equal(await browser.evaluate(`${dialog}.querySelector('input[value="fill-missing"]').checked`), true);
        assert.equal(await browser.evaluate(`${dialog}.querySelector('[aria-label="Ny verdi"]').value`), '');
        await input(`${dialog}.querySelector('[aria-label="Ny verdi"]')`, 'a;b');
        await browser.waitFor(`${dialog}.querySelector('[role=alert]')`);
        assert.match(await text(), /Semikolon/);
        await browser.evaluate(`${dialog}.querySelector('input[value="overwrite"]').click()`);
        assert.match(await text(), /Overskriving:/);
        await shot('m5b-configure-overwrite');
        await click('Avbryt', dialog);
        await browser.waitFor('document.querySelector("[data-gmi-confirm=batch-cancel]")');
        await click('Avbryt', 'document.querySelector("[data-gmi-confirm=batch-cancel]")');
        assert.equal(await browser.evaluate(`${dialog}.querySelector('[aria-label="Ny verdi"]').value`), 'a;b');
        await browser.evaluate(`${dialog}.querySelector('input[value="fill-missing"]').click()`);
        await input(`${dialog}.querySelector('[aria-label="Ny verdi"]')`, '11.0');
        assert.equal(await browser.evaluate(`(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })()`), true);
        await click('Nullstill og åpne ny fil');
        const navigationGuard = 'document.querySelector("dialog[open][data-gmi-confirm=workspace]")';
        await browser.waitFor(navigationGuard); await click('Avbryt', navigationGuard);
        assert.equal(await browser.evaluate(`${dialog}.querySelector('[aria-label="Ny verdi"]').value`), '11.0');
        await shot('m5b-configure-fill');
      });
      await t.test('actual M2 reasons, bounded searchable rows, individual exclusion, all and none', async () => {
        await click('Beregn utvalg', dialog); await waitStep('select');
        assert.match(await text(), /Undersøkt: 129/); assert.match(await text(), /Kvalifisert: 123/);
        assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('[data-batch-object]').length`), 50);
        assert.match(await text(), /Både SDR og Ringstivhet/);
        assert.match(await text(), /FEIL · Nytt i denne masseendringen/);
        await browser.evaluate(`${dialog}.querySelector('[data-batch-object] + tr details').open = true`);
        assert.match(await text(), /SJEKK/);
        await browser.evaluate(`${dialog}.querySelector('[data-batch-object] + tr details').open = false`);
        await browser.evaluate(`${dialog}.querySelector('.gmi-edit-check input').click()`);
        assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('[data-batch-object]').length`), 1);
        await browser.evaluate(`${dialog}.querySelector('.gmi-edit-check input').click()`);
        const colour = await browser.evaluate(`(() => { const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
          ctx.fillStyle = getComputedStyle(${dialog}.querySelector('[data-validation-tone=error]')).color; ctx.fillRect(0, 0, 1, 1);
          return Array.from(ctx.getImageData(0, 0, 1, 1).data); })()`);
        assert(colour[0] > colour[1] * 2 && colour[0] > colour[2] * 2, 'FEIL uses the shared red tone');
        await click('Velg ingen', dialog); assert.match(await text(), /Valgt: 0/);
        assert.equal(await browser.evaluate(`Array.from(${dialog}.querySelectorAll('button')).find(e => e.innerText === 'Se gjennom masseendringen').disabled`), true);
        await click('Velg alle kvalifiserte', dialog); assert.match(await text(), /Valgt: 123/);
        await browser.evaluate(`${dialog}.querySelector('[data-batch-object] input').click()`);
        assert.match(await text(), /Valgt: 122/); assert.match(await text(), /Utelatt av deg: 1/);
        await input(`${dialog}.querySelector('.gmi-batch-search input')`, 'Ledning 129');
        assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('[data-batch-object]').length`), 1);
        await input(`${dialog}.querySelector('.gmi-batch-search input')`, '');
        await click('Neste side', dialog); assert.match(await text(), /51–100 av 123/);
        await click('Forrige side', dialog);
        for (const [width, height] of [[1366, 768], [1280, 720]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          const box = await browser.evaluate(`({ footer: ${dialog}.querySelector('footer').getBoundingClientRect().toJSON(), width: document.documentElement.scrollWidth, dialogWidth: ${dialog}.clientWidth, scrollWidth: ${dialog}.scrollWidth })`);
          assert(box.footer.bottom <= height && box.footer.top >= 0); assert(box.width <= width); assert(box.scrollWidth <= box.dialogWidth);
          await shot(`m5b-review-${width}x${height}`);
        }
      });
      await t.test('final summary and warnings, exactly one ChangeSet and Data Table modes', async () => {
        await click('Se gjennom masseendringen', dialog); await waitStep('confirm');
        assert.match(await text(), /122 objekter endres i én retting/); assert.match(await text(), /0 utfylte verdier overskrives/);
        assert.match(await text(), /FEIL · Nytt i denne masseendringen/);
        await shot('m5b-confirm');
        await click('Legg til masseendring', dialog);
        await browser.waitFor(`!${dialog} && ${workspace}.querySelectorAll('[data-change-set]').length === 1`);
        assert.match(await browser.evaluate(`${workspace}.innerText`), /Fyll SDR 11.0 · 122 ledninger/);
        await click('Ledninger', 'document.querySelector(".gmi-edit-table-modes").closest(".flex.h-full.flex-col")');
        const modes = 'document.querySelector(".gmi-edit-table-modes")';
        await click('Original', modes);
        assert.equal(await browser.evaluate('document.querySelectorAll("[data-gmi-changed-cell]").length'), 0);
        await click('Foreslått', modes);
        await browser.waitFor('document.querySelectorAll("[data-gmi-changed-cell]").length > 0');
        await click('Kun endrede', modes);
        await browser.waitFor(`${modes}.dataset.gmiTableView === 'changed'`);
        assert.match(await browser.evaluate('document.querySelector(".gmi-edit-table-banner").innerText'), /122 felt/);
        await shot('m5b-changes');
      });
      await t.test('explicit conflict replacement approval, external undo invalidates open preview and forces review again', async () => {
        await click('Masseendringer', workspace);
        await input(`${dialog}.querySelector('[aria-label="Ny verdi"]')`, '17.0');
        await browser.evaluate(`${dialog}.querySelector('input[value="overwrite"]').click()`);
        await click('Beregn utvalg', dialog); await waitStep('select');
        await click('Velg alle kvalifiserte', dialog);
        assert.match(await text(), /Erstatt tidligere rettinger for 122 valgte objekter/);
        assert.equal(await browser.evaluate(`Array.from(${dialog}.querySelectorAll('button')).find(e => e.innerText === 'Se gjennom masseendringen').disabled`), true);
        await browser.evaluate(`${dialog}.querySelector('.gmi-edit-confirm input').click()`);
        await click('Se gjennom masseendringen', dialog); await waitStep('confirm');
        await shot('m5b-overwrite-conflicts');
        // Simulates a history transition from another surface while the modal remains open.
        await click('Angre siste retting', workspace);
        await browser.waitFor(`${dialog}.querySelector('[role=alert]')`);
        assert.match(await text(), /Utvalget er utdatert/);
        const guard = 'document.querySelector("dialog[open][data-gmi-confirm=workspace]")';
        if (await browser.evaluate(`Boolean(${guard})`)) await click('Avbryt', guard);
        await click('Beregn utvalget på nytt', dialog); await waitStep('select');
        assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('.gmi-edit-confirm').length`), 0);
        await click('Avbryt', dialog);
        await browser.waitFor('document.querySelector("[data-gmi-confirm=batch-cancel]")');
        await click('Forkast skjemaet', 'document.querySelector("[data-gmi-confirm=batch-cancel]")');
        await browser.waitFor(`!${dialog}`);
        await click('Gjør om retting', workspace);
        await browser.waitFor(`${workspace}.querySelectorAll('[data-change-set]').length === 1`);
        await click('Forkast alle', workspace);
        await click('Forkast alle', 'document.querySelector("dialog[open][data-gmi-confirm=workspace]")');
        await browser.waitFor(`${workspace}.querySelectorAll('[data-change-set]').length === 0`);
      });
    } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
  });
