import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { assertPhotoDialogLayout } from './helpers/photoDialogLayout.mjs';

const applicationUrl = process.env.PHOTO_UI_URL, gmlPath = process.env.PHOTO_GML_FIXTURE;
test('real append duplicate correction: 148 minus six, reimport 148 adds six only; zero-new blocked, override explicit',
  { skip: !chromePath || !applicationUrl || !gmlPath, timeout: 180000 }, async () => {
    const browser = await openTestChrome(), checks = [];
    const dialog = 'document.querySelector(".photo-collection-dialog")';
    const collection = 'document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length';
    const click = (label, scope = 'document') => browser.evaluate(`(() => {
      const button=Array.from(${scope}.querySelectorAll('button')).find(e=>e.innerText.trim()===${JSON.stringify(label)});
      if(!button || button.disabled)throw new Error('Unavailable: '+${JSON.stringify(label)});button.click();})()`);
    const files = async (selector, paths) => {
      const { root } = await browser.send('DOM.getDocument');
      const { nodeId } = await browser.send('DOM.querySelector', { nodeId: root.nodeId, selector });
      assert(nodeId); await browser.send('DOM.setFileInputFiles', { nodeId, files: paths });
    };
    const screenshot = async (name) => {
      if (!process.env.PHOTO_SCREENSHOT_DIR) return;
      await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive: true });
      await browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.PHOTO_SCREENSHOT_DIR, `${name}.png`), Buffer.from(data,'base64'));
    };
    const appendButton = `${dialog}.querySelector('.photo-import-footer .gmi-primary-control')`;
    const openAppend = async () => { await click('Legg til bilder'); await browser.waitFor(`${dialog}?.open`); };
    const cancel = async () => { await click('Avbryt',dialog); await browser.waitFor(`!${dialog}`); };
    const uniformCards = async (label) => {
      const dimensions = await browser.evaluate(`Array.from(${dialog}.querySelectorAll('.photo-collection-grid > li')).map(item=>{
        const card=item.querySelector('.photo-collection-card'),thumb=item.querySelector('.photo-collection-thumbnail'),badge=item.querySelector('.photo-append-badge'),override=item.querySelector('.photo-append-override');
        return {outer:item.getBoundingClientRect().toJSON(),card:card.getBoundingClientRect().toJSON(),thumb:thumb.getBoundingClientRect().toJSON(),
          badge:badge?.getBoundingClientRect().toJSON(),control:override?.getBoundingClientRect().toJSON(),title:override?.title,
          name:override?.getAttribute('aria-label'),pressed:override?.getAttribute('aria-pressed')};})`);
      const normal=dimensions.find(item=>!item.badge)||dimensions[0];
      for (const item of dimensions) {
        const context=`${label}: ${JSON.stringify({normal,item})}`;
        assert(Math.abs(item.outer.height-normal.outer.height)<.5 && Math.abs(item.outer.width-normal.outer.width)<.5,context);
        assert(Math.abs(item.card.height-normal.card.height)<.5 && Math.abs(item.card.height-item.outer.height)<.5,label);
        assert.equal(item.thumb.height,112,'accepted thumbnail height');
        for (const overlay of [item.badge,item.control].filter(Boolean)) {
          assert(overlay.left>=item.thumb.left && overlay.right<=item.thumb.right && overlay.top>=item.thumb.top && overlay.bottom<=item.thumb.bottom,label);
        }
        if (item.control) assert(item.name && item.title === (item.pressed==='true'?'Ikke legg til':'Legg til likevel'));
      }
      checks.push(`${label}: ${dimensions.length} equal ${normal.card.width}×${normal.card.height} px cards; 112 px thumbnails; badge/control inside thumbnail`);
    };
    try {
      await browser.send('Emulation.setDeviceMetricsOverride',{width:1680,height:900,deviceScaleFactor:1,mobile:false});
      await browser.send('Page.navigate',{url:applicationUrl+'?testmodus=1'});
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
      await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
      const photos = (await readdir(path.join(path.dirname(gmlPath),'Attachments'))).filter(name=>/\.jpe?g$/i.test(name)).sort()
        .map(name=>path.join(path.dirname(gmlPath),'Attachments',name));
      assert.equal(photos.length,148);
      await click('Bilder'); await browser.waitFor(`${dialog}?.open`);
      await files('input[aria-label="Velg bildefiler"]',photos);
      await files('input[aria-label="Velg GML med bildeposisjoner"]',[gmlPath]);
      await browser.waitFor(`${dialog}.innerText.includes('148 treff') && ${dialog}.innerText.includes('148 bilder med EXIF GPS-kandidat')`,45000);
      await click('Opprett fotokartlag (148 bilder)',dialog); await browser.waitFor(`!${dialog}`); await click('Bildemodul');
      await browser.waitFor(`${collection}===148`);
      await browser.waitFor('document.querySelectorAll(".photo-workspace-list img").length===148',45000);
      const before = await browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-list li[data-photo-id]')).map(e=>({id:e.dataset.photoId,filename:e.querySelector('.photo-workspace-filename').title,thumbnail:e.querySelector('img')?.src}))`);
      await browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-list input')).slice(0,6).forEach(e=>e.click())`);
      await click('Fjern fra lag','document.querySelector(".photo-workspace-selected-actions")');
      await browser.waitFor('document.querySelector(".photo-remove-confirmation[open]")');
      await click('Fjern fra lag','document.querySelector(".photo-remove-confirmation")'); await browser.waitFor(`${collection}===142`);
      const beforeMarkers = await browser.evaluate('document.querySelectorAll(".photo-camera-marker").length'); assert.equal(beforeMarkers,142);
      await openAppend(); await files('input[aria-label="Velg bildefiler"]',photos);
      await browser.waitFor(`${appendButton}.innerText==='Legg til 6 bilder i laget'`);
      assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('[data-append-status=skipped]').length`),142);
      assert(await browser.evaluate(`${dialog}.querySelector('.photo-append-summary').innerText.includes('6 nye bilder') && ${dialog}.querySelector('.photo-append-summary').innerText.includes('142 bilder finnes allerede')`));
      await click('Velg alle',dialog);
      assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('.photo-batch-toggle[aria-pressed=true]').length`),6);
      assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('[data-append-status=skipped] .photo-batch-toggle[aria-pressed=true]').length`),0);
      await browser.evaluate(`${dialog}.querySelector('[data-append-status=skipped] .photo-collection-card').click()`);
      await browser.waitFor(`${dialog}.querySelector('.photo-spatial-inspector').innerText.includes('GPS leses bare hvis')`);
      assert(!await browser.evaluate(`${dialog}.querySelector('.photo-spatial-inspector').innerText.includes('EXIF kandidat')`));
      await files('input[aria-label="Velg GML med bildeposisjoner"]',[gmlPath]);
      await browser.waitFor(`${dialog}.innerText.includes('6 treff') && ${dialog}.innerText.includes('6 bilder med EXIF GPS-kandidat')`,45000);
      assert(!await browser.evaluate(`${dialog}.querySelector('.photo-spatial-inspector').innerText.includes('GML i importen')`));
      await browser.waitFor(`${dialog}.querySelector('.photo-collection-original img')?.complete && ${dialog}.querySelector('.photo-collection-original img').naturalWidth > 0`,45000);
      await assertPhotoDialogLayout(browser,'append 148 with 142 skipped');
      for (const [width,height] of [[1680,900],[1024,620],[390,700]]) {
        await browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
        await browser.evaluate('new Promise(resolve=>requestAnimationFrame(resolve))');
        await uniformCards(`mixed new/skipped ${width}×${height}`); await screenshot(`append-uniform-cards-${width}x${height}`);
      }
      await browser.send('Emulation.setDeviceMetricsOverride',{width:1680,height:900,deviceScaleFactor:1,mobile:false});
      await screenshot('append-six-new-142-skipped');
      await cancel(); assert.equal(await browser.evaluate(collection),142); assert.equal(await browser.evaluate('document.querySelectorAll(".photo-camera-marker").length'),142);
      checks.push('148 incoming / 142 existing: six new, 142 visibly skipped, select-all selects six; skipped inspector has no EXIF/GML; cancel retains 142');
      await openAppend(); await files('input[aria-label="Velg bildefiler"]',photos);
      await files('input[aria-label="Velg GML med bildeposisjoner"]',[gmlPath]); await browser.waitFor(`${dialog}.innerText.includes('6 treff')`);
      await click('Legg til 6 bilder i laget',dialog); await browser.waitFor(`${collection}===148`);
      assert.equal(await browser.evaluate('document.querySelectorAll(".photo-camera-marker").length'),148);
      const after = await browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-list li[data-photo-id]')).map(e=>({id:e.dataset.photoId,filename:e.querySelector('.photo-workspace-filename').title,thumbnail:e.querySelector('img')?.src}))`);
      before.slice(6).forEach(photo=>assert.deepEqual(after.find(e=>e.id===photo.id),photo));
      checks.push('confirmed six-only append returns to exactly 148 members/markers; remaining original identities/thumbnails preserved');
      await openAppend(); await files('input[aria-label="Velg bildefiler"]',photos);
      await browser.waitFor(`${appendButton}.innerText==='Legg til 0 bilder i laget'`);
      assert(await browser.evaluate(`${appendButton}.disabled`)); assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('[data-append-status=skipped]').length`),148);
      await click('Velg alle',dialog); assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('.photo-batch-toggle[aria-pressed=true]').length`),0);
      for (const [width,height] of [[1680,900],[1024,620],[390,700]]) {
        await browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
        await browser.evaluate('new Promise(resolve=>requestAnimationFrame(resolve))');
        await assertPhotoDialogLayout(browser,'zero-new append'); await uniformCards(`all skipped ${width}×${height}`); await screenshot(`append-zero-new-${width}x${height}`);
      }
      await browser.send('Emulation.setDeviceMetricsOverride',{width:1680,height:900,deviceScaleFactor:1,mobile:false});
      await browser.evaluate(`(async()=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=200;
        const context=canvas.getContext('2d');context.fillStyle='orange';context.fillRect(0,0,320,200);
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));const transfer=new DataTransfer();
        transfer.items.add(new File([blob],${JSON.stringify(path.basename(photos[0]))},{type:'image/png'}));
        const input=document.querySelector('input[aria-label="Velg bildefiler"]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await browser.waitFor(`${dialog}.innerText.includes('Like filnavn i importen (1)')`);
      assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('[data-append-status=skipped]').length`),149);
      assert(await browser.evaluate(`${appendButton}.disabled`)); await click('Velg alle',dialog);
      assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('.photo-batch-toggle[aria-pressed=true]').length`),0);
      await browser.evaluate(`Array.from(${dialog}.querySelectorAll('[data-append-status=skipped] .photo-append-override')).at(-1).focus()`);
      await browser.waitFor('document.activeElement?.classList.contains("photo-append-override")');
      const key = async (name,code) => {
        await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:name,code,windowsVirtualKeyCode:code==='Enter'?13:32,text:code==='Enter'?'\r':' '});
        await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:name,code,windowsVirtualKeyCode:code==='Enter'?13:32});
      };
      await key('Enter','Enter');
      await browser.waitFor(`${appendButton}.innerText==='Legg til 1 bilde i laget'`);
      assert(!await browser.evaluate(`${appendButton}.disabled`));
      assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('[data-append-status=override]').length`),1);
      assert.equal(await browser.evaluate(`${dialog}.querySelector('[data-append-status=override] .photo-append-badge').innerText`),'Legges til');
      await uniformCards('override active');
      await key(' ','Space'); await browser.waitFor(`${appendButton}.innerText==='Legg til 0 bilder i laget'`);
      assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('[data-append-status=override]').length`),0);
      await key('Enter','Enter'); await browser.waitFor(`${appendButton}.innerText==='Legg til 1 bilde i laget'`);
      await click('Velg alle',dialog); assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('.photo-batch-toggle[aria-pressed=true]').length`),1);
      await screenshot('append-one-deliberate-override'); await click('Legg til 1 bilde i laget',dialog); await browser.waitFor(`${collection}===149`);
      assert.equal(await browser.evaluate('document.querySelectorAll(".photo-camera-marker").length'),148,'explicit duplicate remains unplaced without an accepted position');
      await browser.waitFor('document.querySelector(".photo-workspace-list li:last-child img")');
      await browser.evaluate('document.querySelector(".photo-workspace-list li:last-child button").click()');
      await browser.waitFor('document.querySelector(".photo-collection-inspector").innerText.includes("320 × 200") && document.querySelector(".photo-spatial-inspector").innerText.includes("Ingen EXIF GPS")');
      checks.push('full repeat: 148 skipped / zero new, confirmation disabled at desktop/short/narrow; incoming-batch duplicate separately flagged; a distinct same-name PNG deliberately overridden adds exactly one, yielding 149 members and 148 current markers');
      assert.deepEqual(browser.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.text),[]);
      console.log(JSON.stringify({appendDuplicateChecks:checks},null,2));
    } catch(error) { console.error(await browser.evaluate('document.body.innerText.slice(0,8000)')); await screenshot('append-failure'); throw error; }
    finally { await browser.close(); }
  });
