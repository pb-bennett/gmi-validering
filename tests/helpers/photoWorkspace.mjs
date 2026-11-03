import { clickSourceControl } from './photoSourceWorkflow.mjs';

// Shared FOTO workspace interactions. Gestures use CDP mouse input so Leaflet and pointer events see a real drag.
export const editTarget = 'document.querySelector(".leaflet-photo-placement-pane .leaflet-marker-icon[data-edit-target]")';
export const editKnob = 'document.querySelector(".photo-edit-knob")';
export const commandBar = 'document.querySelector(".photo-edit-command-bar")';

export const openTool = (browser, label) => clickSourceControl(browser, label, 'document');
export const clickText = (browser, label, scope = 'document') => clickSourceControl(browser, label, scope);

export async function enterEditMode(browser) {
  await openTool(browser, 'Rediger bilder');
  await browser.waitFor(commandBar);
}

export async function selectPhotoRow(browser, photoId) {
  await browser.evaluate(`document.querySelector('.photo-workspace-list li[data-photo-id="${photoId}"] .photo-workspace-row').click()`);
  await browser.waitFor(`document.querySelector('.photo-workspace-list li[data-photo-id="${photoId}"] .photo-workspace-row')?.getAttribute('aria-pressed')==='true'`);
}

export const elementCentre = (browser, expression) => browser.evaluate(`(() => { const box=(${expression}).getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; })()`);

export async function mouseDrag(browser, from, to, { steps = 8, release = true } = {}) {
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y, button: 'none', buttons: 0 });
  await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= steps; i++) {
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps, button: 'left', buttons: 1 });
  }
  if (release) await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 });
}

export async function dragSelectedMarker(browser, dx, dy, options) {
  await browser.waitFor(editTarget);
  const from = await elementCentre(browser, editTarget);
  await mouseDrag(browser, from, { x: from.x + dx, y: from.y + dy }, options);
}

// Rotate with the knob to an absolute bearing (0° = up = north, clockwise).
export async function rotateSelected(browser, degrees, options) {
  await browser.waitFor(editKnob);
  const anchor = await elementCentre(browser, editTarget), knob = await elementCentre(browser, editKnob);
  const angle = degrees * Math.PI / 180;
  await mouseDrag(browser, knob, { x: anchor.x + 70 * Math.sin(angle), y: anchor.y - 70 * Math.cos(angle) }, options);
}

export async function pressKey(browser, key, { code = key, keyCode = 0, modifiers = 0 } = {}) {
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, modifiers });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, modifiers });
}
export const KEYS = Object.freeze({ Escape: { code: 'Escape', keyCode: 27 }, Enter: { code: 'Enter', keyCode: 13 }, ArrowRight: { code: 'ArrowRight', keyCode: 39 },
  ArrowLeft: { code: 'ArrowLeft', keyCode: 37 }, ArrowUp: { code: 'ArrowUp', keyCode: 38 }, ArrowDown: { code: 'ArrowDown', keyCode: 40 }, Tab: { code: 'Tab', keyCode: 9 } });

export async function saveEdits(browser) {
  await clickText(browser, 'Lagre endringer');
  await browser.waitFor(`!${commandBar}`);
}

export async function discardEdits(browser) {
  await clickText(browser, 'Forkast endringer');
  await browser.waitFor('document.querySelector(".photo-edit-boundary[open]")');
  await clickText(browser, 'Forkast', 'document.querySelector(".photo-edit-boundary")');
  await browser.waitFor(`!${commandBar}`);
}
