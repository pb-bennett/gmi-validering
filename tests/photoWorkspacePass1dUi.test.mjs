import assert from 'node:assert/strict';
import test from 'node:test';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { gmiText } from './helpers/gmiPhotoFixtures.mjs';
import { solidPng } from './helpers/photoImageFixtures.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { chooseImportPlacement, createLayerWithPlacement, importDialog, waitForThumbnails } from './helpers/photoImportWizard.mjs';
import { clickText, commandBar, discardEdits, elementCentre, enterEditMode, selectPhotoRow } from './helpers/photoWorkspace.mjs';

// Pass 1D: thumbnail source dots, photo-first hover preview and popup, display-sized previews, primary button states
// and the file drag affordance. With PHOTO_GML_FIXTURE these use real corpus JPEGs. The corpus is portrait only,
// so the landscape photo is one of its JPEGs rotated by Chrome; without the corpus, sized synthetic PNGs are used.
const app = process.env.PHOTO_UI_URL;
const corpus = process.env.PHOTO_GML_FIXTURE ? path.join(path.dirname(process.env.PHOTO_GML_FIXTURE), 'Attachments') : null;
const tile = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#f0eee3"/></svg>');
const STACK = ['stack-1', 'stack-2', 'stack-3', 'stack-4'];
const INK = 'rgb(2, 6, 24)';
const DARK_MIN_CONTRAST = 4.5;
const marker = (id) => `document.querySelector('.leaflet-marker-icon[data-photo-id="${id}"]')`;
const preview = 'document.querySelector(".photo-thumb-preview")';
const previewImage = 'document.querySelector(".photo-thumb-preview img")';
const popupImage = 'document.querySelector(".photo-map-popup-preview img")';
const overlay = 'document.querySelector(".file-drop-overlay")';

async function rotatedJpeg(browser, source, target) {
  const encoded = (await readFile(source)).toString('base64');
  const data = await browser.evaluate(`(async () => {
    const bytes = Uint8Array.from(atob(${JSON.stringify(encoded)}), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
    const canvas = document.createElement('canvas'); canvas.width = bitmap.height; canvas.height = bitmap.width;
    const context = canvas.getContext('2d'); context.translate(canvas.width, 0); context.rotate(Math.PI / 2); context.drawImage(bitmap, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
  })()`);
  await writeFile(target, Buffer.from(data, 'base64'));
}

// The corpus has no orientation tags. A leading APP1 segment gives a real JPEG EXIF Orientation 6 (rotate 90° clockwise).
function withExifOrientation(jpeg, orientation) {
  const tiff = Buffer.from([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0, 0, 0]);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const header = Buffer.from([0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 0xff]);
  return Buffer.concat([jpeg.subarray(0, 2), header, body, jpeg.subarray(2)]);
}

async function createFixtures(browser) {
  const root = path.resolve(tmpdir()), prefix = 'photo-pass1d-', directory = await mkdtemp(path.join(root, prefix));
  const extension = corpus ? 'jpg' : 'png';
  const name = (base) => `${base}.${extension}`;
  const portraits = ['solo-a', 'solo-b', ...STACK.slice(0, 3)];
  const files = [];
  if (corpus) {
    const sources = (await readdir(corpus)).filter((file) => /\.jpe?g$/i.test(file));
    for (const [index, base] of portraits.entries()) {
      const target = path.join(directory, name(base));
      await copyFile(path.join(corpus, sources[index * 17]), target);
      files.push(target);
    }
    for (const base of ['wide', STACK[3]]) {
      const target = path.join(directory, name(base));
      await rotatedJpeg(browser, path.join(corpus, sources[base === 'wide' ? 90 : 110]), target);
      files.push(target);
    }
    const tagged = path.join(directory, name('exif-rotated'));
    await writeFile(tagged, withExifOrientation(await readFile(path.join(corpus, sources[130])), 6));
    files.push(tagged);
  } else {
    for (const [index, base] of portraits.entries()) {
      const target = path.join(directory, name(base));
      await writeFile(target, solidPng(1500, 2000, [40 + index * 40, 120, 220 - index * 40]));
      files.push(target);
    }
    for (const [index, base] of ['wide', STACK[3]].entries()) {
      const target = path.join(directory, name(base));
      await writeFile(target, solidPng(2000, 1500, [230, 150 - index * 60, 40]));
      files.push(target);
    }
  }
  const gmi = path.join(directory, 'pass1d.gmi');
  await writeFile(gmi, gmiText([
    { label: 'K0', hyperlink: STACK.map((base, index) => `h:${index + 1}(link:"${name(base)}")`).join(' ') + ' ', xyz: '581930 6566000 1' },
    { label: 'K1', hyperlink: `h:1(link:"${name('solo-a')}") `, xyz: '581990 6566000 1' },
    { label: 'K2', hyperlink: `h:1(link:"${name('solo-b')}") `, xyz: '581930 6566060 1' },
    { label: 'K3', hyperlink: `h:1(link:"${name('wide')}") `, xyz: '581990 6566060 1' },
    ...(corpus ? [{ label: 'K4', hyperlink: `h:1(link:"${name('exif-rotated')}") `, xyz: '582050 6566060 1' }] : []),
  ]));
  const second = path.join(directory, 'second.gmi');
  await writeFile(second, gmiText([{ label: 'L1', hyperlink: `h:1(link:"${name('wide')}") `, xyz: '581950 6566030 1' }]));
  const photo = path.join(directory, 'dropped.png');
  await writeFile(photo, solidPng(600, 400, [210, 120, 60]));
  const unsupported = path.join(directory, 'unsupported.zip');
  await writeFile(unsupported, 'not survey data');
  return { files, gmi, second, photo, unsupported, name, cleanup: async () => {
    if (path.dirname(path.resolve(directory)) !== root || !path.basename(directory).startsWith(prefix)) throw new Error('Unsafe fixture path');
    await rm(directory, { recursive: true, force: true });
  } };
}

