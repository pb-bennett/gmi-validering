import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
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
    const bytes = gpsPng({ captureTime: '2026:05:12 14:33:02', artist: 'Synthetic Artist' }).toString('base64');
    await writeFile(source, Buffer.from(gmiText([linked('A/a.png'), linked('A/a.png'), linked('B/a.png'), linked('dup.png'),
      linked('absent.png'), linked('../unsafe.png'), linked('flat.png'), linked('line.png', { scope: 'line' })]), 'latin1'));
    const browser = await openTestChrome();
    const folder = async () => browser.evaluate(`(() => {
      const data=Uint8Array.from(atob(${JSON.stringify(bytes)}), c=>c.charCodeAt(0)), transfer=new DataTransfer();
      for(const relative of ['A/a.png','B/a.png','X/dup.png','Y/dup.png','flat.png','line.png','extra.png']) {
        const file=new File([data], relative.split('/').at(-1), {type:'image/png'});
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
