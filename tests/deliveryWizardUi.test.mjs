import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { unzipSync, strFromU8 } from 'fflate';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { buildGmiText, latin1Bytes } from './helpers/gmiHyperlinkRemovalFixtures.mjs';
import { gpsJpeg, gpsPng } from './helpers/photoGpsFixtures.mjs';
import { setPhotoFiles, clickSourceControl, openPhotoSources, savePhotoSource, sourceWizard } from './helpers/photoSourceWorkflow.mjs';
import { chooseImportPlacement, clickImport, createLayerWithPlacement, importDialog, waitForThumbnails } from './helpers/photoImportWizard.mjs';
import { clickGmiTableObject } from './helpers/gmiTableNavigation.mjs';
import { enterEditMode, editTarget, pressKey, KEYS } from './helpers/photoWorkspace.mjs';
import { assertGeminiConventions } from './helpers/geminiPhotoConventions.mjs';

const app = process.env.PHOTO_UI_URL, shots = process.env.DELIVERY_SCREENSHOT_DIR;
const dialog = 'document.querySelector(".delivery-wizard[open]")';
const workspace = 'document.querySelector(".gmi-edit-workspace")';
const inspector = 'document.querySelector(".gmi-edit-inspector .gmi-edit-editor")';
const section = 'document.querySelector(".photo-delivery-section")';
const click = (browser, label, scope = dialog) => clickSourceControl(browser, label, scope);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const setValue = (browser, selector, value) => browser.evaluate(`(() => { const input = ${selector};
  Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
  input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`);
