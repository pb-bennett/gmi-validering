import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';

const app = process.env.PHOTO_UI_URL, gml = process.env.PHOTO_GML_FIXTURE;
test('manual FOTO placement: real corpus, click/drag/keyboard, transactions, sources, safety and layouts',
  { skip: !chromePath || !app || !gml, timeout: 240000 }, async () => {
    const browser = await openTestChrome();
    const controls = 'document.querySelector(".photo-manual-controls")';
    const spatial = 'document.querySelector(".photo-spatial-inspector")';
    const markerCount = 'document.querySelectorAll(".photo-camera-marker").length';
    const popupCount = 'document.querySelectorAll(".photo-map-popup").length';
    const proposal = 'document.querySelector(".photo-proposed-marker")';
    const click = (text, scope = 'document') => browser.evaluate(`(() => {
      const button = Array.from(${scope}.querySelectorAll('button')).find(e => e.innerText.trim() === ${JSON.stringify(text)});
      if (!button || button.disabled) throw new Error('Unavailable button: '+${JSON.stringify(text)}); button.click(); })()`);
    const inputFiles = async (selector, files) => {
      const { root } = await browser.send('DOM.getDocument');
      const { nodeId } = await browser.send('DOM.querySelector', { nodeId: root.nodeId, selector });
      assert(nodeId, selector); await browser.send('DOM.setFileInputFiles', { nodeId, files });
    };
    const settleMapLayout = async () => {
      await browser.waitFor(`!document.getAnimations().some(animation => animation.playState==='running'
        && animation.effect?.target instanceof Element && animation.effect.target.contains(document.querySelector('.leaflet-container')))`);
      // Workspace height transition (200 ms) and Leaflet's resize debounce must finish.
      await browser.evaluate('new Promise(resolve=>setTimeout(resolve,400))');
      await browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    };
    const pointClick = async (dx = 0, dy = 0) => {
      const box = await browser.evaluate('document.querySelector(".leaflet-container").getBoundingClientRect().toJSON()');
      const x = box.left + box.width / 2 + dx, y = box.top + box.height / 2 + dy;
      await browser.send('Input.dispatchMouseEvent', { type:'mousePressed', x,y,button:'left',buttons:1,clickCount:1 });
      await browser.send('Input.dispatchMouseEvent', { type:'mouseReleased', x,y,button:'left',buttons:0,clickCount:1 });
      await browser.waitFor(proposal);
    };
    const key = async (key, code = key, windowsVirtualKeyCode = undefined) => {
      await browser.send('Input.dispatchKeyEvent', { type:'keyDown',key,code,windowsVirtualKeyCode });
      await browser.send('Input.dispatchKeyEvent', { type:'keyUp',key,code,windowsVirtualKeyCode });
    };
    const currentText = () => browser.evaluate(`Array.from(${spatial}.querySelectorAll('p')).find(e=>e.innerText.includes('(WGS84)') || e.innerText==='Ingen posisjon').innerText`);
    const evidence = () => browser.evaluate(`Array.from(${spatial}.querySelectorAll('pre')).map(e=>e.innerText)`);
    const transforms = () => browser.evaluate('Array.from(document.querySelectorAll(".photo-camera-marker")).map(e=>e.style.transform)');
    const screenshots = [];
    const screenshot = async (name) => {
      if (!process.env.PHOTO_SCREENSHOT_DIR) return;
      await browser.waitFor(`!document.querySelector('.leaflet-container.leaflet-zoom-anim') && Array.from(document.querySelectorAll('.leaflet-tile')).every(e=>e.complete)`);
      await browser.waitFor(`document.querySelector('.photo-collection-original img')?.naturalWidth > 0`);
      await browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive:true });
      const { data } = await browser.send('Page.captureScreenshot', { format:'png' });
      const filename = path.join(process.env.PHOTO_SCREENSHOT_DIR, name+'.png');
      await writeFile(filename, Buffer.from(data,'base64')); screenshots.push(filename);
    };
    const begin = async () => {
      await click(await browser.evaluate('document.querySelector(".photo-manual-start").innerText'));
      await browser.waitFor('document.querySelector(".leaflet-container.photo-placement-active")');
      assert.equal(await browser.evaluate(proposal), null);
      assert.equal(await browser.evaluate('document.querySelectorAll(".photo-camera-marker.leaflet-marker-draggable").length'),0);
      assert(await browser.evaluate(`${controls}.querySelector('button').disabled`));
    };
    const cancel = async () => {
      await click('Avbryt', controls);
      await browser.waitFor('!document.querySelector(".photo-proposed-marker") && !document.querySelector(".photo-placement-active")');
    };
    const selectIndex = async index => {
      await browser.evaluate(`document.querySelectorAll('.photo-workspace-list li button')[${index}].click()`);
      await browser.waitFor('!document.querySelector(".photo-placement-active")');
    };
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
        if (positioned) {
          await inputFiles('input[aria-label="Velg GML med bildeposisjoner"]',[gml]);
          await browser.waitFor('document.querySelector(".photo-collection-dialog").innerText.includes("148 treff")');
        }
        await browser.waitFor('document.querySelector(".photo-collection-dialog").innerText.includes("148 bilder med EXIF GPS-kandidat")',45000);
        // URL assertions below isolate the inspector from temporary decoder URLs.
        await browser.waitFor('document.querySelectorAll(".photo-collection-card img").length===148',60000);
        await click('Opprett fotokartlag (148 bilder)');
        await click('Bildemodul'); await browser.waitFor('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length===148');
        await browser.waitFor('document.querySelector(".photo-collection-original img")?.naturalWidth>0');
        await browser.waitFor('window.__originalUrls.size===1');
        await settleMapLayout();
      };
      await create(false); const inspectedName = await browser.evaluate('document.querySelector(".photo-collection-inspector h3").innerText');
      const initialOriginalCreated = await browser.evaluate(`window.__originalCreatedByName.get(${JSON.stringify(inspectedName)})`); assert.equal(await browser.evaluate(markerCount),0);
      await begin();
      const beforePan=await browser.evaluate('document.querySelector(".leaflet-map-pane").style.transform');
      const mapBox=await browser.evaluate('document.querySelector(".leaflet-container").getBoundingClientRect().toJSON()');
      const panX=mapBox.left+mapBox.width/2, panY=mapBox.top+mapBox.height/2;
      await browser.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:panX,y:panY,buttons:0});
      await browser.evaluate('document.querySelector(".leaflet-container").focus();new Promise(resolve=>requestAnimationFrame(resolve))');
      await browser.send('Input.dispatchMouseEvent',{type:'mousePressed',x:panX,y:panY,button:'left',buttons:1,clickCount:1});
      for(let n=1;n<=5;n++) { await browser.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:panX+n*12,y:panY+n*8,buttons:1,button:'left'}); await browser.evaluate('new Promise(resolve=>requestAnimationFrame(resolve))'); }
      await browser.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:panX+60,y:panY+40,button:'left',buttons:0,clickCount:1});
      await browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      assert.equal(await browser.evaluate(proposal),null,'map pan never creates a proposal');
      assert.notEqual(await browser.evaluate('document.querySelector(".leaflet-map-pane").style.transform'),beforePan,'map still pans during placement');
      await pointClick();
      const first = await browser.evaluate(`${controls}.innerText`);
      await pointClick(65,40); assert.notEqual(await browser.evaluate(`${controls}.innerText`), first);
      assert.equal(await browser.evaluate(markerCount),0); await cancel();
      assert.equal(await browser.evaluate(markerCount),0); assert(await browser.evaluate(`${spatial}.innerText.includes('Uplassert')`));
      await begin(); await pointClick(60,50);
      // Drag proposal only: canonical accepted markers remain absent.
      const box = await browser.evaluate(`${proposal}.getBoundingClientRect().toJSON()`);
      const x=box.left+16,y=box.top+16, beforeDrag=await browser.evaluate(`${controls}.innerText`);
      await browser.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
      for(let n=1;n<=5;n++) await browser.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+n*8,y:y+n*5,buttons:1,button:'left'});
      await browser.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+40,y:y+25,button:'left',buttons:0,clickCount:1});
      await browser.waitFor(`${controls}.innerText!==${JSON.stringify(beforeDrag)}`);
      assert.equal(await browser.evaluate(markerCount),0); await cancel();
      await begin(); await browser.evaluate('document.querySelector(".leaflet-container").focus()');
      await key('Enter','Enter',13); await browser.waitFor(proposal);
      await browser.evaluate(`${proposal}.focus()`); const beforeKey=await browser.evaluate(`${controls}.innerText`);
      await key('ArrowRight','ArrowRight',39); await browser.waitFor(`${controls}.innerText!==${JSON.stringify(beforeKey)}`);
      await key('Escape','Escape',27); await browser.waitFor('!document.querySelector(".photo-placement-active")');
      assert.equal(await browser.evaluate(markerCount),0);
      await begin(); await pointClick(); await screenshot('manual-unplaced-proposal');
      const beforeZoom=await browser.evaluate('document.querySelector(".leaflet-tile-pane").style.transform');
      await click('Bruk plassering',controls); await browser.waitFor(`${markerCount}===1`);
      assert(await browser.evaluate(`${spatial}.innerText.includes('Gjeldende posisjon (Manuell)')`));
      assert.equal(await browser.evaluate('document.querySelector(".leaflet-tile-pane").style.transform'),beforeZoom,'no fit jumps after first manual placement');
      assert(await browser.evaluate('document.querySelector(".photo-workspace-collection header").innerText.includes("1 plassert")'));
      assert.equal(await browser.evaluate(`window.__originalCreatedByName.get(${JSON.stringify(inspectedName)})`),initialOriginalCreated,'placement does not create original URLs');
      const manual=await currentText(); await begin(); await pointClick(-70,30); await cancel(); assert.equal(await currentText(),manual);
      await begin(); await pointClick(); await selectIndex(1); assert.equal(await browser.evaluate(markerCount),1);
      await begin(); await pointClick(); await click('Legg til bilder'); await browser.waitFor('document.querySelector(".photo-collection-dialog[open]")');
      assert.equal(await browser.evaluate(proposal),null); await click('Avbryt', 'document.querySelector(".photo-collection-dialog")');
      await begin(); await pointClick(); await click('Posisjoner bilder'); await browser.waitFor('document.querySelector(".photo-positioning-wizard[open]")');
      assert.equal(await browser.evaluate(proposal),null); await click('Avbryt','document.querySelector(".photo-positioning-wizard")');
      await begin(); await pointClick(); await browser.evaluate('document.querySelector(".photo-workspace-collection header input").click()');
      await browser.waitFor('!document.querySelector(".photo-placement-active")');
      assert(await browser.evaluate('document.querySelector(".photo-manual-start").disabled'));
      await browser.evaluate('document.querySelector(".photo-workspace-collection header input").click()');
      await begin(); await pointClick(); await click('Tilbake til appen'); await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
      assert.equal(await browser.evaluate(proposal),null); await click('Bildemodul'); await browser.waitFor('document.querySelector(".photo-workspace-shell")');
      await deleteLayer(); assert.equal(await browser.evaluate('window.__originalUrls.size'),0);

      await create(true); await browser.waitFor(`${markerCount}===148`);
      await click('Zoom til posisjon',spatial);
      const oldCoords=await currentText(), oldEvidence=await evidence();
      const before=await transforms();
      assert.equal(new Set(before).size,136);
      await begin(); await pointClick(90,55);
      assert.equal(await currentText(),oldCoords); assert.deepEqual(await transforms(),before);
      assert.equal(await browser.evaluate(popupCount),0);
      await screenshot('manual-gml-move-desktop');
      for(const [width,height] of [[1024,620],[390,700]]) {
        await browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
        await browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        assert(await browser.evaluate('document.querySelector(".photo-workspace-shell").scrollWidth<=innerWidth+1'));
        assert(await browser.evaluate(`${controls}.querySelector('button').offsetWidth>0`));
        await screenshot('manual-move-'+width);
        await browser.evaluate(`${controls}.querySelector('button').scrollIntoView({block:'center'})`);
        assert(await browser.evaluate(`${controls}.querySelector('button').getBoundingClientRect().bottom<=innerHeight`));
        await screenshot('manual-controls-'+width);
      }
      await browser.send('Emulation.setDeviceMetricsOverride',{width:1680,height:900,deviceScaleFactor:1,mobile:false});
      await click('Zoom til posisjon',spatial); await cancel();
      const aligned=await transforms(); await begin(); await pointClick(100,45);
      await click('Bruk plassering',controls); await browser.waitFor(`${spatial}.innerText.includes('Gjeldende posisjon (Manuell)')`);
      const after=await transforms(); assert.equal(after.filter((value,index)=>value!==aligned[index]).length,1);
      assert.deepEqual(await evidence(),oldEvidence); assert.equal(await browser.evaluate(markerCount),148);
      const movedCurrent=await currentText();
      await click('Posisjoner bilder'); await browser.waitFor('document.querySelector(".photo-positioning-wizard[open]")');
      await browser.evaluate('document.querySelector(".photo-positioning-wizard input[value=exif]").click()');
      await click('Neste','document.querySelector(".photo-positioning-wizard")');
      await browser.waitFor('document.querySelector(".photo-positioning-rows")');
      assert.equal(await browser.evaluate('document.querySelectorAll(".photo-positioning-rows [data-action=move]").length'),1);
      assert(await browser.evaluate('document.querySelector(".photo-positioning-rows").innerText.includes("Flyttes")'));
      await click('Avbryt','document.querySelector(".photo-positioning-wizard")'); assert.equal(await currentText(),movedCurrent);
      await click('Bruk GML-posisjon',spatial); assert.equal(await currentText(),oldCoords); assert.deepEqual(await evidence(),oldEvidence);
      await click('Bruk EXIF-posisjon',spatial); assert.deepEqual(await evidence(),oldEvidence);
      await begin(); await pointClick(-80,-30); await click('Bruk plassering',controls);
      assert(await browser.evaluate(`${spatial}.innerText.includes('Gjeldende posisjon (Manuell)')`));
      await begin(); await pointClick();
      await browser.evaluate('document.querySelector(".photo-workspace-active input").click()'); await click('Fjern fra lag');
      assert.equal(await browser.evaluate(proposal),null);
      await click('Fjern fra lag','document.querySelector(".photo-remove-confirmation")');
      await browser.waitFor(`${markerCount}===147`); assert(!await browser.evaluate('Boolean(document.querySelector(".photo-placement-active"))'));
      await begin(); await pointClick(); await key('Escape','Escape',27);
      await click('Tilbake til appen'); await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
      await browser.waitFor('window.__originalUrls.size===0 && !document.querySelector(".photo-placement-active")');
      await settleMapLayout();
      // Outside placement, a marker still opens only the accepted compact popup.
      const markerBox=await browser.evaluate(`(() => { const map=document.querySelector('.leaflet-container').getBoundingClientRect();
        const visible=Array.from(document.querySelectorAll('.photo-camera-marker')).map(e=>e.getBoundingClientRect())
          .filter(box=>box.left>map.left+50 && box.right<map.right-60 && box.top>map.top+60 && box.bottom<map.bottom-50);
        if(!visible.length) throw new Error('No visible camera marker');return visible[0].toJSON(); })()`);
      await browser.send('Input.dispatchMouseEvent',{type:'mousePressed',x:markerBox.left+15,y:markerBox.top+15,button:'left',buttons:1,clickCount:1});
      await browser.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:markerBox.left+15,y:markerBox.top+15,button:'left',buttons:0,clickCount:1});
      await browser.waitFor('document.querySelector(".photo-map-popup")');
      assert.equal(await browser.evaluate('Boolean(document.querySelector(".photo-collection-dialog"))'),false);
      assert.equal(await browser.evaluate('window.__originalUrls.size'),0);
      for(const [value,code,number] of [['Enter','Enter',13],[' ','Space',32]]) {
        await browser.evaluate('document.querySelector(".leaflet-popup-close-button").click();document.querySelector(".photo-camera-marker").focus()');
        await key(value,code,number); await browser.waitFor('document.querySelector(".photo-map-popup")');
        assert.equal(await browser.evaluate('window.__originalUrls.size'),0);
      }
      await click('Åpne i bildemodul'); await browser.waitFor('document.querySelector(".photo-workspace-shell")');
      await click('Tilbake til appen'); await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
      await click('Legg til fil'); await browser.waitFor('document.querySelector("input[type=file]")');
      await browser.evaluate('window.confirm=()=>true');
      await inputFiles('input[type=file]',[path.resolve('tests/fixtures/gmi-v32/valid/point-clean-modern.gmi')]);
      await browser.waitFor('document.body.innerText.includes("point-clean-modern")',45000);
      await click('Bildemodul'); await browser.waitFor('document.querySelector(".photo-workspace-shell")');
      await begin(); await pointClick();
      // Dispatch a real DOM click through a survey element: capture must stop its popup.
      await browser.evaluate(`(() => { const feature=document.querySelector('.leaflet-overlay-pane .leaflet-interactive, .leaflet-marker-pane .leaflet-interactive');
        if(!feature) throw new Error('Missing survey feature');
        const rect=document.querySelector('.leaflet-container').getBoundingClientRect();
        feature.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:rect.left+rect.width/2+20,clientY:rect.top+rect.height/2+20})); })()`);
      assert.equal(await browser.evaluate('document.querySelectorAll(".leaflet-popup").length'),0);
      await cancel();
      await begin(); await pointClick();
      await browser.send('Page.reload'); await browser.waitFor('!document.querySelector(".photo-workspace-shell") && !document.querySelector(".photo-proposed-marker")');
      assert.equal(await browser.evaluate('window.__originalUrls.size'),0);
      console.log(JSON.stringify({ realPhotos:148, initialGmlMarkers:148, distinctCoordinates:136, changedMarkers:1,
        checks:'click/reclick/cancel/apply, drag/cancel, keyboard, sources/wizard, active/append/modal/visibility/exit/remove/reload safety, URL reuse, layouts',screenshots }));
    } catch(error) { console.log(await browser.evaluate('({active: Boolean(document.querySelector(".photo-placement-active")),markers: document.querySelectorAll(".photo-camera-marker").length, popup: document.querySelector(".leaflet-popup")?.outerHTML, workspace: Boolean(document.querySelector(".photo-workspace-shell"))})')); console.log(browser.events.filter(event=>event.method==="Runtime.exceptionThrown").slice(-3)); throw error; } finally { await browser.close(); }
  });
