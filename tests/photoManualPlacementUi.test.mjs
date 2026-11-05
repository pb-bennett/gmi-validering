import { createLayerWithoutPlacement, retainGmlInWorkspace } from './helpers/photoImportWizard.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { applyPhotoSourcePositions, clickSourceControl, closePhotoSources } from './helpers/photoSourceWorkflow.mjs';
import { KEYS, commandBar, discardEdits, dragSelectedMarker, editTarget, enterEditMode, pressKey, saveEdits } from './helpers/photoWorkspace.mjs';

const app = process.env.PHOTO_UI_URL, gml = process.env.PHOTO_GML_FIXTURE;
test('manual FOTO placement in Edit mode: real corpus, click/drag/keyboard, staged-only transactions, sources, safety and layouts',
  { skip: !chromePath || !app || !gml, timeout: 300000 }, async () => {
    const browser = await openTestChrome();
    const inspector = 'document.querySelector(".photo-workspace-inspector")';
    const markerCount = 'document.querySelectorAll(".photo-camera-marker").length';
    const popupCount = 'document.querySelectorAll(".photo-map-popup").length';
    const editCount = 'Number(document.querySelector("[data-edit-count]")?.innerText.match(/\\d+/)?.[0] || 0)';
    const click = (text, scope = 'document') => clickSourceControl(browser, text, scope);
    const fact = (term) => `Array.from(${inspector}.querySelectorAll('section[aria-label=Plassering] dt')).find(e=>e.textContent===${JSON.stringify(term)})?.nextElementSibling.textContent.trim()`;
    const inputFiles = async (selector, files) => {
      const { root } = await browser.send('DOM.getDocument');
      const { nodeId } = await browser.send('DOM.querySelector', { nodeId: root.nodeId, selector });
      assert(nodeId, selector); await browser.send('DOM.setFileInputFiles', { nodeId, files });
    };
    const settleMapLayout = async () => {
      await browser.waitFor(`!document.getAnimations().some(animation => animation.playState==='running'
        && animation.effect?.target instanceof Element && animation.effect.target.contains(document.querySelector('.leaflet-container')))`);
      await browser.evaluate('new Promise(resolve=>setTimeout(resolve,400))');
      await browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    };
    const mapClick = async (dx = 0, dy = 0) => {
      const box = await browser.evaluate('document.querySelector(".leaflet-container").getBoundingClientRect().toJSON()');
      const x = box.left + box.width / 2 + dx, y = box.top + box.height / 2 + dy;
      const before = await browser.evaluate(editCount);
      await browser.send('Input.dispatchMouseEvent', { type:'mousePressed', x,y,button:'left',buttons:1,clickCount:1 });
      await browser.send('Input.dispatchMouseEvent', { type:'mouseReleased', x,y,button:'left',buttons:0,clickCount:1 });
      await browser.waitFor(`${editTarget} && ${editCount} >= ${before}`);
    };
    const currentText = () => browser.evaluate(`${fact('Koordinater')} || ${fact('Status')}`);
    const evidence = () => browser.evaluate(`Array.from(${inspector}.querySelectorAll('.photo-inspector-raw pre')).map(e=>e.textContent)`);
    const transforms = () => browser.evaluate('Array.from(document.querySelectorAll(".leaflet-photo-markers-pane .photo-camera-marker")).map(e=>e.style.transform)');
    const screenshots = [];
    const screenshot = async (name) => {
      if (!process.env.PHOTO_SCREENSHOT_DIR) return;
      await browser.waitFor(`!document.querySelector('.leaflet-container.leaflet-zoom-anim') && Array.from(document.querySelectorAll('.leaflet-tile')).every(e=>e.complete)`);
      await browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive:true });
      const { data } = await browser.send('Page.captureScreenshot', { format:'png' });
      const filename = path.join(process.env.PHOTO_SCREENSHOT_DIR, name+'.png');
      await writeFile(filename, Buffer.from(data,'base64')); screenshots.push(filename);
    };
    const selectIndex = async index => {
      await browser.evaluate(`document.querySelectorAll('.photo-workspace-list .photo-workspace-row')[${index}].click()`);
      await browser.waitFor(`document.querySelectorAll('.photo-workspace-list .photo-workspace-row')[${index}].getAttribute('aria-pressed')==='true'`);
    };
    const boundary = 'document.querySelector(".photo-edit-boundary[open]")';
    const deleteLayer = async () => {
      await click('Tilbake til appen');
      await browser.evaluate(`document.querySelector('button[aria-label^="Fjern fotokartlag"]').click()`);
      await click('Fjern'); await browser.waitFor('!document.querySelector("section[aria-label^=Fotokartlag]")');
    };
    try {
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const urls=new Set(), create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
        URL.createObjectURL=value=>{const url=create(value);if(value instanceof File){urls.add(url);window.__originalCreated++;window.__originalCreatedByName.set(value.name,(window.__originalCreatedByName.get(value.name)||0)+1);}return url;};URL.revokeObjectURL=url=>{urls.delete(url);revoke(url);};window.__originalUrls=urls;window.__originalCreated=0;window.__originalCreatedByName=new Map(); })();` });
      await browser.send('Emulation.setDeviceMetricsOverride', { width:1680,height:900,deviceScaleFactor:1,mobile:false });
      await browser.send('Page.navigate', { url:app+'?testmodus=1' });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
      await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
      const photos = (await readdir(path.join(path.dirname(gml),'Attachments'))).filter(name=>/\.jpe?g$/i.test(name)).sort().map(name=>path.join(path.dirname(gml),'Attachments',name));
      assert.equal(photos.length,148);
      const create = async positioned => {
        await click('Bilder'); await browser.waitFor('document.querySelector(".photo-collection-dialog[open]")');
        await inputFiles('input[aria-label="Velg bildefiler"]',photos);
        await browser.waitFor('document.querySelectorAll(".photo-collection-card img").length===148',60000);
        await createLayerWithoutPlacement(browser);
        if (positioned) await retainGmlInWorkspace(browser, gml);
        await browser.waitFor('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length===148');
        if (positioned) await applyPhotoSourcePositions(browser, 'gml');
        await browser.waitFor('document.querySelector(".photo-collection-original img")?.naturalWidth>0');
        await browser.waitFor('window.__originalUrls.size===1');
        await settleMapLayout();
      };
      await create(false); const inspectedName = await browser.evaluate(`${inspector}.querySelector('h2').innerText`);
      const initialOriginalCreated = await browser.evaluate(`window.__originalCreatedByName.get(${JSON.stringify(inspectedName)})`); assert.equal(await browser.evaluate(markerCount),0);

      // Unplaced selection in Edit mode: click capture with crosshair; a pan never places but still pans.
      await enterEditMode(browser);
      await browser.waitFor('document.querySelector(".leaflet-container.photo-edit-placing")');
      assert.equal(await browser.evaluate('getComputedStyle(document.querySelector(".leaflet-container")).cursor'), 'crosshair');
      const beforePan=await browser.evaluate('document.querySelector(".leaflet-map-pane").style.transform');
      const mapBox=await browser.evaluate('document.querySelector(".leaflet-container").getBoundingClientRect().toJSON()');
      const panX=mapBox.left+mapBox.width/2, panY=mapBox.top+mapBox.height/2;
      await browser.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:panX,y:panY,buttons:0});
      await browser.send('Input.dispatchMouseEvent',{type:'mousePressed',x:panX,y:panY,button:'left',buttons:1,clickCount:1});
      for(let n=1;n<=5;n++) { await browser.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:panX+n*12,y:panY+n*8,buttons:1,button:'left'}); await browser.evaluate('new Promise(resolve=>requestAnimationFrame(resolve))'); }
      await browser.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:panX+60,y:panY+40,button:'left',buttons:0,clickCount:1});
      await browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      assert.equal(await browser.evaluate(editCount),0,'map pan never places');
      assert.notEqual(await browser.evaluate('document.querySelector(".leaflet-map-pane").style.transform'),beforePan,'map still pans during placement capture');
      await mapClick();
      assert.equal(await browser.evaluate(editCount),1);
      assert.equal(await browser.evaluate(`document.querySelectorAll('.leaflet-photo-markers-pane .photo-camera-marker').length`),0, 'the staged photo is only the edit target');
      const first = await currentText();
      // Once placed (staged), the photo is dragged like any placed photo; capture stops.
      await browser.waitFor('!document.querySelector(".leaflet-container.photo-edit-placing")');
      await dragSelectedMarker(browser, 40, 25);
      await browser.waitFor(`${JSON.stringify(first)} !== (${fact('Koordinater')})`);
      await discardEdits(browser);
      assert.equal(await browser.evaluate(markerCount),0); assert.equal(await browser.evaluate(fact('Status')),'Uplassert');

      // Keyboard: Enter on the focused map places at the centre; arrow keys nudge; Escape asks before discarding.
      await enterEditMode(browser); await browser.evaluate('document.querySelector(".leaflet-container").focus()');
      await pressKey(browser,'Enter',KEYS.Enter); await browser.waitFor(editTarget);
      await browser.evaluate(`${editTarget}.focus()`); const beforeKey=await currentText();
      await pressKey(browser,'ArrowRight',KEYS.ArrowRight); await browser.waitFor(`(${fact('Koordinater')}) !== ${JSON.stringify(beforeKey)}`);
      await pressKey(browser,'Escape',KEYS.Escape); await browser.waitFor(boundary);
      await click('Forkast endringer','document.querySelector(".photo-edit-boundary")'); await browser.waitFor(`!${commandBar}`);
      assert.equal(await browser.evaluate(markerCount),0);

      await enterEditMode(browser); await mapClick(); await screenshot('manual-unplaced-staged');
      const beforeZoom=await browser.evaluate('document.querySelector(".leaflet-tile-pane").style.transform');
      await saveEdits(browser); await browser.waitFor(`${markerCount}===1`);
      assert.equal(await browser.evaluate(fact('Kilde')),'Manuell');
      assert.equal(await browser.evaluate('document.querySelector(".leaflet-tile-pane").style.transform'),beforeZoom,'no fit jumps after first manual placement');
      assert(await browser.evaluate(`(() => { const n = document.querySelectorAll('.photo-workspace-list .photo-workspace-unplaced').length, c = document.querySelector('.photo-workspace-unplaced-count'); return n === 0 ? !c : c?.innerText === n + ' uplassert'; })()`));
      assert.equal(await browser.evaluate(`window.__originalCreatedByName.get(${JSON.stringify(inspectedName)})`),initialOriginalCreated,'placement does not create original URLs');

      // Staged changes survive selection; every data tool is behind the save/discard boundary.
      const manual=await currentText();
      await enterEditMode(browser); await selectIndex(1); await mapClick(-70,30); await selectIndex(0);
      assert.equal(await currentText(),manual); assert.equal(await browser.evaluate(editCount),1);
      for (const label of ['Legg til bilder', 'Koble og posisjoner bilder', 'Tilbake til appen']) {
        await click(label); await browser.waitFor(boundary);
        assert.equal(await browser.evaluate('Boolean(document.querySelector(".photo-collection-dialog[open], .photo-positioning-wizard[open]"))'),false);
        await click('Fortsett redigering','document.querySelector(".photo-edit-boundary")'); await browser.waitFor(`!${boundary}`);
      }
      assert.equal(await browser.evaluate('document.querySelector(".photo-workspace-visibility").getAttribute("aria-disabled")'),'true');
      await click('Tilbake til appen'); await browser.waitFor(boundary);
      await click('Forkast endringer','document.querySelector(".photo-edit-boundary")');
      await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
      await click('Bildemodul'); await browser.waitFor('document.querySelector(".photo-workspace-shell")');
      assert.equal(await browser.evaluate(markerCount),1,'discarded placement never reached canonical state');
      await deleteLayer(); assert.equal(await browser.evaluate('window.__originalUrls.size'),0);

      await create(true); await browser.waitFor(`${markerCount}===148`);
      await click(await browser.evaluate(`${inspector}.querySelector('.photo-inspector-locate').getAttribute('aria-label')`));
      const oldCoords=await currentText(), oldEvidence=await evidence();
      const before=await transforms();
      assert.equal(new Set(before).size,136);
      await enterEditMode(browser);
      const others = await transforms();
      await dragSelectedMarker(browser, 90, 55); await browser.waitFor(`${editCount}===1`);
      assert.notEqual(await currentText(),oldCoords,'the inspector shows the staged position');
      assert.deepEqual(await transforms(),others,'only the selected photo moves');
      assert.equal(await browser.evaluate(popupCount),0);
      await screenshot('manual-gml-move-desktop');
      for(const [width,height] of [[1024,620],[390,700]]) {
        await browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
        await browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        assert(await browser.evaluate('document.querySelector(".photo-workspace-shell").scrollWidth<=innerWidth+1'));
        await browser.evaluate(`${commandBar}.scrollIntoView({block:'center'})`);
        assert(await browser.evaluate(`${commandBar}.querySelector('[aria-label="Lagre endringer"]').offsetWidth>0`));
        assert(await browser.evaluate(`${commandBar}.getBoundingClientRect().bottom<=innerHeight`));
        await screenshot('manual-edit-'+width);
      }
      await browser.send('Emulation.setDeviceMetricsOverride',{width:1680,height:900,deviceScaleFactor:1,mobile:false});
      await discardEdits(browser);
      assert.equal(await currentText(),oldCoords,'discard restores the accepted GML position');
      await click(await browser.evaluate(`${inspector}.querySelector('.photo-inspector-locate').getAttribute('aria-label')`)); await settleMapLayout();
      const aligned=await transforms();
      await enterEditMode(browser); await dragSelectedMarker(browser, 100, 45); await browser.waitFor(`${editCount}===1`);
      await saveEdits(browser); await browser.waitFor(`(${fact('Kilde')})==='Manuell'`);
      const after=await transforms(); assert.equal(after.length, aligned.length);
      assert.equal(after.filter((value,index)=>value!==aligned[index]).length,1,'exactly one marker changed');
      assert.deepEqual(await evidence(),oldEvidence,'GML/EXIF evidence is preserved'); assert.equal(await browser.evaluate(markerCount),148);
      const movedCurrent=await currentText();
      await click('Koble og posisjoner bilder'); await browser.waitFor('document.querySelector(".photo-positioning-wizard[open]")');
      await clickSourceControl(browser, 'Kontroller tilgjengelige posisjoner');
      await clickSourceControl(browser, 'Foreslå EXIF for viste');
      await browser.waitFor('document.querySelector(".photo-positioning-rows")');
      assert.equal(await browser.evaluate('document.querySelectorAll(".photo-positioning-rows [data-action=move]").length'),1);
      assert(await browser.evaluate('document.querySelector(".photo-positioning-rows").innerText.includes("Flyttes")'));
      await closePhotoSources(browser); assert.equal(await currentText(),movedCurrent);
      const activeFilename = await browser.evaluate(`${inspector}.querySelector('h2').innerText`);
      await applyPhotoSourcePositions(browser, 'gml', { filename: activeFilename }); assert.equal(await currentText(),oldCoords); assert.deepEqual(await evidence(),oldEvidence);
      await applyPhotoSourcePositions(browser, 'exif', { filename: activeFilename }); assert.deepEqual(await evidence(),oldEvidence);

      // Removal is a separate mode behind the boundary; a staged change on the removed photo cannot survive.
      await enterEditMode(browser); await dragSelectedMarker(browser, -80, -30); await browser.waitFor(`${editCount}===1`);
      await click('Fjern bilder fra laget'); await browser.waitFor(boundary);
      await click('Forkast endringer','document.querySelector(".photo-edit-boundary")');
      await browser.waitFor('document.querySelector(".photo-removal-bar")');
      await browser.evaluate('document.querySelector(".photo-workspace-active input").click()');
      await browser.evaluate('document.querySelector(".photo-removal-primary").click()');
      await click('Fjern fra lag','document.querySelector(".photo-remove-confirmation")');
      await browser.waitFor(`${markerCount}===147`);
      await click('Tilbake til appen'); await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
      await browser.waitFor('window.__originalUrls.size===0 && !document.querySelector(".photo-edit-mode")');
      await settleMapLayout();
      // Outside the workspace, a marker still opens only the compact popup.
      const markerBox=await browser.evaluate(`(() => { const map=document.querySelector('.leaflet-container').getBoundingClientRect();
        const visible=Array.from(document.querySelectorAll('.photo-camera-marker')).map(e=>e.getBoundingClientRect())
          .filter(box=>box.left>map.left+50 && box.right<map.right-60 && box.top>map.top+60 && box.bottom<map.bottom-50);
        if(!visible.length) throw new Error('No visible camera marker');return visible[0].toJSON(); })()`);
      await browser.send('Input.dispatchMouseEvent',{type:'mousePressed',x:markerBox.left+15,y:markerBox.top+15,button:'left',buttons:1,clickCount:1});
      await browser.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:markerBox.left+15,y:markerBox.top+15,button:'left',buttons:0,clickCount:1});
      await browser.waitFor('document.querySelector(".photo-map-popup")');
      assert.equal(await browser.evaluate('Boolean(document.querySelector(".photo-collection-dialog"))'),false);
      await browser.waitFor('window.__originalUrls.size===0',5000); // A popup's display preview holds only a brief decoding URL.
      for(const [value,code,number] of [['Enter','Enter',13],[' ','Space',32]]) {
        await click('Lukk bildeforhåndsvisning');
        await browser.evaluate('document.querySelector(".photo-camera-marker").focus()');
        await pressKey(browser,value,{code,keyCode:number}); await browser.waitFor('document.querySelector(".photo-map-popup")');
        await browser.waitFor('window.__originalUrls.size===0',5000); // A popup's display preview holds only a brief decoding URL.
      }
      await click('Åpne i bildemodul'); await browser.waitFor('document.querySelector(".photo-workspace-shell")');
      await enterEditMode(browser); await dragSelectedMarker(browser, 30, 30); await browser.waitFor(`${editCount}===1`);
      await browser.send('Page.reload'); await browser.waitFor('!document.querySelector(".photo-workspace-shell") && !document.querySelector(".photo-edit-command-bar")');
      assert.equal(await browser.evaluate('window.__originalUrls.size'),0);
      console.log(JSON.stringify({ realPhotos:148, initialGmlMarkers:148, distinctCoordinates:136, changedMarkers:1,
        checks:'click/pan/keyboard placement, drag, discard/save, staged-only canonical state, boundaries, sources/wizard, removal, popups, URL reuse, layouts, reload',screenshots }));
    } catch(error) { console.log(await browser.evaluate('({edit: Boolean(document.querySelector(".photo-edit-mode")),markers: document.querySelectorAll(".photo-camera-marker").length, bar: document.querySelector(".photo-edit-command-bar")?.innerText, boundary: Boolean(document.querySelector(".photo-edit-boundary[open]"))})').catch(()=>null)); throw error; }
    finally { await browser.close(); }
  });