const currentStep = (browser) => browser.evaluate(`${dialog}.querySelector('[aria-current="step"]').textContent.trim()`);
const status = (browser) => browser.evaluate(`${dialog}.dataset.exportPhase`);
const choose = async (browser, mode) => {
  await browser.evaluate(`${dialog}.querySelector('input[type=radio][value="${mode}"]').click()`);
  await browser.waitFor(`${dialog}.querySelector('input[value="${mode}"]').checked`);
};
const review = async (browser) => { await click(browser, 'Kontroller leveransen'); await browser.waitFor(`${dialog}.dataset.exportPhase !== 'building'`); };
const primaries = (browser) => browser.evaluate(`${dialog}.querySelectorAll('footer .gmi-primary-control').length`);
// A4: Pakke shows the package and its download only. Findings, photo readiness and technical detail stay in Kontroll.
const assertPackageOnly = async (browser) => {
  const found = await browser.evaluate(`(() => { const body = ${dialog}.querySelector('[data-export-step="package"]');
    return { repeated: Array.from(body.querySelectorAll('.delivery-diagnostics, .delivery-summary, [data-export-status], [data-export-format], [data-export-technical], [data-export-experimental], [data-export-counts], [data-diagnostic-code]')).map((item) => item.className || item.tagName),
      status: body.querySelector('[data-review-status]')?.innerText ?? null, filename: body.querySelector('[data-export-filename]')?.innerText ?? null }; })()`);
  assert.deepEqual(found.repeated, [], 'Pakke repeats no Kontroll content');
  assert.match(found.status, /^Kontroll fullført · (ingen merknader|\d+ merknad(er)?)$/);
  assert(found.filename);
  assert.equal(await primaries(browser), 1, 'one primary action on Pakke');
  assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('footer [data-export-report]').length`), 0);
  assert(await browser.evaluate(`${dialog}.querySelector('.delivery-inventory [data-export-report]') !== null`));
  assert.equal(await browser.evaluate(`Array.from(${dialog}.querySelectorAll('button')).some(e=>e.innerText==='Se kontrollen')`), false);
  assert.deepEqual(await browser.evaluate(`(() => { const b=${dialog}.querySelector('[data-export-download]'),s=getComputedStyle(b);return [s.backgroundColor,Boolean(b.querySelector('svg[aria-hidden=true]'))]; })()`), ['rgb(15, 23, 43)', true]);
};
// Returns the Kontroll summary, read where it is shown, before moving to Pakke.
const pack = async (browser) => {
  await review(browser); assert.equal(await status(browser), 'ready', await browser.evaluate(`${dialog}.innerText`));
  const facts = await summary(browser);
  assert.equal(await primaries(browser), 1, 'one primary action on Kontroll');
  await click(browser, 'Neste'); await assertPackageOnly(browser);
  return facts;
};
const back = async (browser) => {
  while (await browser.evaluate(`${dialog}.dataset.deliveryStep !== 'content'`)) await browser.evaluate(`${dialog}.querySelector('[data-export-back]').click()`);
  await browser.waitFor(`${dialog}.querySelector('[data-export-step="delivery"]')`);
};
// The destination pill follows its filename on the same line, inside the same label (not in a right-hand column).
const pillPlacement = (browser) => browser.evaluate(`(() => { const row = ${dialog}.querySelector('.delivery-file .delivery-destination').closest('.delivery-file');
  const name = row.querySelector('.delivery-file-name'), pill = row.querySelector('.delivery-destination'), rects = name.getClientRects(), last = rects[rects.length - 1], box = pill.getBoundingClientRect();
  return { gap: Math.round(box.left - last.right), sameLine: Math.abs((box.top + box.bottom) / 2 - (last.top + last.bottom) / 2) <= 4,
    rowSlack: Math.round(row.getBoundingClientRect().right - box.right), radius: parseFloat(getComputedStyle(pill).borderTopLeftRadius), height: box.height,
    sameLabel: name.parentElement === pill.parentElement && name.parentElement.classList.contains('delivery-file-label') }; })()`);
const assertPillFollowsName = async (browser) => {
  const placement = await pillPlacement(browser);
  assert(placement.sameLabel && placement.sameLine && placement.gap >= 0 && placement.gap <= 10, JSON.stringify(placement));
  assert(placement.radius >= placement.height / 2 - 1, `fully rounded pill ${JSON.stringify(placement)}`);
};
const summary = (browser) => browser.evaluate(`Object.fromEntries(Array.from(${dialog}.querySelectorAll('.delivery-summary > div')).map(row => [row.querySelector('dt').innerText, row.querySelector('dd').innerText]))`);
const screenshot = async (browser, name) => {
  if (!shots) return;
  await mkdir(shots, { recursive: true });
  for (const size of /^(polish-tree|a4-)/.test(name) ? [[1280, 720], [1366, 768]] : [null]) {
    if (size) await browser.send('Emulation.setDeviceMetricsOverride', { width: size[0], height: size[1], deviceScaleFactor: 1, mobile: false });
    await delay(250);
    const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(shots, `${name}${size ? `-${size[0]}x${size[1]}` : ''}.png`), Buffer.from(data, 'base64'));
  }
};

test('filename editor: live sources, checkboxes, manual choices, reset, limits and synthetic export/reimport cycles',
  { skip: !chromePath || !app, timeout: 240000 }, async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gmi-revision-ui-'));
    const browser = await openTestChrome();
    const original = latin1Bytes(buildGmiText({ points: [{}] }));
    const editor = `${dialog}.querySelector('[data-export-filename-editor]')`;
    const field = `${editor}.querySelector('input[type=text]')`;
    const value = () => browser.evaluate(`${field}.value`);
    const box = (label) => `Array.from(${editor}.querySelectorAll('.delivery-filename-options label')).find(l => l.innerText.trim() === ${JSON.stringify(label)})?.querySelector('input')`;
    const toggle = async (label, checked) => { await browser.evaluate(`${box(label)}.click()`); await browser.waitFor(`${box(label)}.checked === ${checked}`); };
    // What the editor shows: grey prefix | editable text | grey suffix, plus the message slot.
    const parts = () => browser.evaluate(`(() => { const e = ${editor};
      return { prefix: e.querySelector('[data-export-filename-prefix]')?.textContent ?? '', text: e.querySelector('input[type=text]').value,
        suffix: e.querySelector('[data-export-filename-suffix]').textContent, message: e.querySelector('[data-export-filename-message]')?.textContent ?? '',
        tone: e.querySelector('.delivery-filename').dataset.validationTone ?? '', revisionBox: Boolean(${box('Revisjonsnummer')}) }; })()`);
    const advance = () => browser.evaluate(`${dialog}.querySelector('[data-export-advance]').disabled`);
    const load = async (name, bytes = original) => {
      const file = path.join(directory, name); await writeFile(file, bytes);
      if (!await browser.evaluate('Boolean(document.querySelector("input[type=file]"))')) {
        await click(browser, 'Legg til fil', 'document');
        await browser.waitFor('document.querySelector("input[type=file]")');
      }
      await setPhotoFiles(browser, 'input[type=file]', [file]);
      await browser.waitFor(`Array.from(document.querySelectorAll('[data-gmi-edit-action]')).some(e => e.closest('.py-1')?.innerText.includes(${JSON.stringify(name)}))`);
    };
    const open = async (name) => {
      await browser.evaluate(`Array.from(document.querySelectorAll('[data-gmi-edit-action]')).find(e => e.closest('.py-1').innerText.includes(${JSON.stringify(name)})).click()`);
      await browser.waitFor(`${workspace}?.querySelector('[data-gmi-edit-status]')?.innerText === 'Redigerbar'`);
      await browser.evaluate(`${workspace}.querySelector('.gmi-edit-download').click()`);
      await browser.waitFor(dialog);
    };
    const long = '20261110 Ledninger og overvann Storgata nord, sone 4 – innmåling etappe 2 (Æ & Ø)';
    try {
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear();' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
      await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
      await load('Syntetisk M10.gmi'); await load('20261116-105236-Nord_rev001.gmi'); await load(`${long}_rev01.gmi`);
      await open('Syntetisk M10.gmi');
      await browser.waitFor(`${field}.value === 'Syntetisk M10'`);
      assert.deepEqual(await parts(), { prefix: 'ååååmmdd-ttmm-', text: 'Syntetisk M10', suffix: '_rev01.gmi', message: '', tone: '', revisionBox: true });
      // D5: the accessible name is «Filnavn», from a visible label; prefix and suffix describe it.
      assert.deepEqual(await browser.evaluate(`(() => { const f = ${field}; return [f.labels[0].innerText.trim(), f.getAttribute('aria-label'), f.maxLength,
        f.getAttribute('aria-describedby').split(' ').map(id => document.getElementById(id).textContent)]; })()`), ['Filnavn', null, -1, ['ååååmmdd-ttmm-', '_rev01.gmi']]);
      // Old duplicate inputs and explanations are gone.
      assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('[aria-label="Eksportetikett"], [data-export-name-source], [data-export-name-format], .photo-export-label').length`), 0);
      assert.doesNotMatch(await browser.evaluate(`${dialog}.innerText`), /Etikett i filnavnet|Foreslått ut fra|Tidspunktet settes/);
      // Teal native checkboxes, both checked by default.
      assert.deepEqual(await browser.evaluate(`Array.from(${editor}.querySelectorAll('input[type=checkbox]')).map(i => [i.checked, getComputedStyle(i).accentColor])`),
        [[true, 'rgb(0, 117, 149)'], [true, 'rgb(0, 117, 149)']]);

      const ids = await browser.evaluate(`Array.from(${dialog}.querySelector('[aria-label="GMI-kartlag"]').options).filter(o => o.value).map(o => ({ id: o.value, name: o.textContent }))`);
      const first = ids.find(o => o.name === 'Syntetisk M10.gmi').id;
      const second = ids.find(o => o.name.includes('Nord_rev001')).id;
      const third = ids.find(o => o.name.includes('Ledninger og overvann')).id;
      const select = (id) => setValue(browser, `${dialog}.querySelector('[aria-label="GMI-kartlag"]')`, id);
      await select(second); await browser.waitFor(`${field}.value === 'Nord'`);
      assert.equal((await parts()).suffix, '_rev002.gmi', 'legacy timestamp and revision are recognised');
      // A long contractor name with a date prefix, æøå, spaces and punctuation stays whole in the field.
      await select(third); await browser.waitFor(`${field}.value === ${JSON.stringify(long)}`);
      assert.equal((await parts()).suffix, '_rev02.gmi');
      assert.equal((await parts()).message, 'Filnavnet er over 80 tegn.');
      assert.equal((await parts()).tone, 'warning');
      assert.equal(await advance(), false, 'the advisory length never blocks');
      await review(browser); assert.equal(await status(browser), 'ready'); await click(browser, 'Neste');
      assert.match(await browser.evaluate(`${dialog}.querySelector('[data-export-filename]').textContent`), new RegExp(`^\\d{8}-\\d{4}-${long.replace(/[()&]/g, '\\$&')}_rev02\\.gmi$`));
      await back(browser);
      await select(first); await browser.waitFor(`${field}.value === 'Syntetisk M10'`);
      await review(browser); assert.equal(await status(browser), 'ready'); await back(browser);
      assert.equal(await value(), 'Syntetisk M10');

      // Manual text survives source and mode changes; the revision suffix keeps following the live source.
      const manual = '  Min etikett / nord  ';
      await setValue(browser, field, manual); await select(second);
      await browser.waitFor(`${editor}.querySelector('[data-export-filename-suffix]').textContent === '_rev002.gmi'`);
      await choose(browser, 'combined'); assert.equal(await value(), manual);
      assert.equal((await parts()).suffix, '_rev002.zip', 'the suffix shows the primary artifact extension');
      await screenshot(browser, 'a4-revision-combined-content');
      await choose(browser, 'photos-only'); assert.equal(await value(), manual);
      assert.deepEqual([(await parts()).suffix, (await parts()).revisionBox], ['.zip', false], 'D4: Kun GML has no revision');
      assert.equal(await browser.evaluate(`Boolean(${dialog}.querySelector('[data-export-filename-editor] button'))`), false, 'no suggestion without a GMI source');
      await choose(browser, 'gmi-only'); assert.equal(await value(), manual);
      await click(browser, 'Bruk forslag'); assert.equal(await value(), 'Nord');
      assert.equal(await browser.evaluate(`Array.from(${dialog}.querySelectorAll('button')).some(b => b.innerText === 'Bruk forslag')`), false);

      // Advisory boundary: 14 + text + _rev02 + .gmi; 80 is fine, 81 warns.
      await select(first); await browser.waitFor(`${field}.value === 'Syntetisk M10'`);
      await setValue(browser, field, 'x'.repeat(57)); await browser.waitFor(`${editor}.querySelector('[data-export-filename-message]')`);
      await setValue(browser, field, 'x'.repeat(56)); await browser.waitFor(`!${editor}.querySelector('[data-export-filename-message]')`);
      // Hard limit blocks with its reason; a reserved name blocks too.
      await setValue(browser, field, 'x'.repeat(240));
      await browser.waitFor(`${editor}.querySelector('[data-export-filename-message]')?.textContent === 'Filnavnet er for langt for filsystemet.'`);
      assert.equal(await advance(), true);
      assert.equal(await browser.evaluate(`${field}.getAttribute('aria-invalid')`), 'true');
      await click(browser, 'Bruk forslag'); assert.equal(await value(), 'Syntetisk M10');

      // Checkbox combinations change only their own part; navigation keeps text and checkboxes.
      await toggle('Tidsstempel', false);
      assert.deepEqual([(await parts()).prefix, (await parts()).suffix], ['', '_rev01.gmi']);
      await toggle('Revisjonsnummer', false);
      assert.deepEqual([(await parts()).prefix, (await parts()).suffix], ['', '.gmi']);
      await setValue(browser, field, '');
      await browser.waitFor(`${editor}.querySelector('[data-export-filename-message]')?.textContent === 'Filnavnet er tomt.'`);
      assert.equal(await advance(), true, 'an empty name cannot reach review');
      await setValue(browser, field, 'CON');
      await browser.waitFor(`${editor}.querySelector('[data-export-filename-message]')?.textContent === 'Filnavnet er reservert i Windows.'`);
      assert.equal(await advance(), true);
      await click(browser, 'Bruk forslag');
      await toggle('Tidsstempel', true);
      await review(browser); assert.equal(await status(browser), 'ready'); await click(browser, 'Neste');
      assert.match(await browser.evaluate(`${dialog}.querySelector('[data-export-filename]').textContent`), /^\d{8}-\d{4}-Syntetisk M10\.gmi$/);
      await back(browser);
      assert.deepEqual(await browser.evaluate(`Array.from(${editor}.querySelectorAll('input[type=checkbox]')).map(i => i.checked)`), [true, false], 'checkboxes survive navigation');
      await toggle('Revisjonsnummer', true);

      // Keyboard: the wrapper shows the focus ring; Tab reaches the checkboxes and Space toggles them.
      await browser.evaluate(`${field}.focus()`);
      assert.notEqual(await browser.evaluate(`getComputedStyle(${editor}.querySelector('.delivery-filename')).boxShadow`), 'none');
      await pressKey(browser, 'Tab', KEYS.Tab);
      assert.equal(await browser.evaluate(`document.activeElement === ${box('Tidsstempel')}`), true);
      await pressKey(browser, ' ', { code: 'Space', keyCode: 32 });
      await browser.waitFor(`${box('Tidsstempel')}.checked === false`);
      await pressKey(browser, ' ', { code: 'Space', keyCode: 32 });
      await browser.waitFor(`${box('Tidsstempel')}.checked === true`);
      for (const [width, height] of [[1280, 720], [1366, 768]]) {
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        await delay(150);
        const fit = await browser.evaluate(`(() => { const body = ${dialog}.querySelector('.delivery-body'), row = ${editor}.querySelector('.delivery-filename'),
          section = ${editor}.closest('section'), footer = ${dialog}.querySelector('[data-export-footer]').getBoundingClientRect();
          return { overflow: body.scrollWidth - body.clientWidth, inside: row.getBoundingClientRect().right <= section.getBoundingClientRect().right + 1,
            height: Math.round(row.getBoundingClientRect().height), footer: footer.bottom <= innerHeight + 1 }; })()`);
        assert.deepEqual(fit, { overflow: 0, inside: true, height: fit.height, footer: true }, `${width}x${height}`);
        assert(fit.height <= 40, `compact row at ${width}x${height}: ${fit.height}`);
      }
      await screenshot(browser, 'a4-revision-gmi-content');
      await setValue(browser, field, long);
      await screenshot(browser, 'a4-filename-long-gmi');
      await click(browser, 'Bruk forslag');

      // Three export → re-import cycles with both on, then one with the timestamp off; every no-op GMI is byte-identical.
      for (let revision = 1; revision <= 4; revision++) {
        if (revision > 1) await browser.waitFor(`${editor}.querySelector('[data-export-filename-suffix]').textContent === '_rev0${revision}.gmi'`);
        assert.equal(await value(), 'Syntetisk M10');
        if (revision === 4) await toggle('Tidsstempel', false);
        await review(browser); assert.equal(await status(browser), 'ready'); await click(browser, 'Neste');
        if (revision === 1) {
          await browser.evaluate(`(() => { window.__revisionClick = HTMLAnchorElement.prototype.click;
            HTMLAnchorElement.prototype.click = function() { window.__revisionReport = this.download; }; })()`);
          try {
            await click(browser, 'Last ned rapport');
            const reportName = await browser.evaluate('window.__revisionReport');
            const filename = await browser.evaluate(`${dialog}.querySelector('[data-export-filename]').textContent`);
            assert.equal(reportName, filename.replace(/\.gmi$/, '-leveranserapport.txt'));
          } finally { await browser.evaluate('HTMLAnchorElement.prototype.click = window.__revisionClick'); }
        }
        const output = await downloaded(browser, directory, 'Last ned GMI');
        assert.match(output.name, revision === 4 ? /^Syntetisk M10_rev04\.gmi$/ : new RegExp(`^\\d{8}-\\d{4}-Syntetisk M10_rev0${revision}\\.gmi$`));
        assert.deepEqual(output.bytes, original, 'no-op revision exports preserve every source byte');
        await click(browser, 'Lukk eksport'); await click(browser, 'Lukk Rettinger', 'document');
        if (revision < 4) { await load(output.name, output.bytes); await open(output.name); }
      }
    } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
  });
