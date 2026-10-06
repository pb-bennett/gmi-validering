import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { assertPhotoDialogLayout } from './helpers/photoDialogLayout.mjs';

const applicationUrl = process.env.PHOTO_UI_URL;
test('rendered FOTO dialog retains accepted desktop geometry and responsive panes in every mode', { skip: !chromePath || !applicationUrl, timeout: 90000 }, async () => {
  const browser = await openTestChrome();
  const results = [];
  const desktop = { width: 1680, height: 900, deviceScaleFactor: 1, mobile: false };
  const click = async (text) => browser.evaluate(`(() => {
    const button = Array.from(document.querySelectorAll('button')).find(e => e.innerText.trim() === ${JSON.stringify(text)});
    if (!button || button.disabled) throw new Error('Unavailable button: ' + ${JSON.stringify(text)});
    button.click();
  })()`);
  const screenshot = async (name) => {
    if (!process.env.PHOTO_SCREENSHOT_DIR) return;
    await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive: true });
    const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(process.env.PHOTO_SCREENSHOT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
  };
  const checkViewports = async (mode) => {
    for (const [width, height] of [[1680, 900], [1024, 620], [390, 700]]) {
      await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      results.push(await assertPhotoDialogLayout(browser, `${mode} ${width}x${height}`));
    }
    await browser.send('Emulation.setDeviceMetricsOverride', desktop);
  };
  try {
    await browser.send('Emulation.setDeviceMetricsOverride', desktop);
    await browser.send('Page.navigate', { url: applicationUrl + '/?testmodus=1' });
    await browser.waitFor(`document.querySelector('button[aria-label="Lukk"]')`);
    await browser.evaluate(`document.querySelector('button[aria-label="Lukk"]').click()`);
    await click('Bilder');
    await browser.waitFor('document.querySelector(".photo-collection-dialog[open]")');
    await checkViewports('empty importer');
    await screenshot('photo-dialog-empty-desktop');
    // Confirm the guard rejects the reported half-width/left-edge failure.
    await browser.evaluate(`(() => { const style = document.createElement('style'); style.id = 'photo-layout-negative-control'; style.textContent = '.photo-collection-dialog { width: 50vw; margin: 0; }'; document.head.append(style); })()`);
    try {
      await assert.rejects(assertPhotoDialogLayout(browser, 'half-width negative control'), { name: 'AssertionError' });
    } finally { await browser.evaluate('document.getElementById("photo-layout-negative-control").remove()'); }

    // Real decoded photo Files, without depending on the private acceptance corpus.
    await browser.evaluate(`(async () => {
      const transfer = new DataTransfer();
      for (const [index, color] of ['#077595', '#cc7300', '#147b49'].entries()) {
        const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 960;
        const context = canvas.getContext('2d'); context.fillStyle = color; context.fillRect(0, 0, 1280, 960);
        context.fillStyle = '#fff'; context.font = '70px sans-serif'; context.fillText('Bilde ' + (index + 1), 80, 180);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        transfer.items.add(new File([blob], 'layout-photo-' + (index + 1) + '.png', {type:'image/png'}));
      }
      const input = document.querySelector('input[aria-label="Velg bildefiler"]');
      input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles:true}));
    })()`);
    await browser.waitFor('document.querySelectorAll(".photo-collection-thumbnail img").length === 3');
    await checkViewports('populated importer');
    await screenshot('photo-dialog-populated-desktop');
    assert.equal(await browser.evaluate('document.querySelectorAll(".photo-collection-card").length'), 3);
    await click('Opprett fotokartlag (3 bilder)');
    await browser.waitFor('!document.querySelector("dialog[open]")');
    await click('Bildemodul');
    await browser.waitFor('document.querySelector(".photo-workspace-shell")');
    assert.equal(await browser.evaluate('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length'), 3);
    await click('Legg til bilder');
    await browser.waitFor('document.querySelector(".photo-collection-dialog[open]")');
    await checkViewports('target-layer empty importer');
    await browser.evaluate(`(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'addition.png', {type:'image/png'}));
      const input = document.querySelector('input[aria-label="Velg bildefiler"]');
      input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles:true}));
    })()`);
    await browser.waitFor('document.querySelectorAll(".photo-collection-thumbnail img").length === 1');
    await checkViewports('target-layer populated importer');
    await screenshot('photo-dialog-additions-desktop');
    await click('Avbryt');
    await browser.waitFor('!document.querySelector("dialog[open]")');
    assert.equal(await browser.evaluate('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length'), 3);
    console.log(JSON.stringify({ dialogLayoutChecks: results.map(({ label, dialog, columns }) => ({ label, width: dialog.width, height: dialog.height, left: dialog.left, top: dialog.top, columns })) }, null, 2));
    assert.equal(browser.events.filter(event => event.method === 'Runtime.exceptionThrown').length, 0);
  } finally { await browser.close(); }
});
