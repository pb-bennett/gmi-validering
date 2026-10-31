import { unzipSync, strFromU8 } from 'fflate';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { gmiText } from './helpers/gmiPhotoFixtures.mjs';
import { gpsPng } from './helpers/photoGpsFixtures.mjs';
import { setPhotoFiles, clickSourceControl, sourceWizard } from './helpers/photoSourceWorkflow.mjs';
import { TEST_CONNECTION } from './fixtures/gemini-wfs/connection.mjs';
import { collection, independentPoint, partialZLine } from './fixtures/gemini-wfs/syntheticProfile.mjs';

const app = process.env.PHOTO_UI_URL;
const click = (browser, text, scope = 'document') => clickSourceControl(browser, text, scope);
const linked = (reference, options = {}) => ({ hyperlink: `h:1(link:"${reference}") `, ...options });

test('loaded GMI full app: folder evidence, review categories, repeated occurrences, explicit positions, append, ordinary import and WFS isolation',
  { skip: !chromePath || !app, timeout: 240000 }, async (t) => {
    const root = path.resolve(tmpdir()), directory = await mkdtemp(path.join(root, 'photo-loaded-gmi-ui-'));
    const source = path.join(directory, 'Synthetic delivery.gmi');
    const bytes = gpsPng({ captureTime: '2026:05:12 14:33:02', artist: 'Synthetic Artist', direction: 359.875, directionRef: 'T' }).toString('base64');
    const unresolvedBytes = gpsPng().toString('base64');
    await writeFile(source, Buffer.from(gmiText([linked('A/a.png'), linked('A/a.png'), linked('B/a.png'), linked('dup.png'),
      linked('absent.png'), linked('../unsafe.png'), linked('flat.png'), linked('line.png', { scope: 'line' })]), 'latin1'));
    const browser = await openTestChrome();
    const folder = async () => browser.evaluate(`(() => {
      const data=Uint8Array.from(atob(${JSON.stringify(bytes)}), c=>c.charCodeAt(0)), transfer=new DataTransfer();
      for(const relative of ['A/a.png','B/a.png','X/dup.png','Y/dup.png','flat.png','line.png','extra.png']) {
        const original=relative==='flat.png'?Uint8Array.from(atob(${JSON.stringify(unresolvedBytes)}),c=>c.charCodeAt(0)):data;
        const file=new File([original], relative.split('/').at(-1), {type:'image/png'});
        Object.defineProperty(file,'webkitRelativePath',{value:'Delivery/'+relative}); transfer.items.add(file);
      }
      const input=document.querySelector('input[aria-label="Velg leveransemappe"]');
      if(!input.hasAttribute('webkitdirectory'))throw new Error('Not a folder input');
      input.files=transfer.files; input.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    const openEntry = async () => {
      await browser.evaluate(`document.querySelector('button[aria-label="Legg til bilder fra Synthetic delivery.gmi"]').click()`);
      await browser.waitFor('document.querySelector("dialog.photo-collection-dialog") && !document.body.innerText.includes("Klargjør bildereferanser")');
    };
    try {
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
      // Synthetic provider only. Every real application request still passes its
      // production client/session; no hidden mutation seeds photo or WFS state.
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `
        localStorage.clear(); window.confirm=()=>true; globalThis.photoWfsCalls=0;
        const originalFetch=globalThis.fetch.bind(globalThis);
        globalThis.fetch=(url, init)=>{
          if(String(url).includes('/api/gemini-wfs')) {
            photoWfsCalls++;
            const side=JSON.parse(init.body).featureType;
            return Promise.resolve(new Response(side==='lines' ? ${JSON.stringify(collection([partialZLine]))} : ${JSON.stringify(collection([independentPoint]))},
              {headers:{'Content-Type':'application/gml+xml; charset=utf-8'}}));
          }
          return originalFetch(url,init);
        };` });
      await browser.send('Page.navigate', { url: app + '?testmodus=1' });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
      await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
      await setPhotoFiles(browser, 'input[type=file]', [source]);
      await browser.waitFor('document.querySelector("button[aria-label=\\\"Legg til bilder fra Synthetic delivery.gmi\\\"]")');
      await t.test('ordinary loaded GMI exposes a usable photo action; reference state is connected through the real form', async () => {
        assert.equal(await browser.evaluate('document.querySelector("button[aria-label=\\\"Legg til bilder fra Synthetic delivery.gmi\\\"]").disabled'), false);
        await browser.evaluate('document.querySelector("button[aria-label=\\\"Åpne Gemini WFS\\\"]").click()');
        await browser.waitFor('document.querySelector("#gemini-wfs-url")');
        await browser.evaluate(`(() => {const form=document.querySelector('#gemini-va-connection-form');
          form.elements.connectionName.value='Synthetic reference'; form.elements.connectionUrl.value=${JSON.stringify(TEST_CONNECTION.url)};
          form.elements.username.value='synthetic-user'; form.elements.password.value='synthetic-test'; form.requestSubmit();})()`);
        await browser.waitFor('!document.querySelector("#gemini-va-connection-form") && document.querySelector(".gmi-gemini-reference-point")');
        assert.equal(await browser.evaluate('photoWfsCalls'), 2);
        assert.equal(await browser.evaluate('document.querySelectorAll(".gmi-gemini-reference-point").length'), 1);
      });
      await t.test('canceling curation retains no FOTO/source state; the source never needs reselecting', async () => {
        await openEntry(); await folder(); await click(browser, 'Avbryt', 'document.querySelector(".photo-collection-dialog")');
        assert.equal(await browser.evaluate('document.querySelectorAll("section[aria-label^=Fotokartlag]").length'), 0);
      });
      await openEntry(); await folder();
      await browser.waitFor('document.querySelector(".photo-collection-dialog").innerText.includes("7 bilder med EXIF GPS")');
      await click(browser, 'Kontroller referanser', 'document.querySelector(".photo-collection-dialog")');
      await browser.waitFor('document.querySelector("section[aria-label=\\\"Kontroller bildereferanser\\\"]")');
      await t.test('honest reconciliation categories and both desktop layouts; no GMI picker', async () => {
        const counts = await browser.evaluate('Array.from(document.querySelectorAll(".photo-reconciliation-counts dd")).map(e=>Number(e.innerText))');
        assert.deepEqual(counts, [5, 1, 1, 2, 1, 0]);
        assert(await browser.evaluate(`document.querySelector('section[aria-label="Kontroller bildereferanser"]').textContent.includes('Delivery/X/dup.png') && document.querySelector('section[aria-label="Kontroller bildereferanser"]').textContent.includes('Delivery/Y/dup.png')`));
        await browser.evaluate(`document.querySelector('input[aria-label="Ta med bilder som ikke er referert i GMI"]').click()`);
        await browser.waitFor(`document.querySelector('section[aria-label="Kontroller bildereferanser"]').innerText.includes('6 nye bilder legges til')`);
        await browser.evaluate(`document.querySelector('input[aria-label="Ta med bilder som ikke er referert i GMI"]').click()`);
        await browser.waitFor(`document.querySelector('section[aria-label="Kontroller bildereferanser"]').innerText.includes('7 nye bilder legges til')`);
        assert.equal(await browser.evaluate('Boolean(document.querySelector("input[aria-label=\\\"Velg GMI-kilde\\\"]"))'), false);
        assert(await browser.evaluate('document.querySelector("section[aria-label=\\\"Kontroller bildereferanser\\\"]").innerText.includes("7 av 7 bilder har relativ sti")'));
        for (const [width, height] of [[1920, 1080], [1280, 720]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          const bounds = await browser.evaluate(`(() => {const d=document.querySelector('.photo-collection-dialog'), b=Array.from(d.querySelectorAll('button')).find(e=>e.innerText==='Bekreft bilder og koblinger');
            const r=b.getBoundingClientRect();return {right:r.right,bottom:r.bottom,overflow:d.scrollWidth>d.clientWidth};})()`);
          assert(bounds.right <= width && bounds.bottom <= height); assert.equal(bounds.overflow, false);
          if (process.env.PHOTO_SCREENSHOT_DIR) {
            await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive: true });
            const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
            await writeFile(path.join(process.env.PHOTO_SCREENSHOT_DIR, `loaded-gmi-review-${width}x${height}.png`), Buffer.from(data, 'base64'));
          }
        }
      });
      await click(browser, 'Bekreft bilder og koblinger', 'document.querySelector(".photo-collection-dialog")');
      await browser.waitFor(`${sourceWizard}?.querySelector('section[aria-label="Kontroller posisjoner"]')`);
      await t.test('source checkpoint creates shared assets and distinct occurrences but zero markers', async () => {
        await browser.waitFor('new Set(Array.from(document.querySelectorAll(".photo-workspace-list img")).map(e=>e.src)).size===7');
        assert.equal(await browser.evaluate('document.querySelectorAll(".photo-camera-marker").length'), 0);
        assert.equal(await browser.evaluate('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length'), 8);
        assert.equal(await browser.evaluate('new Set(Array.from(document.querySelectorAll(".photo-workspace-list img")).map(e=>e.src)).size'), 7);
        assert.equal(await browser.evaluate('photoWfsCalls'), 2);
      });
      await click(browser, 'Behold alle gjeldende'); await click(browser, 'Foreslå GMI for viste'); await click(browser, 'Neste');
      await click(browser, 'Bruk valgte posisjoner for 4 plasseringer');
      await browser.waitFor(`!${sourceWizard} && document.querySelectorAll('.photo-camera-marker').length===4`);
      await t.test('bulk export readiness: grouped blockers, unique assets, repeated direction, preserved manual values and unresolved evidence', async () => {
        const scope = `document.querySelector('.photo-export-dialog')`;
        const inspector = `document.querySelector('.photo-workspace-inspector')`;
        const rows = await browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-list li[data-photo-id]')).filter(li=>li.querySelector('button')?.getAttribute('aria-label')==='Vis a.png' && li.innerText.includes('Flere plasseringer')).map(li=>li.dataset.photoId)`);
        await browser.evaluate(`document.querySelector('.photo-workspace-list li[data-photo-id="${rows[0]}"] button').click()`);
        await browser.evaluate(`(() => {const input=document.querySelector('input[aria-label="Opptakstid"]'); input.value='2025-01-02T01:02:03'; input.closest('form').requestSubmit();})()`);
        await click(browser,'Juster retning','document');
        await browser.evaluate(`(() => {const input=document.querySelector('input[aria-label="Retning i grader"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'90');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
        await click(browser,'Bruk retning','document');
        await click(browser, 'Eksporter', 'document');
        await browser.evaluate(`(() => {const e=${scope}.querySelector('[aria-label="Eksportprofil"]');e.value='legacy2019';e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
        const preview = async () => { await click(browser,'Lag eksportforhåndsvisning',scope); await browser.waitFor(`${scope}.querySelector('[aria-label="Eksportforhåndsvisning"]')`); };
        const count = (code) => browser.evaluate(`Number(${scope}.querySelector('[data-diagnostic-code="${code}"] summary')?.textContent.split('—').at(-1).trim()||0)`);
        await preview();
        assert.equal(await count('capture-time-required'),2);
        assert.equal(await count('direction-required'),3);
        assert.equal(await browser.evaluate(`${scope}.querySelector('[data-diagnostic-code="direction-required"]').open`),false);
        assert.equal(await browser.evaluate(`${scope}.querySelector('[data-diagnostic-code="direction-required"]').querySelectorAll('li').length`),3);
        await click(browser,'Bruk EXIF-tid for alle mulige (5)',scope);
        assert.equal(await browser.evaluate(`Boolean(${scope}.querySelector('[aria-label="Eksportforhåndsvisning"]'))`),false);
        await preview(); assert.equal(await count('capture-time-required'),1);
        await click(browser,'Bruk EXIF-fotograf for alle mulige (6)',scope);
        await click(browser,'Bruk EXIF-retning for alle mulige (6)',scope);
        await preview(); assert.equal(await count('direction-required'),1);
        assert.equal(await count('capture-time-required'),1);
        assert(await browser.evaluate(`Array.from(${scope}.querySelectorAll('button')).find(b=>b.textContent==='Last ned testpakke').disabled`));
        await click(browser,'Lukk eksport',scope);
        await browser.evaluate(`document.querySelector('.photo-workspace-list li[data-photo-id="${rows[0]}"] button').click()`);
        assert(await browser.evaluate(`${inspector}.querySelector('[data-accepted-metadata="captureTime"]').textContent.includes('2025-01-02T01:02:03 (Manuell)')`));
        assert.equal(await browser.evaluate(`${inspector}.querySelector('.photo-direction-accepted').textContent`),'90°');
        await browser.evaluate(`document.querySelector('.photo-workspace-list li[data-photo-id="${rows[1]}"] button').click()`);
        assert.equal(await browser.evaluate(`${inspector}.querySelector('.photo-direction-accepted').textContent`),'359.875°');
        assert.equal(await browser.evaluate('photoWfsCalls'),2);
      });
      await t.test('canonical metadata: manual, adopt, clear, deduplicated batch and shared repeated occurrences', async () => {
        const inspector = `document.querySelector('.photo-workspace-inspector')`;
        const setValue = async (label, value) => browser.evaluate(`(() => {
          const input=document.querySelector('input[aria-label="${label}"]');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});
          input.dispatchEvent(new Event('input',{bubbles:true}));
        })()`);
        const accepted = (field, value) => browser.waitFor(`${inspector}.querySelector('[data-accepted-metadata="${field}"]').textContent.includes(${JSON.stringify(value)})`);
        const rows = await browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-list li')).filter(li=>li.querySelector('button')?.getAttribute('aria-label')==='Vis a.png' && li.innerText.includes('Flere plasseringer')).map(li=>li.dataset.photoId)`);
        await browser.evaluate(`document.querySelector('.photo-workspace-list li[data-photo-id="${rows[0]}"] button').click()`);
        await click(browser, 'Nullstill opptakstid', inspector);
        await accepted('captureTime', 'Ukjent');
        await setValue('Fotograf', 'Manual Artist'); await click(browser, 'Lagre fotograf', inspector);
        await accepted('photographer', 'Manual Artist');
        await setValue('Opptakstid', '2026-06-01T10:20:30+02:00'); await click(browser, 'Lagre opptakstid', inspector);
        await accepted('captureTime', '2026-06-01T10:20:30+02:00');
        await browser.evaluate(`document.querySelector('.photo-workspace-list li[data-photo-id="${rows[1]}"] button').click()`);
        await accepted('photographer', 'Manual Artist'); await accepted('captureTime', '2026-06-01T10:20:30+02:00');
        await browser.evaluate(`document.querySelector('section[aria-label="Opptaksmetadata"]').querySelectorAll('details').forEach(d=>d.open=true)`);
        await click(browser, 'Bruk EXIF som opptakstid', inspector); await accepted('captureTime', '2026-05-12T14:33:02 (EXIF)');
        await click(browser, 'Bruk EXIF som fotograf', inspector); await accepted('photographer', 'Synthetic Artist (EXIF)');
        await click(browser, 'Nullstill opptakstid', inspector); await accepted('captureTime', 'Ukjent');
        await click(browser, 'Nullstill fotograf', inspector); await accepted('photographer', 'Ukjent');
        await click(browser, 'Velg alle viste', 'document');
        await browser.waitFor(`document.querySelector('details[aria-label="Felles opptaksmetadata"]')?.textContent.includes('7 unike bilder')`);
        await browser.evaluate(`document.querySelector('details[aria-label="Felles opptaksmetadata"]').open=true`);
        await setValue('Felles fotograf', 'Batch Artist'); await click(browser, 'Sett fotograf for valgte bilder', 'document');
        await setValue('Felles opptakstid', '2026-07-02T11:12:13'); await click(browser, 'Sett opptakstid for valgte bilder', 'document');
        const allRows = await browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-list li[data-photo-id]')).map(li=>li.dataset.photoId)`);
        for (const id of allRows) {
          await browser.evaluate(`document.querySelector('.photo-workspace-list li[data-photo-id="${id}"] button').click()`);
          await accepted('photographer', 'Batch Artist'); await accepted('captureTime', '2026-07-02T11:12:13');
        }
        await click(browser, 'Fjern valg', 'document');
        assert.equal(await browser.evaluate('photoWfsCalls'), 2);
      });
      await t.test('experimental dual export: explicit profiles, blocked legacy, truthful-context controls, shared originals and WFS isolation', async () => {
        const scope = `document.querySelector('.photo-export-dialog')`;
        const setExport = async (label, value) => browser.evaluate(`(() => {
          const e=document.querySelector('[aria-label="${label}"]');
          if(e.tagName==='INPUT')Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});
          else e.value=${JSON.stringify(value)};
          e.dispatchEvent(new Event(e.tagName==='INPUT'?'input':'change',{bubbles:true}));
        })()`);
        const preview = async () => {
          await click(browser, 'Lag eksportforhåndsvisning', scope);
          await browser.waitFor(`${scope}.querySelector('section[aria-label="Eksportforhåndsvisning"]') && !${scope}.innerText.includes('Bygger forhåndsvisning')`);
        };
        await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: directory });
        const download = async (profile) => {
          await click(browser, 'Last ned testpakke', scope);
          await browser.waitFor(`${scope}.innerText.includes('ZIP-pakken er klar')`);
          const file=path.join(directory,`photos-${profile}-25832.zip`);
          for(let attempt=0;attempt<100;attempt++) {
            try { return unzipSync(new Uint8Array(await readFile(file))); }
            catch { await new Promise(resolve=>setTimeout(resolve,100)); }
          }
          throw new Error('ZIP download not completed');
        };
        await click(browser, 'Eksporter', 'document');
        assert.equal(await browser.evaluate(`${scope}.querySelector('select[aria-label="Eksportprofil"]').value`), '');
        assert(await browser.evaluate(`Array.from(${scope}.querySelectorAll('button')).find(b=>b.textContent==='Lag eksportforhåndsvisning').disabled`));
        await setExport('Eksportprofil', 'legacy2019'); await preview();
        assert(await browser.evaluate(`${scope}.textContent.includes('Legacy krever godtatt retning')`));
        assert(await browser.evaluate(`Array.from(${scope}.querySelectorAll('button')).find(b=>b.textContent==='Last ned testpakke').disabled`));
        await click(browser, 'Lukk eksport', scope);
        const placed = await browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-list li[data-photo-id]')).filter(li=>Array.from(li.querySelectorAll('span')).some(s=>s.textContent==='Plassert')).map(li=>li.dataset.photoId)`);
        assert.equal(placed.length, 4);
        for(const id of placed) {
          await browser.evaluate(`document.querySelector('.photo-workspace-list li[data-photo-id="${id}"] button').click()`);
          await click(browser, 'Juster retning', 'document'); await click(browser, 'Bruk retning', 'document');
        }
        await click(browser, 'Eksporter', 'document'); await setExport('Eksportprofil','legacy2019'); await preview();
        assert(await browser.evaluate(`${scope}.innerText.includes('4 planlagte features · 3 vedlegg · 1 delte originalbilder')`));
        assert(await browser.evaluate(`${scope}.innerText.includes('4 utelatt/uplassert')`));
        assert(await browser.evaluate(`${scope}.innerText.includes('Gemini-kompatibilitet er ikke verifisert')`));
        const legacy = await download('legacy2019');
        assert.equal(Object.keys(legacy).length,4);
        const legacyXml=strFromU8(legacy['photos.gml']);
        assert.equal((legacyXml.match(/<app:Skråfoto /g)||[]).length,4); assert(legacyXml.includes('<app:fotograf>Batch Artist</app:fotograf>'));
        await setExport('Eksportprofil','asbuilt52'); await preview();
        assert(await browser.evaluate(`${scope}.textContent.includes('Datafangstdato: oppgi')`));
        assert(await browser.evaluate(`Array.from(${scope}.querySelectorAll('button')).find(b=>b.textContent==='Last ned testpakke').disabled`));
        for(const [label,value] of [['Datafangstdato','2026-05-12'],['Datasettets navn','Synthetic export dataset'],['Prosjektnavn','Synthetic export project'],['Målemetode','99'],['Målemetode høyde','99'],['Stedfestingsårsak','nytt'],['Stedfestingsforhold','åpenGrøft']]) await setExport('Eksport '+label,value);
        await preview();
        assert(await browser.evaluate(`${scope}.textContent.includes('fotograf utelates i AsBuilt 5.2')`));
        assert(await browser.evaluate(`${scope}.innerText.includes('Eksperimentell 2D')`));
        for (const [width, height] of [[1920, 1080], [1280, 720]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          const bounds = await browser.evaluate(`(() => {const d=${scope},r=d.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,overflow:d.scrollWidth>d.clientWidth};})()`);
          assert(bounds.left >= 0 && bounds.right <= width && bounds.top >= 0 && bounds.bottom <= height);
          assert.equal(bounds.overflow, false);
          if (process.env.PHOTO_SCREENSHOT_DIR) {
            await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive: true });
            const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
            await writeFile(path.join(process.env.PHOTO_SCREENSHOT_DIR, `photo-export-${width}x${height}.png`), Buffer.from(data, 'base64'));
          }
        }
        const modern = await download('asbuilt52');
        const modernXml=strFromU8(modern['photos.gml']);assert(!modernXml.includes('<app:fotoinformasjon>')); assert(modernXml.includes('Synthetic export dataset'));
        assert.equal((modernXml.match(/<app:Skråfoto /g)||[]).length,4);
        for(const [name,data] of Object.entries(modern))if(name!=='photos.gml')assert.deepEqual(data,Uint8Array.from(Buffer.from(name.endsWith('/flat.png')?unresolvedBytes:bytes,'base64')));
        assert.equal(await browser.evaluate('photoWfsCalls'),2);
        await click(browser,'Lukk eksport',scope);
      });
      await t.test('repeated image occurrences select independently with one original URL; current GMI inspector, preview and panes remain', async () => {
        const rows = await browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-list li')).filter(li=>li.querySelector('button')?.getAttribute('aria-label')==='Vis a.png' && li.innerText.includes('Flere plasseringer')).map(li=>li.dataset.photoId)`);
        assert.equal(rows.length, 2);
        const urls = [];
        for (const id of rows.slice(0, 2)) {
          await browser.evaluate(`document.querySelector('.photo-workspace-list li[data-photo-id="${id}"] button').click()`);
          await browser.waitFor('document.querySelector(".photo-workspace-inspector img")?.getAttribute("src")');
          urls.push(await browser.evaluate('document.querySelector(".photo-workspace-inspector img").src'));
          assert(await browser.evaluate('document.querySelector(".photo-spatial-inspector").innerText.includes("Gjeldende posisjon (GMI)")'));
        }
        assert.equal(urls[0], urls[1]);
        assert.equal(await browser.evaluate('getComputedStyle(document.querySelector(".leaflet-photo-markers-pane")).zIndex'), '620');
        await click(browser, 'Tilbake til appen', 'document');
      });
      await t.test('append reuses existing assets and recheck does not multiply occurrences or issue WFS requests', async () => {
        await openEntry(); await folder();
        await browser.evaluate(`(() => {const s=document.querySelector('select[aria-label="Velg FOTO-mållag"]');s.value=s.options[1].value;s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
        await click(browser, 'Kontroller referanser', 'document.querySelector(".photo-collection-dialog")');
        await click(browser, 'Bekreft bilder og koblinger', 'document.querySelector(".photo-collection-dialog")');
        await browser.waitFor(`${sourceWizard}?.querySelector('section[aria-label="Kontroller posisjoner"]')`);
        await browser.evaluate(`${sourceWizard}.querySelector('header button').click()`);
        assert.equal(await browser.evaluate('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length'), 8);
        assert.equal(await browser.evaluate('document.querySelectorAll(".photo-camera-marker").length'), 4);
        assert.equal(await browser.evaluate('photoWfsCalls'), 2);
        assert(await browser.evaluate(`document.querySelector('[data-accepted-metadata=photographer]').textContent.includes('Batch Artist')`));
      });
      await t.test('ordinary Bilder import still works independently and does not fetch WFS', async () => {
        await click(browser, 'Tilbake til appen', 'document'); await click(browser, 'Bilder', 'document');
        await browser.evaluate(`(() => {const data=Uint8Array.from(atob(${JSON.stringify(bytes)}),c=>c.charCodeAt(0)),t=new DataTransfer();t.items.add(new File([data],'ordinary.png',{type:'image/png'}));
          const i=document.querySelector('input[aria-label="Velg bildefiler"]');i.files=t.files;i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
        await click(browser, 'Opprett fotokartlag (1 bilder)', 'document.querySelector(".photo-collection-dialog")');
        await browser.waitFor('document.querySelectorAll("section[aria-label^=Fotokartlag]").length===2');
        assert.equal(await browser.evaluate('photoWfsCalls'), 2);
      });
      assert.equal(browser.events.filter((event) => event.method === 'Runtime.exceptionThrown').length, 0);
    } catch (error) {
      console.error(await browser.evaluate('document.body.innerText.slice(0,6000)'));
      throw error;
    } finally {
      await browser.close();
      if (path.dirname(path.resolve(directory)) !== root || !path.basename(directory).startsWith('photo-loaded-gmi-ui-')) throw new Error('Unsafe fixture path');
      await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
