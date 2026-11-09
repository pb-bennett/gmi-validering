import { createLayerWithoutPlacement, retainGmlInWorkspace } from './helpers/photoImportWizard.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { applyPhotoSourcePositions, clickSourceControl } from './helpers/photoSourceWorkflow.mjs';
import { gpsPng } from './helpers/photoGpsFixtures.mjs';
import { KEYS, arrowOf, commandBar, discardEdits, dragSelectedMarker, editKnob, editTarget, elementCentre, enterEditMode, pressKey, rotateSelected, saveEdits } from './helpers/photoWorkspace.mjs';

const app = process.env.PHOTO_UI_URL;
const tempRoot = path.resolve(tmpdir());

// Run all interactions even without private originals; never label synthetic checks real-corpus acceptance.
async function fixture() {
  const directory = await mkdtemp(path.join(tempRoot, 'gmi-photo-direction-'));
  const photos = ['a.png', 'b.png'].map(name => path.join(directory, name));
  await Promise.all(photos.map(filename => writeFile(filename, gpsPng())));
  const members = photos.map((filename, i) => `<gml:featureMember><app:Skråfoto gml:id="photo-${i}"><gml:name>${path.basename(filename)}</gml:name><app:fotolink>${path.basename(filename)}</app:fotolink><app:fotograferingspunkt><gml:Point srsDimension="3"><gml:pos>${581930 + i * 20} 6566000 0</gml:pos></gml:Point></app:fotograferingspunkt></app:Skråfoto></gml:featureMember>`).join('');
  const gml = path.join(directory, 'directions.gml');
  await writeFile(gml, `<gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:app="http://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101"><gml:boundedBy><gml:Envelope srsName="EPSG:5972"/></gml:boundedBy>${members}</gml:FeatureCollection>`);
  return { directory, photos, gml };
}

