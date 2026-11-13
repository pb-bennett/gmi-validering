import { createLayerWithoutPlacement, retainGmlInWorkspace } from './helpers/photoImportWizard.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { gpsPng } from './helpers/photoGpsFixtures.mjs';
import { gmiText } from './helpers/gmiPhotoFixtures.mjs';
import { applyPhotoSourcePositions, clickSourceControl, setPhotoColourMode, setPhotoFiles, stagePhotoSource, savePhotoSource, closePhotoSources } from './helpers/photoSourceWorkflow.mjs';
import { PHOTO_POSITION_SOURCES } from '../src/lib/photos/photoMarkerPresentation.mjs';
import { KEYS, arrowOf, commandBar, discardEdits, dragSelectedMarker, editArrow, editTarget, enterEditMode, pressKey, saveEdits } from './helpers/photoWorkspace.mjs';

const app = process.env.PHOTO_UI_URL;
test('synthetic FOTO provenance: accepted sources, shared occurrences, editing, display card lifecycle and rendered layouts',
  { skip: !chromePath || !app, timeout: 240000 }, async (t) => {
    const root = path.resolve(tmpdir()), directory = await mkdtemp(path.join(root, 'photo-marker-provenance-'));
    const names = ['exif.png', 'gml.png', 'shared.png'];
    const photos = names.map((name) => path.join(directory, name));
    await Promise.all(photos.map((filename, i) => writeFile(filename, gpsPng({ longitude: [10, 26, 5 + i * 2] }))));
    const gml = path.join(directory, 'positions.gml'), gmi = path.join(directory, 'Marker survey.gmi');
    await writeFile(gmi, gmiText([0, 1].map((i) => ({ label: `K${i}`, hyperlink: 'h:1(link:"shared.png") ', xyz: `${581930 + i * 50} 6566000 1` }))));
    await writeFile(gml, '<gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:app="http://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101"><gml:boundedBy><gml:Envelope srsName="EPSG:5972"/></gml:boundedBy><gml:featureMember><app:Skråfoto gml:id="photo"><app:fotolink>gml.png</app:fotolink><app:fotograferingspunkt><gml:Point srsDimension="3"><gml:pos>581910 6566050 0</gml:pos></gml:Point></app:fotograferingspunkt></app:Skråfoto></gml:featureMember></gml:FeatureCollection>');
    const browser = await openTestChrome();
    const click = (text, scope = 'document') => clickSourceControl(browser, text, scope);
    const legend = 'document.querySelector(".photo-map-display-card")';
    const markers = 'Array.from(document.querySelectorAll(".photo-camera-marker"))';
    const selected = 'document.querySelector(".photo-camera-marker-selected")';
    const cursor = () => browser.evaluate('getComputedStyle(document.querySelector(".leaflet-container")).cursor');
    const sourceOfSelected = () => browser.evaluate(`${selected}?.querySelector('.photo-camera-glyph').dataset.positionSource`);
    const select = async (id) => {
      await browser.evaluate(`document.querySelector('.photo-workspace-list li[data-photo-id="${id}"] button').click()`);
      await browser.waitFor(`document.querySelector('.photo-workspace-list li[data-photo-id="${id}"] button').getAttribute('aria-pressed')==='true'`);
    };
    const editCount = 'Number(document.querySelector("[data-edit-count]")?.innerText.match(/\\d+/)?.[0] || 0)';
    // Moves are staged in Edit mode; the staged marker already shows the manual provenance it will have after save.
    const move = async (commit) => {
      await enterEditMode(browser);
      assert.notEqual(await cursor(), 'crosshair', 'a placed photo is moved by dragging, not by click capture');
      assert.equal(await browser.evaluate(`getComputedStyle(${editTarget}).cursor`), 'grab');
      await dragSelectedMarker(browser, 70, 50);
      await browser.waitFor(`${editCount} === 1`);
      assert.equal(await sourceOfSelected(), 'manual', 'staged move previews manual provenance');
      if (commit) await saveEdits(browser); else await discardEdits(browser);
      await browser.waitFor(`!${commandBar}`);
    };
    const screenshot = async (name) => {
      if (!process.env.PHOTO_SCREENSHOT_DIR) return;
      await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive: true });
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.PHOTO_SCREENSHOT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
    };
    // Deterministic map backdrops exercise contrast without depending on external tile availability.
    const tile = (dark = false) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="${dark ? '#293f35' : '#f0eee3'}"/><path d="M0 45L256 110V210L0 145Z" fill="${dark ? '#425a38' : '#d9e1c8'}"/><path d="M0 245L256 10M-30 90L256 190" stroke="${dark ? '#8b8b78' : '#fff'}" stroke-width="14"/><path d="M0 245L256 10M-30 90L256 190" stroke="${dark ? '#565c50' : '#c9c3b3'}" stroke-width="2"/></svg>`);
    try {
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.clear(); window.confirm=()=>true;
        const imageSrc=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
        Object.defineProperty(HTMLImageElement.prototype,'src',{...imageSrc,set(value){imageSrc.set.call(this,String(value).includes('cache.kartverket.no/')?${JSON.stringify(tile())}:String(value).includes('geonorge.no/')?'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/%3E':value);}});` });
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
      await browser.send('Page.navigate', { url: app + '?testmodus=1' });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
      await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
      await setPhotoFiles(browser, 'input[type=file]', [gmi]);
      await browser.waitFor('document.body.innerText.includes("Marker survey") && document.querySelector(".leaflet-container")');
      await browser.waitFor('document.body.innerText.includes("Tegnforklaring")');
      await t.test('normal survey legend retained; unplaced evidence produces no camera', async () => {
        assert.notEqual(await cursor(), 'crosshair');
        assert.equal(await browser.evaluate(`Boolean(${legend})`), false);
        await click('Bilder'); await browser.waitFor('document.querySelector(".photo-collection-dialog[open]")');
        await setPhotoFiles(browser, 'input[aria-label="Velg bildefiler"]', photos);
        await createLayerWithoutPlacement(browser);
        await retainGmlInWorkspace(browser, gml);
        assert.equal(await browser.evaluate(`${markers}.length`), 0);
         await browser.waitFor(legend);
        assert.equal(await browser.evaluate('document.body.innerText.includes("Tegnforklaring")'), false);
        assert.equal(await browser.evaluate(`${legend}.querySelector('select').value`), 'delivery', 'Leveringsvalg is the workspace default');
      });
      await stagePhotoSource(browser, gmi, 'gmi'); await savePhotoSource(browser, 'gmi'); await closePhotoSources(browser);
      const rows = await browser.evaluate('Array.from(document.querySelectorAll(".photo-workspace-list li[data-photo-id]")).map(e=>({id:e.dataset.photoId,name:e.querySelector(".photo-workspace-filename").innerText}))');
      const repeated = rows.filter((row) => row.name === 'shared.png');
      assert.equal(repeated.length, 2);
      const exif = rows.find((row) => row.name === 'exif.png'), gmlPhoto = rows.find((row) => row.name === 'gml.png');
      await t.test('accepted GML/EXIF source replacement updates rendered source without separate color state', async () => {
        await applyPhotoSourcePositions(browser, 'gml', { photoId: gmlPhoto.id });
        await select(gmlPhoto.id); assert.equal(await sourceOfSelected(), 'gml');
        await applyPhotoSourcePositions(browser, 'exif', { photoId: gmlPhoto.id });
        assert.equal(await sourceOfSelected(), 'exif');
        await applyPhotoSourcePositions(browser, 'gml', { photoId: gmlPhoto.id });
        assert.equal(await sourceOfSelected(), 'gml');
        await applyPhotoSourcePositions(browser, 'exif', { photoId: exif.id });
        await applyPhotoSourcePositions(browser, 'gmi');
        for (let i = 0; i < 4; i++) {
          await browser.evaluate('document.querySelector(".leaflet-control-zoom-out").click()');
          await browser.evaluate('new Promise(resolve=>setTimeout(resolve,400))');
        }
      });
      await select(repeated[1].id);
      await t.test('discard preserves GMI; save produces manual while shared sibling remains GMI', async () => {
        await move(false); assert.equal(await sourceOfSelected(), 'gmi');
        await move(true); assert.equal(await sourceOfSelected(), 'manual');
        assert.deepEqual(await browser.evaluate(`${markers}.filter(e=>e.title.includes('shared.png')).map(e=>e.querySelector('.photo-camera-glyph').dataset.positionSource).sort()`), ['gmi', 'manual']);
      });
      await t.test('delivery colours are the default; planning toggles isolated markers in one click; provenance identity and mode remain', async () => {
        const colourSelect = `${legend}.querySelector('select')`;
        const markerOf = (id) => `document.querySelector('.photo-camera-marker[data-photo-id="${id}"]')`;
        const fillOf = (id) => browser.evaluate(`${markerOf(id)}.querySelector('.photo-camera-glyph path').getAttribute('fill')`);
        const pillOf = (id) => browser.evaluate(`document.querySelector('.photo-workspace-list li[data-photo-id="${id}"] .photo-delivery-pill').innerText`);
        const [GMI, GML, NEUTRAL] = ['#1e40af', '#22c55e', '#64748b'];
        await setPhotoColourMode(browser, 'delivery');
        assert.equal(await browser.evaluate(`${colourSelect}.value`), 'delivery');
        // Destination colours on every marker; provenance stays on the marker as data and in the tooltip.
        assert(await browser.evaluate(`${markers}.every(marker => ${JSON.stringify([GMI, GML, NEUTRAL])}.includes(marker.querySelector('.photo-camera-glyph path').getAttribute('fill')))`));
        for (const source of PHOTO_POSITION_SOURCES) {
          assert(await browser.evaluate(`${markers}.some(marker => marker.querySelector('.photo-camera-glyph').dataset.positionSource === ${JSON.stringify(source.kind)} && !marker.querySelector('.photo-marker-delivery, .photo-marker-batch'))`));
        }
        assert.equal(await fillOf(repeated[0].id), GMI, 'GMI-linked placement: deep blue');
        assert.equal(await fillOf(exif.id), NEUTRAL, 'placed photo without a GMI reference, not included: neutral');
        assert.deepEqual(await browser.evaluate(`Array.from(${legend}.querySelectorAll('li[data-legend-delivery]')).map(e => [e.dataset.legendDelivery, e.querySelector('.photo-camera-glyph path').getAttribute('fill'), e.innerText.trim()])`),
          [['gmi', GMI, 'Beholdes i GMI'], ['gml', GML, 'Til GML'], ['excluded', NEUTRAL, 'Ikke med i GML'], ['review', '#b06a08', 'Krever gjennomgang'], ['mixed', NEUTRAL, 'Ulike leveringsvalg']]);

        await click('Fordel bilder til GMI/GML');
        await browser.waitFor('document.querySelector(".photo-delivery-bar")');
        assert.equal(await browser.evaluate(`${colourSelect}.value`), 'delivery');
        // Sidebar navigation still locates/highlights the placement during planning and never edits it.
        await select(repeated[0].id);
        await browser.waitFor(`${markerOf(repeated[0].id)}.classList.contains('photo-camera-marker-selected')`);
        assert.equal(await fillOf(repeated[0].id), GMI);
        assert.equal(await pillOf(repeated[0].id), 'GMI');
        await select(exif.id);
        await browser.waitFor(`${markerOf(exif.id)}.classList.contains('photo-camera-marker-selected')`);
        assert.equal(await pillOf(exif.id), 'Ikke med');
        assert.equal(await pillOf(repeated[0].id), 'GMI');
        // An isolated GMI-linked marker: GMI -> GML -> GMI, at once; its sibling placement of the same photograph is untouched.
        for (const [expectedFill, expectedPill] of [[GML, 'GML'], [GMI, 'GMI'], [GML, 'GML']]) {
          await browser.evaluate(`${markerOf(repeated[0].id)}.dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
          await browser.waitFor(`${markerOf(repeated[0].id)}.querySelector('.photo-camera-glyph path').getAttribute('fill') === ${JSON.stringify(expectedFill)}`);
          assert.equal(await pillOf(repeated[0].id), expectedPill);
          assert.equal(await fillOf(repeated[1].id), GMI);
          assert.equal(await browser.evaluate(`Boolean(document.querySelector('.photo-delivery-map-popup'))`), false, 'no chooser for a single occurrence');
        }
        // An isolated photo without a GMI reference: «Ikke med» <-> GML, never GMI.
        await browser.evaluate(`${markerOf(exif.id)}.dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
        await browser.waitFor(`${markerOf(exif.id)}.querySelector('.photo-camera-glyph path').getAttribute('fill') === ${JSON.stringify(GML)}`);
        assert.equal(await pillOf(exif.id), 'GML');
        assert.match(await browser.evaluate(`${markerOf(exif.id)}.getAttribute('aria-label')`), /^Endre leveringsvalg: exif\.png.*plassering: EXIF.*Planlagt: Tas med i GML uten GMI-lenke$/);
        for (const dark of [false, true]) {
          await browser.evaluate(`document.querySelectorAll('.leaflet-tile').forEach(e=>e.src=${JSON.stringify(tile(dark))})`);
          await browser.waitFor('Array.from(document.querySelectorAll(".leaflet-tile")).every(e=>e.complete && e.naturalWidth>0)');
          for (const [width, height] of [[1280, 720], [1366, 768]]) {
            await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
            await browser.evaluate('new Promise(resolve=>setTimeout(resolve,300))');
            await screenshot(`refine-planning-map${dark ? '-dark' : ''}-${width}x${height}`);
          }
        }
        await browser.evaluate(`document.querySelectorAll('.leaflet-tile').forEach(e=>e.src=${JSON.stringify(tile())})`);
        // Restore the defaults through the same one-click path, then leave planning.
        await browser.evaluate(`${markerOf(exif.id)}.dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
        await browser.evaluate(`${markerOf(repeated[0].id)}.dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
        await browser.waitFor(`${markerOf(exif.id)}.querySelector('.photo-camera-glyph path').getAttribute('fill') === ${JSON.stringify(NEUTRAL)}
          && ${markerOf(repeated[0].id)}.querySelector('.photo-camera-glyph path').getAttribute('fill') === ${JSON.stringify(GMI)}`);
        await click('Ferdig', 'document.querySelector(".photo-delivery-bar")');
        await browser.waitFor('!document.querySelector(".photo-delivery-bar")');
        assert.equal(await browser.evaluate(`${colourSelect}.value`), 'delivery', 'leaving planning keeps the delivery colours');
        await screenshot('refine-delivery-normal-navigation');

        // Plasseringskilde restores the accepted provenance palette.
        await setPhotoColourMode(browser, 'provenance');
        assert(await browser.evaluate(`${legend}.innerText.includes('Plasseringskilde') || ${colourSelect}.selectedOptions[0].text === 'Plasseringskilde'`));
        for (const source of PHOTO_POSITION_SOURCES) {
          assert(await browser.evaluate(`${markers}.some(marker => marker.querySelector('.photo-camera-glyph').dataset.positionSource === ${JSON.stringify(source.kind)} && marker.querySelector('.photo-camera-glyph path').getAttribute('fill') === ${JSON.stringify(source.color)})`), source.kind);
        }
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          await screenshot(`final-provenance-mode-${width}x${height}`);
        }
        await select(repeated[1].id);
        await browser.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
      });
      await t.test('selection, hover and accepted direction keep all four source fills', async () => {
        await setPhotoColourMode(browser, 'provenance'); // provenance palette checks choose Plasseringskilde explicitly
        for (const source of PHOTO_POSITION_SOURCES) {
          const id = source.kind === 'exif' ? exif.id : source.kind === 'gml' ? gmlPhoto.id : repeated[source.kind === 'gmi' ? 0 : 1].id;
          await select(id); assert.equal(await sourceOfSelected(), source.kind);
          assert(await browser.evaluate(`${selected}.title.includes(${JSON.stringify(source.label)})`));
          assert.equal(await browser.evaluate(`${selected}.querySelector('.photo-camera-glyph path').getAttribute('fill')`), source.color);
          await browser.evaluate(`${selected}.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))`);
          assert.equal(await sourceOfSelected(), source.kind);
        }
        await enterEditMode(browser);
        assert.notEqual(await cursor(), 'crosshair');
        await browser.evaluate(`${commandBar}.querySelector('input[type=number]').focus()`);
        await browser.evaluate(`(() => { const input = ${commandBar}.querySelector('input[type=number]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '45'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        await pressKey(browser, 'Enter', KEYS.Enter);
        await browser.waitFor(`${editArrow}?.dataset.staged === 'true'`);
        await saveEdits(browser);
        await browser.waitFor(`${arrowOf('document.querySelector(".photo-camera-marker-selected")')}?.dataset.staged === 'false'`);
        assert.equal(await sourceOfSelected(), 'manual');
      });
      await t.test('both viewport layouts keep the shared-palette display card clear of map controls', async () => {
        await setPhotoColourMode(browser, 'provenance'); // provenance palette checks choose Plasseringskilde explicitly
        for (const [width, height] of [[1920, 1080], [1280, 720]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          await browser.evaluate('new Promise(resolve=>setTimeout(resolve,800))');
          const layout = await browser.evaluate(`(() => {const legend=${legend}, box=legend.getBoundingClientRect(), map=document.querySelector('.leaflet-container').getBoundingClientRect();
            const overlaps=Array.from(document.querySelectorAll('.leaflet-control')).some(e=>{const b=e.getBoundingClientRect();return b.width>0 && b.height>0 && box.left<b.right && box.right>b.left && box.top<b.bottom && box.bottom>b.top});
            return {width:box.width,height:box.height,inside:box.left>=map.left && box.right<=map.right && box.top>=map.top && box.bottom<=map.bottom,overlaps,
              controls:legend.querySelectorAll('button,input,select,a').length,radios:legend.querySelectorAll('[role=radio]').length,entries:Array.from(legend.querySelectorAll('li[data-legend-source]')).map(e=>({kind:e.querySelector('svg').dataset.positionSource,label:e.innerText,fill:e.querySelector('path').getAttribute('fill')}))};})()`);
          assert(layout.inside && !layout.overlaps, JSON.stringify(layout));
          assert(layout.width <= 200 && layout.height < 280, JSON.stringify(layout));
          assert.equal(layout.controls, 3, 'colour mode selector plus the Markører/Miniatyrer display toggle');
          assert.equal(layout.radios, 2);
          assert.deepEqual(layout.entries, PHOTO_POSITION_SOURCES.map(({ kind, label, color }) => ({ kind, label, fill: color })));
          assert.deepEqual(await browser.evaluate(`${markers}.map(e=>e.querySelector('.photo-camera-glyph').dataset.positionSource).sort()`), ['exif', 'gmi', 'gml', 'manual']);
          assert(await browser.evaluate(`(() => {const map=document.querySelector('.leaflet-container').getBoundingClientRect();return ${markers}.every(e=>{const b=e.getBoundingClientRect();return b.left>=map.left && b.right<=map.right && b.top>=map.top && b.bottom<=map.bottom});})()`), 'all four markers are inside the rendered map');
          await browser.waitFor('Array.from(document.querySelectorAll(".leaflet-tile")).every(e=>e.complete && e.naturalWidth>0)');
          for (const id of [gmlPhoto.id, repeated[0].id]) {
            await select(id);
            await screenshot(`photo-provenance-selected-${id === gmlPhoto.id ? 'gml' : 'gmi'}-${width}x${height}`);
          }
          await screenshot(`photo-provenance-${width}x${height}`);
          await browser.evaluate(`document.querySelectorAll('.leaflet-tile').forEach(e=>e.src=${JSON.stringify(tile(true))})`);
          await browser.waitFor('Array.from(document.querySelectorAll(".leaflet-tile")).every(e=>e.complete && e.naturalWidth>0)');
          await browser.evaluate('new Promise(resolve=>setTimeout(resolve,500))');
          await screenshot(`photo-provenance-dark-${width}x${height}`);
          await enterEditMode(browser);
          assert(await browser.evaluate('document.querySelector(".leaflet-container").classList.contains("photo-edit-mode")'));
          assert.notEqual(await cursor(), 'crosshair');
          await screenshot(`photo-edit-active-${width}x${height}`);
          await click('Avslutt redigering');
          await browser.waitFor(`!${commandBar}`);
          assert.equal(await browser.evaluate('document.querySelector(".leaflet-container").classList.contains("photo-edit-mode")'), false);
          await browser.evaluate(`document.querySelectorAll('.leaflet-tile').forEach(e=>e.src=${JSON.stringify(tile())})`);
        }
      });
      await t.test('Pass 1D: all source dots render in workspace/main-map thumbnails, with selected ring and direction intact', async () => {
        await setPhotoColourMode(browser, 'provenance'); // provenance palette checks choose Plasseringskilde explicitly
        await browser.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
        await browser.evaluate(`${legend}.querySelector('[data-mode=thumbnails]').click()`);
        for (let i = 0; i < 8 && !await browser.evaluate('Boolean(document.querySelector(".photo-thumb-marker"))'); i++) {
          await browser.evaluate('document.querySelector(".leaflet-control-zoom-in").click()');
          await browser.evaluate('new Promise(resolve=>setTimeout(resolve,350))');
        }
        const badges = () => browser.evaluate(`Array.from(document.querySelectorAll('.photo-thumb-marker')).map(e => ({
          kind:e.querySelector('.photo-thumb').dataset.positionSource, label:e.querySelector('.photo-thumb-source').getAttribute('aria-label'),
          size:e.getBoundingClientRect().width, border:getComputedStyle(e.querySelector('.photo-thumb')).borderTopColor,
          dot:getComputedStyle(e.querySelector('.photo-thumb-source')).backgroundColor, glyphs:e.querySelectorAll('.photo-source-glyph').length,
          corner:(() => {const a=e.querySelector('.photo-thumb-source').getBoundingClientRect(), b=e.querySelector('.photo-thumb').getBoundingClientRect(); return a.width<=8 && a.height<=8 && Math.abs(a.left-b.left)<=2 && Math.abs(a.bottom-b.bottom)<=2;})() })).sort((a,b)=>a.kind.localeCompare(b.kind))`);
        await browser.waitFor('document.querySelectorAll(".photo-thumb-source").length === 4');
        const baseline = await badges();
        assert.deepEqual(baseline.map(e=>e.kind), ['exif','gmi','gml','manual']);
        assert(baseline.every(e=>e.size===44 && e.corner && e.dot===e.border && e.glyphs===0), JSON.stringify(baseline));
        for (const source of PHOTO_POSITION_SOURCES) {
          const id = source.kind === 'exif' ? exif.id : source.kind === 'gml' ? gmlPhoto.id : repeated[source.kind === 'gmi' ? 0 : 1].id;
          await select(id);
          assert.equal(await browser.evaluate('document.querySelector(".photo-marker-selected .photo-thumb").dataset.positionSource'), source.kind);
          assert.equal(await browser.evaluate('document.querySelector(".photo-marker-selected .photo-thumb-source").getAttribute("aria-label")'), source.kind==='manual'?'Manuelt plassert':`Plassering fra ${source.label}`);
        }
        assert(await browser.evaluate(`Boolean(${arrowOf('document.querySelector(".photo-marker-selected")')})`));
        await screenshot('pass1c-four-source-thumbnails-workspace');
        await click('Tilbake til appen'); await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
        assert.deepEqual(await badges(), baseline, 'main map reuses exactly the same source dots and borders');
        await screenshot('pass1c-four-source-thumbnails-main-map');
        await click('Bildemodul'); await browser.waitFor(legend);
        await browser.evaluate(`${legend}.querySelector('[data-mode=markers]').click()`);
        await browser.waitFor(`${markers}.length === 4`);
        await select(repeated[1].id); // Restore this suite's manual-occurrence selection after re-entering the workspace.
      });
      await t.test('hidden layer, repeated workspace exits/entries, manual to GMI replacement and reset have no stale display card', async () => {
        const visibility = 'document.querySelector(".photo-workspace-visibility")';
        await enterEditMode(browser);
        assert.equal(await browser.evaluate(`${visibility}.getAttribute('aria-disabled')`), 'true', 'Edit mode keeps the layer visible');
        await browser.evaluate(`${visibility}.click()`);
        assert.equal(await browser.evaluate(`${markers}.length`), 4);
        await pressKey(browser, 'Escape', KEYS.Escape);
        await browser.waitFor(`!${commandBar}`);
        await browser.evaluate(`${visibility}.click()`);
        await browser.waitFor(`${markers}.length===0`);
        assert.notEqual(await cursor(), 'crosshair'); assert(await browser.evaluate(`Boolean(${legend})`));
        await browser.evaluate(`${visibility}.click()`);
        await browser.waitFor(`${markers}.length===4`);
        await applyPhotoSourcePositions(browser, 'gmi', { photoId: repeated[1].id });
        assert.equal(await sourceOfSelected(), 'gmi');
        for (let i = 0; i < 3; i++) {
          await enterEditMode(browser);
          // Back with no staged changes leaves Edit mode and the workspace without a prompt.
          await click('Tilbake til appen'); await browser.waitFor(`!${legend} && document.body.innerText.includes('Tegnforklaring')`);
          assert.equal(await browser.evaluate('Boolean(document.querySelector(".photo-edit-boundary[open]"))'), false);
          assert.notEqual(await cursor(), 'crosshair');
          await click('Bildemodul'); await browser.waitFor(legend);
          assert.equal(await browser.evaluate('document.body.innerText.includes("Tegnforklaring")'), false);
        }
        await click('Tilbake til appen');
        await browser.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
        await browser.waitFor('document.querySelector("button[aria-label=\\\"Nullstill og åpne ny fil\\\"]")');
        await browser.evaluate('document.querySelector("button[aria-label=\\\"Nullstill og åpne ny fil\\\"]").click()');
        await browser.waitFor(`!${legend} && !document.querySelector('.photo-workspace-shell') && ${markers}.length===0`);
        assert.equal(await browser.evaluate('Boolean(document.querySelector(".photo-edit-mode, .photo-edit-placing"))'), false);
        if (await browser.evaluate('Boolean(document.querySelector(".leaflet-container"))')) assert.notEqual(await cursor(), 'crosshair');
      });
    } finally {
      await browser.close();
      if (path.dirname(path.resolve(directory)) !== root || !path.basename(directory).startsWith('photo-marker-provenance-')) throw new Error('Unsafe fixture path');
      await rm(directory, { recursive: true, force: true });
    }
  });
