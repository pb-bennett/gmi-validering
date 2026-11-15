import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { createWorkspaceFixtures, openWorkspace } from './helpers/photoWorkspaceFixtures.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';

const app = process.env.PHOTO_UI_URL;
const shots = process.env.PHOTO_SCREENSHOT_DIR;
const sizes = [[1280, 720], [1366, 768]];

async function capture(browser, name) {
  if (!shots) return;
  await mkdir(shots, { recursive: true });
  const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(shots, `after-${name}.png`), Buffer.from(data, 'base64'));
}

async function feedback(browser, selector, { disabled = false, selected = false } = {}) {
  const read = () => browser.evaluate(`(() => { const s=getComputedStyle(document.querySelector(${JSON.stringify(selector)})); return {background:s.backgroundColor,opacity:s.opacity,cursor:s.cursor}; })()`);
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 });
  await new Promise(resolve => setTimeout(resolve, 200));
  const normal = await read();
  const point = await browser.evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
  await new Promise(resolve => setTimeout(resolve, 200));
  const hover = await read();
  if (disabled) {
    assert(Number(normal.opacity) < 1); assert(['default', 'not-allowed'].includes(normal.cursor));
    assert.deepEqual(hover, normal, 'unavailable controls have no enabled hover feedback');
  } else if (selected) {
    assert.equal(hover.background, normal.background, 'selection remains visibly persistent on hover');
  } else {
    assert.equal(normal.cursor, 'pointer'); assert.notEqual(hover.background, normal.background);
    await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.notEqual((await read()).background, hover.background);
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 1, y: 1, button: 'left', clickCount: 1 });
  }
}

test('workspace close family: geometry, tooltip, focus, hover, pressed and unchanged exit destinations',
  { skip: !app || !chromePath, timeout: 180000 }, async () => {
    const fixtures = await createWorkspaceFixtures(), browser = await openTestChrome();
    let familyStyle;
    const check = async (name, selector) => {
      await browser.waitFor(`document.querySelector(${JSON.stringify(selector)})`);
      for (const [width, height] of sizes) {
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: width - 2, y: height - 2 });
        await capture(browser, `${name}-${width}x${height}`);
        const info = await browser.evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}), r=e.getBoundingClientRect(), p=e.parentElement.getBoundingClientRect(), s=getComputedStyle(e); return {width:r.width,height:r.height,right:p.right-r.right,label:e.getAttribute('aria-label'),title:e.getAttribute('title'),tip:e.dataset.iconTooltip,radius:s.borderRadius,cursor:s.cursor,icon:e.querySelector('svg').getAttribute('width'),color:s.color,background:s.backgroundColor}; })()`);
        assert.equal(info.width, 32); assert.equal(info.height, 32);
        assert(info.right <= 2, 'close is at the right edge of its header row');
        assert.equal(info.label, `Lukk ${name}`); assert.equal(info.tip, info.label);
        assert.equal(info.title, null); assert.equal(info.radius, '8px');
        assert.equal(info.cursor, 'pointer'); assert.equal(info.icon, '18');
        const currentStyle = { color: info.color, background: info.background, radius: info.radius };
        familyStyle ||= currentStyle;
        assert.deepEqual(currentStyle, familyStyle, 'workspace closes use one computed style family');
      }
      const expression = `document.querySelector(${JSON.stringify(selector)})`;
      const style = () => browser.evaluate(`(() => { const s=getComputedStyle(${expression}); return {background:s.backgroundColor,shadow:s.boxShadow}; })()`);
      const normal = await style();
      const point = await browser.evaluate(`(() => { const r=${expression}.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
      await new Promise(resolve => setTimeout(resolve, 200));
      const hover = await style(); assert.notEqual(hover.background, normal.background);
      await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
      await new Promise(resolve => setTimeout(resolve, 200));
      assert.notEqual((await style()).background, hover.background);
      // Release outside: inspect the pressed state without invoking close.
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 1, y: 1, button: 'left', clickCount: 1 });
      await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      await browser.evaluate(`${expression}.focus()`);
      await browser.waitFor(`Array.from(document.querySelectorAll('.photo-icon-tooltip')).some(e=>e.innerText===${JSON.stringify(`Lukk ${name}`)})`);
      assert.match((await style()).shadow, /0, 117, 149/, 'teal keyboard focus');
      await browser.evaluate(`document.activeElement.blur()`);
    };
    try {
      await openWorkspace(browser, app, fixtures, { width: 1280, height: 720 });
      await check('FOTO', '[data-workspace-close="photo"]');
      await browser.evaluate(`document.querySelector('[data-workspace-close="photo"]').click()`);
      await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
      await browser.evaluate(`Array.from(document.querySelectorAll('button')).find(e=>e.innerText.trim()==='Legg til fil' || e.innerText.trim()==='Ã…pne fil').click()`);
      await browser.waitFor('document.querySelector("input[type=file]")');
      await setPhotoFiles(browser, 'input[type=file]', [fixtures.gmi]);
      await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await browser.evaluate('document.querySelector("[data-gmi-edit-action]").click()');
      await browser.waitFor('document.querySelector(".gmi-edit-workspace")');
      await check('Rettinger', '[data-workspace-close="rettinger"]');
      await feedback(browser, '[aria-label="Angre siste retting"]', { disabled: true });
      await feedback(browser, '[aria-label="Nullstill og åpne ny fil"]');
      await feedback(browser, '[aria-label="Kartoversikt"]', { selected: true });
      await browser.evaluate(`document.querySelector('[data-workspace-close="rettinger"]').click()`);
      await browser.waitFor('!document.querySelector(".gmi-edit-workspace")');
      await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await browser.evaluate('document.querySelector("[data-gmi-edit-action]").click()');
      await browser.waitFor(`document.querySelector('[aria-label="Full kontroll av endringer"]')`);
      await browser.evaluate(`Array.from(document.querySelectorAll('button')).find(e=>e.innerText.trim()==='\u00c5pne Validator').click()`);
      await check('Validator', '[aria-label="Lukk Validator"]');
      await browser.evaluate(`document.querySelector('[aria-label="Lukk Validator"]').focus()`);
      await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
      await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await browser.waitFor(`!document.querySelector('[aria-label="Lukk Validator"]')`);
    } finally { await browser.close(); await fixtures.cleanup(); }
  });