test('FOTO direction in Edit mode: unknown is not north, N/Ø/S/V geometry, staged vs accepted, transactions, source independence and layouts',
  { skip: !chromePath || !app, timeout: 300000 }, async () => {
    const files = await fixture(), browser = await openTestChrome(), screenshots = [];
    const inspector = 'document.querySelector(".photo-workspace-inspector")';
    const fact = (term) => `Array.from(${inspector}.querySelectorAll('section[aria-label=Plassering] dt')).find(e=>e.textContent===${JSON.stringify(term)})?.nextElementSibling.textContent.trim()`;
    const accepted = () => browser.evaluate(fact('Retning'));
    const position = () => browser.evaluate(fact('Koordinater'));
    const evidence = () => browser.evaluate(`Array.from(${inspector}.querySelectorAll('.photo-inspector-raw pre')).map(e=>e.textContent)`);
    const selectedIcon = `(${editTarget} || document.querySelector('.photo-camera-marker-selected'))`;
    const indicator = arrowOf(selectedIcon);
    const click = (text, scope = 'document') => clickSourceControl(browser, text, scope);
    const frames = () => browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const settle = async () => { await browser.evaluate('new Promise(resolve=>setTimeout(resolve,400))'); await frames(); };
    const editCount = 'Number(document.querySelector("[data-edit-count]")?.innerText.match(/\\d+/)?.[0] || 0)';
    const number = async (degrees) => {
      await browser.evaluate(`(() => {const input=${commandBar}.querySelector('input[type=number]'); input.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(String(degrees))});
        input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await pressKey(browser, 'Enter', KEYS.Enter);
      await browser.evaluate('document.activeElement.blur()');
      await frames();
    };
    // The arrow rotates inside its SVG around the geographic anchor: 0° = up/north, clockwise.
    const assertHeading = async (degrees, staged) => {
      await browser.waitFor(`${indicator}?.dataset.degrees===${JSON.stringify(String(degrees))}`);
      const geometry = await browser.evaluate(`(() => { const svg=${indicator}, g=svg.querySelector('g');
        const origin=new DOMPoint(32,32).matrixTransform(svg.getScreenCTM());
        const tip=new DOMPoint(32,3).matrixTransform(g.getScreenCTM());
        const marker=svg.parentElement.getBoundingClientRect();
        return {dx:tip.x-origin.x,dy:tip.y-origin.y,x:origin.x-(marker.left+marker.width/2),y:origin.y-(marker.top+marker.height/2),staged:svg.dataset.staged}; })()`);
      const radians = degrees * Math.PI / 180;
      assert(Math.abs(geometry.dx - 29 * Math.sin(radians)) < 0.1, JSON.stringify(geometry));
      assert(Math.abs(geometry.dy + 29 * Math.cos(radians)) < 0.1, JSON.stringify(geometry));
      assert(Math.abs(geometry.x) < 0.01 && Math.abs(geometry.y) < 0.01, 'rotation origin equals photo geographic anchor');
      assert.equal(geometry.staged, String(staged));
    };
    const assertAnchors = async () => {
      const result = await browser.evaluate(`(() => {
        const center=e=>{const b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};};
        const icons=Array.from(document.querySelectorAll('.photo-camera-marker'));
        const offset=e=>{const marker=center(e),svg=e.querySelector('svg.photo-camera-glyph'),b=svg.getBBox();
          const glyph=new DOMPoint(b.x+b.width/2,b.y+b.height/2).matrixTransform(svg.getScreenCTM());return Math.hypot(marker.x-glyph.x,marker.y-glyph.y);};
        const prior=icons.map(e=>e.style.display), offsets=icons.map(offset);
        icons.forEach(e=>e.style.display='block'); const blockOffsets=icons.map(offset); icons.forEach((e,i)=>e.style.display=prior[i]);
        return {maxOffset:Math.max(...offsets,...blockOffsets),count:icons.length}; })()`);
      assert(result.maxOffset < 0.01, 'graphic bounds coincide with icon anchors, including display:block: ' + JSON.stringify(result));
    };
    const screenshot = async name => {
      if (!process.env.PHOTO_SCREENSHOT_DIR) return;
      await frames(); await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive:true });
      const { data } = await browser.send('Page.captureScreenshot', { format:'png' });
      const filename = path.join(process.env.PHOTO_SCREENSHOT_DIR, `${name}.png`);
      await writeFile(filename, Buffer.from(data, 'base64')); screenshots.push(filename);
    };
    const select = async index => {
      await browser.evaluate(`document.querySelectorAll('.photo-workspace-list .photo-workspace-row')[${index}].click()`);
      await browser.waitFor(`document.querySelectorAll('.photo-workspace-list .photo-workspace-row')[${index}].getAttribute('aria-pressed')==='true'`);
    };
    try {
      await browser.send('Emulation.setDeviceMetricsOverride', { width:1680, height:900, deviceScaleFactor:1, mobile:false });
      await browser.send('Page.navigate', { url:app+'?testmodus=1' });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
      await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
      const create = async () => {
        await click('Bilder'); await browser.waitFor('document.querySelector(".photo-collection-dialog[open]")');
        const { root } = await browser.send('DOM.getDocument');
        const { nodeId } = await browser.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[aria-label="Velg bildefiler"]' });
        await browser.send('DOM.setFileInputFiles', { nodeId, files: files.photos });
        await browser.waitFor(`document.querySelectorAll('.photo-collection-card img').length===${files.photos.length}`, 60000);
        await createLayerWithoutPlacement(browser);
        await retainGmlInWorkspace(browser, files.gml);
        await browser.waitFor('document.querySelector(".photo-workspace-shell")');
        await applyPhotoSourcePositions(browser, 'gml');
        await browser.waitFor(`document.querySelectorAll('.photo-camera-marker').length===${files.photos.length}`);
        await select(0);
        await browser.waitFor(`document.querySelector('.photo-collection-original img')?.naturalWidth>0`);
        await click(await browser.evaluate(`${inspector}.querySelector('.photo-inspector-locate').getAttribute('aria-label')`)); await settle();
      };
      await create();
      assert.equal(await accepted(), '0° N'); assert.equal(await browser.evaluate(`Boolean(${indicator})`), true);
      const originalPosition = await position(), originalEvidence = await evidence();
      assert.equal(await browser.evaluate(fact('Retningskilde')).then((text) => text.startsWith('Standardverdi, ingen kilde oppgir retning')), true, 'a default says that it is one');
      await assertAnchors();

      // A default is an ordinary north heading on the map and in Edit mode; only the provenance differs.
      await enterEditMode(browser);
      assert(!await browser.evaluate(`${editKnob}.classList.contains('photo-edit-knob-ghost')`));
      assert.equal(await browser.evaluate(`Boolean(${indicator})`), true);
      assert.equal(await browser.evaluate(`document.querySelector('.photo-edit-direction-field input').value`), '0');
      for (const degrees of [90, 180, 270]) {
        await number(degrees); await assertHeading(degrees, true);
        assert.equal(await position(), originalPosition);
        await screenshot(`direction-staged-${degrees}-1680`);
      }
      await rotateSelected(browser, 45);
      await browser.waitFor(`Math.abs(Number(${indicator}?.dataset.degrees) - 45) <= 2`);
      await discardEdits(browser);
      assert.equal(await accepted(), '0° N'); assert.equal(await browser.evaluate(`Boolean(${indicator})`), true);

      await enterEditMode(browser); await number(45); await saveEdits(browser);
      assert.equal(await accepted(), '45° NØ'); await assertHeading(45, false);
      await enterEditMode(browser); for (const degrees of [120, 220, 350]) await number(degrees);
      await discardEdits(browser); assert.equal(await accepted(), '45° NØ'); await assertHeading(45, false);
      await enterEditMode(browser); await number(42); await saveEdits(browser); assert.equal(await accepted(), '42° NØ');
      await enterEditMode(browser); await number(90); await saveEdits(browser); await assertHeading(90, false);
      assert.equal(await position(), originalPosition); assert.deepEqual(await evidence(), originalEvidence);

      // Keyboard on the knob (slider): ±1, Shift ±15; an empty numeric value never clears a direction.
      await enterEditMode(browser);
      await pressKey(browser, 'Shift', { code: 'ShiftLeft', keyCode: 16 }); await browser.evaluate(`${editKnob}.focus()`);
      await pressKey(browser, 'ArrowRight', KEYS.ArrowRight); await assertHeading(91, true);
      await pressKey(browser, 'ArrowLeft', { ...KEYS.ArrowLeft, modifiers: 8 }); await assertHeading(76, true);
      await number(''); await assertHeading(76, true);
      await discardEdits(browser); await assertHeading(90, false);

      // A staged move never changes the accepted direction; both commit together.
      await enterEditMode(browser);
      await dragSelectedMarker(browser, 80, 40);
      await browser.waitFor(`${editCount} === 1`);
      await assertHeading(90, false);
      await saveEdits(browser);
      assert.equal(await accepted(), '90° Ø'); assert.notEqual(await position(), originalPosition);
      assert.equal(await browser.evaluate(fact('Kilde')), 'Manuell');
      const activeFilename = await browser.evaluate(`${inspector}.querySelector('h2').innerText`);
      await applyPhotoSourcePositions(browser, 'gml', { filename: activeFilename }); assert.equal(await position(), originalPosition); assert.equal(await accepted(), '90° Ø');
      await applyPhotoSourcePositions(browser, 'exif', { filename: activeFilename }); assert.equal(await accepted(), '90° Ø'); assert.deepEqual(await evidence(), originalEvidence);

      // Staging survives selection changes, and occurrences are independent.
      await enterEditMode(browser);
      await select(1); assert.equal(await accepted(), '0° N'); assert.equal(await browser.evaluate(`Boolean(${indicator})`), true);
      await number(180); await assertHeading(180, true);
      await select(0); await assertHeading(90, false);
      await select(1); await assertHeading(180, true);
      await saveEdits(browser); assert.equal(await accepted(), '180° S'); await assertHeading(180, false);

      for (const [width, height] of [[1024, 620], [390, 700]]) {
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor:1, mobile:false }); await settle();
        await enterEditMode(browser); await number(270); await assertHeading(270, true); await assertAnchors();
        assert(await browser.evaluate('document.querySelector(".photo-workspace-shell").scrollWidth<=innerWidth+1'));
        await screenshot(`direction-edit-${width}`); await discardEdits(browser); await assertHeading(180, false);
      }
      await browser.send('Emulation.setDeviceMetricsOverride', { width:1680, height:900, deviceScaleFactor:1, mobile:false }); await settle();
      await select(0);
      await click(await browser.evaluate(`${inspector}.querySelector('.photo-inspector-locate').getAttribute('aria-label')`)); await settle();
      // Zoom and pan change projection, never heading or anchor.
      await browser.evaluate('document.querySelector(".leaflet-control-zoom-in").click()'); await settle(); await assertHeading(90, false); await assertAnchors();
      const map = await browser.evaluate('document.querySelector(".leaflet-container").getBoundingClientRect().toJSON()');
      const start = { x: map.left + map.width / 2 + 120, y: map.top + map.height / 2 + 120 };
      const beforePan = await browser.evaluate('document.querySelector(".leaflet-map-pane").style.transform');
      await browser.send('Input.dispatchMouseEvent', { type:'mousePressed', x:start.x, y:start.y, button:'left', buttons:1, clickCount:1 });
      for (let i = 1; i <= 5; i++) { await browser.send('Input.dispatchMouseEvent', { type:'mouseMoved', x:start.x+i*10, y:start.y+i*6, button:'left', buttons:1 }); await frames(); }
      await browser.send('Input.dispatchMouseEvent', { type:'mouseReleased', x:start.x+50, y:start.y+30, button:'left', buttons:0, clickCount:1 });
      await settle(); assert.notEqual(await browser.evaluate('document.querySelector(".leaflet-map-pane").style.transform'), beforePan);
      await assertHeading(90, false); await assertAnchors();

      // Staged direction never leaks: boundary on Legg til bilder, and a reload loses the uncommitted session.
      await enterEditMode(browser); await number(180);
      await click('Legg til bilder'); await browser.waitFor('document.querySelector(".photo-edit-boundary[open]")');
      await click('Forkast endringer', 'document.querySelector(".photo-edit-boundary")');
      await browser.waitFor('document.querySelector(".photo-collection-dialog[open]")');
      await click('Avbryt', 'document.querySelector(".photo-collection-dialog")');
      assert.equal(await accepted(), '90° Ø');
      await enterEditMode(browser); await number(180); await browser.send('Page.reload');
      await browser.waitFor('!document.querySelector(".photo-workspace-shell") && !document.querySelector(".photo-direction-indicator") && !document.querySelector(".photo-direction-marker")');
      console.log(JSON.stringify({ fixture: 'synthetic', photos: files.photos.length,
        checks: 'unknown/ghost, N/Ø/S/V geometry, staged dashed vs accepted solid, discard/save, knob drag/keyboard, numeric, move independence, source independence, occurrence independence, zoom/pan, boundary, reload', screenshots }));
    } catch (error) {
      console.log(await browser.evaluate(`({bar:${commandBar}?.innerText,inspector:${inspector}?.innerText?.slice(0,1500)})`).catch(() => null));
      throw error;
    } finally {
      await browser.close();
      if (files.directory) {
        if (path.dirname(path.resolve(files.directory)) !== tempRoot || !path.basename(files.directory).startsWith('gmi-photo-direction-')) throw new Error('Unsafe fixture path');
        await rm(files.directory, { recursive: true, force: true });
      }
    }
  });
