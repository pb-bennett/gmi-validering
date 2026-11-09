// M4 follow-up: unsubmitted Rettinger form values (a draft, no staged
// ChangeSet) must never be lost silently. Every page-level path that would
// unmount the workspace goes through the workspace's own draft dialog:
//   - global «Nullstill og åpne ny fil»;
//   - opening FOTO from a photo marker on the map;
//   - leaving Rettinger (the only way to reach «Fjern lag» or another layer);
//   - a window file drop (refused while a draft exists).
// Cancelling must leave the whole workspace unchanged; confirming discards
// only the draft, and staged corrections keep M3's own confirmation.
import assert from 'node:assert/strict';
import test from 'node:test';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { createLayerWithPlacement, waitForThumbnails } from './helpers/photoImportWizard.mjs';
import { gpsPng } from './helpers/photoGpsFixtures.mjs';
import { GMI_EDIT_FIXTURE_DIR } from './helpers/gmiEditFixtures.mjs';

const app = process.env.PHOTO_UI_URL;
const workspace = 'document.querySelector(".gmi-edit-workspace")';
const editor = 'document.querySelector(".gmi-edit-inspector .gmi-edit-editor")';
const draftDialog = 'document.querySelector(\'dialog[open][data-gmi-confirm="workspace"]\')';
const resetDialog = 'document.querySelector(\'dialog[open][data-gmi-confirm="reset"]\')';
const marker = 'document.querySelector("[data-display-mode][data-photo-id]")';
const row = (field) => `${editor}.querySelector('tr[data-field="${field}"]')`;

