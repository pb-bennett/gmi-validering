import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { gpsPng } from './helpers/photoGpsFixtures.mjs';
import { gmiText } from './helpers/gmiPhotoFixtures.mjs';
import { clickSourceControl } from './helpers/photoSourceWorkflow.mjs';
import { clickImport, chooseImportPlacement, createLayerWithoutPlacement, createLayerWithPlacement, waitForThumbnails, importDialog } from './helpers/photoImportWizard.mjs';
const app=process.env.PHOTO_UI_URL;
const screenshotRoot=process.env.PHOTO_SCREENSHOT_DIR || path.join(tmpdir(),'photo-import-wizard-acceptance');
const bytes=gpsPng({captureTime:'2026:05:12 14:33:02',artist:'Synthetic Artist'}).toString('base64');
const linked=(ref,scope='point')=>({hyperlink:`h:1(link:"${ref}") `,scope,label:'1234'});
test('unified import wizard: all entry contexts, sources, exceptions, lifecycle and rendered acceptance', {skip:!app||!chromePath,timeout:240000},async()=>{
 const browser=await openTestChrome();
 const click=(label)=>clickSourceControl(browser,label,'document');
 const inject=async(selector,items)=>browser.evaluate(`(() => {const transfer=new DataTransfer();for(const item of ${JSON.stringify(items)}){const data=item.text!==undefined?item.text:Uint8Array.from(atob(${JSON.stringify(bytes)}),c=>c.charCodeAt(0));const file=new File([data],item.name,{type:item.text!==undefined?'text/plain':'image/png'});if(item.relative)Object.defineProperty(file,'webkitRelativePath',{value:item.relative});transfer.items.add(file);}const input=document.querySelector(${JSON.stringify(selector)});if(!input)throw new Error('Missing input');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const add=async(count=1,folder=false)=>{await inject(folder?'input[aria-label="Velg mappe"]':'input[aria-label="Velg bildefiler"]',Array.from({length:count},(_,i)=>({name:`photo-${i}.png`,...(folder?{relative:`Delivery/photo-${i}.png`}:{})})));await waitForThumbnails(browser);};
 const capture=async(name)=>{await browser.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});await new Promise(resolve=>setTimeout(resolve,200));if(await browser.evaluate(`${importDialog}.querySelector('.photo-import-final') !== null`)){assert.equal(await browser.evaluate(`getComputedStyle(${importDialog}.querySelector('.photo-import-final')).backgroundColor`),'rgb(15, 23, 43)');assert(await browser.evaluate(`Boolean(${importDialog}.querySelector('.photo-import-final svg'))`));assert(await browser.evaluate(`Array.from(${importDialog}.querySelectorAll('footer > button')).every(e=>e.getBoundingClientRect().height===40)`));}await mkdir(screenshotRoot,{recursive:true});for(const [width,height]of [[1920,1080],[1280,720],[1366,768]]){await browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');const geometry=await browser.evaluate(`(()=>{const d=${importDialog}, f=d.querySelector('footer'),b=f.querySelector('.gmi-primary-control'),r=b.getBoundingClientRect();return {overflow:d.scrollWidth>d.clientWidth,right:r.right,bottom:r.bottom,gridRows:d.querySelector('.photo-collection-grid')?new Set(Array.from(d.querySelectorAll('.photo-collection-card')).map(e=>e.getBoundingClientRect().top)).size:0};})()`);assert(!geometry.overflow);assert(geometry.right<=width&&geometry.bottom<=height);if(name==='populated-review')assert(geometry.gridRows>=2);const {data}=await browser.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(screenshotRoot,`${name}-${width}x${height}.png`),Buffer.from(data,'base64'));}};
 const open=async()=>{await click('Bilder');await browser.waitFor(`${importDialog}?.open`);assert.equal(await browser.evaluate(`${importDialog}.querySelector('header button').getAttribute('aria-label')`),'Avbryt import');};
 try{
 await browser.send('Page.navigate',{url:app+'?testmodus=1'});await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
 await open();await capture('empty-acquisition');
 assert(await browser.evaluate(`${importDialog}.innerText.includes('Velg bilder')&&${importDialog}.innerText.includes('Velg mappe')`));
 assert(!await browser.evaluate(`/GML|EXIF|GMI-fil|Mållag|referanse/.test(${importDialog}.innerText)`));
 await browser.evaluate(`(async()=>{const transfer=new DataTransfer();for(let i=0;i<24;i++){const canvas=document.createElement('canvas');canvas.width=960;canvas.height=640;const c=canvas.getContext('2d');c.fillStyle=['#16778c','#315c85','#806137'][i%3];c.fillRect(0,0,960,640);c.fillStyle='#fff';c.font='60px sans-serif';c.fillText('Synthetic photo '+(i+1),60,170);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));const file=new File([blob],'photo-'+i+'.png',{type:'image/png'});Object.defineProperty(file,'webkitRelativePath',{value:'Delivery/photo-'+i+'.png'});transfer.items.add(file);}const input=document.querySelector('input[aria-label="Velg mappe"]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await waitForThumbnails(browser);await browser.evaluate(`${importDialog}.querySelectorAll('.photo-batch-toggle')[0].click();${importDialog}.querySelectorAll('.photo-batch-toggle')[1].click()`);await capture('populated-review');await clickImport(browser,'Fjern valg');
 assert.equal(await browser.evaluate(`${importDialog}.querySelectorAll('.photo-collection-inspector input, .photo-collection-inspector textarea, .photo-metadata-editor, .photo-spatial-inspector').length`),0);
 await browser.evaluate(`${importDialog}.querySelectorAll('.photo-batch-toggle')[1].click()`);await clickImport(browser,'Fjern valgte (1)');
 assert.equal(await browser.evaluate(`${importDialog}.querySelectorAll('.photo-collection-card').length`),23);
 const toolbarGap=await browser.evaluate(`(()=>{const t=${importDialog}.querySelector('.photo-import-grid-toolbar'),g=${importDialog}.querySelector('.photo-collection-grid');return g.getBoundingClientRect().top-t.getBoundingClientRect().bottom;})()`);assert(toolbarGap<24);
 await clickImport(browser,'Neste');await capture('general-placement');await clickImport(browser,'Avbryt');
 await open();assert.equal(await browser.evaluate(`${importDialog}.querySelectorAll('.photo-collection-card').length`),0);await add();await createLayerWithoutPlacement(browser);assert.equal(await browser.evaluate('document.querySelectorAll(".photo-camera-marker").length'),0);
 await click('Legg til bilder');await add();assert.equal(await browser.evaluate(`${importDialog}.querySelectorAll('[data-append-status=skipped]').length`),1);await browser.evaluate(`${importDialog}.querySelector('.photo-append-override').click()`);await createLayerWithoutPlacement(browser);assert.equal(await browser.evaluate('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length'),2);
 await click('Lukk FOTO');await open();await add();await chooseImportPlacement(browser,'exif');await clickImport(browser,'Neste');await capture('final-review-footer');await clickImport(browser,'Opprett fotolag');await browser.waitFor('!document.querySelector(".photo-collection-dialog")');await browser.waitFor('document.querySelectorAll(".photo-camera-marker").length===1');
 assert.equal(await browser.evaluate('document.querySelector(".photo-workspace-list .photo-delivery-pill").innerText'),'GML','accepted EXIF import positions default to GML');
 await click('Lukk FOTO');
 // File-origin GMI uses the same draft reconciliation and repeated occurrence planner.
 await open();await add();await chooseImportPlacement(browser,'gmi');await inject('input[aria-label="Velg GMI-fil"]',[{name:'file-source.gmi',text:gmiText([linked('photo-0.png'),linked('photo-0.png')])}]);await browser.waitFor(`${importDialog}.innerText.includes('file-source.gmi')`);await clickImport(browser,'Neste');await browser.waitFor(`${importDialog}.querySelector('.photo-import-review')`);await capture('gmi-success');assert.equal(await browser.evaluate(`${importDialog}.querySelector('details summary').parentElement.open`),false);await clickImport(browser,'Opprett fotolag');await browser.waitFor('!document.querySelector(".photo-collection-dialog")');assert.equal(await browser.evaluate('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length'),2);await click('Lukk FOTO');
 // GML import accepts only matched positions through the same final action.
 await open();await add();await chooseImportPlacement(browser,'gml');
 await inject('input[aria-label="Velg GML med bildeposisjoner"]',[{name:'positions.gml',text:'<gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:app="http://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101"><gml:featureMember><app:Skråfoto gml:id="p"><app:fotolink>photo-0.png</app:fotolink><app:fotograferingspunkt><gml:Point srsName="EPSG:25832"><gml:pos>581930 6566000</gml:pos></gml:Point></app:fotograferingspunkt></app:Skråfoto></gml:featureMember></gml:FeatureCollection>'}]);
 await browser.waitFor(`${importDialog}.innerText.includes('positions.gml')`);await createLayerWithPlacement(browser,'gml');assert.equal(await browser.evaluate('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length'),1);assert(await browser.evaluate('document.querySelector(".photo-workspace-collection").innerText.includes("1 bilde") && !document.querySelector(".photo-workspace-collection").innerText.includes("uplassert")'));await click('Lukk FOTO');
 // Loaded GMI context skips placement. Include a LINE, missing reference and ambiguity.
 await click('Legg til fil'); await browser.waitFor('document.querySelector("input[type=file]")'); await inject('input[type=file]',[{name:'loaded-source.gmi',text:gmiText([linked('photo-0.png'),linked('line.png','line'),linked('dup.png'),linked('missing.png')])}]);await browser.waitFor('document.querySelector("button[aria-label=\\\"Koble bilder til GMI-laget\\\"]")');
 await browser.evaluate('document.querySelector("button[aria-label=\\\"Koble bilder til GMI-laget\\\"]").click()');await browser.waitFor(`${importDialog}?.open`);
 await inject('input[aria-label="Velg mappe"]',[{name:'photo-0.png',relative:'D/photo-0.png'},{name:'line.png',relative:'D/line.png'},{name:'dup.png',relative:'D/A/dup.png'},{name:'dup.png',relative:'D/B/dup.png'}]);await waitForThumbnails(browser);await clickImport(browser,'Neste');await browser.waitFor(`${importDialog}.querySelector('.photo-import-review')`);assert(!await browser.evaluate(`${importDialog}.querySelector('.photo-import-steps').innerText.includes('Plassering')`));await capture('gmi-exceptions');assert(await browser.evaluate(`${importDialog}.querySelector('[aria-label="Trenger kontroll"]')!==null`));await clickImport(browser,'Opprett fotolag');await browser.waitFor('!document.querySelector(".photo-collection-dialog")');assert.equal(await browser.evaluate('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length'),4);
 await click('Lukk FOTO');await open();await add();await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await browser.waitFor('!document.querySelector(".photo-collection-dialog")');await open();assert.equal(await browser.evaluate(`${importDialog}.querySelectorAll('.photo-collection-card').length`),0);await clickImport(browser,'Avbryt');
 // A general import can attach an already loaded source after photo selection.
 await open();await add();await chooseImportPlacement(browser,'gmi');await clickImport(browser,'Bruk loaded-source.gmi');await browser.waitFor(`${importDialog}.innerText.includes('loaded-source.gmi')`);await createLayerWithPlacement(browser,'gmi');
 // Simulate target removal through real layer UI while the append draft is open.
 const targetName=await browser.evaluate('document.querySelector(".photo-workspace-collection h1").textContent');
 await click('Legg til bilder');await add();await click('Lukk FOTO');
 await browser.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.getAttribute('aria-label')===${JSON.stringify('Fjern fotokartlag ')}+${JSON.stringify(targetName)}).click()`);
 await browser.evaluate(`Array.from(document.querySelectorAll('section[aria-label^="Fotokartlag"] button')).find(b=>b.textContent==='Fjern').click()`);await browser.waitFor('!document.querySelector(".photo-collection-dialog")');
 // Source liveness is still enforced when its initiating survey layer disappears.
 await browser.evaluate('document.querySelector("button[aria-label=\\\"Koble bilder til GMI-laget\\\"]").click()');await browser.waitFor(`${importDialog}?.open`);await add();await clickImport(browser,'Neste');
 await browser.evaluate('document.querySelector("button[aria-label=\\\"Fjern lag\\\"]").click()');await browser.evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Fjern').click()");
 await browser.waitFor(`${importDialog}.innerText.includes('GMI-laget er ikke lenger tilgjengelig')`);assert(await browser.evaluate(`${importDialog}.querySelector('.gmi-primary-control').disabled`));await clickImport(browser,'Avbryt');
 assert.deepEqual(browser.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.text),[]);
 }catch(error){console.error(await browser.evaluate('document.body.innerText.slice(0,6000)'));throw error;}finally{await browser.close();}
});

test('filename capture-time suggestions: final step, default off, persistence, styling, commit and layout', {skip:!app||!chromePath,timeout:240000},async()=>{
 const browser=await openTestChrome();
 const click=(label)=>clickSourceControl(browser,label,'document');
 const noTime=gpsPng({}).toString('base64'),withTime=gpsPng({captureTime:'2026:10:16 12:00:00'}).toString('base64');
 const names=[['20261014_143302.png',noTime],['KUM12_20261015.png',noTime],['20261013_0915.png',noTime],['IMG_1234.png',noTime],['20261016_120000.png',withTime],['IMG_20261012_101010.png',noTime]];
 const panel=`${importDialog}?.querySelector('.photo-import-capture')`;
 const box=(label)=>`Array.from(${importDialog}.querySelectorAll('.photo-import-capture-choice')).find(l=>l.textContent.startsWith(${JSON.stringify(label)}))?.querySelector('input')`;
 const layout=async(name)=>{await mkdir(screenshotRoot,{recursive:true});for(const [width,height]of [[1280,720],[1366,768]]){await browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');const g=await browser.evaluate(`(()=>{const d=${importDialog},b=d.querySelector('.photo-import-footer .gmi-primary-control').getBoundingClientRect(),p=d.querySelector('.photo-import-capture').getBoundingClientRect(),body=d.querySelector('.photo-import-step-body');return {overflow:d.scrollWidth>d.clientWidth||body.scrollWidth>body.clientWidth,right:b.right,bottom:b.bottom,panelRight:p.right,frame:d.getBoundingClientRect().right};})()`);assert(!g.overflow,name);assert(g.right<=width&&g.bottom<=height,name);assert(g.panelRight<=g.frame,name);const {data}=await browser.send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(screenshotRoot,`capture-${name}-${width}x${height}.png`),Buffer.from(data,'base64'));}};
 try{
 await browser.send('Page.navigate',{url:app+'?testmodus=1'});await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
 await click('Bilder');await browser.waitFor(`${importDialog}?.open`);
 await browser.evaluate(`(() => {const transfer=new DataTransfer();for(const [name,data] of ${JSON.stringify(names)}){transfer.items.add(new File([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],name,{type:'image/png'}));}const input=document.querySelector('input[aria-label="Velg bildefiler"]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await waitForThumbnails(browser);await browser.waitFor(`${importDialog}.dataset.exifPending === '0'`,60000);
 assert.equal(await browser.evaluate(`${panel}`),null,'not on the photo step');
 await clickImport(browser,'Neste');await browser.waitFor(`${panel}`);
 assert.equal(await browser.evaluate(`${panel}.dataset.validationTone`),'warning');
 assert(await browser.evaluate(`${panel}.innerText.includes('SJEKK') && ${panel}.innerText.includes('5 bilder mangler opptakstid.')`));
 assert(await browser.evaluate(`${panel}.querySelector('svg[aria-hidden="true"]') !== null`));
 assert.deepEqual(await browser.evaluate(`Array.from(${panel}.querySelectorAll('.photo-import-capture-choice')).map(l=>[l.textContent.trim(),l.querySelector('input').checked,getComputedStyle(l.querySelector('input')).accentColor])`),
  [['Bruk dato og klokkeslett fra filnavn (3)',false,'rgb(0, 117, 149)'],['Bruk kun dato fra filnavn (1)',false,'rgb(0, 117, 149)']]);
 await browser.evaluate(`${panel}.querySelector('summary').click()`);
 assert.equal(await browser.evaluate(`${panel}.querySelector('summary').textContent`),'Vis forslag (4)');
 const rows=await browser.evaluate(`Array.from(${panel}.querySelectorAll('li')).map(li=>li.innerText.replace(/\\s+/g,' ').trim())`);
 assert.deepEqual(rows,['20261014_143302.png 14.10.2026 14:33:02 · tidssone ukjent','20261013_0915.png 13.10.2026 09:15 · uten sekunder · tidssone ukjent','IMG_20261012_101010.png 12.10.2026 10:10:10 · tidssone ukjent','KUM12_20261015.png 15.10.2026 · bare dato']);
 await layout('placement-final');
 await browser.evaluate(`${box('Bruk kun dato fra filnavn')}.click()`);
 // Kontroll becomes the final step: the section moves there and the choice survives the placement change and back navigation.
 await chooseImportPlacement(browser,'exif');assert.equal(await browser.evaluate(`${panel}`),null);
 await clickImport(browser,'Neste');await browser.waitFor(`${importDialog}?.querySelector('.photo-import-review')`);await browser.waitFor(`${panel}`);
 assert.deepEqual(await browser.evaluate(`[${box('Bruk dato og klokkeslett fra filnavn')}.checked,${box('Bruk kun dato fra filnavn')}.checked]`),[false,true]);
 await layout('review-final');
 await clickImport(browser,'Tilbake');await clickImport(browser,'Tilbake');await clickImport(browser,'Neste');await chooseImportPlacement(browser,'none');await browser.waitFor(`${panel}`);
 assert.deepEqual(await browser.evaluate(`[${box('Bruk dato og klokkeslett fra filnavn')}.checked,${box('Bruk kun dato fra filnavn')}.checked]`),[false,true]);
 // Keyboard: the checkbox is reachable and toggles with Space.
 await browser.evaluate(`${box('Bruk dato og klokkeslett fra filnavn')}.focus()`);
 await browser.send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await browser.send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
 assert.equal(await browser.evaluate(`${box('Bruk dato og klokkeslett fra filnavn')}.checked`),true);
 await clickImport(browser,'Opprett fotolag');await browser.waitFor('!document.querySelector(".photo-collection-dialog[open]") && document.querySelector(".photo-workspace-shell")');
 const inspect=async(name)=>{await browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-list li[data-photo-id]')).find(li=>li.textContent.includes(${JSON.stringify(name)})).querySelector('.photo-workspace-row').click()`);await new Promise(resolve=>setTimeout(resolve,150));return browser.evaluate(`(()=>{const d=document.querySelector('[data-disclosure="capture-evidence"]');return {source:d?.textContent||'',text:document.body.textContent};})()`);};
 const dateOnly=await inspect('KUM12_20261015.png');assert(dateOnly.source.includes('Opptakstid fra') && dateOnly.source.includes('Filnavn'));assert(dateOnly.text.includes('15.10.2026') && dateOnly.text.includes('bare dato'));
 const complete=await inspect('20261013_0915.png');assert(complete.source.includes('Filnavn'));assert(complete.text.includes('13.10.2026 09:15') && complete.text.includes('uten sekunder'));
 const exif=await inspect('20261016_120000.png');assert(exif.source.includes('EXIF DateTimeOriginal'));
 // Cancel leaves nothing behind.
 await click('Legg til bilder');await browser.waitFor(`${importDialog}?.open`);await clickImport(browser,'Avbryt');await browser.waitFor('!document.querySelector(".photo-collection-dialog[open]")');
 assert.deepEqual(browser.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.text),[]);
 }catch(error){console.error(await browser.evaluate('document.body.innerText.slice(0,6000)'));throw error;}finally{await browser.close();}
});