const luminance = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
// color-mix() computes to `color(srgb r g b)` with channels from 0 to 1.
const rgb = (value) => { const channels = value.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number); return value.startsWith('color(srgb') ? channels.map((channel) => channel * 255) : channels; };

test('Pass 1D: source dots, dark previews, display-sized images, Save button states and file drag feedback',
  { skip: !chromePath || !app, timeout: 300000 }, async (t) => {
    const browser = await openTestChrome();
    const fixtures = await createFixtures(browser);
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const exceptions = () => browser.events.filter((event) => event.method === 'Runtime.exceptionThrown');
    const setViewport = async (width, height) => { await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await wait(400); };
    const screenshot = async (name) => {
      if (!process.env.PHOTO_SCREENSHOT_DIR) return;
      await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive: true });
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.PHOTO_SCREENSHOT_DIR, `pass1d-${name}.png`), Buffer.from(data, 'base64'));
    };
    const closeUp = async (name, expression) => {
      if (!process.env.PHOTO_SCREENSHOT_DIR) return;
      const box = await browser.evaluate(`(() => { const b = (${expression}).getBoundingClientRect(); return { x: b.left - 16, y: b.top - 16, width: b.width + 32, height: b.height + 32 }; })()`);
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 5 } });
      await writeFile(path.join(process.env.PHOTO_SCREENSHOT_DIR, `pass1d-${name}.png`), Buffer.from(data, 'base64'));
    };
    const move = ({ x, y }) => browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
    const hover = async (expression) => move(await elementCentre(browser, expression));
    const unhover = () => move({ x: 3, y: 3 });
    const click = async ({ x, y }) => {
      await move({ x, y });
      await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    };
    const drag = (type, { x, y }, files) => browser.send('Input.dispatchDragEvent', { type, x, y, data: { items: [], files, dragOperationsMask: 1 } });
    // Chrome may suppress a native drop entirely after dropEffect=none. Also force the handler path with real
    // Files to verify preventDefault/state preservation when a drop arrives without an eligible dragover.
    const forcedDrop = async ({ x, y }, files) => {
      await browser.evaluate(`(() => { const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.hidden = true; input.id = 'forced-drop-files'; document.body.append(input); })()`);
      await setPhotoFiles(browser, '#forced-drop-files', files);
      return browser.evaluate(`(() => { const input = document.querySelector('#forced-drop-files'), data = new DataTransfer();
        for (const file of input.files) data.items.add(file); input.remove();
        const event = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data });
        document.elementFromPoint(${x}, ${y}).dispatchEvent(event); return event.defaultPrevented; })()`);
    };
    const audit = () => browser.evaluate('({ live: window.__audit.originals.size, created: window.__audit.created })');
    // Same photo: an 8 x 8 average of the shown image matches the marker's own thumbnail.
    const samePhoto = (image, id) => browser.evaluate(`(() => { const sample = (img) => { const c = document.createElement('canvas'); c.width = c.height = 8; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 8, 8); return x.getImageData(0, 0, 8, 8).data; };
      const a = sample(${image}), b = sample(${marker(id)}.querySelector('.photo-thumb img')); let sum = 0; for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]); return sum / a.length; })()`);
    const ids = {};
    try {
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `const imageSrc=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
        Object.defineProperty(HTMLImageElement.prototype,'src',{...imageSrc,set(value){imageSrc.set.call(this,String(value).includes('cache.kartverket.no/')||String(value).includes('geonorge.no/')?${JSON.stringify(tile)}:value);}});
        (() => { const originals = new Set(), create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
          window.__audit = { originals, created: 0 };
          URL.createObjectURL = (value) => { const url = create(value); if (value instanceof File) { originals.add(url); window.__audit.created++; } return url; };
          URL.revokeObjectURL = (url) => { originals.delete(url); revoke(url); }; })();
        window.__reads = 0; const readBuffer = FileReader.prototype.readAsArrayBuffer; FileReader.prototype.readAsArrayBuffer = function (file) { window.__reads++; return readBuffer.call(this, file); };` });
      await setViewport(1920, 1080);
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
      await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');

      await t.test('landing page: the overlay does not block the upload zone, and a drop there is handled once', async () => {
        const zone = await elementCentre(browser, `Array.from(document.querySelectorAll('div')).find((e) => e.className.includes?.('border-dashed'))`);
        await drag('dragEnter', zone, [fixtures.photo, fixtures.second]); await drag('dragOver', zone, [fixtures.photo, fixtures.second]);
        await browser.waitFor(`${overlay}?.dataset.tone === 'refused'`);
        assert.equal(await browser.evaluate(`document.body.innerText.includes('Slipp filen her')`), false, 'the zone also refuses an image-first selection');
        await drag('drop', zone, [fixtures.photo, fixtures.second]);
        await wait(300);
        assert.equal(await browser.evaluate('window.__reads'), 0, 'FileUpload must refuse before the loader mutates state');
        assert(await browser.evaluate(`Boolean(document.querySelector('input[type=file]')) && !document.body.innerText.includes('Feil ved lasting av fil')`));
        await drag('dragEnter', zone, [fixtures.second]); await drag('dragOver', zone, [fixtures.second]);
        await browser.waitFor(overlay);
        assert.match(await browser.evaluate(`${overlay}.innerText`), /Slipp filer her for å importere/);
        assert.equal(await browser.evaluate(`getComputedStyle(${overlay}).pointerEvents`), 'none');
        assert.equal(await browser.evaluate(`document.elementFromPoint(${zone.x}, ${zone.y}).closest('.file-drop-overlay')`), null, 'the page stays the real drop target');
        assert(await browser.evaluate(`document.body.innerText.includes('Slipp filen her')`), 'the upload zone reacts as well');
        await screenshot('drag-landing');
        await drag('drop', zone, [fixtures.second]);
        await browser.waitFor('document.querySelector(".leaflet-container")');
        assert.equal(await browser.evaluate('window.__reads'), 1, 'FileUpload and the window handler do not both import');
        assert.equal(await browser.evaluate(`Boolean(${overlay})`), false);
      });

      await t.test('import wizard: photo-specific feedback on its drop step only, and the drop still adds photos', async () => {
        await clickText(browser, 'Legg til bilder');
        await browser.waitFor(importDialog);
        await setPhotoFiles(browser, 'input[aria-label="Velg bildefiler"]', fixtures.files);
        await waitForThumbnails(browser);
        const point = await elementCentre(browser, importDialog);
        const dialogOverlay = `${importDialog}.querySelector('.file-drop-overlay')`;
        await drag('dragEnter', point, [fixtures.photo]); await drag('dragOver', point, [fixtures.photo]);
        await browser.waitFor(dialogOverlay);
        assert.equal(await browser.evaluate(`${dialogOverlay}.innerText`), 'Slipp bilder her');
        assert.equal(await browser.evaluate('document.querySelectorAll(".file-drop-overlay").length'), 1, 'one overlay, in the dialog');
        const dialogBox = await browser.evaluate(`(() => { const a = ${dialogOverlay}.getBoundingClientRect(), b = ${importDialog}.getBoundingClientRect(); return a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom; })()`);
        assert(dialogBox, 'overlay stays inside the dialog');
        await screenshot('drag-wizard');
        await drag('drop', point, [fixtures.photo]);
        await browser.waitFor(`!${dialogOverlay}`);
        await browser.waitFor(`${importDialog}.innerText.includes('dropped.png')`);
        await browser.evaluate(`${importDialog}.querySelector('[aria-label="Velg bildefiler"]').value = ''; void 0`);
        await waitForThumbnails(browser);
        await browser.waitFor(`${importDialog}.dataset.exifPending === "0"`, 60000);
        await chooseImportPlacement(browser, 'gmi');
        await drag('dragEnter', point, [fixtures.photo]); await drag('dragOver', point, [fixtures.photo]); await wait(120);
        assert.equal(await browser.evaluate(`Boolean(${dialogOverlay})`), false, 'no drop promise on steps that ignore drops');
        await drag('dragCancel', point, [fixtures.photo]);
        await setPhotoFiles(browser, 'input[aria-label="Velg GMI-fil"]', [fixtures.gmi]);
        await browser.waitFor(`${importDialog}.innerText.includes('pass1d.gmi')`);
        await createLayerWithPlacement(browser, 'gmi-layer');
        await browser.waitFor('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length >= 7');
        for (const [id, name] of await browser.evaluate('Array.from(document.querySelectorAll(".photo-workspace-list li[data-photo-id]")).map((e) => [e.dataset.photoId, e.querySelector(".photo-workspace-filename").innerText])')) ids[name.replace(/\.\w+$/, '')] = id;
        assert(STACK.every((name) => ids[name]) && ids['solo-a'] && ids['solo-b'] && ids.wide);
      });

      await t.test('workspace: no drop region, so no overlay, no import and the session stays', async () => {
        const point = await elementCentre(browser, 'document.querySelector(".leaflet-container")');
        const before = await browser.evaluate('({ reads: window.__reads, rows: document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length })');
        await drag('dragEnter', point, [fixtures.second]); await drag('dragOver', point, [fixtures.second]); await wait(120);
        assert.equal(await browser.evaluate(`Boolean(${overlay})`), false);
        await drag('drop', point, [fixtures.second]); await wait(300);
        assert.deepEqual(await browser.evaluate('({ reads: window.__reads, rows: document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length })'), before);
        assert(await browser.evaluate('Boolean(document.querySelector(".photo-workspace-shell"))'));
      });

      // FOTO acceptance corrections: editing controls use the app's teal primary (--gmi-interactive), and secondary buttons show hover.
      await t.test('Save button: teal and legible on hover, press and focus; secondary buttons show a teal hover', async () => {
        await browser.evaluate(`document.querySelector('.photo-workspace-list li[data-photo-id="${ids['solo-a']}"] .photo-workspace-row').click()`);
        await enterEditMode(browser);
        await clickText(browser, 'Flytt til kartsenter');
        await browser.waitFor(`${commandBar}.querySelector('[aria-label="Lagre endringer"]')`);
        const save = `${commandBar}.querySelector('[aria-label="Lagre endringer"]')`;
        const discard = `${commandBar}.querySelector('[aria-label="Forkast endringer"]')`;
        const state = () => browser.evaluate(`(() => { const s = getComputedStyle(${save}); return { background: s.backgroundColor, color: s.color, opacity: s.opacity, shadow: s.boxShadow }; })()`);
        await unhover(); await wait(200);
        const rest = await state();
        assert.equal(rest.background, 'rgb(0, 117, 149)', 'the app\'s interactive teal');
        assert(contrast(rgb(rest.background), rgb(rest.color)) >= DARK_MIN_CONTRAST, JSON.stringify(rest));
        const point = await elementCentre(browser, save);
        await move(point); await wait(250);
        const hovered = await state();
        assert.notEqual(hovered.background, rest.background, 'hover is a deliberate change');
        assert.equal(hovered.opacity, '1');
        assert(contrast(rgb(hovered.background), rgb(hovered.color)) >= DARK_MIN_CONTRAST, JSON.stringify(hovered));
        assert(luminance(rgb(hovered.background)) < luminance(rgb(rest.background)), 'hover darkens the teal');
        await screenshot('save-hover');
        await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 });
        await wait(100);
        const pressed = await state();
        assert.notEqual(pressed.background, hovered.background, 'press differs from hover');
        assert(contrast(rgb(pressed.background), rgb(pressed.color)) >= DARK_MIN_CONTRAST);
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 3, y: 3, button: 'left', buttons: 1 });
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 3, y: 3, button: 'left', buttons: 0, clickCount: 1 });
        await browser.waitFor(save, 2000);
        await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
        await browser.evaluate(`${save}.focus()`);
        await wait(200);
        assert.notEqual((await state()).shadow, 'none', 'focus-visible keeps its ring');
        await move(await elementCentre(browser, discard)); await wait(250);
        const secondary = await browser.evaluate(`(() => { const s = getComputedStyle(${discard}); return { background: s.backgroundColor, border: s.borderTopColor, color: s.color }; })()`);
        assert.notEqual(secondary.background, 'rgb(255, 255, 255)', 'a secondary button shows its hover');
        assert.equal(secondary.border, 'rgb(0, 117, 149)', 'with a teal edge');
        assert(contrast(rgb(secondary.background), rgb(secondary.color)) >= DARK_MIN_CONTRAST, JSON.stringify(secondary));
        await unhover();
        await discardEdits(browser);
      });

      await t.test('main map: thumbnails carry dots and keep stack badges', async () => {
        // Locating a photo in the workspace frames the fixture; the Miniatyrer preference is shared with the main map.
        await browser.evaluate(`document.querySelector('.photo-map-display-card [data-mode=thumbnails]').click()`);
        await selectPhotoRow(browser, ids['solo-b']);
        await browser.evaluate(`document.querySelector('.photo-workspace-inspector .photo-inspector-locate').click()`);
        await browser.waitFor('document.querySelectorAll(".photo-thumb-marker").length >= 7');
        await browser.evaluate('document.querySelector(".photo-workspace-back").click()');
        await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
        await browser.waitFor('document.querySelectorAll(".photo-thumb-marker").length >= 7');
        await wait(800);
        const dots = await browser.evaluate(`Array.from(document.querySelectorAll('.photo-thumb-marker')).map((e) => { const dot = e.querySelector('.photo-thumb-source'), box = dot.getBoundingClientRect(), thumb = e.querySelector('.photo-thumb').getBoundingClientRect();
          return { width: box.width, radius: getComputedStyle(dot).borderTopLeftRadius, label: dot.getAttribute('aria-label'), onCorner: Math.abs(box.left - thumb.left) <= 2 && Math.abs(box.bottom - thumb.bottom) <= 2, glyph: Boolean(e.querySelector('.photo-source-glyph')) }; })`);
        assert(dots.every((dot) => dot.width >= 6 && dot.width <= 8 && dot.radius === '999px' && dot.onCorner && !dot.glyph && dot.label === 'Plassering fra GMI'), JSON.stringify(dots[0]));
        assert.equal(await browser.evaluate('document.querySelector(".photo-marker-stack").innerText'), '4');
        const separate = await browser.evaluate(`(() => { const e = document.querySelector('.photo-marker-stack').closest('.leaflet-marker-icon'), a = e.querySelector('.photo-thumb-source').getBoundingClientRect(), b = e.querySelector('.photo-marker-stack').getBoundingClientRect(); return a.right <= b.left && a.top >= b.bottom; })()`);
        assert(separate, 'dot and count sit in opposite corners');
        await screenshot('dots-main');
        await closeUp('dot-stack', `document.querySelector('.photo-marker-stack').closest('.leaflet-marker-icon')`);
        await closeUp('dot-single', marker(ids['solo-b']));
      });

      let decodesBeforeHover = 0;
      await t.test('hover preview: dark, uncropped, and upgraded to a display-sized image from the original', async () => {
        decodesBeforeHover = (await audit()).created;
        for (const [width, height] of [[1920, 1080], [1366, 768], [1280, 720]]) {
          await setViewport(width, height);
          await hover(marker(ids['solo-b']));
          await browser.waitFor(preview);
          await browser.waitFor(`Math.max(${previewImage}.naturalWidth, ${previewImage}.naturalHeight) === 800`, 10000);
          const portrait = await browser.evaluate(`(() => { const tip = ${preview}, frame = tip.querySelector('.photo-thumb-preview-frame'), image = ${previewImage}, box = frame.getBoundingClientRect(), s = getComputedStyle(tip);
            return { tip: s.backgroundColor, frame: getComputedStyle(frame).backgroundColor, arrow: getComputedStyle(tip, '::before').borderTopColor, width: box.width, height: box.height, fit: getComputedStyle(image).objectFit,
              ratio: image.naturalWidth / image.naturalHeight, caption: tip.querySelector('.photo-thumb-preview-name').innerText, source: tip.querySelector('.photo-source-dot').getAttribute('aria-label'), label: tip.querySelector('.photo-thumb-preview-source').innerText,
              tipWidth: tip.getBoundingClientRect().width, tipHeight: tip.getBoundingClientRect().height }; })()`);
          assert.equal(portrait.tip, INK); assert.equal(portrait.frame, INK); assert.equal(portrait.arrow, INK);
          assert.equal(portrait.fit, 'contain');
          assert(portrait.ratio < 1 && portrait.width === 220 && portrait.height === 220, JSON.stringify(portrait));
          assert(portrait.tipWidth <= 228 && portrait.tipHeight <= 256, 'compact, with no metadata card');
          assert.equal(portrait.caption, fixtures.name('solo-b'));
          assert.equal(portrait.source, 'Plassering fra GMI'); assert.equal(portrait.label, 'GMI');
          assert((await samePhoto(previewImage, ids['solo-b'])) < 24, 'preview shows the hovered photo');
          await screenshot(`hover-portrait-${width}`);
          await unhover(); await browser.waitFor(`!${preview}`);

          await hover(marker(ids.wide));
          await browser.waitFor(preview);
          await browser.waitFor(`${previewImage}.naturalWidth === 800`, 10000);
          const landscape = await browser.evaluate(`(() => { const frame = document.querySelector('.photo-thumb-preview-frame').getBoundingClientRect(), image = ${previewImage}; return { width: frame.width, height: frame.height, ratio: image.naturalWidth / image.naturalHeight }; })()`);
          assert.equal(landscape.width, 220);
          assert(Math.abs(landscape.height - 220 / landscape.ratio) <= 1, `landscape fills the width: ${JSON.stringify(landscape)}`);
          await screenshot(`hover-landscape-${width}`);
          await unhover(); await browser.waitFor(`!${preview}`);
        }
        await setViewport(1920, 1080);
        assert.equal((await audit()).live, 0, 'the temporary original URL never outlives decoding');
      });

      await t.test('rapid hover: no stale image, cached previews are reused, nothing is processed eagerly', async () => {
        const created = (await audit()).created;
        assert.equal(created - decodesBeforeHover, 2, 'the two hovered photos were each decoded once, at every viewport, and no others');
        await hover(marker(ids['solo-b']));
        await browser.waitFor(preview);
        await browser.waitFor(`Math.max(${previewImage}.naturalWidth, ${previewImage}.naturalHeight) === 800`, 10000);
        assert.equal((await audit()).created, created, 'a cached preview is not decoded again');
        await unhover(); await browser.waitFor(`!${preview}`);
        // Slow decoding down so an abandoned photo would finish after the pointer has moved on.
        await browser.evaluate(`window.__decode = HTMLImageElement.prototype.decode; HTMLImageElement.prototype.decode = function () { return new Promise((resolve) => setTimeout(resolve, 200)).then(() => window.__decode.call(this)); }; void 0`);
        const order = [ids['solo-a'], ids.wide, ids['solo-b'], ids['solo-a']];
        for (const id of order) { await hover(marker(id)); await wait(280); }
        await browser.waitFor(preview);
        await browser.waitFor(`${preview}.querySelector('.photo-thumb-preview-name').innerText === ${JSON.stringify(fixtures.name('solo-a'))}`);
        await browser.waitFor(`Math.max(${previewImage}.naturalWidth, ${previewImage}.naturalHeight) === 800`, 10000);
        await wait(600);
        assert((await samePhoto(previewImage, ids['solo-a'])) < 24, 'the last hovered photo wins');
        await unhover();
        await wait(600);
        assert.equal(await browser.evaluate(`Boolean(${preview}) && getComputedStyle(${preview}).opacity !== '0'`), false, 'no preview reappears after leaving');
        await browser.evaluate('HTMLImageElement.prototype.decode = window.__decode; void 0');
      });

      await t.test('EXIF orientation: the display preview is upright like its thumbnail', { skip: !corpus }, async () => {
        await hover(marker(ids['exif-rotated']));
        await browser.waitFor(preview);
        await browser.waitFor(`${previewImage}.naturalWidth === 800`, 10000);
        const shape = await browser.evaluate(`(() => { const image = ${previewImage}, thumb = ${marker(ids['exif-rotated'])}.querySelector('.photo-thumb img'); return { preview: image.naturalWidth / image.naturalHeight, thumb: thumb.naturalWidth / thumb.naturalHeight, frame: document.querySelector('.photo-thumb-preview-frame').getBoundingClientRect().height }; })()`);
        assert(shape.preview > 1 && Math.abs(shape.preview - shape.thumb) < 0.02, `a portrait file tagged Orientation 6 displays as landscape: ${JSON.stringify(shape)}`);
        assert(Math.abs(shape.frame - 220 / shape.preview) <= 1, 'the frame uses the oriented dimensions');
        assert((await samePhoto(previewImage, ids['exif-rotated'])) < 24, 'preview and thumbnail are rotated the same way');
        await unhover(); await browser.waitFor(`!${preview}`);
      });

      await t.test('popup: display-sized image on a dark stage, light details, stack paging and module opening', async () => {
        const stackMarker = `document.querySelector('.photo-marker-stack').closest('.leaflet-marker-icon')`;
        const stackedId = await browser.evaluate(`${stackMarker}.dataset.photoId`);
        await click(await elementCentre(browser, stackMarker));
        await browser.waitFor('document.querySelector(".photo-map-popup")');
        await browser.waitFor(`!${preview}`);
        await browser.waitFor(`Math.max(${popupImage}.naturalWidth, ${popupImage}.naturalHeight) === 800`, 10000);
        assert((await samePhoto(popupImage, stackedId)) < 24, 'popup starts on the clicked photo');
        for (const [width, height] of [[1920, 1080], [1366, 768], [1280, 720]]) {
          await setViewport(width, height);
          await wait(350);
          const look = await browser.evaluate(`(() => { const stage = document.querySelector('.photo-map-popup-preview'), image = ${popupImage}, popup = document.querySelector('.photo-map-viewer-popup').getBoundingClientRect(), map = document.querySelector('.leaflet-container').getBoundingClientRect(), close = document.querySelector('.photo-map-popup-close');
            return { stage: getComputedStyle(stage).backgroundColor, image: getComputedStyle(image).backgroundColor, body: getComputedStyle(document.querySelector('.leaflet-popup-content-wrapper')).backgroundColor, fit: getComputedStyle(image).objectFit,
              inside: popup.left >= map.left && popup.right <= map.right && popup.top >= map.top && popup.bottom <= map.bottom, closeName: close.getAttribute('aria-label'), closeColor: getComputedStyle(close).color }; })()`);
          assert.equal(look.stage, INK); assert.equal(look.body, 'rgb(255, 255, 255)'); assert.equal(look.fit, 'contain');
          assert.equal(look.image, 'rgba(0, 0, 0, 0)', 'nothing pale between the photo and the stage');
          assert(look.inside, `${width}: popup stays inside the map`);
          assert.equal(look.closeName, 'Lukk bildeforhåndsvisning'); assert.equal(look.closeColor, 'rgb(255, 255, 255)');
          await screenshot(`popup-${width}`);
        }
        await setViewport(1920, 1080);
        // The stack mixes orientations: the first portrait member shows the dark side areas.
        for (let i = 0; i < 4 && await browser.evaluate(`${popupImage}.naturalWidth > ${popupImage}.naturalHeight`); i++) {
          await clickText(browser, 'Neste bilde på samme sted', 'document.querySelector(".photo-map-popup")');
          await wait(300);
        }
        await browser.waitFor(`${popupImage}.naturalHeight === 800 && ${popupImage}.naturalWidth < 800`, 10000);
        await wait(350);
        const portrait = await browser.evaluate(`(() => { const image = ${popupImage}, box = image.getBoundingClientRect(), shown = box.height * image.naturalWidth / image.naturalHeight; return { boxWidth: box.width, shown }; })()`);
        assert(portrait.shown < portrait.boxWidth - 40, `portrait leaves dark side areas: ${JSON.stringify(portrait)}`);
        await screenshot('popup-portrait');
        // Rapid paging while decoding is slow: the last member's own image must end up on screen.
        await browser.evaluate(`window.__decode = HTMLImageElement.prototype.decode; HTMLImageElement.prototype.decode = function () { return new Promise((resolve) => setTimeout(resolve, 150)).then(() => window.__decode.call(this)); }; void 0`);
        const next = `document.querySelector('.photo-map-popup [aria-label="Neste bilde på samme sted"]')`;
        const startId = await browser.evaluate('document.querySelector(".photo-map-popup").dataset.photoId');
        for (let i = 0; i < 5; i++) await browser.evaluate(`${next}.click(); void 0`);
        await browser.waitFor(`document.querySelector('.photo-map-popup').dataset.photoId !== ${JSON.stringify(startId)}`);
        await browser.waitFor(`Math.max(${popupImage}.naturalWidth, ${popupImage}.naturalHeight) === 800`, 10000);
        await wait(700);
        const shownId = await browser.evaluate('document.querySelector(".photo-map-popup").dataset.photoId');
        const shownName = await browser.evaluate('document.querySelector(".photo-map-popup .font-semibold").innerText');
        await browser.evaluate('HTMLImageElement.prototype.decode = window.__decode; void 0');
        assert.equal(shownName.replace(/\.\w+$/, ''), Object.entries(ids).find(([, id]) => id === shownId)[0]);
        assert.equal(await browser.evaluate(`Math.max(${popupImage}.naturalWidth, ${popupImage}.naturalHeight)`), 800);
        assert((await samePhoto(popupImage, shownId)) < 24, 'no stale member image after rapid paging');
        assert.equal((await audit()).live, 0);
        await clickText(browser, 'Åpne i bildemodul', 'document.querySelector(".photo-map-popup")');
        await browser.waitFor('document.querySelector(".photo-workspace-shell")');
        await browser.waitFor(`document.querySelector('.photo-workspace-row[aria-pressed=true]')?.closest('li').dataset.photoId === ${JSON.stringify(shownId)}`);
        await browser.evaluate('document.querySelector(".photo-workspace-back").click()');
        await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
      });

      await t.test('main app drag: map stays recognisable, nested moves do not flicker, drop, leave and cancel all clear', async () => {
        await browser.waitFor('document.querySelector(".leaflet-container")');
        const map = await elementCentre(browser, 'document.querySelector(".leaflet-container")');
        const side = await elementCentre(browser, 'document.querySelector(".workspace-left") || document.querySelector("aside")');
        const reads = await browser.evaluate('window.__reads');
        await browser.evaluate(`window.__overlayEvents = []; window.__overlayWatch = new MutationObserver((records) => { for (const record of records) { for (const node of record.addedNodes) if (node.classList?.contains('file-drop-overlay')) window.__overlayEvents.push('add'); for (const node of record.removedNodes) if (node.classList?.contains('file-drop-overlay')) window.__overlayEvents.push('remove'); } }); window.__overlayWatch.observe(document.body, { childList: true, subtree: true }); void 0`);
        await drag('dragEnter', map, [fixtures.second]);
        for (const point of [map, side, { x: map.x + 30, y: map.y + 20 }, side, map]) { await drag('dragOver', point, [fixtures.second]); await wait(40); }
        await browser.waitFor(overlay);
        assert.deepEqual(await browser.evaluate('window.__overlayEvents'), ['add'], 'moving across nested elements never removes the overlay');
        const look = await browser.evaluate(`(() => { const s = getComputedStyle(${overlay}); return { pointer: s.pointerEvents, background: s.backgroundColor, border: s.borderTopStyle, color: s.borderTopColor, filter: s.backdropFilter }; })()`);
        assert.equal(look.pointer, 'none'); assert.equal(look.border, 'dashed'); assert.equal(look.color, 'rgb(0, 117, 149)');
        assert(Number(look.background.match(/[\d.]+\)$/)[0].slice(0, -1)) <= 0.2, 'translucent tint');
        assert(['none', ''].includes(look.filter), 'no blur: the interface stays recognisable');
        await screenshot('drag-main');
        await drag('dragCancel', map, [fixtures.second]);
        await browser.waitFor(`!${overlay}`, 3000);

        await drag('dragEnter', map, [fixtures.photo]); await drag('dragOver', map, [fixtures.photo]);
        await browser.waitFor(overlay);
        assert.equal(await browser.evaluate(`${overlay}.dataset.tone`), 'refused');
        assert.match(await browser.evaluate(`${overlay}.innerText`), /kan ikke importeres her/);
        await screenshot('drag-refused');
        await drag('drop', map, [fixtures.photo]);
        await browser.waitFor(`!${overlay}`, 3000);
        await wait(300);
        assert.equal(await browser.evaluate('window.__reads'), reads, 'a refused file is not parsed');
        assert(await browser.evaluate('Boolean(document.querySelector(".leaflet-container"))'), 'the map survives a refused file');

        await drag('dragEnter', map, [fixtures.second]); await drag('dragOver', map, [fixtures.second]);
        await browser.waitFor(overlay);
        await drag('drop', map, [fixtures.second]);
        await browser.waitFor(`!${overlay}`, 3000);
        await browser.waitFor(`window.__reads === ${reads + 1}`, 5000);
        await wait(300);
        assert.equal(await browser.evaluate('window.__reads'), reads + 1, 'one import per drop');
      });

      await t.test('mixed drops: first-file routing, one import, and refused drops preserve the app, layers and live FOTO assets', async () => {
        const state = () => browser.evaluate(`({ reads: window.__reads, url: location.href, storage: localStorage.getItem('gmi-validator-storage'),
          markers: Array.from(document.querySelectorAll('.photo-thumb-marker')).map(e => [e.dataset.photoId, e.querySelector('img').src]).sort() })`);
        await browser.evaluate(`window.__dropDocument = document; window.__dropMap = document.querySelector('.leaflet-container'); void 0`);
        const map = await elementCentre(browser, 'document.querySelector(".leaflet-container")');
        const before = await state();
        for (const files of [[fixtures.photo, fixtures.second], [fixtures.photo, fixtures.photo], [fixtures.unsupported, fixtures.second]]) {
          await drag('dragEnter', map, files); await drag('dragOver', map, files);
          await browser.waitFor(overlay);
          if (files[0] === fixtures.photo) assert.equal(await browser.evaluate(`${overlay}.dataset.tone`), 'refused');
          await drag('drop', map, files); await wait(300);
          assert.equal(await forcedDrop(map, files), true, 'browser file navigation is always prevented, even if a refused drop is delivered');
          await wait(100);
          assert.deepEqual(await state(), before, 'no reads, persistence changes, navigation, layer loss or asset URL replacement');
          assert(await browser.evaluate('document === window.__dropDocument && document.querySelector(".leaflet-container") === window.__dropMap'), 'the current app and map stay mounted');
          assert.equal(await browser.evaluate(`Boolean(${overlay})`), false);
        }
        // Exercise the child FileUpload handler with an existing map/session, including an unknown MIME type.
        await clickText(browser, 'Legg til fil');
        const zoneExpression = `Array.from(document.querySelectorAll('div')).find(e => e.className.includes?.('border-dashed') && e.querySelector('input[type=file]'))`;
        const zone = await elementCentre(browser, zoneExpression);
        // Opening the dialog legitimately updates lastActive; compare each drop with the already-open dialog.
        const zoneBefore = await state();
        assert.deepEqual(zoneBefore.markers, before.markers);
        assert.equal(zoneBefore.reads, before.reads);
        for (const files of [[fixtures.photo, fixtures.second], [fixtures.unsupported, fixtures.second]]) {
          await drag('dragEnter', zone, files); await drag('dragOver', zone, files); await drag('drop', zone, files); await wait(300);
          assert.equal(await forcedDrop(zone, files), true, 'the upload zone cancels browser file navigation');
          await wait(100);
          assert.deepEqual(await state(), zoneBefore, 'the upload zone must preserve the loaded map and FOTO session too');
          assert(await browser.evaluate(`Boolean(document.querySelector('[aria-label="Lukk legg til lag"]'))`), 'refusal does not complete the layer import');
        }
        await drag('dragEnter', zone, [fixtures.second, fixtures.photo]); await drag('dragOver', zone, [fixtures.second, fixtures.photo]);
        await browser.waitFor(`${overlay}?.dataset.tone !== 'refused' && ${overlay}`);
        await drag('drop', zone, [fixtures.second, fixtures.photo]);
        await browser.waitFor(`!document.querySelector('[aria-label="Lukk legg til lag"]')`);
        await wait(300);
        assert.equal((await state()).reads, before.reads + 1, 'zone and global handler import only the first file, exactly once');
        const reads = (await state()).reads;
        await drag('dragEnter', map, [fixtures.second, fixtures.photo, fixtures.gmi]); await drag('dragOver', map, [fixtures.second, fixtures.photo, fixtures.gmi]);
        await browser.waitFor(`${overlay}?.dataset.tone !== 'refused' && ${overlay}`);
        await drag('drop', map, [fixtures.second, fixtures.photo, fixtures.gmi]); await wait(500);
        assert.equal((await state()).reads, reads + 1, 'global handler does not import the later supported or unsupported files');
        await browser.evaluate(`Array.from(document.querySelectorAll('button')).find(e => e.getAttribute('aria-label')?.startsWith('Åpne bildemodul for ')).click()`);
        await browser.waitFor('document.querySelector(".photo-workspace-shell")');
        const rows = await browser.evaluate('Array.from(document.querySelectorAll(".photo-workspace-list li[data-photo-id]")).map(e => e.dataset.photoId).sort()');
        assert.deepEqual(rows, Object.values(ids).sort(), 'all in-memory photos and layer membership survived');
        await selectPhotoRow(browser, ids['solo-a']);
        await browser.waitFor('document.querySelector(".photo-collection-original img")?.naturalWidth > 0');
        assert.equal(await browser.evaluate('document.querySelector(".photo-workspace-inspector h2").innerText'), fixtures.name('solo-a'), 'the original File remains readable');
        await browser.evaluate('document.querySelector(".photo-workspace-back").click()');
        await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
        await browser.waitFor('window.__audit.originals.size === 0');
      });

      await t.test('internal drags and map panning never show file feedback', async () => {
        await browser.evaluate(`(() => { const target = document.querySelector('.leaflet-container'), data = new DataTransfer(); data.setData('text/plain', 'column');
          for (const type of ['dragenter', 'dragover']) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data })); })()`);
        await wait(100);
        assert.equal(await browser.evaluate(`Boolean(${overlay})`), false);
        const map = await elementCentre(browser, 'document.querySelector(".leaflet-container")');
        await move(map);
        await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: map.x, y: map.y, button: 'left', buttons: 1, clickCount: 1 });
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: map.x + 60, y: map.y + 20, button: 'left', buttons: 1 });
        await wait(60);
        assert.equal(await browser.evaluate(`Boolean(${overlay})`), false);
        await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: map.x + 60, y: map.y + 20, button: 'left', buttons: 0, clickCount: 1 });
      });

      assert.equal(exceptions().length, 0, JSON.stringify(exceptions()[0]?.params?.exceptionDetails?.exception?.description));
    } finally {
      await browser.close();
      await fixtures.cleanup();
    }
  });
