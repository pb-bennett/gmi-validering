import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { gmiText } from './helpers/gmiPhotoFixtures.mjs';
import { gpsPng } from './helpers/photoGpsFixtures.mjs';
import { createLayerWithPlacement, importDialog, waitForThumbnails } from './helpers/photoImportWizard.mjs';
import { clickSourceControl, setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { resetDialog } from './helpers/sessionReset.mjs';

// Roadmap D in the real app: the native warning on reload only for a meaningful session, the reset confirmation that
// lists what would be lost, and the FOTO layer removal confirmation. Cancelling always keeps the session.
const app = process.env.PHOTO_UI_URL;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const removeDialog = 'document.querySelector("dialog[open][data-gmi-confirm=photo-layer-remove]")';

test('session-loss protection: reload warning, reset confirmation and FOTO layer removal', { skip: !app || !chromePath, timeout: 180000 }, async () => {
  const directory = await mkdtemp(path.join(path.resolve(tmpdir()), 'session-loss-ui-'));
  const browser = await openTestChrome();
  const click = (label, scope = 'document') => clickSourceControl(browser, label, scope);
  const openReset = async () => {
    // After FOTO closes, the toolbar can still have the preceding pane width until ResizeObserver runs.
    // At a narrow width the same reset action is in the overflow menu.
    const reset = 'document.querySelector(\'[role="toolbar"][aria-label="Kartverktøy"] button[aria-label="Nullstill og åpne ny fil"]\')';
    const overflow = 'document.querySelector(\'[role="toolbar"][aria-label="Kartverktøy"] button[aria-label="Flere kartverktøy"]\')';
    await browser.waitFor(`${reset} || ${overflow}`);
    const clicked = await browser.evaluate(`(() => {
      const action = ${reset};
      if (action) { action.click(); return true; }
      const menu = ${overflow};
      if (menu?.getAttribute('aria-expanded') === 'false') menu.click();
      return false;
    })()`);
    if (!clicked) {
      await browser.waitFor(reset);
      await click('Nullstill og åpne ny fil');
    }
    await browser.waitFor(resetDialog);
  };
  const shot = async (stage) => {
    const target = process.env.PHOTO_SCREENSHOT_DIR;
    if (!target) return;
    await mkdir(target, { recursive: true });
    for (const [width, height] of [[1280, 720], [1366, 768]]) {
      await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await delay(150);
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(target, `d-${stage}-${width}x${height}.png`), Buffer.from(data, 'base64'));
    }
    await browser.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  };
  // Chrome shows beforeunload only after a real user gesture on the page.
  const gesture = () => browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 5, y: 700, button: 'left', clickCount: 1 })
    .then(() => browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 5, y: 700, button: 'left', clickCount: 1 }));
  const dialogs = () => browser.events.filter((event) => event.method === 'Page.javascriptDialogOpening');
  const reloadPrompted = async () => {
    const before = dialogs().length;
    await gesture();
    const reloading = browser.send('Page.reload', {}).catch(() => {});
    for (let i = 0; i < 30 && dialogs().length === before; i++) await delay(100);
    const prompted = dialogs().length > before;
    if (prompted) {
      assert.equal(dialogs().at(-1).params.type, 'beforeunload');
      await browser.send('Page.handleJavaScriptDialog', { accept: false });
    }
    await reloading;
    return prompted;
  };
  try {
    const tile = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS3cAAAAASUVORK5CYII=';
    await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      Object.defineProperty(HTMLImageElement.prototype, 'src', { ...source, set(value) {
        source.set.call(this, String(value).includes('cache.kartverket.no/') ? ${JSON.stringify(tile)} : value);
      } });` });
    await browser.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
    await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
    await click('Lukk');

    // An empty session never warns.
    assert.equal(await reloadPrompted(), false, 'empty session: no reload warning');
    // The welcome dialog is shown once; after the reload the app opens directly.
    await browser.waitFor('document.querySelector("input[type=file]") || document.querySelector("button[aria-label=Lukk]")');
    if (await browser.evaluate('Boolean(document.querySelector("button[aria-label=Lukk]"))')) await click('Lukk');

    // DD1: a loaded file alone is meaningful. Cancelling the native warning keeps the session.
    const survey = path.join(directory, 'Tap.gmi');
    await writeFile(survey, gmiText([{ label: 'A', xyz: '500000 6640000 1' }]));
    await setPhotoFiles(browser, 'input[type=file]', [survey]);
    await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
    assert.equal(await reloadPrompted(), true, 'loaded file: the browser warns before reload');
    await delay(300);
    assert(await browser.evaluate('Boolean(document.querySelector("[data-gmi-edit-action]"))'), 'cancelling the reload keeps the loaded file');

    // FOTO layer with photos: DD2 confirmation; cancel keeps it.
    const photo = path.join(directory, 'a.png');
    await writeFile(photo, gpsPng());
    await click('Bilder');
    await browser.waitFor(importDialog);
    await setPhotoFiles(browser, 'input[aria-label="Velg bildefiler"]', [photo]);
    await waitForThumbnails(browser);
    await browser.waitFor(`${importDialog}.dataset.exifPending === '0'`);
    await createLayerWithPlacement(browser, 'exif');
    await click('Lukk FOTO');
    await browser.waitFor('!document.querySelector(".photo-workspace-shell")');

    // Reset lists what would be lost; «Avbryt» keeps everything.
    await openReset();
    assert.equal(await browser.evaluate(`${resetDialog}.querySelector('h2').innerText`), 'Nullstille økten?');
    assert.equal(await browser.evaluate(`${resetDialog}.querySelector('[data-reset-loss]').innerText`), 'Dette forsvinner fra økten: 1 kartlag · 1 fotolag med 1 bilde.');
    assert.deepEqual(await browser.evaluate(`Array.from(${resetDialog}.querySelectorAll('button')).map((b) => b.innerText.trim())`), ['Avbryt', 'Nullstill']);
    await shot('reset-confirmation');
    await click('Avbryt', resetDialog);
    await browser.waitFor(`!${resetDialog}`);
    assert(await browser.evaluate('Boolean(document.querySelector("[data-gmi-edit-action]")) && Boolean(document.querySelector(\'section[aria-label^="Fotokartlag"]\'))'), 'cancel keeps the session');

    await browser.evaluate('document.querySelector(\'button[aria-label^="Fjern fotokartlag"]\').click()');
    await browser.waitFor(removeDialog);
    assert.match(await browser.evaluate(`${removeDialog}.innerText`), /Fjerne fotolaget\?[\s\S]*Fjerne «Bilder» og 1 bilde fra økten\?/);
    await shot('photo-layer-remove');
    await click('Avbryt', removeDialog);
    await browser.waitFor(`!${removeDialog}`);
    assert(await browser.evaluate('Boolean(document.querySelector(\'section[aria-label^="Fotokartlag"]\'))'), 'cancel keeps the FOTO layer');

    // Confirmed reset empties the session; afterwards a reload no longer warns.
    await openReset();
    await click('Nullstill', resetDialog);
    await browser.waitFor('document.querySelector("input[type=file]") && !document.querySelector("[data-gmi-edit-action]")');
    assert.equal(await browser.evaluate('(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })()'), false);
    assert.equal(await reloadPrompted(), false, 'after reset: no reload warning');
    assert.deepEqual(browser.events.filter((event) => event.method === 'Runtime.exceptionThrown').map((event) => event.params.exceptionDetails.text), []);
  } finally {
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});