async function downloaded(browser, directory, label) {
  // Two reviewed plans can have the same second-resolution filename. A done state means browser initiation,
  // so an existing path could still contain the previous download. Give each handoff its own empty directory.
  const downloadDirectory = await mkdtemp(path.join(directory, 'download-'));
  await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDirectory });
  await click(browser, label);
  await browser.waitFor(`${dialog}.dataset.exportPhase === 'done'`);
  const name = await browser.evaluate(`${dialog}.querySelector('[data-downloaded-filename]').textContent`);
  for (let count = 0; count < 100; count++) {
    try { return { name, bytes: new Uint8Array(await readFile(path.join(downloadDirectory, name))) }; }
    catch { await delay(50); }
  }
  throw new Error('Download did not arrive');
}

test('FOTO-first combined export uses automatic and manual verified bindings and follows the selected photo layer',
  { skip: !chromePath || !app, timeout: 240000 }, async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gmi-rebinding-ui-'));
    const browser = await openTestChrome();
    const photograph = gpsPng();
    const imageFile = path.join(directory, 'shared.png');
    const hyperlink = 'h:1(link:"Attachments\\shared.png") ';
    const makeGmi = (merknad) => latin1Bytes(buildGmiText({ points: [{ hyperlink, merknad }, { hyperlink }] }));
    const automatic = makeGmi('Automatic association'), manual = makeGmi('Manual association');
    const autoFile = path.join(directory, 'Automatic S2.gmi'), manualFile = path.join(directory, 'Manual S2.gmi');
    const surveySelect = `${dialog}.querySelector('[aria-label="GMI-kartlag"]')`;
    const photoSelect = `${dialog}.querySelector('[aria-label="Fotolag"]')`;
    const selectedSurvey = () => browser.evaluate(`${surveySelect}.selectedOptions[0].textContent`);
    const content = async () => {
      await click(browser, 'Eksporter…', 'document'); await browser.waitFor(dialog); await choose(browser, 'combined');
    };
    const readyToReview = () => browser.waitFor(`${dialog}.querySelector('footer .gmi-primary-control')?.disabled === false`);
    const addIndependent = async (filename) => {
      await click(browser, 'Bilder', 'document'); await browser.waitFor(importDialog);
      await setPhotoFiles(browser, 'input[aria-label="Velg bildefiler"]', [imageFile]);
      await waitForThumbnails(browser); await chooseImportPlacement(browser, 'gmi');
      await setPhotoFiles(browser, 'input[aria-label="Velg GMI-fil"]', [filename]);
      await browser.waitFor(`${importDialog}.innerText.includes(${JSON.stringify(path.basename(filename))})`);
      await createLayerWithPlacement(browser, 'gmi');
      await browser.waitFor('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length === 2');
    };
    const loadVector = async (filename, count) => {
      await click(browser, 'Legg til fil', 'document');
      await browser.waitFor('document.querySelector("input[type=file]")');
      await setPhotoFiles(browser, 'input[type=file]', [filename]);
      await browser.waitFor(`document.querySelectorAll('[data-gmi-edit-action]').length === ${count}`);
    };
    try {
      await writeFile(autoFile, automatic); await writeFile(manualFile, manual); await writeFile(imageFile, photograph);
      await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: directory });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
      await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
      await addIndependent(autoFile);
      await click(browser, 'Lukk FOTO', 'document');
      const photoA = await browser.evaluate('document.querySelector("[data-photo-layer-open]").dataset.photoLayerOpen');
      await loadVector(autoFile, 1);
      await browser.evaluate(`document.querySelector('[data-photo-layer-open="${photoA}"]').click()`);
      await content();
      await browser.waitFor(`${surveySelect}.selectedOptions[0].textContent === 'Automatic S2.gmi'`);
      const surveyA = await browser.evaluate(`${surveySelect}.value`);
      await readyToReview();
      await pack(browser);
      const archive = unzipSync((await downloaded(browser, directory, 'Last ned ZIP')).bytes);
      assert.deepEqual(archive[Object.keys(archive).find((name) => name.endsWith('.gmi'))], automatic);
      assert.deepEqual(Buffer.from(archive['Attachments/shared.png']), photograph);
      await click(browser, 'Lukk eksport');
      await click(browser, 'Lukk FOTO', 'document');

      await loadVector(manualFile, 2);
      await addIndependent(manualFile);
      const photoState = () => browser.evaluate(`({ markers: document.querySelectorAll('.photo-camera-marker').length,
        photos: Array.from(document.querySelectorAll('.photo-workspace-list li[data-photo-id]')).map(row => [row.dataset.photoId, row.innerText]) })`);
      await browser.waitFor('document.querySelector(".photo-camera-marker")');
      const beforeRebind = await photoState();
      await openPhotoSources(browser);
      await browser.evaluate(`${sourceWizard}.querySelector('input[name=photo-external-source][value=gmi]').click()`);
      await click(browser, 'Bruk Manual S2.gmi', sourceWizard);
      await browser.waitFor(`${sourceWizard}.innerText.includes('Kilden kobles til GMI-laget «Manual S2.gmi».')`);
      await savePhotoSource(browser, 'gmi');
      await click(browser, 'Fullfør', sourceWizard);
      await browser.waitFor(`!${sourceWizard}`);
      assert.deepEqual(await photoState(), beforeRebind);
      await content();
      assert.equal(await selectedSurvey(), 'Manual S2.gmi');
      const photoB = await browser.evaluate(`${photoSelect}.value`);
      await setValue(browser, photoSelect, photoA);
      assert.equal(await selectedSurvey(), 'Automatic S2.gmi');
      await setValue(browser, photoSelect, photoB);
      assert.equal(await selectedSurvey(), 'Manual S2.gmi');
      await setValue(browser, surveySelect, surveyA);
      await setValue(browser, photoSelect, photoA);
      await setValue(browser, photoSelect, photoB);
      assert.equal(await selectedSurvey(), 'Automatic S2.gmi');
      await click(browser, 'Lukk eksport');
      await content();
      assert.equal(await selectedSurvey(), 'Manual S2.gmi');
      await readyToReview();
      await pack(browser);
    } finally {
      await browser.close();
      const resolved = path.resolve(directory);
      if (path.dirname(resolved) !== path.resolve(tmpdir()) || !path.basename(resolved).startsWith('gmi-rebinding-ui-')) throw new Error('Unsafe temporary directory');
      await rm(resolved, { recursive: true, force: true });
    }
  });

