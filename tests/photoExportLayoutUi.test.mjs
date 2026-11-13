import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { completionGmlText } from './helpers/photoCompletionFixtures.mjs';
import { buildPreview, chooseFormat, closeExport, deliveryState, downloadZip, exportDialog, openCompletionFromExport, openExport, packageState, returnToExport, setLabel } from './helpers/photoExportWizard.mjs';
import { gpsJpeg } from './helpers/photoGpsFixtures.mjs';
import { addImportFiles, createLayerWithoutPlacement, importDialog, retainGmlInWorkspace } from './helpers/photoImportWizard.mjs';
import { applyPhotoSourcePositions, clickSourceControl } from './helpers/photoSourceWorkflow.mjs';
import { KEYS, pressKey } from './helpers/photoWorkspace.mjs';

// Every wizard state at every planned size. Browser zoom shrinks the CSS viewport, so sizes are CSS pixels (M6 plan §3.1).
// Set PHOTO_SCREENSHOT_DIR to keep a picture of each state.
const app = process.env.PHOTO_UI_URL;
const hub = 'document.querySelector(".photo-completion-dialog[open]")';
const VIEWPORTS = [
  [1920, 1080, 'desktop'], [1536, 760, 'desktop at 125%'], [1536, 730, 'laptop with Windows at 125%'], [1366, 768, 'laptop'], [1366, 625, 'laptop less browser chrome'],
  [1229, 585, 'laptop at 125% twice'], [1093, 510, 'small laptop at 125%'], [800, 700, 'one column'], [390, 700, 'phone'],
];

const size = (browser, width, height, deviceScaleFactor = 1) => browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile: false });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function picture(browser, name) {
  if (!process.env.PHOTO_SCREENSHOT_DIR) return;
  await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive: true });
  const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(process.env.PHOTO_SCREENSHOT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
}

// What a person needs from any screen: the frame inside the window, every footer button on screen and really clickable, nothing
// wider than the area that holds it, and content that does not fit reachable by scrolling. The hub's task list scrolls sideways on
// a phone by design, so only its panel is measured.
const measure = (root) => `(() => {
  const dialog = ${root}, box = dialog.getBoundingClientRect(), frame = dialog.querySelector('.photo-collection-frame');
  const areas = Array.from(dialog.querySelectorAll('.delivery-body, .photo-export-body, .photo-export-choices, .photo-export-state, .photo-export-package, .photo-completion-panel'));
  const footer = Array.from(dialog.querySelectorAll('.photo-import-footer button')).map((button) => {
    const rect = button.getBoundingClientRect(), hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { label: button.innerText.trim(), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, reachable: button === hit || button.contains(hit) };
  });
  const clipped = areas.flatMap((area) => { const edge = area.getBoundingClientRect().right;
    return Array.from(area.querySelectorAll('button, input, select, summary, h3, dd, p, li')).filter((item) => item.getClientRects().length).map((item) => ({ text: (item.innerText || item.getAttribute('aria-label') || item.tagName).slice(0, 50), right: item.getBoundingClientRect().right })).filter((item) => item.right > edge + 1); });
  const wide = areas.filter((area) => area.scrollWidth > area.clientWidth + 1).map((area) => area.className);
  const trapped = areas.filter((area) => area.scrollHeight > area.clientHeight + 1 && getComputedStyle(area).overflowY === 'hidden').map((area) => area.className);
  const text = areas.filter((area) => getComputedStyle(area).overflowY === 'auto').map((area) => area.clientHeight + '/' + area.scrollHeight);
  return { viewport: { width: innerWidth, height: innerHeight }, dialog: { left: box.left, right: box.right, top: box.top, bottom: box.bottom }, footer, clipped, wide, trapped, text,
    pageOverflow: document.documentElement.scrollWidth > innerWidth, frameOverflow: frame.scrollWidth > frame.clientWidth + 1, room: Math.min(...areas.map((area) => area.clientHeight)) };
})()`;

