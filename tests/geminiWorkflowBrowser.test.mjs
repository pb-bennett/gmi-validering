import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFile } from 'node:fs/promises';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { serveGeminiWorkflowApp } from './helpers/geminiUiHarness.mjs';

test('M5 native form, explicit retrieval, errors, refresh and disconnect with real React/Leaflet', {
  skip: !chromePath, timeout: 180000,
}, async (t) => {
  const app = await serveGeminiWorkflowApp(); let browser;
  try {
    browser = await openTestChrome();
    await browser.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 850, deviceScaleFactor: 1, mobile: false });
    await browser.send('Page.navigate', { url: app.url });
    await browser.waitFor('globalThis.geminiWorkflow?.audit.map && document.querySelector(".photo-camera-marker")');
    const dialog = 'dialog[aria-labelledby="gemini-va-heading"]', card = 'section[aria-label="Eksisterende anlegg · Gemini WFS"]';
    const click = async (label) => browser.evaluate(`document.querySelector('button[aria-label=${JSON.stringify(label)}]').click()`);
    const count = (selector) => browser.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
    const requests = () => browser.evaluate('geminiWorkflow.audit.calls.length');
    const open = async () => {
      await browser.evaluate('document.querySelector(\'button[aria-label="Åpne Gemini WFS"]\').focus()');
      await click('Åpne Gemini WFS'); await browser.waitFor(`document.querySelector('${dialog}')?.matches(':modal')`);
    };
    const submit = async (duplicate = false) => browser.evaluate(`(() => { const form=document.querySelector('#gemini-va-connection-form'); form.requestSubmit(); ${duplicate ? 'form.requestSubmit();' : ''} })()`);
    const fill = () => browser.evaluate('geminiWorkflow.fillCredentials()');
    const done = () => browser.waitFor(`!document.querySelector('${dialog}')`);
    const idle = () => browser.waitFor('geminiWorkflow.geminiSession.getSnapshot().status !== "loading"');
    const clean = async () => assert.equal(await browser.evaluate('geminiWorkflow.privateStateClean()'), true, 'No credential leakage');
    const waitError = (text) => browser.waitFor(`document.querySelector('#gemini-va-error')?.innerText.includes(${JSON.stringify(text)})`);

    await t.test('empty workspace connects without a selector or requests and explains survey/map coverage', async () => {
      assert.equal(await count(card), 0);
      await browser.evaluate('geminiWorkflow.sources("none")'); await open();
      assert.equal(await count('#gemini-va-source'), 0);
      assert.equal(await browser.evaluate('document.querySelector("dialog button[type=submit]").disabled'), false);
      await fill(); await submit(); await done();
      assert.equal(await requests(), 0); assert.equal(await count(card), 1);
      assert.match(await browser.evaluate(`document.querySelector('${card}').innerText`), /Hent for kartutsnitt/);
      await click('Koble fra Gemini WFS'); await browser.evaluate('geminiWorkflow.sources("single")');
    });
    await t.test('one survey needs no selector; stable native login fields, focus containment and Escape cleanup', async () => {
      await open();
      assert.equal(await count('#gemini-va-source'), 0);
      const semantics = await browser.evaluate(`(() => { const form=document.querySelector('#gemini-va-connection-form'); return {
        method:form.method, fields:['username','password'].map(name=>{const e=form.elements.namedItem(name); return [e.id,e.name,e.type,e.autocomplete];}), focused:document.activeElement.id }; })()`);
      assert.deepEqual(semantics.fields, [['gemini-va-username', 'username', 'text', 'username'], ['gemini-va-password', 'password', 'password', 'current-password']]);
      assert.equal(semantics.method, 'post'); assert.equal(semantics.focused, 'gemini-va-username');
      await fill(); await clean();
      await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await done(); assert.equal(await count('#gemini-va-password'), 0); assert.equal(await requests(), 0);
      assert.equal(await browser.evaluate('document.activeElement.getAttribute("aria-label")'), 'Åpne Gemini WFS');
      await open(); assert(await browser.evaluate('document.querySelector("#gemini-va-password").value === ""')); await click('Lukk Gemini WFS');
    });
    await t.test('unsafe credential input is rejected before dispatch and cleared for correction', async () => {
      await open(); await fill();
      await browser.evaluate('document.querySelector("#gemini-va-username").value = crypto.randomUUID() + ":"');
      await submit(); await waitError('gyldig brukernavn og passord');
      assert.equal(await requests(), 0); assert(await browser.evaluate('document.querySelector("#gemini-va-password").value === ""'));
      await clean(); await click('Lukk Gemini WFS');
    });
    await t.test('normal submit sends exactly one pair, blocks duplicates, shows loading then closes on success', async () => {
      await open(); await fill(); await browser.evaluate('geminiWorkflow.audit.mode="pending"');
      await submit(true); await browser.waitFor('geminiWorkflow.audit.calls.length === 2');
      assert(await browser.evaluate('document.querySelector("dialog form").getAttribute("aria-busy") === "true"'));
      assert(await browser.evaluate('document.querySelector("dialog button[type=submit]").disabled'));
      assert.match(await browser.evaluate(`document.querySelector('${dialog}').innerText`), /Henter eksisterende anlegg/);
      assert.equal(await count('.gmi-gemini-reference-point'), 0); await clean();
      await browser.evaluate('geminiWorkflow.release()'); await done();
      await browser.waitFor(`document.querySelector('${card}') && document.querySelector('.gmi-gemini-reference-point')`);
      assert.equal(await count('.gmi-gemini-reference-line'), 1); assert.equal(await count('.gmi-gemini-reference-point'), 1);
      assert.equal(await requests(), 2); assert.equal(await count('#gemini-va-password'), 0);
      assert(await browser.evaluate('geminiWorkflow.audit.calls.every(call=>call.url === "/api/gemini-wfs" && call.credentialsMatch && call.safeHeaders && call.sameOriginCredentials)'));
      assert.deepEqual(await browser.evaluate('geminiWorkflow.audit.calls.map(call=>call.featureType)'), ['lines', 'points']); await clean();
    });
    await t.test('opening/closing, map movement, photo changes and reference toggles never fetch', async () => {
      const before = await requests();
      await open(); await click('Lukk Gemini WFS'); await done();
      await click('Vis ledninger fra Gemini WFS'); await browser.waitFor('!document.querySelector(".gmi-gemini-reference-line")');
      await click('Vis punkter fra Gemini WFS'); await browser.waitFor('!document.querySelector(".gmi-gemini-reference-point")');
      await browser.evaluate('void geminiWorkflow.audit.map.panBy([10,10], {animate:false})');
      await browser.evaluate('geminiWorkflow.photoSession.importFiles([new File(["synthetic"],"another.heic")]); void 0');
      assert.equal(await requests(), before);
      await click('Vis punkter fra Gemini WFS');
    });
    await t.test('direct refresh reuses private credentials/generation and retains prior pair while loading', async () => {
      await browser.evaluate('geminiWorkflow.generation=geminiWorkflow.geminiSession.getSnapshot().accountGeneration; geminiWorkflow.good=geminiWorkflow.geminiSession.getSnapshot().result; geminiWorkflow.audit.mode="pending"');
      await click('Oppdater Gemini-referanse'); await browser.waitFor('geminiWorkflow.audit.calls.length === 4');
      assert.equal(await count(dialog), 0); assert(await browser.evaluate('geminiWorkflow.good === geminiWorkflow.geminiSession.getSnapshot().result'));
      assert.equal(await count('.gmi-gemini-reference-line'), 0); assert.equal(await count('.gmi-gemini-reference-point'), 1);
      await browser.evaluate('geminiWorkflow.release("replacement")'); await idle();
      await browser.waitFor('document.querySelectorAll(".gmi-gemini-reference-point").length === 2');
      assert(await browser.evaluate('geminiWorkflow.generation === geminiWorkflow.geminiSession.getSnapshot().accountGeneration'));
      assert.equal(await count('.gmi-gemini-reference-line'), 0); await clean();
    });
    await t.test('failed refresh keeps old geometry/provenance and safe retry status', async () => {
      await browser.evaluate('geminiWorkflow.good=geminiWorkflow.geminiSession.getSnapshot().result; geminiWorkflow.audit.mode="timeout"');
      await click('Oppdater Gemini-referanse'); await idle();
      assert(await browser.evaluate('geminiWorkflow.good === geminiWorkflow.geminiSession.getSnapshot().result'));
      assert.equal(await count('.gmi-gemini-reference-point'), 2);
      assert.match(await browser.evaluate(`document.querySelector('${card} [role="status"]').innerText`), /for lang tid/); await clean();
    });
    await t.test('401 reports unresolved authentication; resubmission rotates account and can succeed', async () => {
      await browser.evaluate('geminiWorkflow.audit.mode="auth"'); await click('Oppdater Gemini-referanse'); await idle();
      await browser.waitFor('document.querySelector(\'button[aria-label="Oppgi Gemini-tilgang"]\')');
      await click('Oppgi Gemini-tilgang'); await browser.waitFor(`document.querySelector('${dialog}')`);
      await waitError('Gemini WFS-tjenesten avviste autentiseringen');
      assert(await browser.evaluate('document.querySelector("#gemini-va-password").required'));
      await fill(); await browser.evaluate('geminiWorkflow.audit.mode="pending"'); await submit();
      await browser.waitFor('geminiWorkflow.geminiSession.getSnapshot().status === "loading"');
      assert.equal(await count('.gmi-gemini-reference-point'), 0); assert(await browser.evaluate('geminiWorkflow.generation !== geminiWorkflow.geminiSession.getSnapshot().accountGeneration'));
      await browser.evaluate('geminiWorkflow.release()'); await done(); await clean();
    });
    await t.test('new loaded surveys automatically fetch separate pairs and merge into one deduplicated source', async () => {
      const before = await requests();
      await browser.evaluate('geminiWorkflow.sources("multiple")'); await idle();
      assert.equal(await requests(), before + 4);
      assert.equal(await count(card), 1);
      assert.equal(await browser.evaluate('geminiWorkflow.geminiSession.getSnapshot().coverages.length'), 3);
      assert.deepEqual(await browser.evaluate('geminiWorkflow.geminiSession.getSnapshot().result.counts'), { lines:1, points:1, total:2 });
      assert(await browser.evaluate('geminiWorkflow.audit.calls.slice(-4).every(call=>call.bbox[2]-call.bbox[0]===270)'));
      await browser.evaluate(`geminiWorkflow.useStore.getState().toggleLayerVisibility('second');
        geminiWorkflow.useStore.getState().setLayerHighlightEnabled('second',true);
        geminiWorkflow.useStore.getState().setLayerHighlightColor('second','#ABCDEF')`);
      assert.equal(await requests(), before + 4); await clean();
    });
    const setMapLevel = async (level) => {
      await browser.evaluate(`(() => {
        const w=geminiWorkflow;
        for(let zoom=22; zoom>=3; zoom--) {
          w.audit.map.setView([59.225,10.4355],zoom,{animate:false});
          const bbox=w.readGeminiMapBbox();
          if(w.classifyGeminiMapExtent(bbox).level===${JSON.stringify(level)}) return;
        }
        throw new Error('No viewport for test level');
      })()`);
    };
    const mapDialog = 'dialog[aria-label="Hent for kartutsnitt"]';
    await t.test('actual current Leaflet viewport fetches without buffer and repeated view refreshes one manual coverage', async () => {
      await setMapLevel('ordinary');
      const bbox = await browser.evaluate('geminiWorkflow.readGeminiMapBbox()');
      const before = await requests();
      await click('Hent for kartutsnitt'); await idle();
      assert.equal(await requests(), before + 2);
      assert.deepEqual(await browser.evaluate('geminiWorkflow.audit.calls.at(-1).bbox'), bbox);
      const areas = await browser.evaluate('geminiWorkflow.geminiSession.getSnapshot().coverages.length');
      await click('Hent for kartutsnitt'); await idle();
      assert.equal(await requests(), before + 4);
      assert.equal(await browser.evaluate('geminiWorkflow.geminiSession.getSnapshot().coverages.length'), areas);
      assert.deepEqual(await browser.evaluate('geminiWorkflow.geminiSession.getSnapshot().result.counts'), {lines:1,points:1,total:2});
    });
    await t.test('large viewport cancellation dispatches zero; Hent likevel confirms exactly one pair', async () => {
      await setMapLevel('confirm'); const before = await requests();
      await click('Hent for kartutsnitt'); await browser.waitFor(`document.querySelector('${mapDialog}')?.matches(':modal')`);
      assert.equal(await requests(), before);
      assert.match(await browser.evaluate(`document.querySelector('${mapDialog}').innerText`), /stort omr/);
      await browser.evaluate(`document.querySelector('${mapDialog} button').click()`);
      await browser.waitFor(`!document.querySelector('${mapDialog}')`); assert.equal(await requests(), before);
      await click('Hent for kartutsnitt'); await browser.waitFor(`document.querySelector('${mapDialog}')?.matches(':modal')`);
      await browser.evaluate(`Array.from(document.querySelectorAll('${mapDialog} button')).find(b=>b.textContent==='Hent likevel').click()`);
      await idle(); assert.equal(await requests(), before + 2);
    });
    await t.test('excessive viewport cannot continue and sends zero requests', async () => {
      await setMapLevel('blocked'); const before = await requests();
      await click('Hent for kartutsnitt'); await browser.waitFor(`document.querySelector('${mapDialog}')?.matches(':modal')`);
      assert.match(await browser.evaluate(`document.querySelector('${mapDialog}').innerText`), /for stort for/);
      assert.equal(await browser.evaluate(`document.querySelectorAll('${mapDialog} button').length`), 1);
      await browser.evaluate(`document.querySelector('${mapDialog} button').click()`); assert.equal(await requests(), before);
    });
    await t.test('Oppdater refreshes all automatic and recorded manual areas while retaining visible data', async () => {
      const areas = await browser.evaluate('geminiWorkflow.geminiSession.getSnapshot().coverages.length');
      const before = await requests();
      await browser.evaluate('geminiWorkflow.good=geminiWorkflow.geminiSession.getSnapshot().result; geminiWorkflow.audit.mode="pending"');
      await click('Oppdater Gemini-referanse');
      await browser.waitFor(`geminiWorkflow.audit.calls.length===${before + 4}`);
      assert(await browser.evaluate('geminiWorkflow.good===geminiWorkflow.geminiSession.getSnapshot().result'));
      // Release each bounded wave, including units that have not started yet.
      await browser.evaluate('geminiWorkflow.release()'); await idle();
      assert.equal(await requests(), before + areas * 2); await clean();
    });
    await t.test('disconnect discards manual areas and pending map confirmation; reconnect derives only current surveys', async () => {
      await setMapLevel('confirm');
      await click('Hent for kartutsnitt'); await browser.waitFor(`document.querySelector('${mapDialog}')?.matches(':modal')`);
      await browser.evaluate('geminiWorkflow.geminiSession.disconnect()');
      await browser.waitFor(`!document.querySelector('${mapDialog}')`);
      assert.equal(await browser.evaluate('geminiWorkflow.geminiSession.getSnapshot().coverages.length'), 0);
      await open(); await fill(); await submit(); await done();
      assert.equal(await count(mapDialog), 0);
      assert(await browser.evaluate('geminiWorkflow.geminiSession.getSnapshot().coverages.length===3 && geminiWorkflow.geminiSession.getSnapshot().coverages.every(area=>area.kind==="survey")'));
      assert.equal(await browser.evaluate('geminiWorkflow.geminiPresentation.getSnapshot().marking.highlightAll'), false);
    });
    await t.test('explicit account replacement clears prior-account data without leaking form values', async () => {
      await open(); await fill(); await browser.evaluate('geminiWorkflow.audit.mode="pending"'); await submit();
      await browser.waitFor('geminiWorkflow.geminiSession.getSnapshot().status === "loading"');
      assert.equal(await count('.gmi-gemini-reference-point'), 0);
      assert(await browser.evaluate('geminiWorkflow.generation !== geminiWorkflow.geminiSession.getSnapshot().accountGeneration'));
      await browser.evaluate('geminiWorkflow.release()'); await done(); await clean();
    });
    await t.test('disconnect is explicit, removes reference/credentials and preserves survey/photo/WMS', async () => {
      const before = await requests(); await click('Koble fra Gemini WFS');
      await browser.waitFor(`!document.querySelector('${card}')`); assert.equal(await count('.gmi-gemini-reference-point'), 0);
      assert.equal(await browser.evaluate('geminiWorkflow.geminiSession.getSnapshot().connectionStatus'), 'disconnected');
      assert(await browser.evaluate('Boolean(geminiWorkflow.useStore.getState().layers.survey && geminiWorkflow.useStore.getState().layers.second)'));
      assert.equal(await count('.photo-camera-marker'), 1);
      assert(await browser.evaluate('geminiWorkflow.useStore.getState().ui.mapOverlayVisibility.geminiWms'));
      assert.equal(await requests(), before); await open();
      assert(await browser.evaluate('document.querySelector("#gemini-va-password").required'));
      await click('Lukk Gemini WFS');
    });
    await t.test('safe form errors cover permission, timeout, provider, size, encoding, parser and display failures', async () => {
      await browser.evaluate('geminiWorkflow.sources("single")'); await open();
      for (const [mode, text] of [['origin', 'appens sikkerhetskontroll'], ['permission', 'ikke tilgang'], ['timeout', 'for lang tid'], ['error', 'mislyktes'], ['size', 'for stort'],
        ['encoding', 'tegnkoding'], ['parser', 'kunne ikke leses'], ['display', 'kartet'], ['auth', 'Gemini WFS-tjenesten avviste autentiseringen']]) {
        await browser.evaluate(`geminiWorkflow.geminiSession.disconnect(); geminiWorkflow.audit.mode=${JSON.stringify(mode)}`);
        await fill(); await submit(); await idle(); await waitError(text);
        assert(await browser.evaluate('document.querySelector("#gemini-va-password").value === ""'));
        assert.equal(await count('.gmi-gemini-reference-point'), 0); await clean();
        assert(!await browser.evaluate('document.body.innerText.includes("UNTRUSTED_PROVIDER_DETAIL")'));
      }
      await click('Lukk Gemini WFS');
    });
    await t.test('source geometry/CRS/area errors stop before proxy requests and remain recoverable', async () => {
      await open();
      for (const [mode, text] of [['crs', 'Koordinatsystemet'], ['large', 'for stort område']]) {
        await browser.evaluate(`geminiWorkflow.geminiSession.disconnect(); geminiWorkflow.sourceVariant(${JSON.stringify(mode)})`);
        const before = await requests(); await fill(); await submit(); await waitError(text);
        assert.equal(await requests(), before); await clean();
      }
      await browser.evaluate('geminiWorkflow.sources("single"); geminiWorkflow.audit.mode="success"');
      await submit(); await done();
    });
    await t.test('closing a pending form cancels explicitly; late responses cannot recreate cleared data', async () => {
      await open(); await fill(); await browser.evaluate('geminiWorkflow.audit.mode="pending"'); await submit();
      await browser.waitFor('geminiWorkflow.geminiSession.getSnapshot().status === "loading"');
      await click('Lukk Gemini WFS'); await done(); await idle();
      assert.equal(await browser.evaluate('geminiWorkflow.geminiSession.getSnapshot().error.code'), 'request_aborted');
      await browser.evaluate('geminiWorkflow.release()');
      assert.equal(await count('.gmi-gemini-reference-point'), 0); assert.equal(await count('#gemini-va-password'), 0); await clean();
    });
    await t.test('reconnect works; WMS form semantics remain independent and final state stays private', async () => {
      await open(); await fill(); await submit(); await done();
      await browser.waitFor(`document.querySelector('${card}')`);
      if (process.env.GEMINI_WORKFLOW_SCREENSHOT_PATH) {
        await open(); const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
        await writeFile(process.env.GEMINI_WORKFLOW_SCREENSHOT_PATH, Buffer.from(data, 'base64')); await click('Lukk Gemini WFS');
      }
      await click('Test WMS setup'); await browser.waitFor('document.querySelector("#wms-password")');
      assert.equal(await browser.evaluate('document.querySelector("#wms-password").autocomplete'), 'current-password');
      assert.equal(await browser.evaluate('document.querySelector("#wms-username").autocomplete'), 'username');
      await click('Lukk'); await browser.waitFor('!document.querySelector("#wms-password")');
      await clean(); assert.equal(await browser.evaluate('geminiWorkflow.audit.errors.length'), 0);
      assert(await browser.evaluate('geminiWorkflow.audit.calls.every(call=>call.credentialsMatch && call.safeHeaders)'));
    });
    await t.test('connection edit invalidates old private session without fetch; name/URL restore after reload', async () => {
      const before = await requests();
      await browser.evaluate('geminiWorkflow.savedSurveyLayers=geminiWorkflow.useStore.getState().layers');
      await open();
      const previousId = await browser.evaluate('geminiWorkflow.geminiSession.getSnapshot().connection.id');
      await browser.evaluate(`document.querySelector('#gemini-wfs-connection-name').value='Edited connection';
        document.querySelector('#gemini-wfs-url').value='https://another.geminisuite.com/portal/api/proxy/map/other.wfs'`);
      await click('Lagre Gemini WFS-tilkobling');
      assert.equal(await requests(), before);
      assert.equal(await browser.evaluate('geminiWorkflow.geminiSession.getSnapshot().result'), null);
      assert.equal(await browser.evaluate('geminiWorkflow.geminiSession.getSnapshot().connectionStatus'), 'disconnected');
      assert.equal(await browser.evaluate('geminiWorkflow.savedSurveyLayers===geminiWorkflow.useStore.getState().layers'), true);
      const saved = await browser.evaluate("JSON.parse(localStorage.getItem('gmi-gemini-wfs-connection-v1'))");
      assert.deepEqual(Object.keys(saved).sort(), ['id', 'name', 'url']);
      assert.notEqual(saved.id, previousId);
      await clean();
      await click('Lukk Gemini WFS'); await done();
      await browser.send('Page.reload');
      await browser.waitFor('globalThis.geminiWorkflow?.audit.map');
      await open();
      assert.equal(await browser.evaluate("document.querySelector('#gemini-wfs-connection-name').value"), saved.name);
      assert.equal(await browser.evaluate("document.querySelector('#gemini-wfs-url').value"), saved.url);
      assert.equal(await browser.evaluate("document.querySelector('#gemini-va-password').value"), '');
      assert.equal(await browser.evaluate("document.querySelector('#gemini-va-username').value"), '');
      await click('Lagre Gemini WFS-tilkobling');
      assert.equal(await browser.evaluate('geminiWorkflow.geminiSession.getSnapshot().connection.id'), saved.id);
      assert.equal(await requests(), 0);
      await click('Lukk Gemini WFS'); await done(); await clean();
    });
  } finally {
    if (browser) await browser.close(); await app.close();
  }
});
