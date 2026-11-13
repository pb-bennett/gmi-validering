import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { unzipSync, strFromU8 } from 'fflate';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { buildGmiText, latin1Bytes } from './helpers/gmiHyperlinkRemovalFixtures.mjs';
import { gpsJpeg } from './helpers/photoGpsFixtures.mjs';
import { setPhotoFiles, clickSourceControl } from './helpers/photoSourceWorkflow.mjs';
import { waitForThumbnails } from './helpers/photoImportWizard.mjs';
import { clickGmiTableObject } from './helpers/gmiTableNavigation.mjs';
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
const pack = async (browser) => { await review(browser); assert.equal(await status(browser), 'ready', await browser.evaluate(`${dialog}.innerText`)); await click(browser, 'Til pakke'); };
const back = async (browser) => { await click(browser, 'Tilbake til Innhold'); await browser.waitFor(`${dialog}.querySelector('[data-export-step="delivery"]')`); };
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
  for (const size of name.startsWith('polish-tree') ? [[1280, 720], [1366, 768]] : [null]) {
    if (size) await browser.send('Emulation.setDeviceMetricsOverride', { width: size[0], height: size[1], deviceScaleFactor: 1, mobile: false });
    await delay(250);
    const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(shots, `${name}${size ? `-${size[0]}x${size[1]}` : ''}.png`), Buffer.from(data, 'base64'));
  }
};
async function downloaded(browser, directory, label) {
  await click(browser, label);
  await browser.waitFor(`${dialog}.dataset.exportPhase === 'done'`);
  const name = await browser.evaluate(`${dialog}.querySelector('[data-downloaded-filename]').textContent`);
  for (let count = 0; count < 100; count++) {
    try { return { name, bytes: new Uint8Array(await readFile(path.join(directory, name))) }; }
    catch { await delay(50); }
  }
  throw new Error('Download did not arrive');
}

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
      await click(browser, 'Se gjennom (1)', inspector);
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

      await click(browser, 'Tilbake til appen', 'document');
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
      await t.test('direct-click planning: delivery colours by default, overlapping chooser toggles exact occurrences, isolated markers toggle in one click', async () => {
        const popup = 'document.querySelector(".photo-delivery-map-popup")';
        const marker = 'document.querySelector(".photo-camera-marker.photo-marker-selected")';
        const fill = () => browser.evaluate(`${marker}.querySelector('.photo-camera-glyph path').getAttribute('fill')`);
        const pills = () => browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-list li[data-photo-id]')).map((li) => li.querySelector('.photo-delivery-pill').innerText)`);
        const colourSelect = 'document.querySelector(".photo-map-display-card select")';
        const setColour = async (value) => { await browser.evaluate(`${colourSelect}.value=${JSON.stringify(value)};${colourSelect}.dispatchEvent(new Event('change',{bubbles:true}))`); };
        const key = async (name, code, keyCode) => {
          await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code, windowsVirtualKeyCode: keyCode, ...(name === ' ' ? { text: ' ' } : {}) });
          await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code, windowsVirtualKeyCode: keyCode });
        };
        // Normal navigation already colours by destination; the mixed stack is neutral and dashed, not its top member's colour.
        await browser.waitFor(marker);
        assert.equal(await browser.evaluate(`${colourSelect}.value`), 'delivery');
        assert.equal(await browser.evaluate(`${marker}.querySelector('.photo-camera-glyph').dataset.positionSource`), 'gmi', 'provenance identity is kept');
        assert.equal(await fill(), '#64748b', 'mixed stack has no single destination colour');
        assert(await browser.evaluate(`${marker}.querySelector('.photo-camera-glyph').innerHTML.includes('stroke-dasharray')`));
        assert.match(await browser.evaluate(`${marker}.getAttribute('aria-label')`), /^Vis bilde:.*Ulike leveringsvalg på samme sted/);
        await screenshot(browser, 'refine-delivery-map-normal');
        await setColour('provenance');
        assert.equal(await fill(), '#2463b5', 'Plasseringskilde restores the accepted provenance colour');
        await screenshot(browser, 'final-marker-provenance');
        await setColour('delivery');

        await click(browser, 'Fordel bilder til GMI/GML', 'document');
        await browser.waitFor('document.querySelector(".photo-delivery-bar")');
        assert.equal(await browser.evaluate(`${colourSelect}.value`), 'delivery');
        assert.equal(await browser.evaluate('document.querySelectorAll(".photo-workspace-list input").length'), 0, 'no selection checkboxes');
        assert.match(await browser.evaluate(`${marker}.getAttribute('aria-label')`), /^Velg plassering:/);
        assert.equal(await browser.evaluate(`${marker}.getAttribute('aria-haspopup')`), 'dialog');
        await browser.evaluate(`${marker}.dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
        await browser.waitFor(popup);
        const occurrence = (id) => `${popup}.querySelector('[data-occurrence-id="${id}"]')`;
        const choose = (id, destination) => browser.evaluate(`${occurrence(id)}.querySelector('[role=radio][data-destination=${destination}]').click()`);
        const checked = (id) => browser.evaluate(`${occurrence(id)}.querySelector('[role=radio][aria-checked=true]').dataset.destination`);
        assert.equal(await browser.evaluate(`${popup}.querySelectorAll('[data-occurrence-id]').length`), 2);
        assert.equal(await browser.evaluate(`${popup}.querySelectorAll('input, [role=tab]').length`), 0, 'no Massevalg tabs or checkboxes');
        assert.equal(await browser.evaluate(`${popup}.querySelector('.photo-delivery-popup-summary').innerText`), '2 plasseringer · 1 GMI · 1 GML');
        assert.match(await browser.evaluate(`${occurrence(rows[1])}.innerText`), /shared\.jpg/);
        assert.deepEqual([await checked(rows[0]), await checked(rows[1])], ['gml', 'gmi']);
        assert.deepEqual(await browser.evaluate(`Array.from(${popup}.querySelectorAll('[role=radio][aria-checked=true]')).map(e => {
          const s=getComputedStyle(e); return [s.backgroundColor,s.color]; })`),
        [['rgb(22, 101, 52)', 'rgb(255, 255, 255)'], ['rgb(30, 64, 175)', 'rgb(255, 255, 255)']]);
        assert.deepEqual(await pills(), ['GML', 'GMI'], 'opening the chooser changes nothing');
        await screenshot(browser, 'refine-overlap-chooser');
        // Each occurrence changes alone; the stack colour follows all of its members at once.
        await choose(rows[1], 'gml');
        await browser.waitFor(`${popup}.querySelector('.photo-delivery-popup-summary').innerText === '2 plasseringer · 2 GML'`);
        assert.deepEqual(await pills(), ['GML', 'GML']);
        await browser.waitFor(`${marker}.querySelector('.photo-camera-glyph path').getAttribute('fill') === '#22c55e'`);
        await choose(rows[0], 'gmi');
        await browser.waitFor(`${popup}.querySelector('.photo-delivery-popup-summary').innerText === '2 plasseringer · 1 GMI · 1 GML'`);
        assert.deepEqual([await checked(rows[0]), await checked(rows[1])], ['gmi', 'gml']);
        await browser.waitFor(`${marker}.querySelector('.photo-camera-glyph path').getAttribute('fill') === '#64748b'`);
        // Keyboard inside the chooser: arrows choose within one occurrence's toggle.
        await browser.evaluate(`${occurrence(rows[1])}.querySelector('[role=radio][aria-checked=true]').focus()`);
        await key('ArrowLeft', 'ArrowLeft', 37);
        await browser.waitFor(`${popup}.querySelector('.photo-delivery-popup-summary').innerText === '2 plasseringer · 2 GMI'`);
        await browser.waitFor(`${marker}.querySelector('.photo-camera-glyph path').getAttribute('fill') === '#1e40af'`);
        assert.equal(await checked(rows[0]), 'gmi');
        await choose(rows[0], 'gml');
        await browser.waitFor(`${popup}.querySelector('.photo-delivery-popup-summary').innerText === '2 plasseringer · 1 GMI · 1 GML'`);
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          await delay(300);
          await screenshot(browser, `refine-overlap-chooser-${width}x${height}`);
        }
        await browser.evaluate(`${popup}.querySelector('.leaflet-popup-close-button').click()`);
        await browser.waitFor(`!${popup}`);
        // A single-occurrence marker: one click toggles that exact occurrence, no popup and no selection step.
        const exactMarker = `document.querySelector('.photo-camera-marker[data-photo-id="${rows[1]}"]')`;
        assert.match(await browser.evaluate(`${exactMarker}.getAttribute('aria-label')`), /^Endre leveringsvalg:.*Planlagt: Beholdes i GMI/);
        await browser.evaluate(`${exactMarker}.dispatchEvent(new MouseEvent('click', {bubbles:true}))`);
        await browser.waitFor(`document.querySelector('.photo-workspace-list li[data-photo-id="${rows[1]}"] .photo-delivery-pill').innerText === 'GML'`);
        assert.equal(await browser.evaluate(`Boolean(${popup})`), false);
        assert.deepEqual(await pills(), ['GML', 'GML'], 'the sibling keeps its own decision');
        assert.match(await browser.evaluate('document.querySelector(".photo-delivery-bar [role=status]").innerText'), /^shared\.jpg · .*: Overføres til GML$/);
        await browser.evaluate(`${exactMarker}.dispatchEvent(new MouseEvent('click', {bubbles:true}))`);
        await browser.waitFor(`document.querySelector('.photo-workspace-list li[data-photo-id="${rows[1]}"] .photo-delivery-pill').innerText === 'GMI'`);
        for (const expected of ['GML', 'GMI']) {
          await browser.evaluate(`${exactMarker}.focus()`);
          await key(' ', 'Space', 32);
          await browser.waitFor(`document.querySelector('.photo-workspace-list li[data-photo-id="${rows[1]}"] .photo-delivery-pill').innerText === ${JSON.stringify(expected)}`);
        }
        assert.deepEqual(await pills(), ['GML', 'GMI']);
        await click(browser, 'Ferdig', 'document.querySelector(".photo-delivery-bar")');
        await browser.waitFor('!document.querySelector(".photo-delivery-bar")');
        assert.equal(await browser.evaluate(`${colourSelect}.value`), 'delivery');
        // An explicit colour choice survives entering and leaving planning.
        await setColour('provenance');
        await click(browser, 'Fordel bilder til GMI/GML', 'document');
        await browser.waitFor('document.querySelector(".photo-delivery-bar")');
        assert.equal(await browser.evaluate(`${colourSelect}.value`), 'provenance');
        await click(browser, 'Ferdig', 'document.querySelector(".photo-delivery-bar")');
        await browser.waitFor('!document.querySelector(".photo-delivery-bar")');
        assert.equal(await browser.evaluate(`${colourSelect}.value`), 'provenance');
        await setColour('delivery');
        // Normal navigation again: a marker click selects the photo and changes no decision.
        await browser.evaluate(`${exactMarker}.dispatchEvent(new MouseEvent('click', {bubbles:true}))`);
        await browser.waitFor(`document.querySelector('.photo-workspace-list li[data-photo-id="${rows[1]}"] button').getAttribute('aria-pressed') === 'true'`);
        assert.deepEqual(await pills(), ['GML', 'GMI']);
        await browser.evaluate(`document.querySelector('.photo-workspace-list li[data-photo-id="${rows[0]}"] button').click()`);
      });
      await click(browser, 'Eksporter…', 'document'); await browser.waitFor(dialog);

      await t.test('FOTO entry point preserves all placed occurrences, Gemini IDs and original attachment bytes', async () => {
        assert.equal(await browser.evaluate(`${dialog}.querySelector('input[value="photos-only"]').checked`), true);
        await setValue(browser, `${dialog}.querySelector('[aria-label="Eksportetikett"]')`, 'M10');
        await pack(browser); assert.equal(await currentStep(browser), '3. Pakke / Last ned');
        const facts = await summary(browser); assert.match(facts.GML, /^2 /);
        assert.equal(await browser.evaluate(`${dialog}.querySelector('.delivery-tree input[type=checkbox]').checked`), false);
        assert.equal(await browser.evaluate(`${dialog}.querySelector('.delivery-folder').getAttribute('aria-expanded')`), 'false');
        await screenshot(browser, 'polish-tree-collapsed');
        await click(browser, 'Utvid alle');
        await browser.waitFor(`${dialog}.querySelector('[data-package-path="Attachments/shared.jpg"]')`);
        assert.equal(await browser.evaluate(`${dialog}.querySelector('.delivery-destination').textContent`), 'GML');
        assert.deepEqual(await browser.evaluate(`(() => { const s=getComputedStyle(${dialog}.querySelector('.delivery-destination')); return [s.backgroundColor,s.color]; })()`),
          ['rgb(22, 101, 52)', 'rgb(255, 255, 255)']);
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
        const again = await downloaded(browser, directory, 'Last ned på nytt'); assert.deepEqual(again.bytes, output.bytes);
        await back(browser);
      });

      await t.test('split requires explicit acknowledgement and preserves staged corrections while removing only the selected link', async () => {
        await choose(browser, 'split');
        assert.equal(await browser.evaluate(`${dialog}.querySelector('[data-export-advance]').disabled`), true);
        await browser.evaluate(`${dialog}.querySelector('[aria-label="Utelat feltrettingene"]').click()`);
        await pack(browser);
        const facts = await summary(browser); assert.match(facts.Rettinger, /uttrykkelig/); assert.match(facts.Bildelenker, /1 beholdes.*1 overføres/);
        await click(browser, 'Gå tilbake til Kontroll');
        assert.equal(await currentStep(browser), '2. Kontroll');
        await screenshot(browser, 'm10-split-review-1366x768');
        await click(browser, 'Til pakke');
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
        await choose(browser, 'combined'); await pack(browser);
        const facts = await summary(browser); assert.match(facts.Rettinger, /^1 /); assert.match(facts.GML, /^1 /);
        for (const [width, height] of [[1280, 720], [1366, 768], [390, 844]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          const bounds = await browser.evaluate(`(() => {const d=${dialog}, f=d.querySelector('footer');return {dialog:d.getBoundingClientRect().toJSON(),footer:f.getBoundingClientRect().toJSON(),overflow:d.scrollWidth>d.clientWidth+1};})()`);
          assert(!bounds.overflow); assert(bounds.footer.bottom <= height); assert(bounds.dialog.top >= 0);
          assert(bounds.dialog.height >= height * .94, 'package uses the available viewport height');
          const rows = await browser.evaluate(`Array.from(${dialog}.querySelectorAll('.delivery-summary > div')).map(row=>row.getBoundingClientRect().toJSON())`);
          if (width > 700) { assert(Math.abs(rows[0].top - rows[3].top) < 2); assert(rows[3].left > rows[0].left); }
          else { assert(rows[3].top > rows[0].top); assert(Math.abs(rows[3].left - rows[0].left) < 2); }
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
        await click(browser, 'Last ned leveranserapport');
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
        assert.equal(await browser.evaluate(`Array.from(${dialog}.querySelectorAll('button')).find(button=>button.textContent==='Til pakke').disabled`), true);
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
        await pack(browser); assert.equal((await summary(browser)).GML, '0 poster i GML');
        await click(browser, 'Utvid alle');
        assert.equal(await browser.evaluate(`${dialog}.querySelector('.delivery-destination').textContent`), 'GMI');
        await screenshot(browser, 'final-package-retained-gmi');
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