function ui(browser) {
  const clickButton = (text, scope = 'document') => browser.evaluate(`(() => {
    const buttons = Array.from(${scope}.querySelectorAll('button'));
    const button = buttons.find((e) => e.innerText.trim() === ${JSON.stringify(text)}) || buttons.find((e) => e.getAttribute('aria-label') === ${JSON.stringify(text)});
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') throw new Error('Unavailable button: ' + ${JSON.stringify(text)});
    button.click(); })()`);
  const edit = (field, value) => browser.evaluate(`(() => { const input = ${row(field)}.querySelector('input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const select = async (key) => {
    await browser.evaluate(`${workspace}.querySelector('[data-object-key="${key}"]').click()`);
    await browser.waitFor(`${editor}?.dataset.gmiObject === ${JSON.stringify(key)}`);
  };
  const openRettinger = async () => {
    await browser.evaluate('document.querySelector("[data-gmi-edit-action]").click()');
    await browser.waitFor(`${workspace}?.querySelector('[data-gmi-edit-status]')?.innerText === 'Redigerbar'`);
  };
  const reset = () => browser.evaluate('document.querySelector(\'button[aria-label="Nullstill og åpne ny fil"]\').click()');
  // Everything a user could see change in Rettinger, plus the surrounding app state.
  const snapshot = () => browser.evaluate(`JSON.stringify((() => {
    const ws = ${workspace}, ed = ${editor}, modes = document.querySelector('.gmi-edit-table-modes');
    return {
      workspace: Boolean(ws), title: ws?.querySelector('h1')?.innerText ?? null, status: ws?.querySelector('.gmi-edit-status-line')?.innerText ?? null,
      tab: ws?.querySelector('[role=tab][aria-selected=true]')?.innerText ?? null, object: ed?.dataset.gmiObject ?? null,
      inputs: ed ? Array.from(ed.querySelectorAll('input')).map((input) => input.value) : null,
      drafts: ed ? Array.from(ed.querySelectorAll('tr[data-state=draft]')).map((tr) => tr.dataset.field) : null,
      tableView: modes?.dataset.gmiTableView ?? null, tableRows: document.querySelectorAll('.group.flex.cursor-pointer').length,
      layerCards: document.querySelectorAll('[data-gmi-edit-action]').length, photoMarkers: document.querySelectorAll('[data-display-mode][data-photo-id]').length,
      fotoWorkspace: Boolean(document.querySelector('.photo-workspace-shell')), uploadScreen: Boolean(document.querySelector('input[type=file]')),
      openDialogs: document.querySelectorAll('dialog[open]').length,
    };
  })())`).then(JSON.parse);
  const unloadBlocked = () => browser.evaluate(`(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })()`);
  return { clickButton, edit, select, openRettinger, reset, snapshot, unloadBlocked };
}

test('Rettinger draft guard: reset, FOTO switch, leaving for layer removal and file drop never lose unsubmitted values silently',
  { skip: !chromePath || !app, timeout: 300000 }, async (t) => {
    const directory = await mkdtemp(path.join(path.resolve(tmpdir()), 'gmi-edit-draft-ui-'));
    const gmi = path.join(directory, 'Utkast leveranse.gmi');
    await copyFile(path.join(GMI_EDIT_FIXTURE_DIR, 'core-crlf-latin1.gmi'), gmi);
    const gmiBytes = await readFile(gmi);
    const photo = path.join(directory, 'plassert.png');
    await writeFile(photo, gpsPng());
    const browser = await openTestChrome();
    const u = ui(browser);
    const draftOnLine1 = async () => {
      await u.select('line:1');
      await u.edit('Merknad', 'Utkast som ikke er lagt til');
      await browser.waitFor(`${row('Merknad')}.dataset.state === 'draft'`);
    };
    try {
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm = () => true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
      await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
      // A placed FOTO photo gives the map a marker whose popup can open the FOTO workspace from inside Rettinger.
      await u.clickButton('Bilder');
      await browser.waitFor('document.querySelector(".photo-collection-dialog[open]")');
      await setPhotoFiles(browser, 'input[aria-label="Velg bildefiler"]', [photo]);
      await waitForThumbnails(browser);
      await createLayerWithPlacement(browser, 'exif');
      await u.clickButton('Tilbake til appen');
      await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
      await u.clickButton('Legg til fil');
      await browser.waitFor('document.querySelector("input[type=file]")');
      await setPhotoFiles(browser, 'input[type=file]', [gmi]);
      await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await u.openRettinger();
      await draftOnLine1();
      assert.equal(await u.unloadBlocked(), true, 'the draft alone guards tab close');

      await t.test('global reset: cancel keeps everything; the M3 staged-edit check is not involved for a draft', async () => {
        const before = await u.snapshot();
        assert.equal(before.workspace, true);
        assert.deepEqual(before.drafts, ['Merknad']);
        assert(before.photoMarkers >= 1, 'placed FOTO marker on the map');
        await u.reset();
        await browser.waitFor(draftDialog);
        assert.equal(await browser.evaluate(`Boolean(${resetDialog})`), false, 'no staged edits: only the draft question');
        assert.match(await browser.evaluate(`${draftDialog}.innerText`), /ikke er lagt til som retting/);
        await u.clickButton('Avbryt', draftDialog);
        await browser.waitFor(`!${draftDialog}`);
        assert.deepEqual(await u.snapshot(), before, 'cancelled reset leaves the workspace, draft, table and FOTO unchanged');
      });

      await t.test('opening FOTO from a map photo: cancel keeps the draft; confirm discards only the draft', async () => {
        const before = await u.snapshot();
        await browser.evaluate(`${marker}.click()`);
        await browser.waitFor('document.querySelector(".photo-map-popup-open")');
        await browser.evaluate('document.querySelector(".photo-map-popup-open").click()');
        await browser.waitFor(draftDialog);
        await u.clickButton('Avbryt', draftDialog);
        await browser.waitFor(`!${draftDialog}`);
        assert.deepEqual({ ...await u.snapshot() }, before, 'FOTO not opened; Rettinger and its draft unchanged');
        await browser.evaluate(`${marker}.click()`);
        await browser.waitFor('document.querySelector(".photo-map-popup-open")');
        await browser.evaluate('document.querySelector(".photo-map-popup-open").click()');
        await browser.waitFor(draftDialog);
        await u.clickButton('Forkast skjemaet', draftDialog);
        await browser.waitFor('document.querySelector(".photo-workspace-shell")');
        assert.equal(await u.unloadBlocked(), false, 'nothing unsaved remains after the confirmed discard');
        // Back from FOTO: Rettinger resumes for the same layer, the discarded draft is gone, nothing was staged.
        await u.clickButton('Tilbake til appen');
        await browser.waitFor(`${workspace}?.querySelector('[data-gmi-edit-status]')?.innerText === 'Redigerbar'`);
        assert.equal(await browser.evaluate(`${workspace}.querySelector('[data-gmi-edit-counts]')`), null);
      });

      await t.test('file drop is refused while a draft exists', async () => {
        await draftOnLine1();
        const before = await u.snapshot();
        await browser.evaluate(`(() => {
          const transfer = new DataTransfer();
          transfer.items.add(new File([Uint8Array.from(atob(${JSON.stringify(gmiBytes.toString('base64'))}), (c) => c.charCodeAt(0))], 'Sluppet.gmi'));
          document.body.dispatchEvent(new DragEvent('dragenter', { dataTransfer: transfer, bubbles: true, cancelable: true }));
          document.body.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
        })()`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        assert.deepEqual(await u.snapshot(), before, 'no parsing, no new layer, draft intact');
      });

      await t.test('leaving Rettinger (the only route to «Fjern lag» or another layer): cancel keeps the draft, confirm leaves', async () => {
        const before = await u.snapshot();
        assert.equal(await browser.evaluate('document.querySelectorAll(\'button[aria-label="Fjern lag"]\').length'), 0, 'layer cards are not reachable inside Rettinger');
        await u.clickButton('Tilbake til appen', workspace);
        await browser.waitFor(draftDialog);
        await u.clickButton('Avbryt', draftDialog);
        await browser.waitFor(`!${draftDialog}`);
        assert.deepEqual(await u.snapshot(), before);
        await u.clickButton('Tilbake til appen', workspace);
        await browser.waitFor(draftDialog);
        await u.clickButton('Forkast skjemaet', draftDialog);
        await browser.waitFor(`!${workspace}`);
        // Draft-only: «Fjern lag» shows the ordinary confirmation without the staged-corrections warning (M3 semantics).
        await browser.evaluate('document.querySelector("[data-gmi-edit-action]").closest(".py-1").querySelector(\'button[aria-label="Fjern lag"]\').click()');
        await browser.waitFor('Array.from(document.querySelectorAll("h3")).some((e) => e.innerText === "Fjern lag")');
        assert.equal(await browser.evaluate('Boolean(document.querySelector("[data-gmi-remove-warning]"))'), false);
        await u.clickButton('Avbryt');
        assert.equal(await browser.evaluate('document.querySelectorAll("[data-gmi-edit-action]").length'), 1);
      });

      await t.test('reset with a draft and staged corrections: two explicit decisions, each cancellable', async () => {
        await u.openRettinger();
        await u.select('line:1');
        await u.edit('SDR', '11.0');
        await u.clickButton('Se gjennom (1)', editor);
        await u.clickButton('Legg til retting', editor);
        await browser.waitFor(`${workspace}.querySelector('[data-download-state]')?.dataset.downloadState === 'unsaved'`);
        const staged = await u.snapshot();
        await u.edit('Merknad', 'Utkast');
        await browser.waitFor(`${row('Merknad')}.dataset.state === 'draft'`);
        const before = await u.snapshot();
        await u.reset();
        await browser.waitFor(draftDialog);
        await u.clickButton('Avbryt', draftDialog);
        assert.deepEqual(await u.snapshot(), before);
        await u.reset();
        await browser.waitFor(draftDialog);
        await u.clickButton('Forkast skjemaet', draftDialog);
        await browser.waitFor(resetDialog);
        await u.clickButton('Avbryt', resetDialog);
        await browser.waitFor(`!${resetDialog}`);
        const after = await u.snapshot();
        assert.deepEqual(after.drafts, [], 'the confirmed draft is gone');
        assert.deepEqual(after, staged,
          'only the confirmed draft is discarded; staged corrections and the whole workspace stay intact');
        assert.equal(await u.unloadBlocked(), true, 'staged corrections still guard unload');
        await u.reset();
        await browser.waitFor(resetDialog);
        assert.equal(await browser.evaluate(`Boolean(${draftDialog})`), false, 'discarded draft does not prompt again');
        await u.clickButton('Avbryt', resetDialog);
        await browser.waitFor(`!${resetDialog}`);
        assert.deepEqual(await u.snapshot(), after);
      });

      await t.test('draft-only reset confirmed: the draft is the only thing to decide, then the reset proceeds', async () => {
        await u.clickButton('Forkast alle', workspace);
        await browser.waitFor(draftDialog);   // the shared confirmation dialog, here for «Forkast alle»
        await u.clickButton('Forkast alle', draftDialog);
        await browser.waitFor(`!${workspace}.querySelector('[data-gmi-edit-counts]')`);
        await u.edit('Merknad', 'Nytt utkast');
        await browser.waitFor(`${row('Merknad')}.dataset.state === 'draft'`);
        await u.reset();
        await browser.waitFor(draftDialog);
        await u.clickButton('Forkast skjemaet', draftDialog);
        await browser.waitFor('document.querySelector("input[type=file]") && !document.querySelector("[data-gmi-edit-action]")');
        assert.equal(await browser.evaluate(`Boolean(${resetDialog})`), false, 'no staged edits: no second dialog');
        assert.equal(await u.unloadBlocked(), false);
      });

      await t.test('confirming both decisions resets only after the staged-corrections confirmation', async () => {
        await setPhotoFiles(browser, 'input[type=file]', [gmi]);
        await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
        await u.openRettinger();
        await u.select('line:1');
        await u.edit('SDR', '11.0');
        await u.clickButton('Se gjennom (1)', editor);
        await u.clickButton('Legg til retting', editor);
        await browser.waitFor(`${workspace}.querySelector('[data-download-state]')?.dataset.downloadState === 'unsaved'`);
        await draftOnLine1();
        await u.reset();
        await browser.waitFor(draftDialog);
        assert.equal(await browser.evaluate(`Boolean(${resetDialog})`), false);
        await u.clickButton('Forkast skjemaet', draftDialog);
        await browser.waitFor(resetDialog);
        assert.equal(await browser.evaluate(`Boolean(${workspace})`), true, 'workspace remains until the second decision');
        assert.equal(await u.unloadBlocked(), true, 'staged corrections remain until confirmed');
        await u.clickButton('Forkast rettinger og nullstill', resetDialog);
        await browser.waitFor('document.querySelector("input[type=file]") && !document.querySelector(".gmi-edit-workspace")');
        assert.equal(await u.unloadBlocked(), false);
        assert.equal(await browser.evaluate('document.querySelectorAll("dialog[open]").length'), 0);
      });
    } finally {
      await browser.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