test('M10 production wizard: modes, M9 bytes, split acknowledgement, shared intent, safety, downloads, keyboard and laptop layouts',
  { skip: !chromePath || !app, timeout: 300000 }, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gmi-m10-ui-'));
    const gmiFile = path.join(directory, 'Syntetisk M10.gmi');
    const original = latin1Bytes(buildGmiText({ points: [{ hyperlink: 'h:1(link:"Attachments\\shared.jpg") ' }, { hyperlink: 'h:1(link:"Attachments\\shared.jpg") ' }] }).replace('581954.000 6566014.000 102.000', '581947.000 6566007.000 101.000'));
    const browser = await openTestChrome();
    const jpeg = await browser.evaluate(`(() => { const canvas=document.createElement('canvas');canvas.width=160;canvas.height=100;const ctx=canvas.getContext('2d');ctx.fillStyle='#2463b5';ctx.fillRect(0,0,160,100);ctx.fillStyle='#b06a08';ctx.fillRect(20,20,80,60);return canvas.toDataURL('image/jpeg').split(',')[1]; })()`);
    const metadata = gpsJpeg({ captureTime: '2026:05:12 14:33:02', direction: 90, directionRef: 'T' });
    const photograph = Buffer.concat([metadata.subarray(0, -2), Buffer.from(jpeg, 'base64').subarray(2)]);
    const imageFile = path.join(directory, 'shared.jpg');
    await writeFile(gmiFile, original); await writeFile(imageFile, photograph);
    try {
      await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: directory });
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear();' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
      await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
      await setPhotoFiles(browser, 'input[type=file]', [gmiFile]);
      await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await browser.evaluate('document.querySelector("[data-gmi-edit-action]").click()');
      await browser.waitFor(`${workspace}?.querySelector('[data-gmi-edit-status]')?.innerText === 'Redigerbar'`);
      await clickGmiTableObject(browser, 'point:0');
      await browser.waitFor(`${inspector}?.querySelector('tr[data-field="Merknad"] input')`);
      await setValue(browser, `${inspector}.querySelector('tr[data-field="Merknad"] input')`, 'M10 corrected');
      await browser.evaluate(`${inspector}.querySelector('.gmi-edit-confirm input').click()`);
      await t.test('unsubmitted Rettinger form values guard the export entry without losing the draft', async () => {
        await browser.evaluate(`${workspace}.querySelector('.gmi-edit-download').click()`);
        const confirm = 'document.querySelector("[data-gmi-confirm=workspace][open]")';
        await browser.waitFor(confirm);
        assert.equal(await browser.evaluate(`Boolean(${dialog})`), false);
        await click(browser, 'Avbryt', confirm);
        assert.equal(await browser.evaluate(`${inspector}.querySelector('tr[data-field="Merknad"] input').value`), 'M10 corrected');
      });
      await click(browser, 'Forhåndsvis endringer (1)', inspector);
      await click(browser, 'Legg til retting', inspector);
      await browser.waitFor(`${workspace}.querySelector('[data-download-state="unsaved"]')`);

      await t.test('Rettinger entry point starts on content and the contextual redo actions share normal typography', async () => {
        await browser.evaluate(`${workspace}.querySelectorAll('button[role="tab"]')[1].click()`);
        await browser.evaluate(`${workspace}.querySelector('button[aria-label="Angre siste retting"]').click()`);
        await browser.waitFor('document.querySelectorAll("[data-gmi-context-redo]").length === 2');
        const styles = await browser.evaluate('Array.from(document.querySelectorAll("[data-gmi-context-redo]")).map(node => { const css=getComputedStyle(node); return {weight:css.fontWeight,size:css.fontSize,cursor:css.cursor}; })');
        assert.deepEqual(styles, [{ weight: '400', size: '12px', cursor: 'pointer' }, { weight: '400', size: '12px', cursor: 'pointer' }]);
        await browser.evaluate('document.querySelector("[data-gmi-context-redo]").click()');
        await browser.evaluate(`${workspace}.querySelector('.gmi-edit-download').click()`);
        await browser.waitFor(dialog);
        assert.equal(await currentStep(browser), '1. Innhold');
        assert.equal(await browser.evaluate(`${dialog}.querySelector('input[value="gmi-only"]').checked`), true);
        await screenshot(browser, 'm10-gmi-content-1366x768');
        await click(browser, 'Lukk eksport');
      });

      await click(browser, 'Lukk Rettinger', 'document');
      await browser.waitFor('!document.querySelector(".gmi-edit-workspace")');
      await browser.waitFor('document.querySelector("button[aria-label=\\\"Koble bilder til GMI-laget\\\"]")');
      await browser.evaluate('document.querySelector("button[aria-label=\\\"Koble bilder til GMI-laget\\\"]").click()');
      await browser.waitFor('document.querySelector("input[aria-label=\\\"Velg bildefiler\\\"]")');
      await setPhotoFiles(browser, 'input[aria-label="Velg bildefiler"]', [imageFile]);
      await waitForThumbnails(browser);
      await click(browser, 'Neste', 'document.querySelector(".photo-collection-dialog[open]")');
      await browser.waitFor('document.querySelector(".photo-import-review")');
      await click(browser, 'Opprett fotolag', 'document.querySelector(".photo-collection-dialog[open]")');
      await browser.waitFor('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length === 2');
      const rows = await browser.evaluate('Array.from(document.querySelectorAll(".photo-workspace-list li[data-photo-id]")).map(row => row.dataset.photoId)');
      await browser.evaluate(`document.querySelector('[data-photo-id="${rows[0]}"] button.photo-workspace-row').click()`);
      await browser.waitFor(section);
      await browser.evaluate(`${section}.querySelector('[role=radio][data-destination=gml]').click()`);
      await browser.waitFor('document.querySelectorAll(".photo-workspace-list .photo-delivery-pill[data-destination=gml]").length === 1');
      await t.test('stacked preview cycle, browse/edit parity and unselected overview', async () => {
        const row = (id) => `document.querySelector('.photo-workspace-list li[data-photo-id="${id}"] .photo-workspace-row')`;
        const selected = 'document.querySelector(".photo-camera-marker.photo-marker-selected")';
        const preview = 'document.querySelector(".photo-workspace-preview-popup")';
        const previewPill = `${preview}.querySelector('.photo-delivery-row-button')`;
        const fill = (target) => `${target}?.querySelector('.photo-camera-glyph path')?.getAttribute('fill')`;
        const dashed = (target) => `${target}?.querySelector('path[stroke-dasharray="2 2"]') !== null`;
        // Restore a uniform GMI baseline, then click the stack to select the other occurrence and open its preview.
        await browser.evaluate(`${section}.querySelector('[data-destination=gmi]').click()`);
        await browser.evaluate(`${selected}.dispatchEvent(new MouseEvent('click', {bubbles:true}))`);
        await browser.waitFor(`${preview} && ${row(rows[1])}.getAttribute('aria-pressed') === 'true'`);
        for (const [label, colour, mixed] of [['GML', '#4ade80', true], ['Ikke', '#cbd5e1', true], ['GMI', '#60a5fa', false]]) {
          await browser.evaluate(`${previewPill}.click()`);
          await browser.waitFor(`${previewPill}?.innerText === '${label}' && ${fill(selected)} === '${colour}'`);
          assert.equal(await browser.evaluate(dashed(selected)), mixed);
          assert.equal(await browser.evaluate(`${selected}.querySelector('.photo-marker-stack').textContent`), '2');
          assert.equal(await browser.evaluate(`${selected}.getAttribute('aria-label').includes('Ulike leveringsvalg')`), mixed);
          assert.equal(await browser.evaluate(`${row(rows[0])}.closest('li').querySelector('.photo-delivery-pill').innerText`), 'GMI');
        }
        // A mixed selected marker has the same fill, outline, count and description in browse and Edit mode.
        await browser.evaluate(`${previewPill}.click()`);
        await browser.waitFor(`${fill(selected)} === '#4ade80'`);
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          await screenshot(browser, `selected-mixed-browse-${width}x${height}`);
          await enterEditMode(browser);
          await browser.waitFor(editTarget);
          assert.equal(await browser.evaluate(fill(editTarget)), '#4ade80');
          assert(await browser.evaluate(dashed(editTarget)));
          assert.equal(await browser.evaluate(`${editTarget}.querySelector('.photo-marker-stack').textContent`), '2');
          assert.match(await browser.evaluate(`${editTarget}.getAttribute('aria-label')`), /Ulike leveringsvalg/);
          await screenshot(browser, `selected-mixed-edit-${width}x${height}`);
          await click(browser, 'Avslutt redigering', 'document');
          await browser.waitFor(`${fill(selected)} === '#4ade80'`);
          assert(await browser.evaluate(dashed(selected)));
        }
        // Main-map stacks have no workspace selection and retain their neutral mixed fill.
        await click(browser, 'Lukk FOTO', 'document');
        await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
        const stack = `Array.from(document.querySelectorAll('.photo-camera-marker')).find((marker) => marker.querySelector('.photo-marker-stack')?.textContent === '2')`;
        await browser.waitFor(`${fill(stack)} === '#64748b'`);
        assert(await browser.evaluate(dashed(stack)));
        await browser.evaluate('document.querySelector("[data-photo-layer-open]").click()');
        await browser.waitFor('document.querySelector(".photo-workspace-shell")');
        // Restore the state expected by the remaining navigation/export acceptance tests.
        await browser.evaluate(`${row(rows[1])}.click()`);
        await browser.evaluate(`${section}.querySelector('[data-destination=gmi]').click()`);
        await browser.evaluate(`${row(rows[0])}.click()`);
        await browser.evaluate(`${section}.querySelector('[data-destination=gml]').click()`);
        await browser.waitFor(`${fill(selected)} === '#4ade80'`);
      });
      await t.test('normal browsing: safe stack/marker navigation, explicit destination controls and synchronized delivery colours', async () => {
        const marker = 'document.querySelector(".photo-camera-marker.photo-marker-selected")';
        const fill = () => browser.evaluate(`${marker}.querySelector('.photo-camera-glyph path').getAttribute('fill')`);
        const pills = () => browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-list li[data-photo-id]')).map((li) => li.querySelector('.photo-delivery-pill').innerText)`);
        const colourSelect = 'document.querySelector(".photo-map-display-card select")';
        const setColour = async (value) => { await browser.evaluate(`${colourSelect}.value=${JSON.stringify(value)};${colourSelect}.dispatchEvent(new Event('change',{bubbles:true}))`); };
        const key = async (name, code, keyCode) => {
          await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code, windowsVirtualKeyCode: keyCode, ...(name === ' ' ? { text: ' ' } : {}) });
          await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code, windowsVirtualKeyCode: keyCode });
        };
        // Selection keeps its own delivery colour and the dashed mixed-stack cue.
        await browser.waitFor(marker);
        assert.equal(await browser.evaluate(`${colourSelect}.value`), 'delivery');
        assert.equal(await browser.evaluate(`${marker}.querySelector('.photo-camera-glyph').dataset.positionSource`), 'gmi', 'provenance identity is kept');
        assert.equal(await fill(), '#4ade80', 'selected mixed-stack occurrence keeps its own delivery colour');
        assert(await browser.evaluate(`${marker}.querySelector('.photo-camera-glyph').innerHTML.includes('stroke-dasharray')`));
        assert.match(await browser.evaluate(`${marker}.getAttribute('aria-label')`), /^Vis bilde:.*Ulike leveringsvalg på samme sted/);
        await screenshot(browser, 'refine-delivery-map-normal');
        await setColour('provenance');
        assert.equal(await fill(), '#2463b5', 'Plasseringskilde restores the accepted provenance colour');
        await screenshot(browser, 'final-marker-provenance');
        await setColour('delivery');

        assert.equal(await browser.evaluate('document.querySelectorAll(".photo-delivery-bar").length'), 0);
        const cycle = (id) => `document.querySelector('.photo-workspace-list li[data-photo-id="${id}"] .photo-delivery-row-button')`;
        const exactMarker = `document.querySelector('.photo-camera-marker[data-photo-id="${rows[1]}"]')`;
        // Stack and isolated marker navigation select only; the inspector owns explicit destination changes.
        const before = await pills();
        await browser.evaluate(`${marker}.dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
        assert.deepEqual(await pills(), before);
        await browser.waitFor(`document.querySelector('.photo-workspace-list li[data-photo-id="${rows[1]}"] .photo-workspace-row').getAttribute('aria-pressed') === 'true'`);
        await browser.evaluate(`${exactMarker}.focus()`);
        await key(' ', 'Space', 32);
        await browser.waitFor(`document.querySelector('.photo-workspace-list li[data-photo-id="${rows[0]}"] .photo-workspace-row').getAttribute('aria-pressed') === 'true'`);
        assert.deepEqual(await pills(), before);
        await browser.evaluate(`document.querySelector('.photo-workspace-list li[data-photo-id="${rows[1]}"] .photo-workspace-row').click()`);
        await browser.evaluate(`document.querySelector('.photo-delivery-section [data-destination=gml]').click()`);
        await browser.waitFor(`${cycle(rows[1])}.dataset.destination === 'gml'`);
        assert.deepEqual(await pills(), ['GML', 'GML']);
        await browser.waitFor(`${marker}.querySelector('.photo-camera-glyph path').getAttribute('fill') === '#4ade80'`);
        for (const expected of ['Ikke', 'GMI']) {
          await browser.evaluate(`${cycle(rows[1])}.focus()`);
          await key(' ', 'Space', 32);
          await browser.waitFor(`document.querySelector('.photo-workspace-list li[data-photo-id="${rows[1]}"] .photo-delivery-pill').innerText === ${JSON.stringify(expected)}`);
        }
        assert.deepEqual(await pills(), ['GML', 'GMI']);
        await setColour('provenance');
        assert.equal(await browser.evaluate(`${colourSelect}.value`), 'provenance');
        await setColour('delivery');
        // Normal navigation again: a marker click selects the photo and changes no decision.
        await browser.evaluate(`document.querySelector('.photo-workspace-list li[data-photo-id="${rows[0]}"] .photo-workspace-row').click()`);
        await browser.evaluate(`${exactMarker}.dispatchEvent(new MouseEvent('click', {bubbles:true}))`);
        await browser.waitFor(`document.querySelector('.photo-workspace-list li[data-photo-id="${rows[1]}"] button').getAttribute('aria-pressed') === 'true'`);
        assert.deepEqual(await pills(), ['GML', 'GMI']);
        await browser.evaluate(`document.querySelector('.photo-workspace-list li[data-photo-id="${rows[0]}"] button').click()`);
      });
      await click(browser, 'Eksporter…', 'document'); await browser.waitFor(dialog);

      await t.test('automatic combined names and report share the revision basename; Kun GML stays unlabelled', async () => {
        const field = `${dialog}.querySelector('[data-export-filename-editor] input[type=text]')`;
        assert.equal(await browser.evaluate(`${field}.value`), '');
        await choose(browser, 'combined');
        await browser.waitFor(`${field}.value === 'Syntetisk M10'`);
        await review(browser); assert.equal(await status(browser), 'ready');
        const names = await browser.evaluate(`({...${dialog}.querySelector('[data-export-zip]').dataset})`);
        assert.match(names.exportZip, /^\d{8}-\d{4}-Syntetisk M10_rev01\.zip$/);
        assert.equal(names.exportGml, names.exportZip.replace(/\.zip$/, '.gml'));
        await click(browser, 'Neste');
        assert((await browser.evaluate(`${dialog}.querySelector('.delivery-inventory').textContent`)).includes(names.exportZip.replace(/\.zip$/, '.gmi')));
        await browser.evaluate(`(() => { window.__revisionClick = HTMLAnchorElement.prototype.click;
          HTMLAnchorElement.prototype.click = function() { window.__revisionReport = this.download; }; })()`);
        try {
          await click(browser, 'Last ned rapport');
          assert.equal(await browser.evaluate('window.__revisionReport'), names.exportZip.replace(/\.zip$/, '-leveranserapport.txt'));
        } finally { await browser.evaluate('HTMLAnchorElement.prototype.click = window.__revisionClick'); }
        await back(browser); await choose(browser, 'photos-only');
        assert.equal(await browser.evaluate(`${field}.value`), '');
      });

      await t.test('FOTO entry point preserves all placed occurrences, Gemini IDs and original attachment bytes', async () => {
        assert.equal(await browser.evaluate(`${dialog}.querySelector('input[value="photos-only"]').checked`), true);
        await setValue(browser, `${dialog}.querySelector('[data-export-filename-editor] input[type=text]')`, 'M10');
        const facts = await pack(browser); assert.equal(await currentStep(browser), '3. Pakke / Last ned');
        assert.match(facts.GML, /^2 /);
        await screenshot(browser, 'a4-pakke-photos-only');
        await click(browser, 'Tilbake'); assert.equal(await currentStep(browser), '2. Kontroll');
        await screenshot(browser, 'a4-kontroll-photos-only');
        await click(browser, 'Neste'); await assertPackageOnly(browser);
        assert.equal(await browser.evaluate(`${dialog}.querySelector('.delivery-tree input[type=checkbox]').checked`), false);
        assert.equal(await browser.evaluate(`${dialog}.querySelector('.delivery-folder').getAttribute('aria-expanded')`), 'false');
        await screenshot(browser, 'polish-tree-collapsed');
        await click(browser, 'Utvid alle');
        await browser.waitFor(`${dialog}.querySelector('[data-package-path="Attachments/shared.jpg"]')`);
        assert.equal(await browser.evaluate(`${dialog}.querySelector('.delivery-destination').textContent`), 'GML');
        assert.deepEqual(await browser.evaluate(`(() => { const s=getComputedStyle(${dialog}.querySelector('.delivery-destination')); return [s.backgroundColor,s.color]; })()`),
          ['rgb(74, 222, 128)', 'rgb(15, 23, 42)']); // Slice 2 palette: light GML fill, dark ink
        await assertPillFollowsName(browser);
        await screenshot(browser, 'polish-tree-expanded');
        await browser.evaluate(`${dialog}.querySelector('.delivery-tree input[type=checkbox]').click()`);
        await browser.waitFor(`${dialog}.querySelector('.delivery-thumbnail img')?.naturalWidth > 0`);
        assert.equal(await browser.evaluate(`${dialog}.querySelector('.delivery-destination').textContent`), 'GML');
        assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('.delivery-tree input').length`), 1, 'the reviewed tree only has the preview toggle, no delivery editors');
        await assertPillFollowsName(browser);
        await screenshot(browser, 'polish-tree-thumbnails');
        const previewUrl = await browser.evaluate(`${dialog}.querySelector('.delivery-thumbnail img').src`);
        await browser.evaluate(`window.__polishRevoked=[];window.__polishRevoke=URL.revokeObjectURL;URL.revokeObjectURL=function(url){window.__polishRevoked.push(url);window.__polishRevoke.call(URL,url);}`);
        await click(browser, 'Lukk alle');
        await browser.waitFor(`window.__polishRevoked.includes(${JSON.stringify(previewUrl)})`);
        assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('.delivery-thumbnail').length`), 0);
        await browser.evaluate('URL.revokeObjectURL=window.__polishRevoke');
        await browser.evaluate('window.__polishDecode=HTMLImageElement.prototype.decode;HTMLImageElement.prototype.decode=function(){return Promise.reject(new Error("Synthetic preview failure"));}');
        await click(browser, 'Utvid alle');
        await browser.waitFor(`${dialog}.querySelector('.delivery-thumbnail')?.textContent.includes('Forhåndsvisning mangler')`);
        assert(await browser.evaluate(`${dialog}.querySelector('[data-package-path="Attachments/shared.jpg"]').textContent.includes('shared.jpg')`));
        await browser.evaluate('HTMLImageElement.prototype.decode=window.__polishDecode');
        await click(browser, 'Lukk alle'); await click(browser, 'Utvid alle');
        await browser.waitFor(`${dialog}.querySelector('.delivery-thumbnail img')?.naturalWidth > 0`);
        await browser.evaluate(`${dialog}.querySelector('.delivery-folder').scrollIntoView({block:'center'});${dialog}.querySelector('.delivery-folder').focus()`);
        assert.equal(await browser.evaluate('document.activeElement.classList.contains("delivery-folder")'), true);
        await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' });
        await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
        await browser.waitFor(`${dialog}.querySelector('.delivery-folder').getAttribute('aria-expanded') === 'false'`);
        await screenshot(browser, 'polish-tree-keyboard-focus');
        const output = await downloaded(browser, directory, 'Last ned ZIP');
        const entries = unzipSync(output.bytes), gml = Object.keys(entries).find((name) => name.endsWith('.gml'));
        assert.deepEqual(Object.keys(entries), [gml, 'Attachments/shared.jpg']);
        assertGeminiConventions(strFromU8(entries[gml]));
        assert.equal((strFromU8(entries[gml]).match(/<app:Skråfoto/g) ?? []).length, 2);
        assert.deepEqual(entries['Attachments/shared.jpg'], new Uint8Array(photograph));
        const again = await downloaded(browser, directory, 'Last ned ZIP'); assert.deepEqual(again.bytes, output.bytes);
        await back(browser);
      });

      await t.test('split requires explicit acknowledgement and preserves staged corrections while removing only the selected link', async () => {
        await choose(browser, 'split');
        assert.equal(await browser.evaluate(`${dialog}.querySelector('[data-export-advance]').disabled`), true);
        await browser.evaluate(`${dialog}.querySelector('[aria-label="Utelat feltrettingene"]').click()`);
        const facts = await pack(browser); assert.match(facts.Rettinger, /uttrykkelig/); assert.match(facts.Bildelenker, /1 beholdes.*1 overføres/);
        await click(browser, 'Gå tilbake til Kontroll');
        assert.equal(await currentStep(browser), '2. Kontroll');
        await screenshot(browser, 'm10-split-review-1366x768');
        await click(browser, 'Neste');
        const output = await downloaded(browser, directory, 'Last ned ZIP');
        const entries = unzipSync(output.bytes), gmi = Object.keys(entries).find((name) => name.endsWith('.gmi'));
        const xml = strFromU8(entries[Object.keys(entries).find((name) => name.endsWith('.gml'))]);
        assert.equal(strFromU8(entries[gmi]), strFromU8(original).replace('h:1(link:"Attachments\\shared.jpg") ', ''));
        assert.equal((xml.match(/<app:Skråfoto/g) ?? []).length, 1);
        assert.deepEqual(Object.keys(entries).slice(2), ['Attachments/shared.jpg']);
        assert(await browser.evaluate(`(() => {const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;})()`), 'split download leaves staged corrections unsaved');
        await back(browser);
      });

      await t.test('combined preview, separate report, exact package and download failure/retry state', async () => {
        await choose(browser, 'combined');
        const facts = await pack(browser); assert.match(facts.Rettinger, /^1 /); assert.match(facts.GML, /^1 /);
        // «Se kontrollen» returns to the same valid review: same plan name, no rebuild, findings shown without interaction.
        const reviewed = await browser.evaluate(`${dialog}.querySelector('[data-export-zip]').dataset.exportZip`);
        await click(browser, 'Tilbake');
        assert.equal(await currentStep(browser), '2. Kontroll'); assert.equal(await status(browser), 'ready');
        assert.equal(await browser.evaluate(`${dialog}.querySelector('[data-export-zip]').dataset.exportZip`), reviewed);
        assert.deepEqual(await summary(browser), facts);
        await browser.evaluate(`${dialog}.querySelector('[data-export-back]').click()`);
        assert.equal(await currentStep(browser), '1. Innhold');
        assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('[data-export-zip]').length`), 0, 'content Back invalidates the old plan');
        assert.equal(await browser.evaluate(`${dialog}.querySelector('input[value=combined]').checked`), true);
        await setValue(browser, `${dialog}.querySelector('[data-export-filename-editor] input[type=text]')`, 'Fresh-check');
        await review(browser); assert.equal(await status(browser), 'ready');
        const freshName = await browser.evaluate(`${dialog}.querySelector('[data-export-zip]').dataset.exportZip`);
        assert.notEqual(freshName, reviewed); assert.match(freshName, /Fresh-check/);
        // Return to the original label and obtain a fresh review for the remaining package assertions.
        await browser.evaluate(`${dialog}.querySelector('[data-export-back]').click()`);
        await setValue(browser, `${dialog}.querySelector('[data-export-filename-editor] input[type=text]')`, 'M10');
        await review(browser);
        assert.equal(await browser.evaluate(`document.activeElement === ${dialog}.querySelector('[data-export-heading]')`), true, 'focus moves to the Kontroll heading');
        assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('[data-export-step="review"] [data-review-status], [data-export-step="review"] .delivery-inventory').length`), 0, 'Kontroll has no package tree');
        assert.equal(await browser.evaluate(`Boolean(${dialog}.querySelector('details[data-export-technical]:not([open])'))`), true, 'technical details start folded');
        assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('section.delivery-diagnostics[data-tone=warnings] li').length > 0
          && ${dialog}.querySelector('section.delivery-diagnostics[data-tone=warnings]').closest('details') === null`), true, 'warnings are not folded');
        assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('details.delivery-diagnostics[data-tone=info][open]').length`), 0, 'information starts folded');
        assert.equal((await browser.evaluate(`${dialog}.innerText.match(/Dette er eksportkontroll/g)?.length ?? 0`)), 1, 'the disclaimer appears once');
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          const rows = await browser.evaluate(`Array.from(${dialog}.querySelectorAll('.delivery-summary > div')).map(row=>row.getBoundingClientRect().toJSON())`);
          assert(Math.abs(rows[0].top - rows[3].top) < 2); assert(rows[3].left > rows[0].left);
          const footer = await browser.evaluate(`${dialog}.querySelector('footer').getBoundingClientRect().bottom`);
          assert(footer <= height);
          assert.deepEqual(await browser.evaluate(`Array.from(${dialog}.querySelectorAll('footer button')).map(e=>e.innerText.trim())`), ['Avbryt', 'Tilbake', 'Neste']);
          assert.equal(await browser.evaluate(`getComputedStyle(${dialog}.querySelector('[data-export-next]')).backgroundColor`), 'rgb(0, 117, 149)');
          assert(await browser.evaluate(`Array.from(${dialog}.querySelectorAll('footer button')).every(e=>e.getBoundingClientRect().height===40)`));
          await screenshot(browser, `navigation-export-review-${width}x${height}`);
        }
        await screenshot(browser, 'a4-kontroll-combined');
        await click(browser, 'Neste'); await assertPackageOnly(browser);
        assert.match(await browser.evaluate(`${dialog}.querySelector('[data-export-zip]').dataset.exportZip`), /M10/);
        assert.equal(await browser.evaluate(`${dialog}.querySelector('.delivery-folder').getAttribute('aria-expanded')`), 'false', 'the package tree starts collapsed');
        await screenshot(browser, 'a4-pakke-combined');
        for (const [width, height] of [[1280, 720], [1366, 768], [390, 844]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          const bounds = await browser.evaluate(`(() => {const d=${dialog}, f=d.querySelector('footer');return {dialog:d.getBoundingClientRect().toJSON(),footer:f.getBoundingClientRect().toJSON(),overflow:d.scrollWidth>d.clientWidth+1};})()`);
          assert(!bounds.overflow); assert(bounds.footer.bottom <= height); assert(bounds.dialog.top >= 0);
          assert(bounds.dialog.height >= height * .94, 'package uses the available viewport height');
          assert.deepEqual(await browser.evaluate(`Array.from(${dialog}.querySelectorAll('footer button')).map(e=>e.innerText.trim())`), ['Avbryt', 'Tilbake', 'Last ned ZIP']);
          await click(browser, 'Utvid alle');
          assert.equal(await browser.evaluate(`${dialog}.querySelector('.delivery-destination').textContent`), 'GMI + GML');
          await assertPillFollowsName(browser);
          await screenshot(browser, `m10-combined-package-${width}x${height}`);
          if (width === 390) {
            // Layout probe: a long name wraps and the pill still follows its last line inside the row (text restored after).
            const original = await browser.evaluate(`${dialog}.querySelector('.delivery-file .delivery-file-name').textContent`);
            await browser.evaluate(`${dialog}.querySelector('.delivery-file .delivery-file-name').textContent = 'EKS.BETONG.110.1.1_20260922_1401_01_with_a_deliberately_long_synthetic_name.jpg'`);
            const wrapped = await pillPlacement(browser);
            assert(wrapped.sameLine && wrapped.gap >= 0 && wrapped.gap <= 10 && wrapped.rowSlack >= 0, JSON.stringify(wrapped));
            assert(await browser.evaluate(`${dialog}.querySelector('.delivery-file .delivery-file-name').getClientRects().length > 1`), 'the long filename wraps');
            await screenshot(browser, 'refine-tree-long-name-390x844');
            await browser.evaluate(`${dialog}.querySelector('.delivery-file .delivery-file-name').textContent = ${JSON.stringify(original)}`);
          }
        }
        await browser.send('Emulation.setDeviceMetricsOverride', { width:1366, height:768,deviceScaleFactor:1,mobile:false });
        // Native modal focus containment, trusted Tab and Escape controls.
        await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        assert(await browser.evaluate(`${dialog}.contains(document.activeElement)`));
        await click(browser, 'Last ned rapport');
        assert(await browser.evaluate(`(() => {const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;})()`), 'report does not mark corrections downloaded');
        await browser.evaluate(`(() => {window.__m10Click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){throw new Error('Synthetic blocked download');};})()`);
        await click(browser, 'Last ned ZIP');
        await browser.waitFor(`${dialog}.dataset.exportPhase === 'download-failed'`);
        assert.match(await browser.evaluate(`${dialog}.innerText`), /kunne ikke startes/);
        assert(await browser.evaluate(`(() => {const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;})()`), 'failed initiation keeps corrections unsaved');
        await browser.evaluate('HTMLAnchorElement.prototype.click=window.__m10Click');
        const output = await downloaded(browser, directory, 'Last ned ZIP');
        const entries = unzipSync(output.bytes), gmi = Object.keys(entries).find((name) => name.endsWith('.gmi'));
        assert.equal(strFromU8(entries[gmi]), strFromU8(original).replace('h:1(link:"Attachments\\shared.jpg") ', '').replace('Punkt 1', 'M10 corrected'));
        assert.equal(Object.keys(entries).length, 3); assert(!Object.keys(entries).some((name) => /rapport|manifest/.test(name)));
        assert.equal(await browser.evaluate(`(() => {const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;})()`), false, 'successful combined handoff clears only the exported field state');
        await back(browser);
      });

      await t.test('GMI-only keeps both links and includes the exact corrected field', async () => {
        await choose(browser, 'gmi-only'); await pack(browser);
        await screenshot(browser, 'a4-pakke-gmi-only');
        await click(browser, 'Tilbake'); assert.equal(await currentStep(browser), '2. Kontroll');
        assert.match(await browser.evaluate(`${dialog}.querySelector('[data-export-experimental]').innerText`), /^Eksperimentell\. Revidert GMI er ikke akseptansetestet i Gemini VA\.$/);
        await screenshot(browser, 'a4-kontroll-gmi-only');
        await click(browser, 'Neste'); await assertPackageOnly(browser);
        const output = await downloaded(browser, directory, 'Last ned GMI');
        assert.match(output.name, /\.gmi$/);
        assert.equal(strFromU8(output.bytes), strFromU8(original).replace('Punkt 1', 'M10 corrected'));
        await back(browser);
      });

      await t.test('unreadable originals block the reviewed package with actionable text', async () => {
        await choose(browser, 'combined');
        await browser.evaluate(`(() => {window.__m10Read=Blob.prototype.arrayBuffer;Blob.prototype.arrayBuffer=function(){return this.type==='image/jpeg'?Promise.reject(new Error('Synthetic missing original')):window.__m10Read.call(this);};})()`);
        await review(browser); assert.equal(await status(browser), 'blocked');
        assert(await browser.evaluate(`${dialog}.querySelector('section[aria-label="Feil"]')!==null`));
        assert(await browser.evaluate(`(() => { const errors = ${dialog}.querySelector('section[aria-label="Feil"]');
          return errors.closest('details') === null && errors.getBoundingClientRect().height > 0 && errors.querySelectorAll('li').length > 0; })()`), 'blockers are shown without interaction');
        assert.equal(await primaries(browser), 1, 'one (disabled) primary action on a blocked Kontroll');
        await screenshot(browser, 'a4-kontroll-blocked');
        assert.equal(await browser.evaluate(`Array.from(${dialog}.querySelectorAll('button')).find(button=>button.textContent==='Neste').disabled`), true);
        await screenshot(browser, 'm10-blocked-review');
        await browser.evaluate('Blob.prototype.arrayBuffer=window.__m10Read'); await back(browser);
      });

      await t.test('a changed M8 occurrence invalidates the reviewed plan and requires a fresh control', async () => {
        await pack(browser);
        await click(browser, 'Utvid alle');
        await browser.evaluate(`${dialog}.querySelector('.delivery-tree input[type=checkbox]').click()`);
        await browser.waitFor(`${dialog}.querySelector('.delivery-thumbnail img')?.naturalWidth > 0`);
        const obsoleteUrl = await browser.evaluate(`${dialog}.querySelector('.delivery-thumbnail img').src`);
        await browser.evaluate('window.__polishRevoked=[];window.__polishRevoke=URL.revokeObjectURL;URL.revokeObjectURL=function(url){window.__polishRevoked.push(url);window.__polishRevoke.call(URL,url);}');
        await browser.evaluate(`${section}.querySelector('[role=radio][data-destination=gmi]').click()`);
        await browser.waitFor(`${dialog}.dataset.exportPhase === 'stale'`);
        assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('[data-package-contents], .delivery-thumbnail').length`), 0);
        await browser.waitFor(`window.__polishRevoked.includes(${JSON.stringify(obsoleteUrl)})`);
        await browser.evaluate('URL.revokeObjectURL=window.__polishRevoke');
        assert.equal(await browser.evaluate(`Array.from(${dialog}.querySelectorAll('button')).find(button=>button.textContent==='Last ned ZIP').disabled`), true);
        await click(browser, 'Tilbake og kontroller på nytt');
        assert.equal(await currentStep(browser), '1. Innhold');
        assert.equal((await pack(browser)).GML, '0 poster i GML');
        await click(browser, 'Utvid alle');
        assert.equal(await browser.evaluate(`${dialog}.querySelector('.delivery-destination').textContent`), 'GMI');
        await screenshot(browser, 'final-package-retained-gmi');
        await click(browser, 'Lukk eksport');
      });
      await t.test('Slice 3: exclusions in Kontroll, exact inventory/report/download, standalone notes and restoration at both laptop sizes', async () => {
        // The previous staleness check restored the first occurrence to GMI.
        // Set an explicit exclusion through the inspector, never through a normal row click.
        await browser.evaluate(`${section}.querySelector('[role=radio][data-destination=excluded]').click()`);
        await browser.waitFor(`${section}.querySelector('[data-destination=excluded]').getAttribute('aria-checked') === 'true'`);
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          await click(browser, 'Eksporter…', 'document'); await browser.waitFor(dialog);
          await choose(browser, 'combined'); await review(browser);
          assert.equal(await status(browser), 'ready', await browser.evaluate(`${dialog}.innerText`));
          const facts = await summary(browser);
          assert.match(facts.Bilder, /^1 bilde /); assert.match(facts.Plasseringer, /^1 i GMI · 0 i GML$/);
          assert.match(facts.Bildelenker, /^1 beholdes.*0 overføres.*1 fjernet/);
          assert.match(facts['Ikke med'], /^1 plassering valgt · 0 bilder helt ute · 1 bilde delvis med$/);
          await browser.evaluate(`${dialog}.querySelector('[data-delivery-exclusions]').open=true`);
          assert.match(await browser.evaluate(`${dialog}.querySelector('[data-delivery-exclusions]').innerText`), /shared.jpg.*Punkt 1.*bildelenke fjernet.*fortsatt med via.*Punkt 2/);
          assert(await browser.evaluate(`${dialog}.querySelector('footer').getBoundingClientRect().bottom <= ${height}`));
          await screenshot(browser, `slice3-kontroll-partial-${width}x${height}`);
          await click(browser, 'Neste'); await click(browser, 'Utvid alle');
          assert.equal(await browser.evaluate(`${dialog}.querySelector('.delivery-destination').innerText`), 'GMI');
          await screenshot(browser, `slice3-inventory-partial-${width}x${height}`);
          const reportDirectory = await mkdtemp(path.join(directory, 'report-'));
          await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: reportDirectory });
          await click(browser, 'Last ned rapport');
          let report;
          for (let attempt = 0; attempt < 100; attempt++) {
            const name = (await readdir(reportDirectory)).find((name) => name.endsWith('.txt'));
            if (name) { report = await readFile(path.join(reportDirectory, name), 'utf8'); break; }
            await delay(50);
          }
          assert.match(report, /Ikke med i leveransen:/);
          assert.match(report, /shared.jpg.*Punkt 1.*bildelenke fjernet.*fortsatt med via.*Punkt 2/);
          const output = await downloaded(browser, directory, 'Last ned ZIP'), entries = unzipSync(output.bytes);
          assert.equal(Object.keys(entries).length, 2); assert(!Object.keys(entries).some((name) => /\.gml$|\.txt$/.test(name)));
          const gmi = Object.keys(entries).find((name) => name.endsWith('.gmi'));
          assert.equal(strFromU8(entries[gmi]), strFromU8(original).replace('h:1(link:"Attachments\\shared.jpg") ', '').replace('Punkt 1', 'M10 corrected'));
          assert.deepEqual(entries['Attachments/shared.jpg'], new Uint8Array(photograph));
          await back(browser);
          for (const mode of ['gmi-only', 'photos-only']) {
            await choose(browser, mode);
            assert.match(await browser.evaluate(`${dialog}.querySelector('[data-delivery-exclusion-note]').innerText`), /bruker ikke disse valgene/);
            await review(browser); assert.equal(await status(browser), 'ready');
            assert.match(await browser.evaluate(`${dialog}.querySelector('[data-delivery-exclusion-note]').innerText`), /bruker ikke disse valgene/);
            await back(browser);
          }
          await click(browser, 'Lukk eksport');
        }
        // Exclude the second occurrence too: no photo file remains, and no GML is created.
        await browser.evaluate(`document.querySelector('[data-photo-id="${rows[1]}"] button.photo-workspace-row').click()`);
        await browser.evaluate(`${section}.querySelector('[role=radio][data-destination=excluded]').click()`);
        await click(browser, 'Eksporter…', 'document'); await browser.waitFor(dialog); await choose(browser, 'combined');
        const facts = await pack(browser); assert.match(facts.Bilder, /^0 bilder/); assert.match(facts.Vedlegg, /^0 filer/);
        assert.match(facts['Ikke med'], /^2 plasseringer valgt · 1 bilde helt ute · 0 bilder delvis med$/);
        const output = await downloaded(browser, directory, 'Last ned ZIP'), entries = unzipSync(output.bytes);
        assert.equal(Object.keys(entries).length, 1);
        assert.equal(strFromU8(Object.values(entries)[0]), strFromU8(original).replaceAll('h:1(link:"Attachments\\shared.jpg") ', '').replace('Punkt 1', 'M10 corrected'));
        await click(browser, 'Lukk eksport');
        for (const id of rows) {
          await browser.evaluate(`document.querySelector('[data-photo-id="${id}"] button.photo-workspace-row').click()`);
          await browser.evaluate(`${section}.querySelector('[role=radio][data-destination=gmi]').click()`);
        }
        await click(browser, 'Eksporter…', 'document'); await browser.waitFor(dialog); await choose(browser, 'combined');
        await pack(browser);
        const restored = unzipSync((await downloaded(browser, directory, 'Last ned ZIP')).bytes);
        assert.equal(strFromU8(restored[Object.keys(restored).find((name) => name.endsWith('.gmi'))]), strFromU8(original).replace('Punkt 1', 'M10 corrected'));
        assert.deepEqual(await readFile(imageFile), photograph);
        await click(browser, 'Lukk eksport');
      });
      await t.test('changed attachment bytes invalidate review rather than allowing retry of an obsolete package', async () => {
        await click(browser, 'Eksporter…', 'document'); await browser.waitFor(dialog); await pack(browser);
        await browser.evaluate(`(() => {window.__m10Read=Blob.prototype.arrayBuffer;Blob.prototype.arrayBuffer=function(){return this.type==='image/jpeg'?Promise.resolve(new Uint8Array([0]).buffer):window.__m10Read.call(this);};})()`);
        await click(browser, 'Last ned ZIP');
        await browser.waitFor(`${dialog}.dataset.exportPhase === 'stale'`);
        assert.equal(await browser.evaluate(`Array.from(${dialog}.querySelectorAll('button')).find(button=>button.textContent==='Last ned ZIP').disabled`), true);
        await browser.evaluate('Blob.prototype.arrayBuffer=window.__m10Read');
        await click(browser, 'Tilbake og kontroller på nytt'); await pack(browser); await click(browser, 'Lukk eksport');
      });
      await t.test('closing during packaging suppresses late browser downloads and Escape restores opener focus', async () => {
        await click(browser, 'Eksporter…', 'document'); await browser.waitFor(dialog); await pack(browser);
        await browser.evaluate(`(() => {window.__m10Downloads=[];window.__m10NativeClick=HTMLAnchorElement.prototype.click;
          HTMLAnchorElement.prototype.click=function(){window.__m10Downloads.push(this.download);return window.__m10NativeClick.call(this);};
          window.__m10Read=Blob.prototype.arrayBuffer;window.__m10Pending=[];
          Blob.prototype.arrayBuffer=function(){return this.type==='image/jpeg'?new Promise(resolve=>window.__m10Pending.push(()=>window.__m10Read.call(this).then(resolve))):window.__m10Read.call(this);};})()`);
        await click(browser, 'Last ned ZIP'); await browser.waitFor('window.__m10Pending.length>0');
        await click(browser, 'Lukk eksport');
        await browser.evaluate('window.__m10Pending.forEach(resume=>resume());Blob.prototype.arrayBuffer=window.__m10Read');
        await delay(300); assert.deepEqual(await browser.evaluate('window.__m10Downloads'), []);
        await browser.evaluate('HTMLAnchorElement.prototype.click=window.__m10NativeClick');
        await click(browser, 'Eksporter…', 'document'); await browser.waitFor(dialog);
        await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await browser.waitFor(`!${dialog}`);
        assert(await browser.evaluate('document.activeElement!==document.body && document.activeElement.isConnected'));
      });
      assert.deepEqual(new Uint8Array(await readFile(gmiFile)), original);
    } finally {
      await browser.close();
      const resolved = path.resolve(directory);
      if (path.dirname(resolved) !== path.resolve(tmpdir()) || !path.basename(resolved).startsWith('gmi-m10-ui-')) throw new Error('Unsafe temporary directory');
      await rm(resolved, { recursive: true, force: true });
    }
  });
