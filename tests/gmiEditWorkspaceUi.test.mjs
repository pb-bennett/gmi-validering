import { clickGmiTableObject } from './helpers/gmiTableNavigation.mjs';
// M4 browser test: the Rettinger workspace in the real app (production build
// or dev server at PHOTO_UI_URL), driven through the visible UI only.
// Synthetic M0 fixtures; downloads go to a temporary directory.
// Screenshots: set GMI_EDIT_SCREENSHOT_DIR.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { createLayerWithoutPlacement, waitForThumbnails } from './helpers/photoImportWizard.mjs';
import { gpsPng } from './helpers/photoGpsFixtures.mjs';
import { GMI_EDIT_FIXTURE_DIR } from './helpers/gmiEditFixtures.mjs';
import { loadGmiDocument, verifyCellChanges } from './helpers/gmiEditHarness.mjs';
import { GMIParser } from '../src/lib/parsing/gmiParser.js';
import { decodeGmiBytes } from '../src/lib/parsing/gmiDecoding.js';

const app = process.env.PHOTO_UI_URL;
const shots = process.env.GMI_EDIT_SCREENSHOT_DIR;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const workspace = 'document.querySelector(".gmi-edit-workspace")';
const editor = 'document.querySelector(".gmi-edit-inspector .gmi-edit-editor")';
const table = 'document.querySelector(".gmi-edit-table-modes")?.closest(".flex.h-full.flex-col")';
const confirmDialog = (id) => `document.querySelector('dialog[open][data-gmi-confirm="${id}"]')`;
const exportDialog = 'document.querySelector("dialog[open].gmi-edit-export")';
const row = (field) => `${editor}.querySelector('tr[data-field="${field}"]')`;

function ui(browser) {
  const clickButton = (text, scope = 'document') => browser.evaluate(`(() => {
    const root = ${scope}; if (!root) throw new Error('No scope for ' + ${JSON.stringify(text)});
    const buttons = Array.from(root.querySelectorAll('button'));
    const button = buttons.find((e) => e.innerText.trim() === ${JSON.stringify(text)}) || buttons.find((e) => e.getAttribute('aria-label') === ${JSON.stringify(text)});
    if (!button) throw new Error('Missing button: ' + ${JSON.stringify(text)});
    if (button.disabled || button.getAttribute('aria-disabled') === 'true') throw new Error('Disabled button: ' + ${JSON.stringify(text)});
    button.click(); })()`);
  const buttonState = (text, scope = 'document') => browser.evaluate(`(() => {
    const button = Array.from(${scope}.querySelectorAll('button')).find((e) => e.innerText.trim().startsWith(${JSON.stringify(text)}) || e.getAttribute('aria-label') === ${JSON.stringify(text)});
    return button ? { disabled: button.disabled || button.getAttribute('aria-disabled') === 'true' } : null; })()`);
  const setValue = (selector, value) => browser.evaluate(`(() => { const input = ${selector}, select = input.tagName === 'SELECT';
    Object.getOwnPropertyDescriptor(select ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event(select ? 'change' : 'input', { bubbles: true })); })()`);
  const edit = (field, value) => setValue(`${row(field)}.querySelector('input, select')`, value);
  const selectObject = async (key) => {
    await clickGmiTableObject(browser, key);
  };
  const waitObject = (key) => browser.waitFor(`${editor}?.dataset.gmiObject === ${JSON.stringify(key)}`);
  const text = (expression) => browser.evaluate(`(${expression})?.innerText ?? null`);
  const shot = async (name) => {
    if (!shots) return;
    await mkdir(shots, { recursive: true });
    const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(shots, `${name}.png`), Buffer.from(data, 'base64'));
  };
  const loadGmi = async (file) => {
    const openFile = await browser.evaluate('Boolean(document.querySelector("input[type=file]"))');
    if (!openFile) {
      // «Legg til fil» in the layer list; an emptied map shows «Åpne fil» instead.
      const label = await browser.evaluate(`Array.from(document.querySelectorAll('button')).some((e) => e.innerText.trim() === 'Legg til fil') ? 'Legg til fil' : 'Åpne fil'`);
      await clickButton(label); await browser.waitFor('document.querySelector("input[type=file]")');
    }
    await setPhotoFiles(browser, 'input[type=file]', [file]);
    await browser.waitFor(`Array.from(document.querySelectorAll('[data-gmi-edit-action]')).some((e) => e.closest('.py-1')?.innerText.includes(${JSON.stringify(path.basename(file, '.gmi'))}))`, 30000);
  };
  const openRettinger = async (name) => {
    await browser.evaluate(`Array.from(document.querySelectorAll('[data-gmi-edit-action]')).find((e) => e.closest('.py-1').innerText.includes(${JSON.stringify(name)})).click()`);
    await browser.waitFor(workspace);
  };
  const unloadBlocked = () => browser.evaluate(`(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })()`);
  return { clickButton, buttonState, setValue, edit, selectObject, waitObject, text, shot, loadGmi, openRettinger, unloadBlocked };
}

