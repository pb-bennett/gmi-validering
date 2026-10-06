import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { assertPhotoDialogLayout } from './helpers/photoDialogLayout.mjs';

// Opt-in production UI acceptance; private originals stay outside the repository.
const applicationUrl = process.env.PHOTO_UI_URL;
const gmlPath = process.env.PHOTO_GML_FIXTURE;
test('production FOTO UI: real corpus markers, provenance, locate, visibility, ownership and survey coexistence', { skip: !chromePath || !applicationUrl || !gmlPath, timeout: 180000 }, async () => {
  const browser = await openTestChrome();
  const checks = [];
  const click = async (text) => browser.evaluate(`(() => { const button = Array.from(document.querySelectorAll('button')).find(e => e.innerText.trim() === ${JSON.stringify(text)}); if (!button || button.disabled) throw new Error('Unavailable button: ' + ${JSON.stringify(text)}); button.click(); })()`);
  const inputFiles = async (selector, files) => {
    const { root } = await browser.send('DOM.getDocument');
    const { nodeId } = await browser.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    assert(nodeId, selector);
    await browser.send('DOM.setFileInputFiles', { nodeId, files });
  };
  const markerCount = 'document.querySelectorAll(".photo-camera-marker").length';
  const screenshot = async (name) => {
    if (!process.env.PHOTO_SCREENSHOT_DIR) return;
    await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive: true });
    const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(process.env.PHOTO_SCREENSHOT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
  };
  const deleteLayer = async () => {
    await browser.evaluate(`document.querySelector('button[aria-label^="Fjern fotokartlag"]').click()`);
    await click('Fjern');
    await browser.waitFor(`!document.querySelector('section[aria-label^="Fotokartlag"]')`);
  };
  try {
    await browser.send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 900, deviceScaleFactor: 1, mobile: false });
    await browser.send('Page.navigate', { url: applicationUrl + '?testmodus=1' });
    await browser.waitFor('Array.from(document.querySelectorAll("button")).some(e => e.innerText.trim() === "Bilder")');
    await browser.waitFor(`document.querySelector('button[aria-label="Lukk"]')`);
    await browser.evaluate(`document.querySelector('button[aria-label="Lukk"]').click()`);
    const attachments = path.join(path.dirname(gmlPath), 'Attachments');
    const photos = (await readdir(attachments)).filter(name => /\.jpe?g$/i.test(name)).sort().map(name => path.join(attachments, name));
    assert.equal(photos.length, 148);
    await click('Bilder');
    await browser.waitFor('document.querySelector("dialog[open]")');
    await assertPhotoDialogLayout(browser, 'empty real-corpus importer');
    await inputFiles('input[aria-label="Velg GML med bildeposisjoner"]', [gmlPath]);
    await browser.waitFor('document.querySelector("dialog").innerText.includes("148 uten bilde")');
    await inputFiles('input[aria-label="Velg bildefiler"]', photos);
    await browser.waitFor('document.querySelector("dialog").innerText.includes("148 treff")');
    await assertPhotoDialogLayout(browser, 'populated real-corpus importer');
    await click('Opprett fotokartlag (148 bilder)');
    await browser.waitFor(`${markerCount} === 148`);
    await browser.waitFor('document.querySelector(".leaflet-container") && document.body.innerText.includes("148 plassert")');
    await browser.waitFor('/Zoom: (1[6-8])/.test(document.body.innerText)');
    // Leaflet rounds pixel offsets; nearby distinct coordinates may share a pixel.
    const renderedLocations = await browser.evaluate('new Set(Array.from(document.querySelectorAll(".photo-camera-marker")).map(e => e.style.transform)).size');
    assert(renderedLocations <= 136 && renderedLocations > 120);
    checks.push(`148 marker records; initial photo fit; ${renderedLocations} rounded pixel locations (136 geographic positions verified separately)`);
    await screenshot('photo-spatial-map');

    await browser.evaluate(`document.querySelector('input[aria-label^="Vis lag"]').click()`);
    await browser.waitFor(`${markerCount} === 0`);
    assert(await browser.evaluate('Boolean(document.querySelector(".leaflet-container"))'));
    assert(await browser.evaluate('document.body.innerText.includes("148 plassert")'));
    await browser.evaluate(`document.querySelector('input[aria-label^="Vis lag"]').click()`);
    await browser.waitFor(`${markerCount} === 148`);
    checks.push('visibility hides/shows all markers without unmounting map or changing counts');

    const markerTitle = await browser.evaluate('document.querySelector(".photo-camera-marker").title.replace(/^Vis bilde: /, "")');
    await browser.evaluate('document.querySelector(".photo-camera-marker").focus()');
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await browser.waitFor('document.querySelector(".photo-map-popup")');
    assert(!await browser.evaluate('Boolean(document.querySelector("dialog[open]"))'));
    await click('Åpne i bildemodul');
    await browser.waitFor('document.querySelector(".photo-workspace-shell")');
    await browser.waitFor('document.body.innerText.includes("148 bilder med EXIF GPS-kandidat")', 45000);
    assert(await browser.evaluate(`document.querySelector('.photo-collection-inspector').innerText.includes(${JSON.stringify(markerTitle)})`));
    assert(await browser.evaluate('document.body.innerText.includes("Gjeldende posisjon (GML)")'));
    for (const kind of ['GML', 'EXIF']) await browser.evaluate(`Array.from(document.querySelectorAll('summary')).find(e => e.innerText === 'Kildeinformasjon (${kind})').click()`);
    assert(await browser.evaluate('document.body.innerText.includes("EPSG:5972") && document.body.innerText.includes("GPSLatitude")'));
    await browser.evaluate('document.querySelector(".photo-spatial-inspector").scrollIntoView({block:"start"})');
    await screenshot('photo-spatial-inspector');
    await click('Bruk EXIF-posisjon');
    await browser.waitFor('document.body.innerText.includes("Gjeldende posisjon (EXIF)")');
    await click('Tilbake til appen'); await browser.waitFor('!document.querySelector(".photo-workspace-shell")'); await click('Bildemodul');
    await browser.waitFor('document.body.innerText.includes("Gjeldende posisjon (EXIF)")');
    await click('Bruk GML-posisjon');
    await browser.waitFor('document.body.innerText.includes("Gjeldende posisjon (GML)")');
    for (const [width, height] of [[1024, 620], [390, 700]]) {
      await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      assert(await browser.evaluate('document.querySelector(".photo-workspace-shell").getBoundingClientRect().width === innerWidth'));
      await browser.evaluate('Array.from(document.querySelectorAll("button")).find(e => e.innerText === "Bruk EXIF-posisjon").scrollIntoView({block:"center"})');
      assert(await browser.evaluate('Array.from(document.querySelectorAll("button")).find(e => e.innerText === "Bruk EXIF-posisjon").getBoundingClientRect().bottom <= window.innerHeight'));
    }
    await browser.send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 900, deviceScaleFactor: 1, mobile: false });
    checks.push('marker focuses correct photo; provenance visible; candidate acceptance preserved on reopen');
    for (const button of ['Zoom til posisjon', 'Zoom til GML', 'Zoom til EXIF']) {
      await click(button); await browser.waitFor('document.querySelector(".photo-workspace-shell")');
      await browser.waitFor('document.body.innerText.includes("Zoom: 18")');
      assert.equal(await browser.evaluate(markerCount), 148);
      await browser.waitFor('document.body.innerText.includes("Gjeldende posisjon (GML)")');
    }
    checks.push('current/GML/EXIF locate retain workspace, markers and accepted basis');
    await click('Tilbake til appen'); await browser.waitFor('!document.querySelector(".photo-workspace-shell")'); await deleteLayer();
    assert.equal(await browser.evaluate(markerCount), 0);

    await click('Bilder'); await browser.waitFor('document.querySelector("dialog[open]")');
    await inputFiles('input[aria-label="Velg bildefiler"]', photos);
    await browser.waitFor('document.querySelector("dialog").innerText.includes("148 bilder med EXIF GPS-kandidat")', 45000);
    await click('Opprett fotokartlag (148 bilder)');
    await browser.waitFor('document.body.innerText.includes("148 uplassert") && document.querySelector(".leaflet-container")');
    assert.equal(await browser.evaluate(markerCount), 0);
    await click('Bildemodul'); await browser.waitFor('document.querySelector(".photo-workspace-shell")');
    await click('Bruk EXIF-posisjon'); await click('Tilbake til appen');
    await browser.waitFor(`${markerCount} === 1`);
    assert(await browser.evaluate('document.body.innerText.includes("1 plassert") && document.body.innerText.includes("147 uplassert")'));
    checks.push('all 148 EXIF candidates stay unplaced without GML; explicit acceptance creates exactly one marker');

    // Use the repository's synthetic survey, never the unrelated external GMI.
    await click('Legg til fil');
    await browser.waitFor('document.querySelector("input[type=file]")');
    // The pre-existing upload flow asks the user to choose a CRS for this fixture.
    await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.confirm = () => true;' });
    await browser.evaluate('window.confirm = () => true');
    await inputFiles('input[type="file"]', [path.resolve('tests/fixtures/gmi-v32/valid/point-clean-modern.gmi')]);
    await browser.waitFor('document.body.innerText.includes("point-clean-modern")', 45000);
    assert.equal(await browser.evaluate(markerCount), 1);
    assert(await browser.evaluate('Boolean(document.querySelector(".leaflet-container"))'));
    await click('Legg til fil'); await browser.waitFor('document.querySelector("input[type=file]")');
    await inputFiles('input[type="file"]', [path.resolve('node_modules/sosijs/data/fastmerke.sos')]);
    await browser.waitFor('document.body.innerText.includes("fastmerke")', 45000);
    await click('Legg til fil'); await browser.waitFor('document.querySelector("input[type=file]")');
    await browser.evaluate(`(() => { const input = document.querySelector('input[type=file]'); const transfer = new DataTransfer(); transfer.items.add(new File(['00 KOORDSYS 22\\n05 1 6566001.89 581932.58 0\\n'], 'photo-coexistence.kof')); input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles:true})); })()`);
    await browser.waitFor('document.body.innerText.includes("photo-coexistence")', 45000);
    assert.equal(await browser.evaluate(markerCount), 1);
    await screenshot('photo-survey-coexistence');
    await click('Bildemodul'); await browser.waitFor('document.querySelector(".photo-workspace-shell")');
    await click('Zoom til EXIF'); await browser.waitFor('!document.querySelector("dialog[open]")');
    await browser.waitFor('document.body.innerText.includes("Zoom: 18")');
    assert(await browser.evaluate('(() => { const point = document.querySelector(".photo-camera-marker").getBoundingClientRect(); const map = document.querySelector(".leaflet-container").getBoundingClientRect(); return point.left >= map.left && point.right <= map.right && point.top >= map.top && point.bottom <= map.bottom; })()'));
    assert.equal(await browser.evaluate(markerCount), 1);
    checks.push('GMI/SOSI/KOF survey import, fitting and explicit photo geographic locate coexist');
    await click('Tilbake til appen'); await browser.waitFor('!document.querySelector(".photo-workspace-shell")');

    await click('Nullstill og last opp ny');
    await browser.waitFor(`!document.querySelector('section[aria-label^="Fotokartlag"]') && !document.querySelector('.leaflet-container')`);
    assert.equal(await browser.evaluate(markerCount), 0);
    checks.push('application reset releases FOTO/map state and returns to upload');
    await click('Bilder'); await browser.waitFor('document.querySelector("dialog[open]")');
    await inputFiles('input[aria-label="Velg bildefiler"]', [photos[0]]);
    await click('Opprett fotokartlag (1 bilder)');
    await browser.waitFor(`document.querySelector('section[aria-label^="Fotokartlag"]')`);

    await browser.send('Page.reload');
    await browser.waitFor(`document.body.innerText.includes('Bilder') && !document.querySelector('section[aria-label^="Fotokartlag"]')`);
    assert.equal(await browser.evaluate(markerCount), 0);
    checks.push('hard reload restores no FOTO layer, marker or spatial state');
    const exceptions = browser.events.filter(event => event.method === 'Runtime.exceptionThrown');
    assert.deepEqual(exceptions.map(event => event.params.exceptionDetails.text), []);
    console.log(JSON.stringify({ productionUiChecks: checks }, null, 2));
  } catch (error) {
    console.error(await browser.evaluate('document.body.innerText.slice(0,10000)'));
    await screenshot('photo-spatial-failure');
    throw error;
  } finally { await browser.close(); }
});