async function assertFits(browser, label, root = exportDialog) {
  const seen = [];
  for (const [width, height, name] of VIEWPORTS) {
    await size(browser, width, height);
    const result = await browser.evaluate(measure(root));
    const context = `${label} at ${width}×${height} (${name}): ${JSON.stringify(result)}`;
    assert(result.dialog.left >= 0 && result.dialog.top >= 0 && result.dialog.right <= width && result.dialog.bottom <= height, context);
    assert.equal(result.pageOverflow || result.frameOverflow, false, context);
    assert.deepEqual([result.clipped, result.wide, result.trapped], [[], [], []], context);
    assert(result.footer.length > 0, context);
    for (const button of result.footer) assert(button.reachable && button.left >= result.dialog.left && button.right <= result.dialog.right && button.bottom <= result.dialog.bottom, context);
    assert(result.room >= 120, `${context}: too little room to read`);
    seen.push(`${width}×${height}: ${result.text.join(' ')}`);
  }
  await size(browser, 1680, 900);
  console.log(`${label} — visible/content height: ${seen.join(', ')}`);
}

// By key at the smallest laptop size: each stop is on screen, inside the area that scrolls it, and shows that it has focus.
async function assertKeyboard(browser, label, expected) {
  const stops = [];
  for (let press = 0; press < 30; press++) {
    await pressKey(browser, 'Tab', KEYS.Tab);
    const stop = await browser.evaluate(`(() => {
      const item = document.activeElement, dialog = ${exportDialog}, rect = item.getBoundingClientRect(), style = getComputedStyle(item);
      const area = item.closest('.delivery-body, .photo-export-choices, .photo-export-state, .photo-export-package')?.getBoundingClientRect() || { top: 0, bottom: innerHeight };
      return { name: item.getAttribute('aria-label') || item.value || item.innerText?.trim(), tag: item.tagName, inside: dialog.contains(item), visible: rect.top >= area.top - 1 && rect.bottom <= area.bottom + 1 && rect.bottom <= innerHeight,
        marked: style.outlineStyle !== 'none' || style.boxShadow !== 'none' };
    })()`);
    if (stop.tag === 'BODY') continue;
    assert(stop.inside, `${label}: ${JSON.stringify(stop)}`);
    assert(stop.visible && stop.marked, `${label}: ${JSON.stringify(stop)}`);
    stops.push(stop.name);
  }
  for (const name of expected) assert(stops.includes(name), `${label}: ${name} in ${JSON.stringify(stops)}`);
}

async function openApp(browser) {
  await size(browser, 1680, 900);
  await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
  await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
  await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
}

async function buildLayer(browser, directory, files, features) {
  const paths = await Promise.all(Object.entries(files).map(async ([name, options]) => {
    const file = path.join(directory, name);
    await writeFile(file, gpsJpeg({ noLocation: true, ...options }));
    return file;
  }));
  const gml = path.join(directory, 'kilde.gml');
  await writeFile(gml, completionGmlText(features));
  await clickSourceControl(browser, 'Bilder', 'document');
  await browser.waitFor(importDialog);
  await addImportFiles(browser, paths);
  await createLayerWithoutPlacement(browser);
  await retainGmlInWorkspace(browser, gml);
  await applyPhotoSourcePositions(browser, 'gml');
  await browser.waitFor(`document.querySelectorAll(".photo-camera-marker").length === ${features.length}`, 60000);
}