test('Rettinger workspace: inspect, correct, review, stage, table modes, history, export, unsaved-change safeguards and lifecycle',
  { skip: !chromePath || !app, timeout: 300000 }, async (t) => {
    const root = path.resolve(tmpdir()), directory = await mkdtemp(path.join(root, 'gmi-edit-ui-'));
    const downloads = path.join(directory, 'downloads');
    await mkdir(downloads);
    const corePath = path.join(directory, 'Syntetisk leveranse.gmi');
    await copyFile(path.join(GMI_EDIT_FIXTURE_DIR, 'core-crlf-latin1.gmi'), corePath);
    const readOnlyPath = path.join(directory, 'Blandede linjeskift.gmi');
    await copyFile(path.join(GMI_EDIT_FIXTURE_DIR, 'guard-mixed-eol.gmi'), readOnlyPath);
    const photo = path.join(directory, 'foto-1.png');
    await writeFile(photo, gpsPng());
    const CORE = new Uint8Array(await readFile(corePath));
    const browser = await openTestChrome();
    const u = ui(browser);
    try {
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm = () => true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
      await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');

      // A FOTO layer exists alongside the GMI layer, to prove a cancelled reset leaves FOTO alone.
      await u.clickButton('Bilder');
      await browser.waitFor('document.querySelector(".photo-collection-dialog[open]")');
      await setPhotoFiles(browser, 'input[aria-label="Velg bildefiler"]', [photo]);
      await waitForThumbnails(browser);
      await createLayerWithoutPlacement(browser);
      await u.clickButton('Tilbake til appen');
      await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
      await u.loadGmi(corePath);
      const photoLayerCount = () => browser.evaluate('document.querySelectorAll("section[aria-label^=Fotokartlag]").length');
      const photoLayersBefore = await photoLayerCount();
      assert(photoLayersBefore >= 1, 'FOTO layer card visible');

      await t.test('opening Rettinger from the layer card shows the layer, editable source and the Data Table modes', async () => {
        await u.openRettinger('Syntetisk leveranse');
        await browser.waitFor(`${workspace}.querySelector('[data-gmi-edit-status]')?.innerText === 'Redigerbar'`);
        assert.match(await u.text(`${workspace}.querySelector('h1')`), /Syntetisk leveranse/);
        assert.match(await u.text(`${workspace}.querySelector('.gmi-edit-kicker')`), /Rettinger/i);
        await browser.waitFor('document.querySelector(".gmi-edit-table-modes")');
        assert.equal(await browser.evaluate('document.querySelector(".gmi-edit-table-modes").dataset.gmiTableView'), 'original');
        assert.equal((await u.buttonState('Last ned revidert GMI', workspace)).disabled, false);
        assert.equal(await u.unloadBlocked(), false, 'nothing to lose yet');
        await u.shot('m4-rettinger-open');
      });

      await t.test('selecting an object shows exact original values; S_HYPERLINK and non-editable fields explain why', async () => {
        await u.selectObject('line:1');
        await u.waitObject('line:1');
        assert.equal(await u.text(`${editor}.querySelector('h2')`), 'Ledning 2');
        assert.equal(await u.text(`${row('SDR')}.children[1]`), 'tom');
        assert.equal(await u.text(`${row('Material')}.children[1]`), 'PE');
        assert.equal(await browser.evaluate(`${row('S_HYPERLINK')}.querySelector('input')`), null);
        assert.match(await u.text(row('S_HYPERLINK')), /Bildelenker \(S_HYPERLINK\) styres av bildeleveransen/);
        assert.match(await u.text(editor), /Geometri, koordinater, objektnummer, GUID og filhode kan ikke rettes/);
      });

      await t.test('invalid lexemes are refused in the form; nothing can be reviewed', async () => {
        await u.edit('Merknad', 'a;b');
        await browser.waitFor(`${row('Merknad')}.querySelector('[role=alert]')`);
        assert.match(await u.text(`${row('Merknad')}.querySelector('[role=alert]')`), /Semikolon/);
        assert.equal((await u.buttonState('Se gjennom', editor)).disabled, true);
        await u.clickButton('Angre skrivingen i Merknad', editor);
        await browser.waitFor(`!${row('Merknad')}.querySelector('[role=alert]')`);
      });

      await t.test('several fields: overwriting a populated value needs an explicit choice, then review and stage', async () => {
        await u.edit('SDR', '11.0');
        await u.edit('Material', 'PE100');
        await browser.waitFor(`${editor}.querySelector('.gmi-edit-confirm')`);
        assert.match(await u.text(`${editor}.querySelector('.gmi-edit-confirm')`), /Overskriv utfylte verdier fra leveransen: Material/);
        assert.equal((await u.buttonState('Se gjennom', editor)).disabled, true, 'blocked until overwrite is confirmed');
        assert.equal(await browser.evaluate(`${row('SDR')}.querySelector('.gmi-edit-state-pill').innerText`), 'Ikke lagt til');
        assert.equal(await u.unloadBlocked(), true, 'an unsubmitted form blocks unload');
        await browser.evaluate(`${editor}.querySelector('.gmi-edit-confirm input').click()`);
        await u.clickButton('Se gjennom (2)', editor);
        await browser.waitFor(`${editor}.querySelector('.gmi-edit-review')`);
        const review = await browser.evaluate(`Array.from(${editor}.querySelectorAll('.gmi-edit-review-table tbody tr')).map((tr) => tr.innerText.replace(/\\s+/g, ' ').trim())`);
        assert.deepEqual(review, ['Material PE PE100Overskriver verdi', 'SDR tom 11.0']);
        await u.shot('m4-rettinger-review');
        // G5: PE100 is outside the authoritative Material list; approve the new Validator FEIL explicitly.
        await browser.evaluate(`${editor}.querySelector('[data-gmi-new-errors] input')?.click()`);
        await u.clickButton('Legg til retting', editor);
        await browser.waitFor(`${workspace}.querySelector('[data-gmi-edit-counts]')?.innerText === '1 retting · 2 felt i 1 objekt'`);
        assert.equal(await browser.evaluate(`${workspace}.querySelector('[data-download-state]').dataset.downloadState`), 'unsaved');
        assert.match(await u.text(`${editor}.querySelector('.gmi-edit-message')`), /lagt til/);
        // Returning shows the proposed values, with the original kept next to them.
        assert.equal(await browser.evaluate(`${row('Material')}.querySelector('input').value`), 'PE100');
        assert.equal(await u.text(`${row('Material')}.children[1]`), 'PE');
        assert.equal(await browser.evaluate(`${row('Material')}.dataset.state`), 'proposed');
        assert.equal(await u.unloadBlocked(), true, 'staged, not downloaded: unload is guarded');
      });

      await t.test('leaving an object with unsubmitted values asks first; cancel keeps the draft', async () => {
        await u.edit('Merknad', 'Utkast');
        await u.selectObject('line:2');
        await browser.waitFor(confirmDialog('workspace'));
        await u.clickButton('Avbryt', confirmDialog('workspace'));
        await browser.waitFor(`!${confirmDialog('workspace')}`);
        assert.equal(await browser.evaluate(`${editor}.dataset.gmiObject`), 'line:1');
        assert.equal(await browser.evaluate(`${row('Merknad')}.querySelector('input').value`), 'Utkast');
        await u.selectObject('line:2');
        await browser.waitFor(confirmDialog('workspace'));
        await u.clickButton('Forkast skjemaet', confirmDialog('workspace'));
        await u.waitObject('line:2');
      });

      await t.test('Data Table: Original, Foreslått and Kun endrede; row click opens the object with the right identity', async () => {
        await browser.evaluate(`Array.from(${table}.querySelectorAll('button')).find((e) => e.innerText.trim() === 'Ledninger').click()`);
        const changedCells = () => browser.evaluate(`${table}.querySelectorAll('[data-gmi-changed-cell]').length`);
        const visibleRows = () => browser.evaluate(`${table}.querySelectorAll('.group.flex.cursor-pointer').length`);
        // S5/T2 (deliberate update): the first stage switched the automatic Original to Foreslått.
        assert.equal(await browser.evaluate(`document.querySelector(".gmi-edit-table-modes").dataset.gmiTableView`), 'proposed');
        await u.clickButton('Original', 'document.querySelector(".gmi-edit-table-modes")');
        await browser.waitFor(`document.querySelector(".gmi-edit-table-modes").dataset.gmiTableView === 'original'`);
        assert.equal(await changedCells(), 0, 'Original shows the imported data only');
        await u.clickButton('Foreslått', 'document.querySelector(".gmi-edit-table-modes")');
        await browser.waitFor(`document.querySelector(".gmi-edit-table-modes").dataset.gmiTableView === 'proposed'`);
        await browser.waitFor(`${table}.querySelectorAll('[data-gmi-changed-cell]').length === 2`);
        assert.equal(await visibleRows(), 3);
        assert.match(await browser.evaluate(`${table}.querySelector('[data-gmi-changed-cell]').title`), /Original: .* → Foreslått: /);
        await u.shot('m4-rettinger-table-proposed');
        await u.clickButton('Kun endrede', 'document.querySelector(".gmi-edit-table-modes")');
        await browser.waitFor(`document.querySelector(".gmi-edit-table-modes").dataset.gmiTableView === 'changed'`);
        assert.equal(await visibleRows(), 1);
        const headers = await browser.evaluate(`Array.from(${table}.querySelectorAll('.sticky.top-0 > div')).map((e) => e.innerText.trim()).filter(Boolean)`);
        assert(headers.some((h) => /SDR/i.test(h)) && headers.some((h) => /Material/i.test(h)), JSON.stringify(headers));
        assert.equal(await browser.evaluate(`${table}.querySelector('[role=status].gmi-edit-table-banner').innerText`), 'Kun endrede · 2 felt');
        await u.clickButton('Original', 'document.querySelector(".gmi-edit-table-modes")');
        await browser.waitFor(`document.querySelector(".gmi-edit-table-modes").dataset.gmiTableView === 'original'`);
        // Row 3 of Ledninger is source index 2 (":L 3"), not a filtered position.
        await browser.evaluate(`${table}.querySelectorAll('.group.flex.cursor-pointer')[2].click()`);
        await u.waitObject('line:2');
        assert.equal(await u.text(`${editor}.querySelector('h2')`), 'Ledning 3');
        await browser.evaluate(`${table}.querySelectorAll('.group.flex.cursor-pointer')[1].click()`);
        await u.waitObject('line:1');
      });

      await t.test('change list, dependent-discard warning, undo and redo', async () => {
        // A second correction on the same object (Merknad is populated, so it needs the explicit overwrite).
        await u.edit('Merknad', 'Kontrollert');
        await browser.evaluate(`${editor}.querySelector('.gmi-edit-confirm input').click()`);
        await u.clickButton('Se gjennom (1)', editor);
        await u.clickButton('Legg til retting', editor);
        await browser.waitFor(`${workspace}.querySelector('[data-gmi-edit-counts]')?.innerText === '2 rettinger · 3 felt i 1 objekt'`);
        await browser.evaluate(`Array.from(${workspace}.querySelectorAll('[role=tab]')).find((e) => e.innerText.startsWith('Endringer')).click()`);
        await browser.waitFor(`${workspace}.querySelectorAll('[data-change-set]').length === 2`);
        const entries = await browser.evaluate(`Array.from(${workspace}.querySelectorAll('[data-change-set]')).map((li) => li.querySelector('.gmi-edit-change-label').innerText)`);
        assert.deepEqual(entries, ['Material, SDR · Ledning 2', 'Merknad · Ledning 2']);
        const first = `${workspace}.querySelector('[data-change-set="cs-1"]')`;
        assert.match(await u.text(first), /PE\s+PE100/);
        assert.match(await u.text(first), /Objektretting · \d{1,2}\. \w+\.?/);
        await u.shot('m4-rettinger-change-list');
        // Laptop widths: panel, map and inspector fit without page overflow; footer actions stay reachable.
        for (const [width, height] of [[1366, 768], [1280, 720]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          await browser.waitFor(`document.documentElement.clientWidth === ${width}`);
          const box = await browser.evaluate(`({ scroll: document.documentElement.scrollWidth, footer: ${workspace}.querySelector('.gmi-edit-download').getBoundingClientRect().toJSON(),
            inspector: document.querySelector('.gmi-edit-inspector').getBoundingClientRect().toJSON() })`);
          assert(box.scroll <= width, `no horizontal page scroll at ${width}`);
          assert(box.footer.bottom <= height && box.footer.top >= 0, `download action visible at ${width}x${height}`);
          assert(box.inspector.right <= width + 1, `inspector inside the viewport at ${width}`);
          await u.shot(`m4-rettinger-${width}x${height}`);
        }
        await browser.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
        // Selecting a change opens its object.
        await browser.evaluate(`${first}.querySelector('.gmi-edit-change-objects button').click()`);
        await u.waitObject('line:1');
        // Discarding the earlier set warns about the later one and removes nothing on cancel.
        await u.clickButton('Forkast Material, SDR · Ledning 2', workspace);
        await browser.waitFor(confirmDialog('workspace'));
        assert.match(await u.text(confirmDialog('workspace')), /Merknad · Ledning 2 – retter samme objekt/);
        await u.clickButton('Avbryt', confirmDialog('workspace'));
        assert.equal(await browser.evaluate(`${workspace}.querySelectorAll('[data-change-set]').length`), 2);
        await u.clickButton('Angre siste retting', workspace);
        await browser.waitFor(`${workspace}.querySelectorAll('[data-change-set]').length === 1`);
        assert.match(await u.text(`${workspace}.querySelector('.gmi-edit-notice')`), /Angret: Merknad · Ledning 2/);
        await u.clickButton('Gjør om retting', workspace);
        await browser.waitFor(`${workspace}.querySelectorAll('[data-change-set]').length === 2`);
      });

      let downloaded;
      await t.test('download: experimental, verified, byte-identical to the M3 payload, original untouched', async () => {
        await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
        await browser.evaluate(`${workspace}.querySelector('.gmi-edit-download').click()`);
        await browser.waitFor(exportDialog);
        assert.match(await u.text(exportDialog), /Eksperimentell\./);
        assert.match(await u.text(exportDialog), /Syntetisk leveranse\.gmi \(endres ikke\)/);
        await u.setValue(`${exportDialog}.querySelector('input[type=text]')`, 'Rettet');
        await browser.waitFor(`/^\\d{8}-\\d{6}-Rettet\\.gmi$/.test(${exportDialog}.querySelector('[data-export-filename]').innerText)`);
        await u.shot('m4-rettinger-export');
        await u.clickButton('Last ned', exportDialog);
        await browser.waitFor(`${exportDialog}?.dataset.exportPhase === 'done'`, 30000);
        const filename = await u.text(`${exportDialog}.querySelector('[data-downloaded-filename]')`);
        const fingerprint = await u.text(`${exportDialog}.querySelector('[data-downloaded-fingerprint]')`);
        let bytes;
        for (let i = 0; i < 100 && !bytes; i++) {
          if ((await readdir(downloads)).includes(filename)) bytes = new Uint8Array(await readFile(path.join(downloads, filename)));
          else await new Promise((resolve) => setTimeout(resolve, 100));
        }
        assert(bytes, 'download arrived');
        assert.equal(sha(bytes), fingerprint, 'downloaded bytes are exactly the M3 payload (same SHA-256)');
        const oracle = verifyCellChanges(loadGmiDocument(CORE), bytes, [
          { scope: 'line', sourceIndex: 1, field: 'Material', lexeme: 'PE100' },
          { scope: 'line', sourceIndex: 1, field: 'SDR', lexeme: '11.0' },
          { scope: 'line', sourceIndex: 1, field: 'Merknad', lexeme: 'Kontrollert' }]);
        assert.deepEqual(oracle.failures, [], 'independent M0 oracle: only the intended cells changed');
        const reparsed = new GMIParser(decodeGmiBytes(bytes));
        assert.equal(reparsed.linesParsed[1].attributes.SDR, 11);
        assert.equal(reparsed.linesParsed[0].attributes.S_HYPERLINK, new GMIParser(decodeGmiBytes(CORE)).linesParsed[0].attributes.S_HYPERLINK);
        assert.deepEqual(new Uint8Array(await readFile(corePath)), CORE, 'original file on disk unchanged');
        downloaded = filename;
        await u.clickButton('Lukk', exportDialog);
        await browser.waitFor(`${workspace}.querySelector('[data-download-state]')?.dataset.downloadState === 'downloaded'`);
        assert.equal(await u.unloadBlocked(), false, 'downloaded revision: no unload prompt');
      });

      await t.test('reset with unsaved corrections: cancel keeps GMI, FOTO and page state; confirm discards', async () => {
        assert(downloaded);
        await u.selectObject('point:1');
        await u.waitObject('point:1');
        await u.edit('Kumform', 'R');
        await u.clickButton('Se gjennom (1)', editor);
        await u.clickButton('Legg til retting', editor);
        await browser.waitFor(`${workspace}.querySelector('[data-download-state]')?.dataset.downloadState === 'unsaved'`);
        await browser.evaluate(`document.querySelector('button[aria-label="Nullstill og åpne ny fil"]').click()`);
        await browser.waitFor(confirmDialog('reset'));
        assert.match(await u.text(confirmDialog('reset')), /3 rettinger, 4 endrede felt/);
        await u.shot('m4-rettinger-reset-confirm');
        await u.clickButton('Avbryt', confirmDialog('reset'));
        await browser.waitFor(`!${confirmDialog('reset')}`);
        assert(await browser.evaluate(`Boolean(${workspace})`), "Rettinger still open");
        assert.equal(await browser.evaluate(`${editor}.dataset.gmiObject`), 'point:1', 'selection kept');
        assert.equal(await browser.evaluate(`${workspace}.querySelectorAll('[data-change-set]').length + ${workspace}.querySelector('[data-gmi-edit-counts]').innerText.length > 0`), true);
        await u.clickButton('Tilbake til appen', workspace);
        await browser.waitFor(`!${workspace}`);
        assert.equal(await photoLayerCount(), photoLayersBefore, 'FOTO layer untouched by a cancelled reset');
        assert(await browser.evaluate(`document.querySelector('[data-gmi-layer-pill]')?.innerText.includes('3 rettinger · ikke lastet ned')`));
        // Layer removal warns as well; cancel keeps the layer.
        await browser.evaluate(`Array.from(document.querySelectorAll('[data-gmi-edit-action]'))[0].closest('.py-1').querySelector('button[aria-label="Fjern lag"]').click()`);
        await browser.waitFor('document.querySelector("[data-gmi-remove-warning]")');
        await u.shot('m4-rettinger-remove-warning');
        await u.clickButton('Avbryt');
        await browser.waitFor('!document.querySelector("[data-gmi-remove-warning]")');
        assert.equal(await browser.evaluate('document.querySelectorAll("[data-gmi-edit-action]").length'), 1);
        assert.equal(await u.unloadBlocked(), true);
        // Confirmed reset discards everything.
        await browser.evaluate(`document.querySelector('button[aria-label="Nullstill og åpne ny fil"]').click()`);
        await browser.waitFor(confirmDialog('reset'));
        await u.clickButton('Forkast rettinger og nullstill', confirmDialog('reset'));
        await browser.waitFor('document.querySelector("input[type=file]") && !document.querySelector("[data-gmi-edit-action]")');
        assert.equal(await u.unloadBlocked(), false);
      });

      await t.test('layer removal with unsaved corrections needs the explicit discard', async () => {
        await u.loadGmi(corePath);
        await u.openRettinger('Syntetisk leveranse');
        await browser.waitFor(`${workspace}.querySelector('[data-gmi-edit-status]')?.innerText === 'Redigerbar'`);
        await u.selectObject('line:2');
        await u.waitObject('line:2');
        await u.edit('SDR', '10.0');
        await u.clickButton('Se gjennom (1)', editor);
        await browser.evaluate(`${editor}.querySelector('[data-gmi-new-errors] input')?.click()`);
        await u.clickButton('Legg til retting', editor);
        await browser.waitFor(`${workspace}.querySelector('[data-download-state]')?.dataset.downloadState === 'unsaved'`);
        await u.clickButton('Tilbake til appen', workspace);
        await browser.waitFor(`!${workspace}`);
        const remove = `document.querySelector('[data-gmi-edit-action]').closest('.py-1').querySelector('button[aria-label="Fjern lag"]')`;
        await browser.evaluate(`${remove}.click()`);
        await browser.waitFor('document.querySelector("[data-gmi-remove-warning]")');
        await u.clickButton('Forkast rettinger og fjern');
        await browser.waitFor('!document.querySelector("[data-gmi-edit-action]")');
        assert.equal(await u.unloadBlocked(), false);
      });

      await t.test('read-only and unsupported files can be inspected but not edited or downloaded', async () => {
        await u.loadGmi(readOnlyPath);
        await u.openRettinger('Blandede linjeskift');
        await browser.waitFor(`${workspace}.querySelector('[data-gmi-edit-status]')?.innerText === 'Kun visning'`);
        assert.match(await u.text(workspace), /Filen kan vises, men ikke rettes\. Filen har blandede linjeskift\./);
        assert.equal((await u.buttonState('Last ned revidert GMI', workspace)).disabled, true);
        await u.selectObject('line:0');
        await u.waitObject('line:0');
        assert.equal(await browser.evaluate(`${editor}.querySelectorAll('input').length`), 0);
        assert.match(await u.text(editor), /kan ikke rettes/);
        await u.shot('m4-rettinger-read-only');
        await u.clickButton('Tilbake til appen', workspace);
      });
    } finally {
      await browser.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
