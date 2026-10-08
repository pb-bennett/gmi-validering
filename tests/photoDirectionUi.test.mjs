import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { gpsPng } from './helpers/photoGpsFixtures.mjs';

const app = process.env.PHOTO_UI_URL;
const corpus = process.env.PHOTO_GML_FIXTURE;
const tempRoot = path.resolve(tmpdir());

// Run all interactions even without private originals; never label synthetic checks real-corpus acceptance.
async function fixture() {
  if (corpus) return { gml: corpus, photos: (await readdir(path.join(path.dirname(corpus), 'Attachments')))
    .filter(name => /\.jpe?g$/i.test(name)).sort().map(name => path.join(path.dirname(corpus), 'Attachments', name)) };
  const directory = await mkdtemp(path.join(tempRoot, 'gmi-photo-direction-'));
  const photos = ['a.png', 'b.png'].map(name => path.join(directory, name));
  await Promise.all(photos.map(filename => writeFile(filename, gpsPng())));
  const members = photos.map((filename, i) => `<gml:featureMember><app:Skråfoto gml:id="photo-${i}"><gml:name>${path.basename(filename)}</gml:name><app:fotolink>${path.basename(filename)}</app:fotolink><app:fotograferingspunkt><gml:Point srsDimension="3"><gml:pos>${581930 + i * 20} 6566000 0</gml:pos></gml:Point></app:fotograferingspunkt><app:retningsvektor><app:Retning><app:retningsverdi>0</app:retningsverdi><app:retningsenhet>1</app:retningsenhet><app:retningsreferanse>1</app:retningsreferanse></app:Retning></app:retningsvektor></app:Skråfoto></gml:featureMember>`).join('');
  const gml = path.join(directory, 'directions.gml');
  await writeFile(gml, `<gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:app="http://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101"><gml:boundedBy><gml:Envelope srsName="EPSG:5972"/></gml:boundedBy>${members}</gml:FeatureCollection>`);
  return { directory, photos, gml };
}

