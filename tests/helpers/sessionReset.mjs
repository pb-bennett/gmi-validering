import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

// Roadmap D: «Nullstill og åpne ny fil» asks first whenever the session holds loaded files, photos or unsaved work.
// The confirmation is the last action in the dialog: «Nullstill», or «Forkast rettinger og nullstill» with staged Rettinger.
export const resetDialog = 'document.querySelector("dialog[open][data-gmi-confirm=reset]")';

export async function confirmSessionReset(browser) {
  await browser.waitFor(resetDialog);
  await browser.evaluate(`${resetDialog}.querySelector('.gmi-edit-actions button:last-child').click()`);
  await browser.waitFor(`!${resetDialog}`);
}
export async function reloadAcceptedSession(browser) {
  // Chrome only presents beforeunload after trusted user activation.
  for (const type of ['keyDown', 'keyUp']) {
    await browser.send('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  }
  const start = browser.events.length;
  const reloading = browser.send('Page.reload');
  const find = (method, matches = () => true) => browser.events.slice(start).find((event) => event.method === method && matches(event));
  let dialog;
  for (let i = 0; i < 100 && !dialog; i++) {
    dialog = find('Page.javascriptDialogOpening');
    if (!dialog) await delay(50);
  }
  if (dialog) await browser.send('Page.handleJavaScriptDialog', { accept: dialog.params.type === 'beforeunload' });
  await reloading;
  assert.equal(dialog?.params.type, 'beforeunload', 'a loaded FOTO session asks before reloading');
  let navigation;
  for (let i = 0; i < 100 && !navigation; i++) {
    navigation = find('Page.frameNavigated', ({ params }) => !params.frame.parentId);
    if (!navigation) await delay(50);
  }
  assert(navigation, 'the confirmed reload navigated the page');
}
