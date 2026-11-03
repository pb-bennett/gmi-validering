import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { gpsPng } from './helpers/photoGpsFixtures.mjs';
import { gmiText } from './helpers/gmiPhotoFixtures.mjs';
import { clickSourceControl } from './helpers/photoSourceWorkflow.mjs';
import { clickImport, chooseImportPlacement, waitForThumbnails, importDialog } from './helpers/photoImportWizard.mjs';

const app = process.env.PHOTO_UI_URL;
const screenshotRoot = process.env.PHOTO_FIXES_SCREENSHOT_DIR || path.join(tmpdir(), 'photo-import-acceptance-fixes');
const imageBytes = gpsPng().toString('base64');
const gml = (reference) => `<gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:app="http://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101"><gml:featureMember><app:Skråfoto gml:id="p"><app:fotolink>${reference}</app:fotolink><app:fotograferingspunkt><gml:Point srsName="EPSG:25832"><gml:pos>581930 6566000</gml:pos></gml:Point></app:fotograferingspunkt></app:Skråfoto></gml:featureMember></gml:FeatureCollection>`;

test('picker cancellation, recoverable source choices and backward stage navigation', { skip: !app || !chromePath, timeout: 90000 }, async () => {
  const browser = await openTestChrome();
  const current = () => browser.evaluate(`${importDialog}.querySelector('[aria-current="step"]').textContent.trim()`);
  const photoIds = () => browser.evaluate(`Array.from(${importDialog}.querySelectorAll('[data-photo-id]')).map(item => item.dataset.photoId)`);
  const noLayers = async () => assert.equal(await browser.evaluate('document.querySelectorAll("section[aria-label^=Fotokartlag]").length'), 0);
  const inject = (label, name, text) => browser.evaluate(`(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([${text === undefined ? `Uint8Array.from(atob(${JSON.stringify(imageBytes)}), c => c.charCodeAt(0))` : JSON.stringify(text)}], ${JSON.stringify(name)}, { type: ${JSON.stringify(text === undefined ? 'image/png' : 'text/plain')} }));
    const input = document.querySelector('input[aria-label='+${JSON.stringify(JSON.stringify(label))}+']');
    input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  // The native picker cancel event bubbles and is not cancelable. Follow it with
  // an empty change to cover browsers that report dismissal that way instead.
  const cancelPicker = (label) => browser.evaluate(`(() => {
    const input = document.querySelector('input[aria-label='+${JSON.stringify(JSON.stringify(label))}+']');
    input.dispatchEvent(new Event('cancel', { bubbles: true }));
    input.files = new DataTransfer().files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  const assertButton = async (text, scope = importDialog) => {
    const style = await browser.evaluate(`(() => {
      const b = Array.from(${scope}.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(text)});
      if (!b) return null;
      const s = getComputedStyle(b); return { tag: b.tagName, border: s.borderTopWidth, focus: b.classList.contains('gmi-focus-ring') };
    })()`);
    assert(style); assert.equal(style.tag, 'BUTTON'); assert(parseFloat(style.border) >= 1); assert(style.focus);
  };
  const capture = async (name, sizes = [[1920, 1080]]) => {
    await mkdir(screenshotRoot, { recursive: true });
    for (const [width, height] of sizes) {
      await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await browser.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      const bounds = await browser.evaluate(`(() => {
        const d = ${importDialog}; const buttons = Array.from(d.querySelectorAll('footer button, .photo-import-source-actions button, .photo-import-steps button'));
        return { overflow: d.scrollWidth > d.clientWidth, buttons: buttons.map(b => b.getBoundingClientRect().toJSON()) };
      })()`);
      assert.equal(bounds.overflow, false);
      for (const rect of bounds.buttons) assert(rect.left >= 0 && rect.right <= width && rect.bottom <= height);
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(screenshotRoot, `${name}-${width}x${height}.png`), Buffer.from(data, 'base64'));
    }
  };
  const backStage = (name) => browser.evaluate(`${importDialog}.querySelector('button[aria-label="Gå tilbake til ${name}"]').click()`);
  try {
    await browser.send('Page.navigate', { url: app + '?testmodus=1' });
    await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
    await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
    await clickSourceControl(browser, 'Bilder', 'document');
    await inject('Velg bildefiler', 'a.png'); await waitForThumbnails(browser);
    await browser.waitFor(`${importDialog}.dataset.exifPending === '0'`);
    const ids = await photoIds(); assert.equal(ids.length, 1);
    for (const label of ['Velg bildefiler', 'Velg mappe']) {
      await cancelPicker(label); assert.match(await current(), /Bilder/); assert.deepEqual(await photoIds(), ids); await noLayers();
    }
    // Future steps are text, never links/buttons that could skip validation.
    assert.equal(await browser.evaluate(`${importDialog}.querySelectorAll('.photo-import-steps button').length`), 0);
    await chooseImportPlacement(browser, 'gmi');
    await cancelPicker('Velg GMI-fil'); assert.match(await current(), /Plassering/); await noLayers();
    assert(await browser.evaluate(`${importDialog}.querySelector('footer .gmi-primary-control').disabled`));
    await assertButton('Velg GMI-fil …'); await assertButton('Avbryt'); await assertButton('Tilbake');
    await capture('placement-gmi');
    await inject('Velg GMI-fil', 'first.gmi', gmiText([{ hyperlink: 'h:1(link:"a.png") ' }]));
    await browser.waitFor(`${importDialog}.querySelector('[role=status]').textContent.includes('first.gmi')`);
    await cancelPicker('Velg GMI-fil'); assert.match(await current(), /Plassering/);
    assert(await browser.evaluate(`${importDialog}.textContent.includes('first.gmi')`));
    await inject('Velg GMI-fil', 'replacement.gmi', gmiText([{ hyperlink: 'h:1(link:"missing.png") ' }]));
    await browser.waitFor(`${importDialog}.textContent.includes('replacement.gmi')`);
    await clickImport(browser, 'Neste');
    await browser.waitFor(`${importDialog}.querySelector('.photo-import-review')`);
    assert.equal(await browser.evaluate(`${importDialog}.querySelectorAll('.photo-import-figures dd')[1].textContent`), '0');
    await backStage('Plassering');
    await chooseImportPlacement(browser, 'gml');
    assert(!await browser.evaluate(`${importDialog}.textContent.includes('replacement.gmi')`));
    await cancelPicker('Velg GML med bildeposisjoner'); assert.match(await current(), /Plassering/); await noLayers();
    await assertButton('Velg GML-fil …');
    await capture('placement-gml', [[1920, 1080], [1280, 720]]);
    await inject('Velg GML med bildeposisjoner', 'wrong.gml', gml('other.png'));
    await browser.waitFor(`${importDialog}.textContent.includes('wrong.gml')`);
    await cancelPicker('Velg GML med bildeposisjoner'); assert(await browser.evaluate(`${importDialog}.textContent.includes('wrong.gml')`));
    await inject('Velg GML med bildeposisjoner', 'chosen.gml', gml('a.png'));
    await browser.waitFor(`${importDialog}.textContent.includes('chosen.gml')`);
    await clickImport(browser, 'Neste'); await browser.waitFor(`${importDialog}.querySelector('.photo-import-review')`);
    assert.equal(await browser.evaluate(`${importDialog}.querySelectorAll('.photo-import-figures dd')[1].textContent`), '1');
    await capture('review-navigation-footer', [[1920, 1080], [1280, 720]]);
    await backStage('Bilder'); assert.deepEqual(await photoIds(), ids);
    await clickImport(browser, 'Neste'); assert.match(await current(), /Plassering/);
    assert(await browser.evaluate(`${importDialog}.querySelector('input[value=gml]').checked && ${importDialog}.textContent.includes('chosen.gml')`));
    await backStage('Bilder'); assert.deepEqual(await photoIds(), ids);
    await clickImport(browser, 'Neste'); await chooseImportPlacement(browser, 'exif');
    assert(await browser.evaluate(`${importDialog}.textContent.includes('Fra EXIF-data i bildene') && ${importDialog}.textContent.includes('1 av 1 bilder har GPS-posisjon')`));
    assert(!await browser.evaluate(`${importDialog}.textContent.includes('chosen.gml')`));
    await capture('placement-exif');
    await clickImport(browser, 'Neste'); await browser.waitFor(`${importDialog}.querySelector('.photo-import-review')`);
    assert(await browser.evaluate(`${importDialog}.querySelector('.photo-import-outcome').textContent.includes('fra EXIF-data')`));
    // Backward stage navigation also works from the keyboard.
    await browser.evaluate(`${importDialog}.querySelector('button[aria-label="Gå tilbake til Bilder"]').focus()`);
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    assert.match(await current(), /Bilder/); assert.deepEqual(await photoIds(), ids); await noLayers();
    await clickImport(browser, 'Avbryt'); await browser.waitFor('!document.querySelector(".photo-collection-dialog")');
    assert.deepEqual(browser.events.filter(event => event.method === 'Runtime.exceptionThrown').map(event => event.params.exceptionDetails.text), []);
  } catch (error) { console.error(await browser.evaluate('document.body.innerText.slice(0,5000)')); throw error; }
  finally { await browser.close(); }
});
