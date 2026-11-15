import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { createWorkspaceFixtures, openWorkspace } from './helpers/photoWorkspaceFixtures.mjs';
import { clickSourceControl as click } from './helpers/photoSourceWorkflow.mjs';

const app = process.env.PHOTO_UI_URL;
const dialog = 'document.querySelector(".photo-remove-confirmation[open]")';
const selected = 'Array.from(document.querySelectorAll(".photo-workspace-list input:checked")).map(e => e.closest("li").dataset.photoId)';
const count = 'document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length';
const opener = 'Array.from(document.querySelectorAll(".photo-removal-actions button")).find(e => e.innerText.startsWith("Fjern 1"))';

test('Removal confirmation: Escape and cancel preserve selection, restore focus and never remove; explicit confirmation removes',
  { skip: !app || !chromePath, timeout: 180000 }, async () => {
    const fixtures = await createWorkspaceFixtures(), browser = await openTestChrome();
    try {
      await openWorkspace(browser, app, fixtures, { width: 1280, height: 720 });
      await click(browser, 'Fjern bilder fra laget…', 'document');
      await browser.evaluate('document.querySelector(".photo-workspace-list input").click()');
      const ids = await browser.evaluate(selected);
      for (const escape of [true, false]) {
        const width = escape ? 1280 : 1366, height = escape ? 720 : 768;
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        await browser.evaluate(`${opener}.focus(); ${opener}.click()`);
        await browser.waitFor(dialog);
        assert(await browser.evaluate(`(() => { const r=${dialog}.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })()`));
        assert(await browser.evaluate(`(() => { const e=${dialog}.querySelector('.photo-remove-confirm'), probe=document.createElement('span'); probe.style.color='var(--gmi-validation-error-text)'; e.append(probe); const matches=getComputedStyle(e).color === getComputedStyle(probe).color; probe.remove(); return matches; })()`));
        assert.equal(await browser.evaluate('getComputedStyle(document.querySelector(".photo-workspace-list input")).accentColor'), 'rgb(0, 117, 149)');
        if (process.env.PHOTO_SCREENSHOT_DIR) {
          await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive: true });
          const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
          await writeFile(path.join(process.env.PHOTO_SCREENSHOT_DIR, `removal-confirmation-${width}x${height}.png`), Buffer.from(data, 'base64'));
        }
        if (escape) {
          await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
          await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        } else await click(browser, 'Avbryt', dialog);
        await browser.waitFor(`!${dialog}`);
        assert.equal(await browser.evaluate(count), 5);
        assert.equal(await browser.evaluate('document.querySelector(".photo-workspace-collection").dataset.mode'), 'remove');
        assert.deepEqual(await browser.evaluate(selected), ids);
        assert(await browser.evaluate(`document.activeElement === ${opener}`));
      }
      await browser.evaluate(`${opener}.click()`);
      await browser.waitFor(dialog);
      assert(await browser.evaluate(`${dialog}.querySelector('.photo-remove-confirm').classList.contains('gmi-edit-destructive')`));
      await click(browser, 'Fjern fra lag', dialog);
      await browser.waitFor(`!${dialog} && ${count} === 4`);
      assert.equal(await browser.evaluate(selected + '.length'), 0);
    } finally { await browser.close(); await fixtures.cleanup(); }
  });
