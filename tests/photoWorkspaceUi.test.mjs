import { createLayerWithoutPlacement, retainGmlInWorkspace } from './helpers/photoImportWizard.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { assertPhotoDialogLayout } from './helpers/photoDialogLayout.mjs';
import { applyPhotoSourcePositions, openPhotoSources, closePhotoSources, stagePhotoSource, savePhotoSource, clickSourceControl, sourceWizard } from './helpers/photoSourceWorkflow.mjs';

const applicationUrl = process.env.PHOTO_UI_URL;
const gmlPath = process.env.PHOTO_GML_FIXTURE;
test('real FOTO workspace: popup, selection, append/remove, late sources, batch, layout and lifecycle',
  { skip: !chromePath || !applicationUrl || !gmlPath, timeout: 240000 }, async () => {
    const browser = await openTestChrome(), checks = [];
    // Visible text first, then icon-only accessible names; workspace tools open through Verktøy.
    const click = async (text, scope = 'document') => clickSourceControl(browser, text, scope);
    const inputFiles = async (selector, files) => {
      const { root } = await browser.send('DOM.getDocument');
      const { nodeId } = await browser.send('DOM.querySelector', { nodeId: root.nodeId, selector });
      assert(nodeId, selector); await browser.send('DOM.setFileInputFiles', { nodeId, files });
    };
    const markerCount = 'document.querySelectorAll(".photo-camera-marker").length';
    const collectionCount = 'document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length';
    const inspector = 'document.querySelector(".photo-workspace-inspector")';
    const originalCount = 'window.__photoUrlAudit.originals.size';
    const current = (kind) => `Array.from(${inspector}.querySelectorAll('section[aria-label=Plassering] dt')).find(e=>e.textContent==='Kilde')?.nextElementSibling.textContent.trim()===${JSON.stringify(kind)}`;
    const sourceCards = async () => {
      await click('Kilder og koblinger'); await browser.waitFor('document.querySelector(".photo-sources-info[open]")');
      const count = await browser.evaluate('document.querySelectorAll(".photo-sources-card").length');
      await click('Lukk', 'document.querySelector(".photo-sources-info")'); await browser.waitFor('!document.querySelector(".photo-sources-info[open]")');
      return count;
    };
    const removalMode = async () => { await click('Fjern bilder fra laget'); await browser.waitFor('document.querySelector(".photo-removal-bar")'); };
    const screenshot = async (name) => {
      if (!process.env.PHOTO_SCREENSHOT_DIR) return;
      await browser.waitFor(`!document.querySelector('.leaflet-container.leaflet-zoom-anim') && Array.from(document.querySelectorAll('.leaflet-tile')).every(image => image.complete)`);
      await browser.waitFor(`(() => { const image = document.querySelector('.photo-workspace-inspector .photo-collection-original img'); return !image || (image.complete && image.naturalWidth > 0 && !image.hidden); })()`);
      await browser.evaluate(`(async () => { const image = document.querySelector('.photo-workspace-inspector .photo-collection-original img'); if (image) await image.decode(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); })()`);
      await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive: true });
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.PHOTO_SCREENSHOT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
    };
    const syntheticPhotos = async (names) => browser.evaluate(`(async () => {
      const transfer = new DataTransfer();
      for (const [index, name] of ${JSON.stringify(names)}.entries()) {
        const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 800;
        const context = canvas.getContext('2d'); context.fillStyle = ['#087595','#bd7c24','#127b49'][index % 3]; context.fillRect(0,0,1200,800);
        context.fillStyle = 'white'; context.font = '48px sans-serif'; context.fillText(name, 40,100);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        transfer.items.add(new File([blob], name, {type:'image/png'}));
      }
      const input = document.querySelector('input[aria-label="Velg bildefiler"]'); input.files = transfer.files;
      input.dispatchEvent(new Event('change', {bubbles:true}));
    })()`);
    const syntheticGml = async (filename, late = false) => {
      const xml = `<gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:app="http://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101"><gml:boundedBy><gml:Envelope srsName="EPSG:5972"/></gml:boundedBy><gml:featureMember><app:Skråfoto gml:id="extra"><app:fotolink>Attachments\\${filename}</app:fotolink><app:fotograferingspunkt><gml:Point srsDimension="3"><gml:pos>${late ? '582142 6566396 0' : '581932.579311 6566001.891835 0'}</gml:pos></gml:Point></app:fotograferingspunkt></app:Skråfoto></gml:featureMember></gml:FeatureCollection>`;
      await browser.evaluate(`(() => { const transfer = new DataTransfer(); transfer.items.add(new File([${JSON.stringify(xml)}], ${JSON.stringify(late ? 'changed.gml' : 'addition.gml')}));
        const input = document.querySelector(${JSON.stringify('input[aria-label="Velg GML-kilde"]')});
        input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles:true})); })()`);
    };
    const selectPhoto = async (filename) => {
      await browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-row')).find(e => e.getAttribute('aria-label').startsWith(${JSON.stringify(`${filename},`)})).click()`);
      await browser.waitFor(`${inspector}.querySelector('h2').innerText === ${JSON.stringify(filename)}`);
    };
    const togglePhoto = async (filename) => browser.evaluate(`document.querySelector(${JSON.stringify(`.photo-workspace-list input[aria-label="Velg ${filename} for fjerning"]`)}).click()`);
    const checkImageViewer = async (label, closeWithEscape = true) => {
      await browser.waitFor(`(() => { const image = ${inspector}.querySelector('.photo-collection-original img'); return image?.complete && image.naturalWidth > 0; })()`);
      const original = await browser.evaluate(`${inspector}.querySelector('.photo-collection-original img').src`);
      const created = await browser.evaluate('window.__photoUrlAudit.originalCreated');
      const filename = await browser.evaluate(`${inspector}.querySelector('h2').innerText`);
      await browser.evaluate('document.querySelector(".photo-preview-open").click()'); await browser.waitFor('document.querySelector(".photo-image-viewer[open]")');
      await browser.waitFor('document.querySelector(".photo-image-viewer img").complete');
      // ResizeObserver measures the opened top-layer viewport before fitting.
      await browser.waitFor('parseInt(document.querySelector(".photo-image-viewer output").innerText) < 100');
      // Pass 1B: the viewer navigates across assets, so it owns exactly one original URL for the shown photo.
      assert.notEqual(await browser.evaluate('document.querySelector(".photo-image-viewer img").src'), original);
      assert.equal(await browser.evaluate(originalCount), 2); assert.equal(await browser.evaluate('window.__photoUrlAudit.originalCreated'), created + 1);
      const viewer = 'document.querySelector(".photo-image-viewer")';
      const zoomValue = async () => browser.evaluate(`parseInt(${viewer}.querySelector('output').innerText)`);
      const fitValue = await zoomValue();
      assert(fitValue > 0 && fitValue < 100);
      await browser.evaluate(`${viewer}.querySelector('button[aria-label="Zoom inn"]').click()`);
      assert(await zoomValue() > fitValue);
      await browser.evaluate(`${viewer}.querySelector('button[aria-label="Zoom ut"]').click()`);
      assert.equal(await zoomValue(), fitValue);
      await click('Faktisk størrelse (100 %)', viewer); assert.equal(await zoomValue(), 100);
      const area = await browser.evaluate(`${viewer}.querySelector('.photo-image-viewer-viewport').getBoundingClientRect().toJSON()`);
      const x = area.left + area.width / 2, y = area.top + area.height / 2;
      const beforePan = await browser.evaluate(`${viewer}.querySelector('img').style.transform`);
      await browser.send('Input.dispatchMouseEvent', {type:'mousePressed', x,y,button:'left',buttons:1,clickCount:1});
      await browser.evaluate('new Promise(resolve => requestAnimationFrame(resolve))');
      await browser.send('Input.dispatchMouseEvent', {type:'mouseMoved', x:x+70,y:y+80,button:'left',buttons:1});
      await browser.waitFor(`${viewer}.querySelector('img').style.transform !== ${JSON.stringify(beforePan)}`);
      await browser.send('Input.dispatchMouseEvent', {type:'mouseReleased', x:x+70,y:y+80,button:'left',buttons:0,clickCount:1});
      assert.notEqual(await browser.evaluate(`${viewer}.querySelector('img').style.transform`), beforePan);
      await browser.send('Input.dispatchMouseEvent', {type:'mouseWheel',x,y,deltaX:0,deltaY:-80});
      await browser.waitFor(`parseInt(${viewer}.querySelector('output').innerText) > 100`);
      await screenshot('photo-image-viewer-' + label);
      await click('Tilpass skjermen', viewer); assert.equal(await zoomValue(), fitValue);
      const size = await browser.evaluate(`(() => { const box = ${viewer}.querySelector('img').getBoundingClientRect(); const area = ${viewer}.querySelector('.photo-image-viewer-viewport').getBoundingClientRect(); return {width:box.width,height:box.height,areaWidth:area.width,areaHeight:area.height}; })()`);
      assert(size.width <= size.areaWidth && size.height <= size.areaHeight, 'fit contains original image');
      await screenshot('photo-image-viewer-fit-' + label);
      if (closeWithEscape) {
        await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
        await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
      } else await browser.evaluate(`${viewer}.querySelector('button[aria-label="Lukk bildevisning"]').click()`);
      await browser.waitFor('!document.querySelector(".photo-image-viewer")');
      assert.equal(await browser.evaluate(`${inspector}.querySelector('h2').innerText`), filename);
      assert.equal(await browser.evaluate(originalCount), 1, 'the viewer revoked its URL; the inspector keeps its own');
      assert.equal(await browser.evaluate('window.__photoUrlAudit.originalCreated'), created + 1);
      checks.push(`image viewer ${label}: one viewer-owned original URL revoked on close, fit/zoom/100%/pan/wheel, close preserves photo`);
    };
    const deleteLayer = async () => {
      await browser.evaluate(`document.querySelector('button[aria-label^="Fjern fotokartlag"]').click()`);
      await click('Fjern'); await browser.waitFor(`!document.querySelector('section[aria-label^="Fotokartlag"]')`);
    };
    const assertWorkspaceLayout = async (width, height) => {
      await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      const layout = await browser.evaluate(`(() => { const box = s => document.querySelector(s).getBoundingClientRect().toJSON(); return {
        shell: box('.photo-workspace-shell'), left: box('.workspace-left'), map: box('.leaflet-container'), right: box('.photo-workspace-inspector'),
        scrollWidth: document.querySelector('.photo-workspace-shell').scrollWidth,
      }; })()`);
      assert.equal(layout.shell.width, width); assert(layout.scrollWidth <= width + 1, JSON.stringify(layout));
      // Pass 1B: the shared header is branding + app info only; new photo imports start from the layer list.
      assert(await browser.evaluate(`(() => { const header = document.querySelector('.workspace-left > header'); const brand = header.querySelector('h1 span'), info = header.querySelector('button'); return !Array.from(header.querySelectorAll('button')).some((b) => b.innerText.includes('Bilder')) && brand.getBoundingClientRect().right <= info.getBoundingClientRect().left; })()`), 'workspace header branding must not overlap the info button');
      assert(layout.map.width > 0 && layout.map.height > 200 && layout.right.width > 0);
      if (width > 700) {
        assert(Math.abs(layout.left.right - layout.map.left) < 2);
        assert(Math.abs(layout.map.right - layout.right.left) < 2);
        assert(layout.map.width > layout.left.width && layout.map.width > layout.right.width);
        assert(layout.right.right <= width + 1);
        // Pass 1B widths: left pane clamp(292px, 23vw, 316px); inspector clamp(380px, 30vw, 560px).
        if (width === 1680) { assert(layout.right.width >= 380 && layout.right.width <= 560, JSON.stringify(layout.right)); assert.equal(layout.left.width, 316); }
      } else {
        assert(layout.map.top >= layout.left.bottom - 1); assert(layout.right.top >= layout.map.bottom - 1);
        await browser.evaluate(`${inspector}.scrollIntoView({block:'start'})`);
        assert(await browser.evaluate(`${inspector}.getBoundingClientRect().top < innerHeight`));
        await browser.evaluate('document.querySelector(".photo-workspace-shell").scrollTo(0,0)');
      }
      checks.push(`workspace layout ${width}×${height}: left ${layout.left.width}, map ${layout.map.width}, right ${layout.right.width}`);
    };
    try {
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
        const originals = new Set(), audit = { originals, originalCreated: 0, originalRevoked: 0 };
        const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
        URL.createObjectURL = value => { const url = create(value); if (value instanceof File) { originals.add(url); audit.originalCreated++; } return url; };
        URL.revokeObjectURL = url => { if (originals.delete(url)) audit.originalRevoked++; revoke(url); };
        window.__photoUrlAudit = audit;
      })();` });
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 900, deviceScaleFactor: 1, mobile: false });
      await browser.send('Page.navigate', { url: applicationUrl + '?testmodus=1' });
      await browser.waitFor(`document.querySelector('button[aria-label="Lukk"]')`);
      await browser.evaluate(`document.querySelector('button[aria-label="Lukk"]').click()`);
      const photos = (await readdir(path.join(path.dirname(gmlPath), 'Attachments'))).filter(name => /\.jpe?g$/i.test(name)).sort()
        .map(name => path.join(path.dirname(gmlPath), 'Attachments', name));
      assert.equal(photos.length, 148);
      await click('Bilder'); await browser.waitFor('document.querySelector(".photo-collection-dialog[open]")');
      await assertPhotoDialogLayout(browser, 'empty real-corpus importer');
      await inputFiles('input[aria-label="Velg bildefiler"]', photos);
      await assertPhotoDialogLayout(browser, 'populated real-corpus importer');
      await createLayerWithoutPlacement(browser);
        await retainGmlInWorkspace(browser, gmlPath);
      assert.equal(await browser.evaluate(markerCount), 0); await applyPhotoSourcePositions(browser, 'gml');
      await browser.waitFor(`${markerCount} === 148`);
      await browser.waitFor('/Zoom: (1[6-8])/.test(document.body.innerText)');
      await click('Tilbake til appen'); await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
      const locations = await browser.evaluate('new Set(Array.from(document.querySelectorAll(".photo-camera-marker")).map(e => e.style.transform)).size');
      assert(locations > 120 && locations <= 136); await browser.waitFor(`${originalCount} === 0`);
      await screenshot('photo-workspace-normal-map'); checks.push(`148 markers, ${locations} rounded pixel locations; 136 geographic positions checked independently`);
      await click('Bildemodul'); await browser.waitFor('document.querySelector(".photo-workspace-shell")');
      await browser.waitFor('document.querySelectorAll(".photo-workspace-list img").length === 148');
      await browser.waitFor(`${originalCount} === 1`);
      assert.equal(await browser.evaluate(collectionCount), 148); assert(await browser.evaluate(current('GML')));
      await browser.waitFor(`(() => { const image = ${inspector}.querySelector('.photo-collection-original img'); return image?.complete && image.naturalWidth > 0 && image.getBoundingClientRect().height >= 200; })()`);
      const first = await browser.evaluate(`${inspector}.querySelector('h2').innerText`), second = path.basename(photos[1]);
      // Batch selection only exists in removal mode and stays independent of the active photo.
      await removalMode(); await togglePhoto(first); await selectPhoto(second);
      assert(await browser.evaluate(`document.querySelector(${JSON.stringify(`input[aria-label="Velg ${first} for fjerning"]`)}).checked`));
      assert.equal(await browser.evaluate('document.querySelectorAll(".photo-camera-marker-selected").length'), 1);
      assert(await browser.evaluate(`document.querySelector('.photo-camera-marker-selected').title.includes(${JSON.stringify(second)})`));
      assert.equal(await browser.evaluate(originalCount), 1);
      const selectedStyle = await browser.evaluate(`(() => { const selected = document.querySelector('.photo-camera-marker-selected'); const ordinary = document.querySelector('.photo-camera-marker:not(.photo-camera-marker-selected)'); return {
        selectedWidth: selected.getBoundingClientRect().width, normalWidth: ordinary.getBoundingClientRect().width,
        selectedColor: getComputedStyle(selected).backgroundColor, normalColor: getComputedStyle(ordinary).backgroundColor,
      }; })()`);
      assert.equal(selectedStyle.normalWidth, 30); assert.equal(selectedStyle.selectedWidth, 30);
      assert.equal(selectedStyle.normalColor, 'rgba(0, 0, 0, 0)');
      assert.equal(selectedStyle.selectedColor, 'rgba(0, 0, 0, 0)');
      assert.equal(await browser.evaluate("document.querySelector('.photo-camera-marker:not(.photo-camera-marker-selected) svg:not(.photo-direction-indicator)').getBoundingClientRect().width"), 16);
      assert.equal(await browser.evaluate("document.querySelector('.photo-camera-marker-selected svg:not(.photo-direction-indicator)').getBoundingClientRect().width"), 22);
      assert(await browser.evaluate("Number(document.querySelector('.photo-camera-marker-selected').style.zIndex) > Math.max(...Array.from(document.querySelectorAll('.photo-camera-marker:not(.photo-camera-marker-selected)')).map(e => Number(e.style.zIndex)))"));
      await browser.evaluate(`Array.from(${inspector}.querySelectorAll('summary')).find(e => e.innerText === 'Tekniske kildedata').click()`);
      assert(await browser.evaluate(`${inspector}.innerText.includes('EPSG:5972') && ${inspector}.innerText.includes('GPSLatitude')`));
      await click('Avbryt', 'document.querySelector(".photo-removal-bar")'); await assertWorkspaceLayout(1680, 900);
      assert(!await browser.evaluate("Boolean(document.querySelector('.photo-removal-bar, .photo-workspace-list input'))"));
      assert.equal(await sourceCards(), 1);
      assert(await browser.evaluate("document.querySelector('.photo-workspace-list').getBoundingClientRect().height > innerHeight / 2"));
      await screenshot('photo-workspace-desktop'); await checkImageViewer('portrait');
      const oldOriginal = await browser.evaluate(`${inspector}.querySelector('.photo-collection-original img').src`);
      await selectPhoto(first); assert.equal(await browser.evaluate(originalCount), 1);
      assert(!await browser.evaluate(`window.__photoUrlAudit.originals.has(${JSON.stringify(oldOriginal)})`));
      for (const zoom of [16,17,18,19,20]) {
        const currentZoom = await browser.evaluate("Number(document.body.innerText.match(/Zoom: (\\d+)/)[1])");
        for (let n=0; n<Math.abs(currentZoom-zoom); n++) {
          await browser.evaluate(`document.querySelector('.leaflet-control-zoom-${currentZoom < zoom ? 'in' : 'out'}').click()`);
          await browser.waitFor(`document.body.innerText.includes('Zoom: ${currentZoom + (currentZoom < zoom ? n+1 : -n-1)}')`);
        }
        assert.equal(await browser.evaluate(markerCount),148); await screenshot(`photo-markers-zoom-${zoom}`);
        if (zoom === 17) {
          const densePhoto = await browser.evaluate(`(() => {
            const map = document.querySelector('.leaflet-container').getBoundingClientRect();
            const markers = Array.from(document.querySelectorAll('.photo-camera-marker')).map(marker => ({ marker, box: marker.getBoundingClientRect() }))
              .filter(({box}) => box.left > map.left && box.right < map.right && box.top > map.top && box.bottom < map.bottom);
            markers.sort((a,b) => markers.filter(c => Math.hypot(c.box.x-b.box.x,c.box.y-b.box.y) < 30).length
              - markers.filter(c => Math.hypot(c.box.x-a.box.x,c.box.y-a.box.y) < 30).length);
            const marker = markers[0].marker; marker.click(); return marker.title.replace(/^Vis bilde: /,'').split(' · ')[0];
          })()`);
          await browser.waitFor(`${inspector}.querySelector('h2').innerText === ${JSON.stringify(densePhoto)}`);
          await browser.waitFor(`document.querySelector('.photo-camera-marker-selected').title.includes(${JSON.stringify(densePhoto)})`);
          await screenshot('photo-workspace-dense-selected');
          await browser.evaluate(`${inspector}.querySelector('.photo-inspector-locate').click()`);
          await browser.waitFor("document.body.innerText.includes('Zoom: 18')");
        }
      }
      await assertWorkspaceLayout(1024, 620); await screenshot('photo-workspace-short'); await checkImageViewer('short');
      await assertWorkspaceLayout(390, 700); await screenshot('photo-workspace-narrow'); await checkImageViewer('narrow'); await assertWorkspaceLayout(1680, 900);
      const clickedWorkspacePhoto = await browser.evaluate(`(() => { const marker = document.querySelectorAll('.photo-camera-marker')[3]; marker.click(); return marker.title.replace(/^Vis bilde: /, '').split(' · ')[0]; })()`);
      await browser.waitFor(`${inspector}.querySelector('h2').innerText === ${JSON.stringify(clickedWorkspacePhoto)}`);
      assert(!await browser.evaluate('Boolean(document.querySelector(".photo-map-popup"))'));
      checks.push('layer-card entry, 148 collection records, active/batch independence, selected marker, provenance and one live original URL');
      await click('Tilbake til appen'); await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
      assert.equal(await browser.evaluate(originalCount), 0);
      const markerTitle = await browser.evaluate('document.querySelector(".photo-camera-marker").title.replace(/^Vis bilde: /, "").split(" · ")[0]');
      const originalsBeforePopup = await browser.evaluate('window.__photoUrlAudit.originalCreated');
      await browser.evaluate('document.querySelector(".photo-camera-marker").focus()');
      await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
      await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await browser.waitFor('document.querySelector(".photo-map-popup")');
      assert(await browser.evaluate(`Boolean(document.querySelector('.leaflet-popup-pane .photo-map-popup'))`), 'photo popup sits above the marker pane');
      await browser.waitFor(`(() => { const popup = document.querySelector('.leaflet-popup'); const image = popup?.querySelector('.photo-map-popup img'); return popup && getComputedStyle(popup).opacity === '1' && popup.getBoundingClientRect().top >= 0 && image?.complete && image.naturalWidth > 0; })()`);
      assert(!await browser.evaluate('Boolean(document.querySelector("dialog[open], .photo-workspace-shell"))'));
      // Pass 1D: the popup decodes one display preview from the original. Its temporary URL is revoked at once, and exactly one is made.
      await browser.waitFor('Math.max(document.querySelector(".photo-map-popup img").naturalWidth, document.querySelector(".photo-map-popup img").naturalHeight) === 800');
      assert.equal(await browser.evaluate(originalCount), 0); assert.equal(await browser.evaluate('window.__photoUrlAudit.originalCreated'), originalsBeforePopup + 1);
      assert(await browser.evaluate(`document.querySelector('.photo-map-popup').innerText.includes(${JSON.stringify(markerTitle)})`));
      await screenshot('photo-workspace-compact-popup'); await click('Åpne i bildemodul'); await browser.waitFor('document.querySelector(".photo-workspace-shell")');
      assert.equal(await browser.evaluate(`${inspector}.querySelector('h2').innerText`), markerTitle);
      assert(await browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-row')).find(e => e.getAttribute('aria-label').startsWith(${JSON.stringify(`${markerTitle},`)})).querySelector('img').naturalHeight <= 320`), 'the list keeps the session thumbnail');
      checks.push('normal marker opens compact popup only, decodes one display preview, leaves no live original URL; popup enters workspace at exact photo');

      await click('Legg til bilder'); await browser.waitFor('document.querySelector(".photo-collection-dialog[open]")');
      await syntheticPhotos(['cancelled.png']); await browser.waitFor('document.querySelector(".photo-collection-thumbnail img")');
      assert.equal(await browser.evaluate(originalCount), 1, 'workspace suspends original while importing');
      await click('Avbryt', 'document.querySelector(".photo-collection-dialog")'); await browser.waitFor('!document.querySelector("dialog[open]")');
      assert.equal(await browser.evaluate(collectionCount), 148);
      await click('Legg til bilder'); await browser.waitFor('document.querySelector(".photo-collection-dialog[open]")');
      await syntheticPhotos(['addition-placed.png', 'addition-one.png', 'addition-two.png']);

      await assertPhotoDialogLayout(browser, 'populated add-to-layer importer');
      await createLayerWithoutPlacement(browser); await browser.waitFor(`${collectionCount} === 151 && ${markerCount} === 148`);
      await openPhotoSources(browser); await syntheticGml('addition-placed.png', true); await savePhotoSource(browser); await closePhotoSources(browser);
      await applyPhotoSourcePositions(browser, 'gml', { filename: 'addition-placed.png' }); await browser.waitFor(`${markerCount} === 149`);
      await selectPhoto('addition-one.png'); await checkImageViewer('landscape', false);
      await removalMode(); await togglePhoto('addition-one.png'); await togglePhoto('addition-two.png');
      await browser.evaluate('document.querySelector(".photo-removal-primary").click()'); await browser.waitFor('document.querySelector(".photo-remove-confirmation[open]")');
      assert(await browser.evaluate('document.querySelector(".photo-remove-confirmation").innerText.includes("2 bilder")'));
      assert.equal(await browser.evaluate(collectionCount), 151);
      await click('Avbryt', 'document.querySelector(".photo-remove-confirmation")'); await browser.waitFor('!document.querySelector("dialog[open]")');
      assert.equal(await browser.evaluate(collectionCount), 151);
      await browser.evaluate('document.querySelector(".photo-removal-primary").click()'); await browser.waitFor('document.querySelector(".photo-remove-confirmation[open]")');
      await click('Fjern fra lag', 'document.querySelector(".photo-remove-confirmation")'); await browser.waitFor(`${collectionCount} === 149`);
      assert.equal(await browser.evaluate(`${inspector}.querySelector('h2').innerText`), 'addition-placed.png');
      await removalMode(); await togglePhoto('addition-placed.png');
      await browser.evaluate('document.querySelector(".photo-removal-primary").click()'); await browser.waitFor('document.querySelector(".photo-remove-confirmation[open]")');
      assert(await browser.evaluate('document.querySelector(".photo-remove-confirmation").innerText.includes("Fjern bildet")'));
      await click('Fjern fra lag', 'document.querySelector(".photo-remove-confirmation")'); await browser.waitFor(`${collectionCount} === 148 && ${markerCount} === 148`);
      assert.equal(await browser.evaluate(originalCount), 1);
      checks.push('append cancel/confirm with incoming-only GML; batch/single removal confirmation, active fallback, counts/resources and layer retained');

      // Per-source recheck lives in step 1 of Koble og posisjoner bilder.
      await openPhotoSources(browser);
      await click('Kontroller på nytt', `${sourceWizard}.querySelector('.photo-source-inventory section[data-source-id]')`);
      await browser.waitFor('document.querySelector(".photo-positioning-wizard")?.innerText.includes("Kilden finnes i laget")');
      await savePhotoSource(browser); await closePhotoSources(browser);
      await stagePhotoSource(browser, gmlPath); await closePhotoSources(browser);
      await openPhotoSources(browser);
      await syntheticGml(first, true); await browser.waitFor('document.querySelector(".photo-positioning-wizard").innerText.includes("1 treff")');
      await savePhotoSource(browser);
      await applyPhotoSourcePositions(browser, 'gml', { filename: first, sourceFilename: 'changed.gml' });
      await selectPhoto(first);
      assert(await browser.evaluate(current('GML')));
      assert.equal(await browser.evaluate(`${inspector}.querySelectorAll('.photo-inspector-raw').length`), 3);
      assert(await browser.evaluate(`${inspector}.innerText.includes('changed.gml')`));
      await applyPhotoSourcePositions(browser, 'exif'); await browser.waitFor(current('EXIF'));
      await applyPhotoSourcePositions(browser, 'gml', { sourceFilename: path.basename(gmlPath) }); await browser.waitFor(current('GML'));
      assert.equal(await browser.evaluate(markerCount), 148);
      await browser.evaluate(`document.querySelector('.photo-workspace-visibility').click()`); await browser.waitFor(`${markerCount} === 0`);
      assert(await browser.evaluate('Boolean(document.querySelector(".leaflet-container"))'));
      await browser.evaluate(`document.querySelector('.photo-workspace-visibility').click()`); await browser.waitFor(`${markerCount} === 148`);
      await screenshot('photo-workspace-dense-selection');
      checks.push('duplicate GML diagnosed; changed source requires explicit wizard confirmation; reversible 148-photo GML/EXIF and visibility');
      await click('Tilbake til appen'); await browser.waitFor('!document.querySelector(".photo-workspace-shell")'); await deleteLayer();
      assert.equal(await browser.evaluate(markerCount), 0); assert.equal(await browser.evaluate(originalCount), 0);

      await click('Bilder'); await browser.waitFor('document.querySelector("dialog[open]")'); await inputFiles('input[aria-label="Velg bildefiler"]', photos);
      await createLayerWithoutPlacement(browser); await browser.waitFor('document.querySelector(".photo-workspace-counts")?.innerText.includes("148 bilder") && document.querySelector(".photo-workspace-counts")?.innerText.includes("148 uplassert")');
      assert.equal(await browser.evaluate(markerCount), 0);  await browser.waitFor('document.querySelector(".photo-workspace-shell")');
      await stagePhotoSource(browser, gmlPath); await savePhotoSource(browser);
      assert.equal(await browser.evaluate(markerCount), 0, 'source checkpoint leaves photos unplaced');
      await applyPhotoSourcePositions(browser, 'gml'); await browser.waitFor(`${markerCount} === 148`);
      await applyPhotoSourcePositions(browser, 'exif'); await browser.waitFor(current('EXIF'));
      await applyPhotoSourcePositions(browser, 'gml'); await browser.waitFor(current('GML'));
      await click('Tilbake til appen'); await browser.waitFor('!document.querySelector(".photo-workspace-shell")'); await deleteLayer();
      checks.push('photos-only EXIF and late real GML remain candidate-only; all 148 explicitly accepted in batch; reversible source basis');

      await click('Bilder'); await browser.waitFor('document.querySelector("dialog[open]")'); await syntheticPhotos(['empty-layer.png']);
      await createLayerWithoutPlacement(browser); await browser.waitFor('!document.querySelector("dialog[open]")');
      await browser.waitFor('document.querySelector(".photo-workspace-shell")'); await removalMode(); await click('Velg alle viste');
      await browser.evaluate('document.querySelector(".photo-removal-primary").click()');
      await browser.waitFor('document.querySelector(".photo-remove-confirmation[open]")'); await click('Fjern fra lag', 'document.querySelector(".photo-remove-confirmation")');
      await browser.waitFor(`${collectionCount} === 0`);
      assert(await browser.evaluate('document.body.innerText.includes("Laget er tomt")')); assert(await browser.evaluate('Boolean(document.querySelector(".leaflet-container"))'));
      await click('Tilbake til appen'); await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
      assert(await browser.evaluate('Boolean(document.querySelector("section[aria-label^=Fotokartlag]"))')); await deleteLayer();
      checks.push('final member removal retains empty FOTO layer and map; separate layer deletion');
      await click('Bilder'); await browser.waitFor('document.querySelector("dialog[open]")'); await inputFiles('input[aria-label="Velg bildefiler"]', [photos[0]]);
      await createLayerWithoutPlacement(browser); await browser.waitFor('!document.querySelector("dialog[open]")');
      await browser.waitFor('document.querySelector(".photo-workspace-shell")'); await browser.send('Page.reload');
      await browser.waitFor('document.body.innerText.includes("Bilder") && !document.querySelector(".photo-workspace-shell, section[aria-label^=Fotokartlag]")');
      assert.equal(await browser.evaluate(markerCount), 0); assert.equal(await browser.evaluate(originalCount), 0);
      checks.push('hard reload restores no layer, spatial state, workspace selection or original preview');
      assert.deepEqual(browser.events.filter(event => event.method === 'Runtime.exceptionThrown').map(event => event.params.exceptionDetails.exception?.description || event.params.exceptionDetails.text), []);
      console.log(JSON.stringify({ photoWorkspaceUiChecks: checks }, null, 2));
    } catch (error) {
      console.error(await browser.evaluate('document.body.innerText.slice(0,14000)')); await screenshot('photo-workspace-failure'); throw error;
    } finally { await browser.close(); }
  });