const layoutTest = (name, files, features, run) => test(name, { skip: !chromePath || !app, timeout: 240000 }, async () => {
  const browser = await openTestChrome();
  const directory = await mkdtemp(path.join(tmpdir(), 'gmi-export-layout-'));
  try {
    await openApp(browser);
    await buildLayer(browser, directory, files, features);
    await run(browser, directory);
    assert.equal(browser.events.filter((event) => event.method === 'Runtime.exceptionThrown').length, 0);
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});

const TIME = '2026:05:12 14:33:02';
const COMPLETE = { 'nord.jpg': { captureTime: TIME }, 'sor.jpg': { captureTime: '2026:05:12 14:40:10' } };
const COMPLETE_FEATURES = [{ name: 'nord.jpg', time: '2026-05-12T14:33:02', direction: '45' }, { name: 'sor.jpg', time: '2026-05-12T14:40:10', direction: '90' }];
const GAPS = { 'a.jpg': { captureTime: TIME }, 'b.jpg': {}, 'c.jpg': {}, 'd.jpg': {}, 'loose.jpg': { captureTime: TIME } };
const GAP_FEATURES = [{ name: 'a.jpg', time: '2026-05-12T14:33:02', direction: '45' }, { name: 'b.jpg' }, { name: 'c.jpg' }, { name: 'd.jpg' }];

layoutTest('normal delivery: Leveranse, Pakke and the finished package fit every size', COMPLETE, COMPLETE_FEATURES, async (browser, directory) => {
  await openExport(browser);
  await setLabel(browser, 'Torkopp PS');
  await delay(300);
  await picture(browser, '1-leveranse-ready');
  await assertFits(browser, 'Leveranse, ready');
  await buildPreview(browser);
  assert.equal(await packageState(browser), 'ready');
  await picture(browser, '4-pakke-ready');
  await assertFits(browser, 'Pakke, ready');
  await size(browser, 1093, 510, 1.25);
  await picture(browser, '7b-pakke-small-laptop-125');
  await size(browser, 1680, 900);
  await downloadZip(browser, directory);
  await picture(browser, '5-pakke-done');
  await assertFits(browser, 'Pakke, done');
  await closeExport(browser);
});

layoutTest('missing times and blocked formats: Leveranse and the hub fit every size', GAPS, GAP_FEATURES, async (browser) => {
  await openExport(browser);
  assert.equal(await deliveryState(browser), 'schema-gap');
  await delay(300);
  await picture(browser, '2-leveranse-gemini-missing-time');
  await assertFits(browser, 'Leveranse, schema gap');
  await size(browser, 1366, 625);
  await picture(browser, '7a-leveranse-laptop-1366x625');
  await size(browser, 1093, 510, 1.25);
  await picture(browser, '7c-leveranse-small-laptop-125');
  await assertKeyboard(browser, 'Innhold', ['Lukk eksport', 'gemini-legacy2019', 'Eksportetikett', 'Fullfør opplysninger…', 'Avbryt', 'Kontroller leveransen']);
  await pressKey(browser, 'Escape', KEYS.Escape);
  await browser.waitFor(`!${exportDialog}`);
  assert.equal(await browser.evaluate(`document.activeElement === document.querySelector('.photo-tools-trigger')`), true, 'Escape at this size, and focus comes back');
  await size(browser, 1680, 900);
  await openExport(browser);

  await chooseFormat(browser, 'legacy2019');
  assert.equal(await deliveryState(browser), 'blocked');
  await delay(100);
  await picture(browser, '3a-leveranse-legacy-blocked');
  await assertFits(browser, 'Leveranse, Legacy blocked');
  await chooseFormat(browser, 'asbuilt52');
  assert.equal(await deliveryState(browser), 'blocked');
  await delay(100);
  await picture(browser, '3b-leveranse-asbuilt-blocked');
  assert.equal(await browser.evaluate(`(() => { const label = ${exportDialog}.querySelector('.photo-export-crs'), select = label.querySelector('select');
    const text = document.createRange(); text.selectNodeContents(label.firstChild); return text.getBoundingClientRect().bottom <= select.getBoundingClientRect().top; })()`), true, 'the CRS label sits above its field');
  await assertFits(browser, 'Leveranse, AsBuilt blocked');
  await size(browser, 1093, 510, 1.25);
  await picture(browser, '7d-leveranse-asbuilt-small-laptop-125');
  await size(browser, 1680, 900);

  await chooseFormat(browser, 'gemini-legacy2019');
  await openCompletionFromExport(browser);
  await delay(300);
  await picture(browser, '6-hub-from-export');
  await assertFits(browser, 'Hub from export', hub);
  await size(browser, 1093, 510, 1.25);
  await picture(browser, '7e-hub-small-laptop-125');
  await size(browser, 1680, 900);
  await returnToExport(browser);
  await closeExport(browser);
});
