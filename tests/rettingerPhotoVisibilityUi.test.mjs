// Workspace suppression through visible controls against a production build at PHOTO_UI_URL.
// Synthetic fixtures only. Screenshots: set GMI_EDIT_SCREENSHOT_DIR.
import assert from 'node:assert/strict';
import test from 'node:test';
import { copyFile, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { createLayerWithPlacement, waitForThumbnails } from './helpers/photoImportWizard.mjs';
import { gpsPng } from './helpers/photoGpsFixtures.mjs';
import { GMI_EDIT_FIXTURE_DIR } from './helpers/gmiEditFixtures.mjs';

const app = process.env.PHOTO_UI_URL;
const shots = process.env.GMI_EDIT_SCREENSHOT_DIR;
const workspace = 'document.querySelector(".gmi-edit-workspace")';
const validatorLayer = 'document.querySelector("#validation-v2-layer")';
const toggle = 'document.querySelector("[data-rettinger-photo-toggle]")';
const markerCount = 'document.querySelectorAll(".leaflet-marker-icon[data-photo-id]").length';
const gmiFeatureCount = 'document.querySelectorAll(".leaflet-overlay-pane path.leaflet-interactive, .leaflet-marker-pane .leaflet-marker-icon:not([data-photo-id])").length';

test('A5: Rettinger hides FOTO markers per visit, «Vis bilder»/«Skjul bilder» override, exact restore, no persistent writes',
  { skip: !chromePath || !app, timeout: 300000 }, async (t) => {
    const directory = await mkdtemp(path.join(path.resolve(tmpdir()), 'rettinger-photo-visibility-ui-'));
    const first = path.join(directory, 'Syntetisk leveranse.gmi');
    const second = path.join(directory, 'Annen leveranse.gmi');
    await copyFile(path.join(GMI_EDIT_FIXTURE_DIR, 'core-crlf-latin1.gmi'), first);
    await copyFile(path.join(GMI_EDIT_FIXTURE_DIR, 'core-lf-latin1.gmi'), second);
    const photos = [0, 1].map((i) => path.join(directory, `foto-${i}.png`));
    await Promise.all(photos.map((file, i) => writeFile(file, gpsPng({ longitude: [10, 26, 5 + i * 2] }))));
    const browser = await openTestChrome();
    const clickButton = (text, scope = 'document') => browser.evaluate(`(() => {
      const buttons = Array.from(${scope}.querySelectorAll('button'));
      const button = buttons.find((e) => e.innerText.trim() === ${JSON.stringify(text)}) || buttons.find((e) => e.getAttribute('aria-label') === ${JSON.stringify(text)});
      if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') throw new Error('Unavailable button: ' + ${JSON.stringify(text)});
      button.click(); })()`);
    const openRettinger = async (name) => {
      await browser.evaluate(`Array.from(document.querySelectorAll('[data-gmi-edit-action]')).find((e) => e.closest('.py-1').innerText.includes(${JSON.stringify(name)})).click()`);
      await browser.waitFor(workspace);
    };
    const exitRettinger = async () => {
      await clickButton('Lukk Rettinger', workspace);
      await browser.waitFor(`!${workspace}`);
    };
    const openValidator = async (name) => {
      const title = `document.querySelector(${JSON.stringify(`[title="${name}.gmi"]`)})`;
      const action = `${title}.closest('.py-1').querySelector('button[aria-label=Feltvalidering]')`;
      if (!await browser.evaluate(`Boolean(${action})`)) await browser.evaluate(`${title}.click()`);
      await browser.waitFor(action);
      await browser.evaluate(`${action}.click()`);
      await browser.waitFor(`${validatorLayer}?.selectedOptions[0]?.textContent === ${JSON.stringify(`${name}.gmi`)}`);
    };
    const exitValidator = async () => {
      await clickButton('Lukk Validator');
      await browser.waitFor(`!${validatorLayer}`);
    };
    // Persistent FOTO visibility as the layer card states it (the card is the Layer Manager's own control).
    const cardVisible = () => browser.evaluate(`Array.from(document.querySelectorAll('section[aria-label^="Fotokartlag"] input[type=checkbox]')).map((e) => e.checked)`);
    const toggleState = () => browser.evaluate(`(() => { const e = ${toggle}; if (!e) return null;
      return { label: e.getAttribute('aria-label'), pressed: e.getAttribute('aria-pressed'), tooltip: e.dataset.iconTooltip, state: e.dataset.rettingerPhotoToggle,
        title: e.getAttribute('title'), inToolbar: Boolean(e.closest('[role=toolbar][aria-label="Kartverktøy"]')) }; })()`);
    // Native button activation: Enter fires on keydown and Space on keyup, which CDP only performs when text is sent.
    const key = async (name, code, keyCode, text) => {
      await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code, windowsVirtualKeyCode: keyCode, text });
      await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code, windowsVirtualKeyCode: keyCode });
    };
    const shot = async (name) => {
      if (!shots) return;
      await mkdir(shots, { recursive: true });
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(shots, `${name}.png`), Buffer.from(data, 'base64'));
    };
    const assertToolbarFit = async (width, height) => {
      const box = await browser.evaluate(`(() => { const r = (e) => e.getBoundingClientRect(), b = r(${toggle}), bar = ${toggle}.closest('[role=toolbar]');
        const apart = (o) => !o || b.right <= o.left || b.left >= o.right || b.bottom <= o.top || b.top >= o.bottom;
        const tabs = r(bar.querySelector('[class*="left-1/2"]')), zoom = document.querySelector('.leaflet-control-zoom');
        const right = Array.from(bar.querySelector('.right-0').children).map(r);
        return { inside: b.left >= r(bar).left && b.top >= r(bar).top, clearOfSwitcher: apart(tabs), clearOfZoom: apart(zoom && r(zoom)),
          clearOfRight: right.every(apart), w: b.width, h: b.height, scroll: document.documentElement.scrollWidth <= window.innerWidth }; })()`);
      assert.deepEqual(box, { inside: true, clearOfSwitcher: true, clearOfZoom: true, clearOfRight: true, w: 36, h: 36, scroll: true }, `${width}×${height}`);
    };
    const deliverySummary = async () => {
      // FOTO workspace delivery pills: the visible form of photoSession delivery decisions.
      await browser.evaluate(`document.querySelector('section[aria-label^="Fotokartlag"] button[aria-label^="Åpne"]')?.click()`);
      await browser.waitFor('document.querySelector(".photo-workspace-shell") && document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length === 2');
      const pills = await browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-list li[data-photo-id]')).map((li) => [li.dataset.photoId, li.querySelector('.photo-delivery-pill')?.innerText ?? null])`);
      const workspaceMarkers = await browser.evaluate(markerCount);
      await clickButton('Lukk FOTO');
      await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
      return { pills, workspaceMarkers };
    };
    try {
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm = () => true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
      await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
      await clickButton('Bilder');
      await browser.waitFor('document.querySelector(".photo-collection-dialog[open]")');
      await setPhotoFiles(browser, 'input[aria-label="Velg bildefiler"]', photos);
      await waitForThumbnails(browser);
      await createLayerWithPlacement(browser, 'exif');
      const deliveryBefore = await (async () => {
        const pills = await browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-list li[data-photo-id]')).map((li) => [li.dataset.photoId, li.querySelector('.photo-delivery-pill')?.innerText ?? null])`);
        return pills;
      })();
      await clickButton('Lukk FOTO');
      await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
      for (const file of [first, second]) {
        await clickButton('Legg til fil');
        await browser.waitFor('document.querySelector("input[type=file]")');
        await setPhotoFiles(browser, 'input[type=file]', [file]);
        await browser.waitFor(`Array.from(document.querySelectorAll('[data-gmi-edit-action]')).some((e) => e.closest('.py-1')?.innerText.includes(${JSON.stringify(path.basename(file, '.gmi'))}))`, 30000);
      }
      await browser.waitFor(`${markerCount} === 2`);
      const cardsBefore = await cardVisible();
      assert.deepEqual(cardsBefore, [true], 'FOTO layer is visible by its own setting');

      await t.test('normal map shows markers, legend photo modes and the shared toggle in its shown state', async () => {
        assert.equal(await browser.evaluate(markerCount), 2);
        // A8.1: the same control is offered in the main map; pressed = photos shown.
        assert.deepEqual(await toggleState(), { label: 'Vis bilder', pressed: 'true', tooltip: 'Skjul bilder', state: 'shown', title: null, inToolbar: true });
        const expanded = await browser.evaluate(`Array.from(document.querySelectorAll('button[aria-expanded]')).find((e) => e.innerText.includes('Tegnforklaring'))?.getAttribute('aria-expanded')`);
        if (expanded === 'false') await clickButton('Tegnforklaring');
        await browser.waitFor('document.querySelector("[data-legend-photos]")');
      });

      let gmiFeaturesBefore;
      await t.test('entering Rettinger hides FOTO markers; GMI geometry stays; legend follows effective visibility', async () => {
        gmiFeaturesBefore = await browser.evaluate(gmiFeatureCount);
        await openRettinger('Syntetisk leveranse');
        await browser.waitFor(`${markerCount} === 0 && ${toggle}`);
        assert.deepEqual(await toggleState(), { label: 'Vis bilder', pressed: 'false', tooltip: 'Vis bilder', state: 'hidden', title: null, inToolbar: true });
        assert(await browser.evaluate(gmiFeatureCount) > 0, 'GMI geometry still drawn');
        assert.equal(await browser.evaluate('document.querySelectorAll(".leaflet-photo-directions-pane .leaflet-marker-icon").length'), 0, 'no orphan direction arrows');
        // U3 collapses the legend on entry; opened manually it shows no photo modes while photos are suppressed.
        await clickButton('Tegnforklaring');
        await browser.waitFor(`Array.from(document.querySelectorAll('button[aria-expanded="true"]')).some((e) => e.innerText.includes('Tegnforklaring'))`);
        assert.equal(await browser.evaluate('Boolean(document.querySelector("[data-legend-photos]"))'), false);
        await shot('a5-rettinger-hidden-1366x768');
      });

      await t.test('«Vis bilder» shows markers; «Skjul bilder» hides them; keyboard and focus work', async () => {
        // Reach the control with Tab from the map toolbar's first focusable predecessor: it is in the natural tab order.
        await browser.evaluate(`(() => { const all = Array.from(document.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
          const index = all.indexOf(${toggle}); (all[index - 1] || document.body).focus(); })()`);
        await key('Tab', 'Tab', 9);
        await browser.waitFor(`document.activeElement === ${toggle}`);
        const focus = await browser.evaluate(`(() => { const s = getComputedStyle(${toggle}); return { visible: ${toggle}.matches(':focus-visible'), ring: s.outlineStyle !== 'none' || s.boxShadow !== 'none',
          tooltip: ${toggle}.dataset.tooltipOpen === 'true' ? document.querySelector('.photo-icon-tooltip')?.textContent ?? null : null }; })()`);
        assert.equal(focus.visible, true, 'keyboard focus is :focus-visible');
        assert.equal(focus.ring, true, 'visible focus indicator');
        assert.equal(focus.tooltip, 'Vis bilder', 'tooltip shows immediately on keyboard focus');
        await shot('a5-rettinger-focus-1366x768');
        await key('Enter', 'Enter', 13, String.fromCharCode(13));
        await browser.waitFor(`${markerCount} === 2`);
        assert.deepEqual(await toggleState(), { label: 'Vis bilder', pressed: 'true', tooltip: 'Skjul bilder', state: 'shown', title: null, inToolbar: true });
        await browser.waitFor('document.querySelector("[data-legend-photos]")');
        // transition-colors (150 ms) from .gmi-compact-button: read the settled pressed colours.
        // Background, colour and border transition together but round to their final values on different frames:
        // wait for the element's own CSS transitions to finish rather than for one property.
        await browser.evaluate(`Promise.all(${toggle}.getAnimations().map((animation) => animation.finished.catch(() => null)))`);
        const pressedStyle = await browser.evaluate(`(() => { const s = getComputedStyle(${toggle}); return { bg: s.backgroundColor, color: s.color, border: s.borderTopColor, w: s.width, h: s.height }; })()`);
        assert.deepEqual(pressedStyle, { bg: 'rgb(206, 250, 254)', color: 'rgb(0, 117, 149)', border: 'rgb(0, 117, 149)', w: '36px', h: '36px' });
        await shot('a5-rettinger-shown-1366x768');
        await key(' ', 'Space', 32, ' ');
        await browser.waitFor(`${markerCount} === 0 && ${toggle}.getAttribute('aria-pressed') === 'false'`);
        assert.equal(await browser.evaluate(`document.activeElement === ${toggle}`), true, 'focus stays on the control');
        // Layer cards are not rendered while Rettinger owns the sidebar; they are compared after each exit below.
      });

      await t.test('switching GMI edit layers resets the override to hidden', async () => {
        await clickButton('Vis bilder');
        await browser.waitFor(`${markerCount} === 2`);
        const canSwitch = await browser.evaluate(`Array.from(document.querySelectorAll('[data-gmi-edit-action]')).some((e) => e.closest('.py-1')?.innerText.includes('Annen leveranse') && e.offsetParent)`);
        if (canSwitch) await openRettinger('Annen leveranse');
        else { await exitRettinger(); await openRettinger('Annen leveranse'); }
        await browser.waitFor(`${markerCount} === 0 && ${toggle}?.getAttribute('aria-pressed') === 'false'`);
        t.diagnostic(canSwitch ? 'switched layer directly inside Rettinger' : 'layer card hidden in Rettinger: switched through exit and entry');
        await exitRettinger();
      });

      await t.test('leaving restores markers exactly; re-entering hides again even after «Vis bilder»', async () => {
        await browser.waitFor(`${markerCount} === 2`);
        assert.equal((await toggleState()).state, 'shown', 'the main map global choice applies again');
        assert.equal(await browser.evaluate(gmiFeatureCount), gmiFeaturesBefore, 'GMI map unchanged after the visit');
        await openRettinger('Syntetisk leveranse');
        await browser.waitFor(`${markerCount} === 0`);
        await clickButton('Vis bilder');
        await browser.waitFor(`${markerCount} === 2`);
        await exitRettinger();
        await browser.waitFor(`${markerCount} === 2`);
        await openRettinger('Syntetisk leveranse');
        await browser.waitFor(`${markerCount} === 0 && ${toggle}.getAttribute('aria-pressed') === 'false'`);
        await exitRettinger();
        assert.deepEqual(await cardVisible(), cardsBefore);
      });

      await t.test('a user-hidden FOTO layer stays hidden through Rettinger and Validator visits', async () => {
        await browser.evaluate(`document.querySelector('section[aria-label^="Fotokartlag"] input[type=checkbox]').click()`);
        await browser.waitFor(`${markerCount} === 0`);
        await openRettinger('Syntetisk leveranse');
        assert.equal(await toggleState(), null, 'nothing to show: no control');
        assert.equal(await browser.evaluate(markerCount), 0);
        await exitRettinger();
        await openValidator('Syntetisk leveranse');
        assert.equal(await toggleState(), null, 'no eligible FOTO layer in Validator');
        assert.equal(await browser.evaluate(markerCount), 0);
        await exitValidator();
        assert.equal(await browser.evaluate(markerCount), 0, 'hidden layer remains hidden');
        assert.deepEqual(await cardVisible(), [false]);
        await browser.evaluate(`document.querySelector('section[aria-label^="Fotokartlag"] input[type=checkbox]').click()`);
        await browser.waitFor(`${markerCount} === 2`);
      });

      await t.test('FOTO workspace unchanged: delivery choices intact and markers drawn', async () => {
        const after = await deliverySummary();
        assert.deepEqual(after.pills, deliveryBefore, 'delivery decisions unchanged');
        assert.equal(after.workspaceMarkers, 2, 'FOTO workspace draws its markers');
        assert.equal(await browser.evaluate(markerCount), 2);
      });

      await t.test('laptop sizes: toolbar row fits at 1280×720 and 1366×768', async () => {
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          await openRettinger('Syntetisk leveranse');
          await browser.waitFor(toggle);
          await new Promise((resolve) => setTimeout(resolve, 300));
          await assertToolbarFit(width, height);
          await shot(`a5-rettinger-toolbar-${width}x${height}`);
          await exitRettinger();
        }
      });

      await t.test('Validator entry, reveal, survey layer switch and exit preserve visibility preferences at both sizes', async () => {
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          await openValidator('Syntetisk leveranse');
          await browser.waitFor(`${markerCount} === 0 && ${toggle}?.dataset.rettingerPhotoToggle === 'hidden'`);
          assert.equal((await toggleState()).pressed, 'false');
          assert(await browser.evaluate(gmiFeatureCount) > 0);
          assert.equal(await browser.evaluate('Boolean(document.querySelector("[data-legend-photos]"))'), false);
          await assertToolbarFit(width, height);
          await clickButton('Vis bilder');
          await browser.waitFor(`${markerCount} === 2`);
          await browser.evaluate(`(() => { const select = ${validatorLayer};
            select.value = Array.from(select.options).find(e => e.textContent.includes('Annen leveranse')).value;
            select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
          await browser.waitFor(`${validatorLayer}.selectedOptions[0].textContent === 'Annen leveranse.gmi'`);
          assert.equal((await toggleState()).pressed, 'true', 'same Validator visit keeps the reveal');
          assert.equal(await browser.evaluate(markerCount), 2);
          await shot(`batch-c-validator-photos-${width}x${height}`);
          await clickButton('Vis bilder');
          await browser.waitFor(`${markerCount} === 0`);
          await exitValidator();
          await browser.waitFor(`${markerCount} === 2 && ${toggle}?.dataset.rettingerPhotoToggle === 'shown'`);
          assert.deepEqual(await cardVisible(), cardsBefore);
        }
      });

      await t.test('direct Rettinger ↔ Validator transitions start hidden in each destination', async () => {
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          await openRettinger('Syntetisk leveranse');
          await browser.waitFor(`${markerCount} === 0 && ${toggle}?.dataset.rettingerPhotoToggle === 'hidden'`);
          await clickButton('Vis bilder');
          await browser.waitFor(`${markerCount} === 2`);
          await clickButton('Åpne Validator', workspace);
          await browser.waitFor(`${validatorLayer} && !${workspace} && ${markerCount} === 0 && ${toggle}?.dataset.rettingerPhotoToggle === 'hidden'`);
          await clickButton('Vis bilder');
          await browser.waitFor(`${markerCount} === 2`);
          await browser.evaluate(`Array.from(document.querySelectorAll('[aria-label=Geometri] [role=tab]')).find(e => e.innerText.startsWith('Ledninger')).click()`);
          const rule = `document.querySelector('button[aria-label^="SDR:"]')`;
          await browser.waitFor(rule);
          await browser.evaluate(`${rule}.click()`);
          await clickButton('Lag retting…');
          await browser.waitFor(`${workspace} && !${validatorLayer} && ${markerCount} === 0 && ${toggle}?.dataset.rettingerPhotoToggle === 'hidden'`);
          await exitRettinger();
          await browser.waitFor(`${markerCount} === 2 && ${toggle}?.dataset.rettingerPhotoToggle === 'shown'`);
          assert.deepEqual(await cardVisible(), cardsBefore);
        }
        const after = await deliverySummary();
        assert.deepEqual(after.pills, deliveryBefore, 'Validator visits leave delivery choices intact');
        assert.equal(after.workspaceMarkers, 2);
      });
    } finally {
      await browser.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
