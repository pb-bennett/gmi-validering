import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFile } from 'node:fs/promises';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { serveGeminiWorkflowApp } from './helpers/geminiUiHarness.mjs';

test('M6 read-only inspection in real React/Leaflet through the M5 workflow', { skip: !chromePath, timeout: 180000 }, async (t) => {
  const app = await serveGeminiWorkflowApp(); let browser;
  try {
    browser = await openTestChrome();
    await browser.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 850, deviceScaleFactor: 1, mobile: false });
    await browser.send('Page.navigate', { url: app.url });
    await browser.waitFor('globalThis.geminiWorkflow?.audit.map && document.querySelector(".photo-camera-marker")');
    const clickButton = (label) => browser.evaluate(`document.querySelector('button[aria-label=${JSON.stringify(label)}]').click()`);
    const count = (selector) => browser.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
    const requests = () => browser.evaluate('geminiWorkflow.audit.calls.length');
    const settle = () => browser.waitFor('!geminiWorkflow.audit.map._animatingZoom && !geminiWorkflow.audit.map._panAnim?._inProgress');
    const pointer = async ({ x, y }) => {
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    };
    // Test API below stays in the browser harness; no production test seam.
    await browser.evaluate(`geminiWorkflow.inspectionTarget = (kind) => {
      const map = geminiWorkflow.audit.map; let layer;
      map.eachLayer(item => { if (item.feature?.properties.kind === 'gemini-reference' && item.feature.geometry.type === kind) layer = item; });
      const vertices = layer.getLatLngs?.();
      const location = kind === 'Point' ? layer.getLatLng() : { lat: vertices[0].lat + .63*(vertices[1].lat-vertices[0].lat), lng: vertices[0].lng + .63*(vertices[1].lng-vertices[0].lng) };
      const pixel = map.latLngToContainerPoint(location), rect = map.getContainer().getBoundingClientRect();
      const x = rect.left + pixel.x, y = rect.top + pixel.y;
      const actual = map.mouseEventToLatLng({clientX:x,clientY:y});
      geminiWorkflow.lastClick = {lat:actual.lat,lng:actual.lng};
      return {x,y};
    }`);
    const clickReference = async (kind) => { await settle(); await pointer(await browser.evaluate(`geminiWorkflow.inspectionTarget(${JSON.stringify(kind)})`)); };
    const popup = '.gmi-gemini-popup';
    const opened = () => browser.waitFor(`document.querySelector('${popup}')`);
    const closed = () => browser.waitFor(`!document.querySelector('${popup}')`);
    const rows = () => browser.evaluate(`Object.fromEntries(Array.from(document.querySelectorAll('${popup} dt')).map(dt=>[dt.textContent,dt.nextElementSibling.textContent]))`);
    const close = async () => { await browser.evaluate(`document.querySelector('${popup} .leaflet-popup-close-button').click()`); await closed(); await settle(); };
    const connect = async () => {
      await clickButton('Åpne Gemini WFS'); await browser.waitFor('document.querySelector("#gemini-va-connection-form")');
      await browser.evaluate('geminiWorkflow.audit.mode="inspection"; geminiWorkflow.fillCredentials(); document.querySelector("#gemini-va-connection-form").requestSubmit()');
      await browser.waitFor('!document.querySelector("#gemini-va-connection-form") && document.querySelector(".gmi-gemini-reference-point")');
      await browser.evaluate('void geminiWorkflow.audit.map.fitBounds([[59.2244,10.4345],[59.2257,10.437]],{animate:false})'); await settle();
    };
    const save = () => browser.evaluate(`geminiWorkflow.before = { result: geminiWorkflow.geminiSession.getSnapshot().result,
      evidence:JSON.stringify(geminiWorkflow.geminiSession.getSnapshot().result), layers:geminiWorkflow.useStore.getState().layers,
      highlight:geminiWorkflow.useStore.getState().ui.highlightedFeatureId, photo:geminiWorkflow.photoSession.getSnapshot(), calls:geminiWorkflow.audit.calls.length }; void 0`);
    const unchanged = async () => assert.equal(await browser.evaluate(`(() => { const b=geminiWorkflow.before; return b.result===geminiWorkflow.geminiSession.getSnapshot().result &&
      b.evidence===JSON.stringify(b.result) && b.layers===geminiWorkflow.useStore.getState().layers &&
      b.highlight===geminiWorkflow.useStore.getState().ui.highlightedFeatureId && b.photo===geminiWorkflow.photoSession.getSnapshot() && b.calls===geminiWorkflow.audit.calls.length; })()`), true);

    await t.test('eligible survey, explicit M5 fetch, actual line pointer popup and clicked anchor', async () => {
      await connect(); assert.equal(await requests(), 2);
      await browser.evaluate('geminiWorkflow.useStore.getState().setHighlightedFeature("punkter-survey-0")');
      await save(); await clickReference('LineString'); await opened();
      assert.equal(await count('.gmi-gemini-reference-line.gmi-gemini-selected'), 1);
      assert.equal(await browser.evaluate("document.querySelector('.gmi-gemini-selected').getAttribute('stroke')"), '#00FFFF');
      assert.match(await browser.evaluate(`document.querySelector('${popup}').innerText`), /Eksisterende ledning/);
      assert.deepEqual(await rows(), { Type:'Vannledning – østre grøft', Nettype:'Vann', Dimensjon:'160.00', Materiale:'PE', År:'1980',
        Status:'I drift', Eier:'Færder ÆØÅ', Ansvarlig:'<img src=x onerror=alert(1)>', Lengde:'0', 'Gemini-ID':'000123' });
      assert.equal(await browser.evaluate('geminiWorkflow.audit.map._popup.getLatLng().equals(geminiWorkflow.lastClick, 1e-10)'), true);
      await unchanged();
    });
    await t.test('inert provider strings, no links/actions/internal fields and readable semantic layout', async () => {
      assert.equal(await count(`${popup} img, ${popup} script, ${popup} a:not(.leaflet-popup-close-button), ${popup} button`), 0);
      assert.equal(await count(`${popup} h2`), 1); assert.equal(await count(`${popup} dl`), 1);
      assert(!await browser.evaluate(`document.querySelector('${popup}').innerText.includes('HIDDEN_')`));
      assert(await browser.evaluate(`document.querySelector('${popup} .leaflet-popup-content').getBoundingClientRect().width >= 330`));
      if (process.env.GEMINI_POPUP_SCREENSHOT_PATH) {
        await settle();
        await browser.waitFor(`getComputedStyle(document.querySelector('${popup}')).opacity === '1'`);
        const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
        await writeFile(process.env.GEMINI_POPUP_SCREENSHOT_PATH, Buffer.from(data, 'base64'));
      }
      await close(); await unchanged();
      assert.equal(await count('.gmi-gemini-selected'), 0);
    });
    await t.test('actual point pointer popup: fields, cover separate from literal geometry zero and point anchor', async () => {
      await clickReference('Point'); await opened();
      assert.equal(await count('.gmi-gemini-reference-point.gmi-gemini-selected'), 1);
      assert.deepEqual(await rows(), { Type:'Avløpskum', Punkttype:'Kum ÆØÅ', Funksjon:'Inspeksjon', Utførelse:'Betong', Stasjon:'0007',
        Bredde:'0', Lengde:'1.50', 'Kote lokk':'17.75', Geometrikote:'0', År:'2001', Status:'I drift', Eier:'Færder ÆØÅ', Ansvarlig:'Kommunen', 'Gemini-ID':'000456' });
      assert(await browser.evaluate(`(() => {let point;geminiWorkflow.audit.map.eachLayer(l=>{if(l.feature?.geometry.type==='Point'&&l.feature.properties.kind==='gemini-reference')point=l;}); return point.getLatLng().equals(geminiWorkflow.audit.map._popup.getLatLng());})()`));
      await unchanged(); await close();
    });
    await t.test('existing Lagmarkering controls change only the external source casing and preserve inspection', async () => {
      await save();
      await clickReference('LineString'); await opened();
      await clickButton('Lagmarkering');
      await browser.waitFor(`document.querySelector('#layer-highlight-panel input[aria-label="Markeringsfarge for Gemini WFS"]')`);
      const setControl = async (label, value) => {
        await browser.evaluate(`(() => {
          const input = document.querySelector('#layer-highlight-panel input[aria-label=${JSON.stringify(label)}]');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(String(value))});
          input.dispatchEvent(new Event('input', {bubbles:true}));
          input.dispatchEvent(new Event('change', {bubbles:true}));
          input.dispatchEvent(new KeyboardEvent('keyup', {key:'ArrowRight',bubbles:true}));
        })()`);
      };
      await setControl('Markeringsfarge for Gemini WFS', '#123456');
      await setControl('Styrke for Gemini WFS', 80);
      await setControl('Bredde for Gemini WFS', 8);
      assert.equal(await browser.evaluate("document.querySelector('.gmi-gemini-line-halo').getAttribute('stroke')"), '#123456');
      assert.equal(await browser.evaluate("document.querySelector('.gmi-gemini-line-halo').getAttribute('stroke-opacity')"), '0.8');
      assert.equal(await browser.evaluate("document.querySelector('.gmi-gemini-line-halo').getAttribute('stroke-width')"), '15');
      assert.equal(await browser.evaluate("document.querySelector('.gmi-gemini-reference-line').getAttribute('stroke')"), '#00FFFF');
      assert.equal(await count(popup), 1);
      await browser.evaluate(`document.querySelector('#layer-highlight-panel input[aria-label="Lagmarkering for Gemini WFS"]').click()`);
      assert.equal(await browser.evaluate("document.querySelector('.gmi-gemini-line-halo').getAttribute('stroke-opacity')"), '0');
      assert.equal(await count('.gmi-gemini-reference-point svg [stroke-opacity]'), 0);
      await clickButton('Nullstill lagmarkering for Gemini WFS');
      assert.equal(await browser.evaluate('geminiWorkflow.geminiPresentation.getSnapshot().marking.highlightAll'), false);
      await browser.evaluate(`document.querySelector('#layer-highlight-panel input[aria-label="Lagmarkering for Gemini WFS"]').click()`);
      await clickButton('Lukk lagmarkering');
      await close(); await unchanged();
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 600, y: 100 });
      assert.equal(await browser.evaluate("document.querySelector('.gmi-gemini-reference-line').getAttribute('stroke')"), '#0101FF');
    });
    await t.test('hover and selection stay local; switching objects and closing restore their base styles', async () => {
      await save();
      const target = await browser.evaluate('geminiWorkflow.inspectionTarget("LineString")');
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...target });
      assert.equal(await browser.evaluate("document.querySelector('.gmi-gemini-reference-line').getAttribute('stroke-width')"), '7');
      await clickReference('LineString'); await opened();
      // This fixture's point is covered by the line popup. Exercise the
      // Leaflet event here; actual point pointer targeting is covered above.
      await browser.evaluate(`geminiWorkflow.audit.map.eachLayer(layer => {
        if (layer.options.className === 'gmi-gemini-reference-line') layer.fire('mouseout');
        if (layer.options.className === 'gmi-gemini-reference-point') layer.fire('click', {latlng:layer.getLatLng()});
      }); void 0`);
      // Leaflet keeps the outgoing popup DOM during its fade animation.
      await browser.waitFor("document.querySelectorAll('.gmi-gemini-popup').length === 1 && document.querySelector('.gmi-gemini-popup h2')?.textContent === 'Eksisterende punkt'");
      assert.equal(await count('.gmi-gemini-selected'), 1);
      assert.equal(await count('.gmi-gemini-reference-point.gmi-gemini-selected'), 1);
      assert.equal(await browser.evaluate("document.querySelector('.gmi-gemini-reference-line').getAttribute('stroke-width')"), '3');
      await close();
      assert.equal(await count('.gmi-gemini-selected'), 0);
      await unchanged();
    });
    await t.test('photo pointer popup and survey pointer popup retain normal controls', async () => {
      const photo = await browser.evaluate(`(() => {const r=document.querySelector('.photo-camera-marker').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
      await pointer(photo); await browser.waitFor('document.querySelector(".photo-map-popup")');
      assert.match(await browser.evaluate('document.querySelector(".photo-map-popup").innerText'), /Synthetic photo.heic/);
      await browser.evaluate('geminiWorkflow.audit.map.closePopup(); void 0'); await settle();
      const survey = await browser.evaluate(`(() => {const map=geminiWorkflow.audit.map;let layer;map.eachLayer(l=>{if(l.feature?.properties.featureType==='Line')layer=l;});const v=layer.getLatLngs(),p=map.latLngToContainerPoint({lat:v[0].lat+.15*(v[1].lat-v[0].lat),lng:v[0].lng+.15*(v[1].lng-v[0].lng)}),r=map.getContainer().getBoundingClientRect();return{x:r.x+p.x,y:r.y+p.y};})()`);
      await pointer(survey); await browser.waitFor('document.querySelector(".gmi-feature-popup")');
      assert.equal(await count('.gmi-feature-popup .inspect-data-btn'), 1);
      await browser.evaluate('geminiWorkflow.audit.map.closePopup(); void 0'); await settle();
      assert.equal(await requests(), 2);
    });
    await t.test('hidden lines/points close only their side popup, no fetch or survey/photo mutation', async () => {
      await save();
      for (const [kind, label] of [['LineString','Vis ledninger fra Gemini WFS'],['Point','Vis punkter fra Gemini WFS']]) {
        await clickReference(kind); await opened(); await clickButton(label); await closed();
        await clickButton(label); await browser.waitFor(`document.querySelector('.gmi-gemini-reference-${kind==='Point'?'point':'line'}')`);
      }
      await unchanged();
    });
    await t.test('measurement owns reference clicks, retains geometry and closes prior popup', async () => {
      await clickReference('LineString'); await opened();
      await browser.evaluate('geminiWorkflow.useStore.getState().toggleMeasureMode()'); await closed();
      await browser.waitFor('document.querySelector(".gmi-gemini-reference-line").style.pointerEvents === "none"');
      const before = await browser.evaluate('geminiWorkflow.useStore.getState().ui.measurePoints.length');
      await clickReference('LineString');
      assert.equal(await browser.evaluate('geminiWorkflow.useStore.getState().ui.measurePoints.length'), before+1);
      assert.equal(await count(popup), 0);
      await browser.evaluate('geminiWorkflow.useStore.getState().toggleMeasureMode()');
      await browser.waitFor('document.querySelector(".gmi-gemini-reference-line").style.pointerEvents === "auto"');
    });
    await t.test('manual photo placement and direction editing suppress inspection and preserve their ownership', async () => {
      await clickReference('Point'); await opened();
      await browser.evaluate(`geminiWorkflow.audit.setMapMode({photoDirectionEdit:{ticket:{photoId:'synthetic',layerId:'synthetic'},degrees:42}})`); await closed();
      await clickReference('Point'); assert.equal(await count(popup), 0);
      await browser.evaluate(`geminiWorkflow.audit.setMapMode({photoPlacement:{ticket:{},position:null},onPhotoPropose:()=>{geminiWorkflow.audit.proposed=(geminiWorkflow.audit.proposed||0)+1}})`);
      await browser.waitFor('document.querySelector(".photo-placement-active")');
      await clickReference('LineString'); assert.equal(await count(popup), 0);
      assert.equal(await browser.evaluate('geminiWorkflow.audit.proposed'), 1);
      await browser.evaluate('geminiWorkflow.audit.setMapMode({})');
      await browser.waitFor('document.querySelector(".gmi-gemini-reference-line").style.pointerEvents === "auto"');
      assert.equal(await requests(), 2);
    });
    await t.test('dragging from reference geometry still pans without opening inspection or fetching', async () => {
      await settle();
      const before = await browser.evaluate('({lat:geminiWorkflow.audit.map.getCenter().lat,lng:geminiWorkflow.audit.map.getCenter().lng})');
      const start = await browser.evaluate('geminiWorkflow.inspectionTarget("LineString")');
      await browser.send('Input.dispatchMouseEvent', { type:'mouseMoved', ...start });
      await browser.send('Input.dispatchMouseEvent', { type:'mousePressed', ...start, button:'left', buttons:1, clickCount:1 });
      for (const offset of [8, 20, 40]) await browser.send('Input.dispatchMouseEvent', { type:'mouseMoved', x:start.x+offset, y:start.y+offset, buttons:1 });
      await browser.send('Input.dispatchMouseEvent', { type:'mouseReleased', x:start.x+40, y:start.y+40, button:'left', buttons:0, clickCount:1 });
      await settle();
      assert.equal(await browser.evaluate(`geminiWorkflow.audit.map.getCenter().equals(${JSON.stringify(before)})`), false);
      assert.equal(await count(popup), 0); assert.equal(await requests(), 2);
    });
    await t.test('same good result retains popup while pending; replacement closes old content', async () => {
      await clickReference('LineString'); await opened();
      await browser.evaluate('geminiWorkflow.audit.mode="pending"'); await clickButton('Oppdater Gemini-referanse');
      await browser.waitFor('geminiWorkflow.audit.calls.length===4'); assert.equal(await count(popup), 1);
      await browser.evaluate('geminiWorkflow.release("inspection")'); await closed();
      await browser.waitFor('geminiWorkflow.geminiSession.getSnapshot().status!=="loading"');
      assert.equal(await requests(), 4);
      await clickReference('Point'); await opened(); await close(); assert.equal(await requests(), 4);
    });
    await t.test('disconnect, clear, source removal and reset remove owned popups/reference without requests', async () => {
      await clickReference('LineString'); await opened(); await clickButton('Koble fra Gemini WFS'); await closed();
      assert.equal(await count('.gmi-gemini-reference-line'), 0); assert.equal(await requests(), 4);
      for (const action of ['clearResult()', 'source', 'reset']) {
        await connect(); await clickReference('Point'); await opened(); const before=await requests();
        await browser.evaluate(action==='source' ? 'geminiWorkflow.useStore.getState().removeLayer("survey")' :
          action==='reset' ? 'geminiWorkflow.useStore.getState().resetAll()' : `geminiWorkflow.geminiSession.${action}`);
        await closed(); assert.equal(await count('.gmi-gemini-reference-point'), 0); assert.equal(await requests(), before);
        if(action==='source') await browser.evaluate('geminiWorkflow.sources("single")');
      }
      assert.deepEqual(await browser.evaluate('geminiWorkflow.audit.errors'), []);
      assert(await browser.evaluate('geminiWorkflow.privateStateClean()'));
    });
  } finally { if (browser) await browser.close(); await app.close(); }
});