test('FOTO direction: native slider, N/E/S/W geometry, explicit transactions, source independence, safety and connector anchors',
  { skip: !chromePath || !app, timeout: 240000 }, async () => {
    const files = await fixture(), browser = await openTestChrome(), screenshots = [];
    const spatial = 'document.querySelector(".photo-spatial-inspector")';
    const controls = 'document.querySelector(".photo-direction-controls")';
    const indicator = 'document.querySelector(".photo-direction-indicator")';
    const editor = 'document.querySelector(".photo-direction-editor")';
    const accepted = () => browser.evaluate(`${controls}.querySelector('.photo-direction-accepted').innerText`);
    const evidence = () => browser.evaluate(`Array.from(${spatial}.querySelectorAll('pre')).map(e=>e.textContent)`);
    const position = () => browser.evaluate(`Array.from(${spatial}.querySelectorAll('p')).find(e=>e.innerText.includes('(WGS84)')).innerText`);
    const click = (text, scope = 'document') => browser.evaluate(`(() => {
      const button=Array.from(${scope}.querySelectorAll('button')).find(e=>e.innerText.trim()===${JSON.stringify(text)});
      if(!button || button.disabled) throw new Error('Unavailable: '+${JSON.stringify(text)});button.click(); })()`);
    const inputFiles = async (selector, files) => {
      const { root } = await browser.send('DOM.getDocument');
      const { nodeId } = await browser.send('DOM.querySelector', { nodeId: root.nodeId, selector });
      assert(nodeId, selector); await browser.send('DOM.setFileInputFiles', { nodeId, files });
    };
    const frames = () => browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const settle = async () => { await browser.evaluate('new Promise(resolve=>setTimeout(resolve,400))'); await frames(); };
    const begin = async () => {
      await browser.waitFor('document.querySelector(".photo-direction-start") && !document.querySelector(".photo-direction-start").disabled');
      await click('Juster retning'); await browser.waitFor(editor);
    };
    const cancel = async () => { await click('Avbryt', controls); await browser.waitFor(`!${editor}`); };
    const apply = async () => { await click('Bruk retning', controls); await browser.waitFor(`!${editor}`); };
    const key = async (key, windowsVirtualKeyCode) => {
      await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key, windowsVirtualKeyCode });
      await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key, windowsVirtualKeyCode });
    };
    const number = async degrees => {
      // Native setter/input event drives React's normal field handler, without access to session writes.
      await browser.evaluate(`(() => {const input=${editor}.querySelector('input[type=number]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(String(degrees))});
        input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await browser.waitFor(`${editor}.querySelector('input[type=number]').value===${JSON.stringify(String(degrees))}`);
      await frames();
    };
    const dragSlider = async degrees => {
      await browser.evaluate(`${editor}.querySelector('input[type=range]').scrollIntoView({block:'center'})`);
      const { box, value } = await browser.evaluate(`({box:${editor}.querySelector('input[type=range]').getBoundingClientRect().toJSON(),value:Number(${editor}.querySelector('input[type=range]').value)})`);
      const x = box.left + 8 + (box.width - 16) * value / 359, y = box.top + box.height / 2;
      const target = box.left + 8 + (box.width - 16) * degrees / 359;
      await browser.send('Input.dispatchMouseEvent', { type:'mousePressed', x, y, button:'left', buttons:1, clickCount:1 });
      for (let i = 1; i <= 5; i++) await browser.send('Input.dispatchMouseEvent', { type:'mouseMoved', x:x+(target-x)*i/5, y, button:'left', buttons:1 });
      await browser.send('Input.dispatchMouseEvent', { type:'mouseReleased', x:target, y, button:'left', buttons:0, clickCount:1 });
      await frames();
      const actual = await browser.evaluate(`Number(${editor}.querySelector('input[type=range]').value)`);
      assert(Math.abs(actual - degrees) <= 2, `Dragged slider ${actual} ≈ ${degrees}`);
      return actual;
    };
    const assertHeading = async (degrees, proposed) => {
      await browser.waitFor(`${indicator}?.dataset.degrees===${JSON.stringify(String(degrees))}`);
      const geometry = await browser.evaluate(`(() => { const svg=${indicator}, g=svg.querySelector('g');
        const origin=new DOMPoint(32,32).matrixTransform(svg.getScreenCTM());
        const tip=new DOMPoint(32,3).matrixTransform(g.getScreenCTM());
        const marker=svg.parentElement.getBoundingClientRect();
        return {dx:tip.x-origin.x,dy:tip.y-origin.y,x:origin.x-(marker.left+marker.width/2),y:origin.y-(marker.top+marker.height/2),proposed:svg.dataset.proposed}; })()`);
      const radians = degrees * Math.PI / 180;
      assert(Math.abs(geometry.dx - 29 * Math.sin(radians)) < 0.1);
      assert(Math.abs(geometry.dy + 29 * Math.cos(radians)) < 0.1);
      assert(Math.abs(geometry.x) < 0.01 && Math.abs(geometry.y) < 0.01, 'rotation origin equals photo geographic anchor');
      assert.equal(geometry.proposed, String(proposed));
    };
    const assertAnchors = async (connector = false) => {
      const result = await browser.evaluate(`(() => {
        const center=e=>{const b=e.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};};
        const icons=Array.from(document.querySelectorAll('.photo-camera-marker,.photo-proposed-marker'));
        const offset=e=>{const marker=center(e),svg=e.querySelector('svg.photo-camera-glyph')||e.querySelector('svg'),b=svg.getBBox();
          const glyph=new DOMPoint(b.x+b.width/2,b.y+b.height/2).matrixTransform(svg.getScreenCTM());return Math.hypot(marker.x-glyph.x,marker.y-glyph.y);};
        const offsets=icons.map(offset);
        // Reproduce Leaflet's late display:block rule; the graphic must still meet its center anchor.
        const prior=icons.map(e=>e.style.display);icons.forEach(e=>e.style.display='block');
        const blockOffsets=icons.map(offset);icons.forEach((e,i)=>e.style.display=prior[i]);
        const line=document.querySelector('.photo-placement-connector');
        const endpoints=line?[line.getPointAtLength(0),line.getPointAtLength(line.getTotalLength())].map(p=>new DOMPoint(p.x,p.y).matrixTransform(line.getScreenCTM())):[];
        const markers=[document.querySelector('.photo-camera-marker-selected'),document.querySelector('.photo-proposed-marker')];
        return {maxOffset:Math.max(...offsets,...blockOffsets),offsets,blockOffsets,variants:icons.map(e=>e.className),endpointErrors:endpoints.map((p,i)=>{const c=center(markers[i]);return Math.hypot(p.x-c.x,p.y-c.y);})}; })()`);
      assert(result.maxOffset < 0.01, 'normal/selected/proposal graphic bounds coincide with icon anchors, including display:block: '+JSON.stringify(result));
      if (connector) { assert.equal(result.endpointErrors.length, 2); assert(result.endpointErrors.every(error => error <= 1.5), JSON.stringify(result)); }
      return result;
    };
    const mapClick = async (dx, dy) => {
      const box = await browser.evaluate('document.querySelector(".leaflet-container").getBoundingClientRect().toJSON()');
      const x = box.left + box.width / 2 + dx, y = box.top + box.height / 2 + dy;
      await browser.send('Input.dispatchMouseEvent', { type:'mousePressed', x, y, button:'left', buttons:1, clickCount:1 });
      await browser.send('Input.dispatchMouseEvent', { type:'mouseReleased', x, y, button:'left', buttons:0, clickCount:1 });
      await browser.waitFor('document.querySelector(".photo-proposed-marker")'); await frames();
    };
    const screenshot = async name => {
      if (!process.env.PHOTO_SCREENSHOT_DIR) return;
      await frames(); await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive:true });
      const { data } = await browser.send('Page.captureScreenshot', { format:'png' });
      const filename = path.join(process.env.PHOTO_SCREENSHOT_DIR, `${name}.png`);
      await writeFile(filename, Buffer.from(data, 'base64')); screenshots.push(filename);
    };
    const select = async index => { await browser.evaluate(`document.querySelectorAll('.photo-workspace-list li button')[${index}].click()`); await browser.waitFor(`!${editor}`); };
    try {
      await browser.send('Emulation.setDeviceMetricsOverride', { width:1680, height:900, deviceScaleFactor:1, mobile:false });
      await browser.send('Page.navigate', { url:app+'?testmodus=1' });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
      await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
      const create = async () => {
        await click('Bilder'); await browser.waitFor('document.querySelector(".photo-collection-dialog[open]")');
        await inputFiles('input[aria-label="Velg bildefiler"]', files.photos);
        await inputFiles('input[aria-label="Velg GML med bildeposisjoner"]', [files.gml]);
        await browser.waitFor(`document.querySelector('.photo-collection-dialog').innerText.includes('${files.photos.length} treff')`);
        await browser.waitFor(`document.querySelectorAll('.photo-collection-card img').length===${files.photos.length}`, 60000);
        await click(`Opprett fotokartlag (${files.photos.length} bilder)`);
        await click('Bildemodul'); await browser.waitFor(`document.querySelectorAll('.photo-camera-marker').length===${files.photos.length}`);
        await browser.waitFor(`document.querySelector('.photo-collection-original img')?.naturalWidth>0`);
        await click('Zoom til posisjon', spatial); await settle();
      };
      await create();
      assert.equal(await accepted(), 'Ikke angitt'); assert.equal(await browser.evaluate(indicator), null);
      const originalPosition = await position(), originalEvidence = await evidence();
      assert(originalEvidence.some(text => text.includes('"valueText": "0"')));
      await assertAnchors(); await begin();
      assert.equal(await accepted(), 'Ikke angitt'); await assertHeading(0, true);
      for (const degrees of [0,90,180,270]) {
        const dragged = await dragSlider(degrees); await assertHeading(dragged, true);
        await number(degrees); await assertHeading(degrees, true);
        assert.equal(await accepted(), 'Ikke angitt'); assert.equal(await position(), originalPosition);
        await screenshot(`direction-proposed-${degrees}-1680`);
      }
      await cancel(); assert.equal(await accepted(), 'Ikke angitt'); assert.equal(await browser.evaluate(indicator), null);
      await begin(); await dragSlider(45); await number(45); await apply();
      assert.equal(await accepted(), '45°'); await assertHeading(45, false);
      await begin(); for (const degrees of [120,220,350]) await dragSlider(degrees);
      await cancel(); assert.equal(await accepted(), '45°'); await assertHeading(45, false);
      await begin(); await number(42); await apply(); assert.equal(await accepted(), '42°');
      await begin(); await number(90); await apply(); await assertHeading(90, false);
      // Native keyboard stepping and explicit wrap buttons.
      await begin(); await browser.evaluate(`${editor}.querySelector('input[type=range]').focus()`);
      await key('Home',36); await assertHeading(0, true); await key('ArrowRight',39); await assertHeading(1, true);
      await key('End',35); await assertHeading(359, true);
      await click('+1°',controls); await assertHeading(0,true); await click('−1°',controls); await assertHeading(359,true);
      await number('');
      assert(await browser.evaluate(`Array.from(${editor}.querySelectorAll('button')).find(e=>e.innerText==='Bruk retning').disabled`));
      await number(90); await browser.evaluate(`${editor}.querySelector('input[type=range]').focus()`);
      await key('Escape',27); await browser.waitFor(`!${editor}`); await assertHeading(90, false);
      // Both transaction starts discard the other proposal.
      await begin(); await number(180); await click('Flytt på kartet'); await browser.waitFor('document.querySelector(".photo-placement-active")');
      assert.equal(await browser.evaluate(editor), null); await assertHeading(90, false);
      for (const [dx,dy] of [[90,40],[-70,50],[50,-70],[-60,-50]]) { await mapClick(dx,dy); await assertAnchors(true); }
      // Drag and keyboard adjust only the placement proposal, retaining accepted heading/position.
      const box = await browser.evaluate('document.querySelector(".photo-proposed-marker").getBoundingClientRect().toJSON()');
      const beforeDrag = await browser.evaluate('document.querySelector(".photo-manual-controls").innerText');
      const x = box.left + 16, y = box.top + 16;
      await browser.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
      for(let i=1;i<=5;i++) await browser.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+i*5,y:y+i*3,button:'left',buttons:1});
      await browser.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+25,y:y+15,button:'left',buttons:0,clickCount:1});
      await browser.waitFor(`document.querySelector('.photo-manual-controls').innerText!==${JSON.stringify(beforeDrag)}`);
      await browser.evaluate('document.querySelector(".photo-proposed-marker").focus()');
      const beforeKey = await browser.evaluate('document.querySelector(".photo-manual-controls").innerText');
      await key('ArrowRight',39); await browser.waitFor(`document.querySelector('.photo-manual-controls').innerText!==${JSON.stringify(beforeKey)}`);
      await assertAnchors(true); assert.equal(await position(),originalPosition); await assertHeading(90,false);
      await screenshot('direction-placement-connector-1680');
      await begin(); assert.equal(await browser.evaluate('document.querySelector(".photo-proposed-marker")'), null);
      assert.equal(await browser.evaluate('document.querySelector(".photo-placement-active")'), null); await cancel();
      await click('Flytt på kartet'); await mapClick(80,40); await click('Bruk plassering','document.querySelector(".photo-manual-controls")');
      await browser.waitFor(`${spatial}.innerText.includes('Gjeldende posisjon (Manuell)')`);
      assert.equal(await accepted(),'90°'); await assertHeading(90,false); assert.notEqual(await position(),originalPosition);
      await click('Bruk GML-posisjon',spatial); assert.equal(await position(),originalPosition); assert.equal(await accepted(),'90°');
      await browser.waitFor(`Array.from(${spatial}.querySelectorAll('button')).some(e=>e.innerText==='Bruk EXIF-posisjon')`);
      await click('Bruk EXIF-posisjon',spatial); assert.equal(await accepted(),'90°'); assert.deepEqual(await evidence(),originalEvidence);
      // Wizard only changes positions; it cancels any direction proposal before opening.
      await begin(); await number(180); await click('Posisjoner bilder'); await browser.waitFor('document.querySelector(".photo-positioning-wizard[open]")');
      assert.equal(await browser.evaluate(editor),null);
      await browser.evaluate('document.querySelector(".photo-positioning-wizard input[value=exif]").click()');
      await click('Neste','document.querySelector(".photo-positioning-wizard")'); await browser.waitFor('document.querySelector(".photo-positioning-rows")');
      await click('Neste','document.querySelector(".photo-positioning-wizard")'); await browser.waitFor('document.querySelector(".photo-positioning-summary")');
      await click(`Bruk EXIF-posisjon for ${files.photos.length} bilder`,'document.querySelector(".photo-positioning-wizard")');
      await browser.waitFor('!document.querySelector(".photo-positioning-wizard")'); assert.equal(await accepted(),'90°');
      await select(1); assert.equal(await accepted(),'Ikke angitt'); assert.equal(await browser.evaluate(indicator),null);
      await begin(); await apply(); assert.equal(await accepted(),'0°'); await assertHeading(0,false);
      await begin(); await number(200); await select(0); assert.equal(await accepted(),'90°'); await assertHeading(90,false);
      for (const [width,height] of [[1024,620],[390,700]]) {
        await browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false}); await settle();
        await begin(); await dragSlider(270); await number(270); await assertHeading(270,true); await assertAnchors();
        assert(await browser.evaluate('document.querySelector(".photo-workspace-shell").scrollWidth<=innerWidth+1'));
        await browser.evaluate(`${editor}.querySelector('button:last-of-type').scrollIntoView({block:'center'})`);
        assert(await browser.evaluate(`${editor}.querySelector('button:last-of-type').getBoundingClientRect().bottom<=innerHeight`));
        await screenshot(`direction-editor-${width}`); await cancel(); await assertHeading(90,false);
      }
      await browser.send('Emulation.setDeviceMetricsOverride',{width:1680,height:900,deviceScaleFactor:1,mobile:false}); await settle();
      await click('Zoom til posisjon',spatial); await settle();
      // Zoom changes geographic projection, never heading/anchor.
      await browser.evaluate('document.querySelector(".leaflet-control-zoom-in").click()'); await settle(); await assertHeading(90,false); await assertAnchors();
      const map = await browser.evaluate('document.querySelector(".leaflet-container").getBoundingClientRect().toJSON()');
      const panX = map.left + map.width / 2, panY = map.top + map.height / 2;
      const beforePan = await browser.evaluate('document.querySelector(".leaflet-map-pane").style.transform');
      await browser.send('Input.dispatchMouseEvent',{type:'mousePressed',x:panX,y:panY,button:'left',buttons:1,clickCount:1});
      for(let i=1;i<=5;i++) { await browser.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:panX+i*10,y:panY+i*6,button:'left',buttons:1}); await frames(); }
      await browser.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:panX+50,y:panY+30,button:'left',buttons:0,clickCount:1});
      await settle(); assert.notEqual(await browser.evaluate('document.querySelector(".leaflet-map-pane").style.transform'),beforePan);
      await assertHeading(90,false); await assertAnchors();
      await begin(); await number(180); await click('Legg til bilder'); await browser.waitFor('document.querySelector(".photo-collection-dialog[open]")');
      assert.equal(await browser.evaluate(editor),null); await click('Avbryt','document.querySelector(".photo-collection-dialog")'); assert.equal(await accepted(),'90°');
      await begin(); await browser.evaluate('document.querySelector(".photo-workspace-collection header input").click()');
      await browser.waitFor(`!${editor}`); assert.equal(await accepted(),'90°');
      await browser.evaluate('document.querySelector(".photo-workspace-collection header input").click()');
      await begin(); await click('Tilbake til appen'); await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
      assert.equal(await browser.evaluate(editor),null); assert.equal(await browser.evaluate(indicator),null);
      await click('Bildemodul'); await browser.waitFor(controls); assert.equal(await accepted(),'90°');
      await begin(); await number(180); await browser.evaluate('document.querySelector(".photo-workspace-active input").click()'); await click('Fjern fra lag');
      assert.equal(await browser.evaluate(editor),null); await click('Fjern fra lag','document.querySelector(".photo-remove-confirmation")');
      await browser.waitFor(`document.querySelectorAll('.photo-camera-marker').length===${files.photos.length-1}`);
      await begin(); await click('Tilbake til appen'); await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
      await browser.evaluate(`document.querySelector('button[aria-label^="Fjern fotokartlag"]').click()`); await click('Fjern');
      await browser.waitFor('!document.querySelector("section[aria-label^=Fotokartlag]")'); assert.equal(await browser.evaluate(indicator),null);
      await create(); await begin(); await number(90); await browser.send('Page.reload');
      await browser.waitFor('!document.querySelector(".photo-workspace-shell") && !document.querySelector(".photo-direction-indicator")');
      console.log(JSON.stringify({fixture:corpus?'real Ekenesstokken':'synthetic',photos:files.photos.length,checks:'slider drag, numeric/±1/native keyboard, unknown/north, cardinal geometry, apply/cancel, position/source/wizard independence, selection/visibility/dialog/exit/removal/delete/reload safety, connector SVG centers/endpoints, desktop/short/narrow layouts',screenshots}));
    } catch (error) {
      console.log(await browser.evaluate(`({editor:${editor}?.innerText,spatial:${spatial}?.innerText,
        paths:Array.from(document.querySelectorAll('.leaflet-overlay-pane path,.leaflet-photo-placement-pane path')).map(e=>e.outerHTML),
        placement:document.querySelector('.leaflet-photo-placement-pane')?.innerHTML})`));
      throw error;
    } finally {
      await browser.close();
      if(files.directory) {
        if(path.dirname(path.resolve(files.directory))!==tempRoot || !path.basename(files.directory).startsWith('gmi-photo-direction-')) throw new Error('Unsafe fixture path');
        await rm(files.directory,{recursive:true,force:true});
      }
    }
  });
