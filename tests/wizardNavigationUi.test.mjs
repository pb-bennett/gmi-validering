import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { createWorkspaceFixtures, openWorkspace } from './helpers/photoWorkspaceFixtures.mjs';
import { clickSourceControl as click, openPhotoSources, sourceWizard as wizard, stagePhotoSource, savePhotoSource } from './helpers/photoSourceWorkflow.mjs';

const app = process.env.PHOTO_UI_URL;
const draft = 'document.querySelector("dialog[open][data-gmi-confirm=positioning-draft]")';
const choices = `Array.from(${wizard}.querySelectorAll('.photo-position-choice select')).map(e=>[e.getAttribute('aria-label'),e.value])`;
const steps = `Array.from(${wizard}.querySelectorAll('.photo-import-steps li')).map(e=>e.innerText)`;
const key = async (browser, name, number) => {
  for (const type of ['keyDown', 'keyUp']) await browser.send('Input.dispatchKeyEvent', { type, key: name, code: name, windowsVirtualKeyCode: number });
};

async function layout(browser, name, labels, final = false) {
  for (const [width, height] of [[1280, 720], [1366, 768]]) {
    await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const ui = await browser.evaluate(`(() => {
      const root=${wizard}, footer=root.querySelector('footer'), buttons=Array.from(footer.querySelectorAll('button'));
      const r=footer.getBoundingClientRect(), last=buttons.at(-1), css=getComputedStyle(last);
      return {labels:buttons.map(e=>e.innerText.trim()),heights:buttons.map(e=>e.getBoundingClientRect().height),
        bounds:r.top>=0 && r.bottom<=innerHeight && r.right<=innerWidth, overflow:root.scrollWidth>root.clientWidth,
        colour:css.backgroundColor,icon:Boolean(last.querySelector('svg[aria-hidden=true]'))};
    })()`);
    assert.deepEqual(ui.labels, labels); assert(ui.heights.every(h=>h===40)); assert(ui.bounds && !ui.overflow);
    assert.equal(ui.colour, final ? 'rgb(15, 23, 43)' : 'rgb(0, 117, 149)');
    if (final) assert(ui.icon);
    if (process.env.PHOTO_SCREENSHOT_DIR) {
      await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive: true });
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.PHOTO_SCREENSHOT_DIR, `navigation-${name}-${width}x${height}.png`), Buffer.from(data, 'base64'));
    }
  }
}

test('positioning navigation: conditional numbering, adjacent steps, preserved manual choices and guarded exits',
  { skip: !app || !chromePath, timeout: 180000 }, async () => {
    const fixtures = await createWorkspaceFixtures(), browser = await openTestChrome();
    try {
      await openWorkspace(browser, app, fixtures);
      await openPhotoSources(browser);
      assert.deepEqual(await browser.evaluate(steps), ['1. Kilder', '2. Plassering', '3. Kontroll']);
      await layout(browser, 'sources', ['Avbryt', 'Neste']);
      await click(browser, 'Neste'); await browser.waitFor(`${wizard}.dataset.step==='3'`);
      await click(browser, 'Foreslå GMI for viste');
      const before = await browser.evaluate(choices);
      await layout(browser, 'positions', ['Avbryt', 'Tilbake', 'Neste']);
      await click(browser, 'Tilbake'); assert.equal(await browser.evaluate(`${wizard}.dataset.step`), '1');
      await click(browser, 'Neste'); assert.deepEqual(await browser.evaluate(choices), before);
      await click(browser, 'Neste'); assert.equal(await browser.evaluate(`${wizard}.dataset.step`), '4');
      const applyLabel = await browser.evaluate(`${wizard}.querySelector('[data-positioning-apply]').innerText`);
      await layout(browser, 'control', ['Avbryt', 'Tilbake', applyLabel], true);
      await click(browser, 'Tilbake'); assert.deepEqual(await browser.evaluate(choices), before);
      await browser.evaluate(`${wizard}.querySelector('[data-positioning-cancel]').focus()`);
      await key(browser, 'Escape', 27); await browser.waitFor(draft);
      assert.equal(await browser.evaluate('document.activeElement.innerText'), 'Fortsett posisjonering');
      await key(browser, 'Escape', 27); await browser.waitFor(`!${draft}`);
      assert.deepEqual(await browser.evaluate(choices), before);
      assert(await browser.evaluate(`${wizard}.open`), 'nested Escape must keep the parent modal open');
      await browser.waitFor(`document.activeElement === ${wizard}.querySelector('[data-positioning-cancel]')`);
      await browser.evaluate(`${wizard}.querySelector('header button').click()`); await browser.waitFor(draft);
      await click(browser, 'Fortsett posisjonering', draft); assert.deepEqual(await browser.evaluate(choices), before);
      await click(browser, 'Avbryt'); await browser.waitFor(draft);
      await click(browser, 'Forkast posisjonsvalg', draft); await browser.waitFor(`!${wizard}`);
      // Source save remains explicit, does not apply positions and stays committed on Close.
      await stagePhotoSource(browser, fixtures.gmi, 'gmi');
      assert.deepEqual(await browser.evaluate(steps), ['1. Kilder', '2. Koblinger', '3. Plassering', '4. Kontroll']);
      await layout(browser, 'source-review', ['Avbryt', 'Tilbake', 'Oppdater koblinger'], true);
      await click(browser, 'Tilbake'); assert.equal(await browser.evaluate(`${wizard}.dataset.step`), '1');
      await click(browser, 'Neste'); assert.equal(await browser.evaluate(`${wizard}.dataset.step`), '2');
      const markerCount = await browser.evaluate('document.querySelectorAll(".photo-camera-marker").length');
      await savePhotoSource(browser, 'gmi'); assert.equal(await browser.evaluate(`${wizard}.dataset.step`), '3');
      assert.equal(await browser.evaluate('document.querySelectorAll(".photo-camera-marker").length'), markerCount);
      await click(browser, 'Tilbake'); assert.equal(await browser.evaluate(`${wizard}.dataset.step`), '2');
      await layout(browser, 'saved-source', ['Lukk', 'Tilbake', 'Neste']);
      await click(browser, 'Lukk'); await browser.waitFor(`!${wizard}`);
      await openPhotoSources(browser);
      assert.equal(await browser.evaluate(`${wizard}.querySelectorAll('.photo-source-inventory [data-source-id]').length`), 1);
      await click(browser, 'Fjern kilde');
      const danger = `${wizard}.querySelector('.photo-source-removal .gmi-edit-destructive')`;
      const rect = await browser.evaluate(`${danger}.getBoundingClientRect().toJSON()`);
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      await browser.evaluate('new Promise(resolve=>setTimeout(resolve,150))');
      assert(await browser.evaluate(`(() => { const e=${danger}, probe=document.createElement('span');probe.style.color='var(--gmi-validation-error-text)';e.append(probe);const same=getComputedStyle(e).color===getComputedStyle(probe).color;probe.remove();return same; })()`), 'destructive source removal keeps its semantic red on hover');
      await click(browser, 'Avbryt fjerning');
      await click(browser, 'Avbryt'); await browser.waitFor(`!${wizard}`);
    } finally { await browser.close(); await fixtures.cleanup(); }
  });
