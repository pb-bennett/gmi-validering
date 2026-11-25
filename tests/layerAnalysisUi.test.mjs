import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { gmiEditBatchFixture } from './helpers/gmiEditBatchFixture.mjs';
import { clickSourceControl, setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { KEYS, pressKey } from './helpers/photoWorkspace.mjs';

const app = process.env.PHOTO_UI_URL;
const shots = process.env.GMI_EDIT_SCREENSHOT_DIR;
const actions = ['Marker alt i laget', 'Profilanalyse', 'Høydekontroll', 'Validator', 'Topplok'];
const profilePanel = 'document.querySelector(".profile-analysis-panel")';
const heightClose = 'document.querySelector(\'button[aria-label="Lukk høydekontroll"]\')';
const validator = 'document.querySelector("#validation-v2-layer")';

test('layer analysis matches card actions and retains results, keyboard tooltips, toggles and KOF restrictions',
  { skip: !app || !chromePath, timeout: 180000 }, async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gmi-layer-analysis-ui-'));
    const gmi = path.join(directory, 'Syntetisk analyse.gmi');
    const kof = path.join(directory, 'Syntetiske punkter.kof');
    const fixture = Buffer.from(gmiEditBatchFixture({ fields: ['Tema', 'Dimensjon'], rows: [['SP', '160']] })).toString('latin1')
      .replace('[+L_]', '[P_]\r\n_FIELDNAMES Tema;\r\n[+L_]')
      .replace('[END]', '[+P_]\r\n:P 1\r\n_FIELDVALUES KUM;\r\n/XYZ\r\n581942 6566000 0\r\n:P 2\r\n_FIELDVALUES KUM;\r\n/XYZ\r\n581946 6566002 0\r\n[END]');
    await writeFile(gmi, Buffer.from(fixture, 'latin1'));
    await writeFile(kof, '00 KOORDSYS 22\n05 1 6566001.89 581932.58 10\n');
    const browser = await openTestChrome();
    const title = (file) => `document.querySelector(${JSON.stringify(`[title="${path.basename(file)}"]`)})`;
    const card = (file) => `${title(file)}.closest('.py-1')`;
    const action = (name, file = gmi) => `${card(file)}.querySelector(${JSON.stringify(`button[aria-label="${name}"]`)})`;
    const click = (label) => clickSourceControl(browser, label, 'document');
    const focus = (target) => browser.evaluate(`${target}.focus()`);
    const tooltip = 'document.querySelector(".photo-icon-tooltip")';
    const profileWarning = `${profilePanel}?.innerText.includes('Advarsel: Delstrekning under krav')`;
    const hover = async (target) => {
      const hit = await browser.evaluate(`(() => { const button = ${target};
        button.scrollIntoView({block:'nearest'});
        const r = button.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        const top = document.elementFromPoint(x, y);
        return { x, y, target: button.getAttribute('aria-label'), over: top?.outerHTML.slice(0, 140), reachable: button.contains(top) }; })()`);
      assert(hit.reachable, JSON.stringify(hit));
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hit.x, y: hit.y, pointerType: 'mouse' });
    };
    const moveAway = () => browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
    const tab = () => pressKey(browser, 'Tab', KEYS.Tab);
    const enter = async () => {
      await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
      await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    };
    const shot = async (name) => {
      if (!shots) return;
      await mkdir(shots, { recursive: true });
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(shots, name + '.png'), Buffer.from(data, 'base64'));
    };
    try {
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
      await browser.send('Page.navigate', { url: app + '?testmodus=1' });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
      await click('Lukk');
      await setPhotoFiles(browser, 'input[type=file]', [gmi]);
      await browser.waitFor(title(gmi));
      if (!await browser.evaluate(`Boolean(${action('Profilanalyse')})`)) await browser.evaluate(`${title(gmi)}.click()`);
      await browser.waitFor(action('Profilanalyse'));
      const highlight = action('Marker alt i laget'), profile = action('Profilanalyse');
      const height = action('Høydekontroll'), topplok = action('Topplok');

      for (const [width, viewportHeight] of [[1280, 720], [1366, 768]]) {
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height: viewportHeight, deviceScaleFactor: 1, mobile: false });
        await moveAway();
        const parity = await browser.evaluate(`(() => {
          const buttons = [${actions.map((name) => action(name)).join(',')}], header = ${card(gmi)}.querySelector('[data-gmi-edit-action]');
          const metrics = (button) => {
            const icon = button.querySelector('svg'), b = button.getBoundingClientRect(), i = icon.getBoundingClientRect();
            return [b.width, b.height, i.width, i.height, getComputedStyle(button).color, icon.getAttribute('aria-hidden'), button.getAttribute('title'),
              Math.abs((b.left + b.right) / 2 - (i.left + i.right) / 2), Math.abs((b.top + b.bottom) / 2 - (i.top + i.bottom) / 2)];
          };
          const bounds = ${card(gmi)}.getBoundingClientRect();
          return { header: metrics(header), actions: buttons.map(metrics),
            row: new Set(buttons.map(b => b.getBoundingClientRect().top)).size,
            gap: getComputedStyle(buttons[0].parentElement).columnGap,
            fits: buttons.every(b => b.getBoundingClientRect().right <= bounds.right && b.getBoundingClientRect().bottom <= innerHeight) };
        })()`);
        assert.deepEqual(parity.header.slice(0, 4), [22, 22, 14, 14]);
        assert.equal(parity.row, 1);
        assert(parity.fits);
        assert.equal(parity.gap, '6px');
        for (const metrics of parity.actions) {
          assert.deepEqual(metrics.slice(0, 7), [22, 22, 16, 16, 'rgb(69, 85, 108)', 'true', null]);
          assert(metrics[7] <= 0.5 && metrics[8] <= 0.5, 'icons are centred in their existing compact targets');
        }
      }

      await hover(profile);
      assert.equal(await browser.evaluate(`Boolean(${tooltip})`), false, 'mouse tooltip starts delayed');
      await browser.waitFor(`${profile}.dataset.tooltipOpen === 'true' && ${tooltip}?.textContent === 'Åpne profilanalyse'`, 3000);
      await browser.waitFor(`getComputedStyle(${profile}).color === 'rgb(15, 23, 43)'`);
      await moveAway();
      await browser.waitFor(`!${tooltip}`);
      await focus(highlight);
      await tab();
      assert(await browser.evaluate(`document.activeElement === ${profile} && ${profile}.matches(':focus-visible')`));
      assert(await browser.evaluate(`getComputedStyle(${profile}).boxShadow !== 'none' && ${tooltip}?.textContent === 'Åpne profilanalyse'`));
      await pressKey(browser, 'Escape', KEYS.Escape);
      assert(await browser.evaluate(`!${tooltip} && document.activeElement === ${profile}`));
      await enter();
      await browser.waitFor(profileWarning);
      await click('Lukk analyse');
      await browser.waitFor(`!${profilePanel}`);
      assert.equal(await browser.evaluate(`${profile}.dataset.iconTooltip`), 'Åpne profilanalyse');
      assert.equal(await browser.evaluate(`${profile}.children.length`), 1, 'profile findings stay inside the analysis');
      await browser.evaluate(`${profile}.click()`);
      await browser.waitFor(profileWarning);
      // B1.2: an open main-map profile analysis does not leak into Validator: its panel, split map and pipe styling are
      // suspended there, and the analysis returns unchanged with the main map.
      const thinLines = `Array.from(document.querySelectorAll('.leaflet-overlay-pane path')).filter((e) => e.getAttribute('stroke-width') === '8').length`;
      const analysisLines = await browser.evaluate(thinLines);
      assert(analysisLines > 0, 'the selected pipe is drawn thicker in the main map');
      await browser.evaluate(`${action('Validator')}.click()`);
      await browser.waitFor(`${validator} && !${profilePanel}`);
      await browser.evaluate('new Promise(resolve => setTimeout(resolve, 300))');
      assert.equal(await browser.evaluate(thinLines), 0, 'no selected-pipe analysis styling in Validator');
      assert.equal(await browser.evaluate('Boolean(document.querySelector(".leaflet-container"))'), true);
      await shot('b1-2-validator-without-profile');
      await click('Lukk Validator');
      await browser.waitFor(`!${validator} && ${profileWarning}`);
      assert.equal(await browser.evaluate(thinLines), analysisLines, 'the analysis styling returns with the main map');
      await click('Lukk analyse');

      await browser.evaluate(`${height}.click()`);
      await browser.waitFor(heightClose);
      await click('Lukk høydekontroll');
      const dot = `${height}.querySelector('.gmi-validation-dot[data-validation-tone=error]')`;
      await browser.waitFor(dot);
      assert.equal(await browser.evaluate(`(() => {
        const dot = ${dot}, probe = document.createElement('span');
        probe.style.color = 'var(--gmi-validation-error-dot)'; dot.append(probe);
        const match = getComputedStyle(dot).backgroundColor === getComputedStyle(probe).color;
        probe.remove(); return match;
      })()`), true);
      await browser.evaluate(`${topplok}.click(); ${highlight}.click()`);
      await browser.waitFor(`${topplok}.getAttribute('aria-pressed') === 'true' && ${highlight}.getAttribute('aria-pressed') === 'true'`);
      await browser.waitFor(`[${topplok}, ${highlight}].every(e => getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)')`);
      const selected = await browser.evaluate(`[${topplok}, ${highlight}].map(e => [e.classList.contains('gmi-selected-control'), getComputedStyle(e).backgroundColor])`);
      assert(selected.every(([hasRecipe, background]) => hasRecipe && background !== 'rgba(0, 0, 0, 0)'));
      for (const [width, viewportHeight] of [[1280, 720], [1366, 768]]) {
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height: viewportHeight, deviceScaleFactor: 1, mobile: false });
        await browser.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'); // let the resize event settle before the tooltip opens
        await focus(profile);
        await tab();
        assert(await browser.evaluate(`document.activeElement === ${height} && ${height}.matches(':focus-visible')`));
        const tip = `document.getElementById(${height}.getAttribute('aria-describedby'))`;
        assert.equal(await browser.evaluate(`${tip}?.textContent`), 'Åpne høydekontroll · 2 objekter mangler Z');
        assert(await browser.evaluate(`(() => { const tip = ${tip}, r = tip.getBoundingClientRect();
          return [r.left + 8, r.left + r.width / 2, r.right - 8].every(x => document.elementFromPoint(x, r.top + r.height / 2) === tip); })()`),
          `the height tooltip is visible across its width at ${width}×${viewportHeight}`);
        await browser.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
        await shot(`batch-d-layer-analysis-${width}x${viewportHeight}`);
      }
      await browser.evaluate(`${topplok}.click(); ${highlight}.click()`);
      assert(await browser.evaluate(`[${topplok}, ${highlight}].every(e => e.getAttribute('aria-pressed') === 'false')`));

      await click('Legg til fil');
      await browser.waitFor('document.querySelector("input[type=file]")');
      await setPhotoFiles(browser, 'input[type=file]', [kof]);
      await browser.waitFor(title(kof));
      if (!await browser.evaluate(`Boolean(${action('Profilanalyse', kof)})`)) await browser.evaluate(`${title(kof)}.click()`);
      await browser.waitFor(action('Profilanalyse', kof));
      for (const name of ['Profilanalyse', 'Validator', 'Topplok']) {
        const target = action(name, kof);
        const state = await browser.evaluate(`(() => {
          const e = ${target}, s = getComputedStyle(e);
          return { disabled: e.getAttribute('aria-disabled'), focusable: e.tabIndex === 0,
            opacity: Number(s.opacity), color: s.color, background: s.backgroundColor };
        })()`);
        assert.equal(state.disabled, 'true');
        assert(state.focusable && state.opacity < 1);
        await hover(target);
        await browser.waitFor(`${target}.dataset.tooltipOpen === 'true' && ${tooltip}?.textContent === 'Ikke tilgjengelig for KOF'`);
        assert.deepEqual(await browser.evaluate(`(() => { const s = getComputedStyle(${target}); return [s.color, s.backgroundColor]; })()`),
          [state.color, state.background]);
        await focus(target);
        await enter();
        assert(await browser.evaluate(`document.activeElement === ${target} && !${profilePanel} && !${validator} && ${action('Topplok', kof)}.getAttribute('aria-pressed') === 'false'`));
        await moveAway();
      }
      assert(await browser.evaluate(`[${action('Marker alt i laget', kof)}, ${action('Høydekontroll', kof)}].every(e => !e.hasAttribute('aria-disabled'))`));
    } finally {
      await browser.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
