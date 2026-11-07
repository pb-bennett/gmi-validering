import { createLayerWithoutPlacement, waitForThumbnails } from './helpers/photoImportWizard.mjs';
import { assertGeminiConventions } from './helpers/geminiPhotoConventions.mjs';
import { strFromU8 } from 'fflate';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { gmiText } from './helpers/gmiPhotoFixtures.mjs';
import { buildPreview, canAdvance, canDownload, chooseFormat, closeExport, deliveryState, downloadZip, exportDialog, fillContextInHub, openCompletionFromExport, openExport, previewNames, returnToExport, selectedFormat, setLabel } from './helpers/photoExportWizard.mjs';
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
        const original=['flat.png','line.png'].includes(relative)?Uint8Array.from(atob(${JSON.stringify(unresolvedBytes)}),c=>c.charCodeAt(0)):data;
        const file=new File([original], relative.split('/').at(-1), {type:'image/png'});
        Object.defineProperty(file,'webkitRelativePath',{value:'Delivery/'+relative}); transfer.items.add(file);
      }
      const input=document.querySelector('input[aria-label="Velg mappe"]');
      if(!input.hasAttribute('webkitdirectory'))throw new Error('Not a folder input');
      input.files=transfer.files; input.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    const openEntry = async () => {
      await browser.evaluate(`document.querySelector('button[aria-label="Koble bilder til GMI-laget"]').click()`);
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
      await browser.waitFor('document.querySelector("button[aria-label=\\\"Koble bilder til GMI-laget\\\"]")');
      const inspectorFact = (section, term) => `Array.from(document.querySelectorAll('.photo-workspace-inspector section[aria-label=${section}] dt')).find((e) => e.textContent === ${JSON.stringify(term)})?.nextElementSibling.textContent.trim()`;
      const repeatedRows = () => browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-list li[data-photo-id]')).filter((li) => /^a\\.png, .*plassering \\d av \\d/.test(li.querySelector('.photo-workspace-row').getAttribute('aria-label'))).map((li) => li.dataset.photoId)`);
      const selectRow = (id) => browser.evaluate(`document.querySelector('.photo-workspace-list li[data-photo-id="${id}"] .photo-workspace-row').click()`);
      const metadataDialog = 'document.querySelector(".photo-metadata-dialog[open]")';
      // Rediger opptaksdata…: choices are 'evidence:<id>', 'other' or 'remove'; values fill the native fields.
      const editMetadata = async ({ time, timeValue, name, nameValue }) => {
        await click(browser, 'Rediger opptaksdata…', 'document.querySelector(".photo-workspace-inspector")');
        await browser.waitFor(metadataDialog);
        const choose = (group, value) => browser.evaluate(`Array.from(${metadataDialog}.querySelectorAll('.photo-metadata-body > fieldset'))[${group}].querySelector('input[type=radio][value^="${value}"]').click()`);
        const set = (selector, value) => browser.evaluate(`(() => { const e = ${metadataDialog}.querySelector('${selector}'); const proto = e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event(e instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); })()`);
        if (time) {
          await choose(0, time);
          if (timeValue) { await set('input[type=date]', timeValue.date); await set('input[type=time]', timeValue.time); await set('.photo-capture-time-field select', timeValue.zone || ''); }
        }
        if (name) {
          await choose(1, name);
          if (nameValue) await set('.photo-metadata-text input', nameValue);
        }
        await click(browser, 'Lagre', metadataDialog);
        await browser.waitFor(`!${metadataDialog}`);
      };
      const setDirection = async (degrees) => {
        await clickSourceControl(browser, 'Juster plassering og retning', 'document');
        await browser.waitFor('document.querySelector(".photo-edit-command-bar")');
        await browser.evaluate(`(() => { const input = document.querySelector('.photo-edit-command-bar input[type=number]'); input.focus();
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(String(degrees))}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
        await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
        await browser.waitFor('document.querySelector("[data-edit-count]")');
        await click(browser, 'Lagre endringer', 'document.querySelector(".photo-edit-command-bar")');
        await browser.waitFor('!document.querySelector(".photo-edit-command-bar")');
      };
      const hub = 'document.querySelector(".photo-completion-dialog[open]")';
      const hubPanel = (key) => `${hub}.querySelector('[data-completion-panel="${key}"]')`;
      const openHub = async () => { await click(browser, 'Fullfør opplysninger…'); await browser.waitFor(hub); };
      const closeHub = async () => { await browser.evaluate(`${hub}.querySelector('.photo-import-footer .gmi-primary-control').click()`); await browser.waitFor(`!${hub}`); };
      const setHubValue = (selector, value) => browser.evaluate(`(() => { const element = ${selector}, proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); })()`);
      // Selects every open row in a task, fills its form and applies the one value to them. Returns the count on the button.
      const fillInHub = async (task, fields) => {
        await browser.evaluate(`${hub}.querySelector('[data-task="${task}"]').click()`);
        await browser.waitFor(hubPanel(task));
        const form = `${hubPanel(task)}.querySelector('[data-manual-fill="${task}"]')`;
        await browser.evaluate(`${form}.open = true`);
        assert(await browser.evaluate(`Array.from(${form}.querySelectorAll('input:not([type=checkbox])')).every((input) => input.value === '')`), 'nothing is prefilled');
        await browser.evaluate(`${hubPanel(task)}.querySelectorAll('[data-group] details, details[data-group]').forEach((item) => { item.open = true; })`);
        await browser.evaluate(`Array.from(${hubPanel(task)}.querySelectorAll('[data-completion-row] input[type=checkbox]:not(:checked)')).forEach((item) => item.click())`);
        for (const [selector, value] of fields) await setHubValue(`${form}.querySelector('${selector}')`, value);
        await browser.waitFor(`!${form}.querySelector('button[type=submit]').disabled`);
        const label = await browser.evaluate(`${form}.querySelector('button[type=submit]').innerText`);
        await browser.evaluate(`${form}.querySelector('button[type=submit]').click()`);
        await browser.waitFor(`${hub}.querySelector('.photo-import-footer [role=status]').innerText.includes('godtatt for')`);
        return label;
      };
      const TIME_FIELDS = (date, time, zone = '') => [['input[type=date]', date], ['input[type=time]', time], ['select', zone]];
      await t.test('ordinary loaded GMI exposes a usable photo action; reference state is connected through the real form', async () => {
        assert.equal(await browser.evaluate('document.querySelector("button[aria-label=\\\"Koble bilder til GMI-laget\\\"]").getAttribute("aria-disabled")'), null);
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
      await waitForThumbnails(browser);
      await click(browser, 'Neste', 'document.querySelector(".photo-collection-dialog")');
      await browser.waitFor('document.querySelector(".photo-import-review")');
      await t.test('outcomes and exceptions at both desktop sizes; diagnostics collapsed and no GMI picker', async () => {
        assert.equal(await browser.evaluate('document.querySelectorAll(".photo-import-figures dd")[0].textContent'), '7');
        assert.equal(await browser.evaluate('document.querySelectorAll(".photo-import-figures dd")[1].textContent'), '3');
        assert(await browser.evaluate('document.querySelector("[aria-label=\\\"Trenger kontroll\\\"]")!==null'));
        assert.equal(await browser.evaluate('document.querySelector(".photo-import-steps").innerText.includes("Plassering")'),false);
        assert.equal(await browser.evaluate('document.querySelector(".photo-import-review details").open'),false);
        for(const [width,height] of [[1920,1080],[1280,720]]) {
          await browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
          const bounds=await browser.evaluate('document.querySelector(".photo-import-footer .gmi-primary-control").getBoundingClientRect().toJSON()');
          assert(bounds.right<=width&&bounds.bottom<=height);
        }
      });
      await click(browser,'Opprett fotolag','document.querySelector(".photo-collection-dialog")');
      await browser.waitFor('!document.querySelector(".photo-collection-dialog") && document.querySelectorAll(".photo-camera-marker").length===4');
      assert.equal(await browser.evaluate('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length'),8);
      assert.equal(await browser.evaluate('new Set(Array.from(document.querySelectorAll(".photo-workspace-list img")).map(e=>e.src)).size'),7);
      await t.test('bulk export readiness: evidence first, manual fallback, correct ownership, preserved values and zero remaining metadata blockers', async () => {
        const inspector = `document.querySelector('.photo-workspace-inspector')`;
        const rows = await repeatedRows();
        await selectRow(rows[0]);
        await editMetadata({ time: 'other', timeValue: { date: '2025-01-02', time: '01:02:03' } });
        await setDirection(90);
        await openExport(browser);
        await chooseFormat(browser, 'legacy2019');
        const count = (code) => browser.evaluate(`Number(${exportDialog}.querySelector('[data-diagnostic-code="${code}"] summary')?.textContent.split('—').at(-1).trim()||0)`);
        assert.equal(await deliveryState(browser),'blocked');
        assert.equal(await count('capture-time-required'),1,'only the photo no source has a time for');
        assert.equal(await count('direction-required'),0,'source directions and defaults are already in place');
        assert.equal(await browser.evaluate(`${exportDialog}.querySelectorAll('[data-manual-fill]').length`),0,'corrections belong to the hub');
        assert(!await canAdvance(browser)); assert(!await canDownload(browser));
        await openCompletionFromExport(browser);
        assert.equal(await fillInHub('captureTime', TIME_FIELDS('2026-09-17', '10:30:02.125', '+02:00')),'Bruk på 1 valgt bilde','a photo without a position is not in the hub');
        await browser.waitFor(`${hub}.querySelector('[data-task="photographer"] .photo-completion-task-count')`);
        assert.equal(await fillInHub('photographer', [['input', ' Fallback   Artist ']]),'Bruk på 1 valgt bilde');
        assert.equal(await fillInHub('direction', [['input[type=number]', '0']]),'Bruk på 1 valgt plassering');
        await returnToExport(browser);
        assert.equal(await selectedFormat(browser),'legacy2019','the format survives the trip to the hub');
        assert.equal(await count('capture-time-required'),0); assert.equal(await count('direction-required'),0);
        await buildPreview(browser);
        assert(await canDownload(browser));
        assert(await browser.evaluate(`${exportDialog}.textContent.includes('7 unike bilder i laget · 8 forekomster')`));
        await closeExport(browser);
        await selectRow(rows[0]);
        await browser.waitFor(`${inspectorFact('Opptak', 'Opptakstid')} === '02.01.2025 01:02:03 · tidssone ukjent'`);
        assert.equal(await browser.evaluate(inspectorFact('Opptak', 'Opptakstid fra')), 'Manuell');
        assert.equal(await browser.evaluate(inspectorFact('Plassering', 'Retning')), '90° Ø');
        await selectRow(rows[1]);
        await browser.waitFor(`${inspectorFact('Plassering', 'Retning')} === '0° N'`);
        assert.equal(await browser.evaluate('photoWfsCalls'),2);
      });
      await t.test('canonical metadata: manual, adopt, clear, whole-layer missing-only fill and shared repeated occurrences', async () => {
        const inspector = `document.querySelector('.photo-workspace-inspector')`;
        const metadata = () => browser.evaluate(`({ captureTime: ${inspectorFact('Opptak', 'Opptakstid')}, photographer: ${inspectorFact('Opptak', 'Fotograf')} })`);
        const accepted = (field, value) => browser.waitFor(`${inspectorFact('Opptak', field === 'captureTime' ? 'Opptakstid' : 'Fotograf')} === ${JSON.stringify(value)}`);
        const rows = await repeatedRows();
        await selectRow(rows[0]);
        await editMetadata({ time: 'remove' });
        await accepted('captureTime', 'Ikke angitt');
        await editMetadata({ name: 'other', nameValue: 'Manual Artist', time: 'other', timeValue: { date: '2026-06-01', time: '10:20:30', zone: '+02:00' } });
        await accepted('photographer', 'Manual Artist'); await accepted('captureTime', '01.06.2026 10:20:30 (+02:00)');
        // Capture metadata is asset-level: the sibling occurrence shows the same accepted values.
        await selectRow(rows[1]);
        await accepted('photographer', 'Manual Artist'); await accepted('captureTime', '01.06.2026 10:20:30 (+02:00)');
        await editMetadata({ time: 'evidence:', name: 'evidence:' });
        await accepted('captureTime', '12.05.2026 14:33:02 · tidssone ukjent'); await accepted('photographer', 'Synthetic Artist');
        assert.equal(await browser.evaluate(`Array.from(${inspector}.querySelectorAll('section[aria-label=Opptak] dt')).filter((e) => /^(Opptakstid|Fotograf) fra$/.test(e.textContent)).map((e) => e.nextElementSibling.textContent).join('|')`), 'EXIF DateTimeOriginal|EXIF Artist');
        await editMetadata({ time: 'remove', name: 'remove' });
        await accepted('captureTime', 'Ikke angitt'); await accepted('photographer', 'Ikke angitt');
        const allRows = await browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-list li[data-photo-id]')).map(li=>li.dataset.photoId)`);
        const before = {};
        const placed = {};
        for (const id of allRows) {
          await selectRow(id); await browser.waitFor(`${inspector}.querySelector('section[data-photo-id="${id}"]')`); before[id] = await metadata();
          placed[id] = await browser.evaluate(`document.querySelector('.photo-workspace-list li[data-photo-id="${id}"]').innerText.includes('Uplassert') === false`);
        }
        // Missing-only fill in the hub: it reaches placed photos that lack a value, and it writes over nothing.
        await openHub();
        assert.equal(await fillInHub('photographer', [['input', 'Batch Artist']]),'Bruk på 1 valgt bilde');
        assert.equal(await fillInHub('captureTime', TIME_FIELDS('2026-07-02', '11:12:13')),'Bruk på 1 valgt bilde');
        await closeHub();
        for (const id of allRows) {
          await selectRow(id);
          for (const [field, value] of [['photographer', 'Batch Artist'], ['captureTime', '02.07.2026 11:12:13 · tidssone ukjent']]) {
            await accepted(field, before[id][field] === 'Ikke angitt' && placed[id] ? value : before[id][field]);
          }
        }
        assert.equal(await browser.evaluate('photoWfsCalls'), 2);
      });
      await t.test('experimental dual export: explicit profiles, ready Legacy, truthful-context controls, shared originals and WFS isolation', async () => {
        await openExport(browser);
        assert.equal(await selectedFormat(browser), 'legacy2019', 'the format chosen earlier is kept for the session');
        await chooseFormat(browser, 'gemini-legacy2019');
        assert(await canAdvance(browser), 'Gemini needs no explicit choice');
        await chooseFormat(browser, 'legacy2019'); await buildPreview(browser);
        assert.equal(await browser.evaluate(`${exportDialog}.querySelectorAll('[data-diagnostic-code="capture-time-required"], [data-diagnostic-code="direction-required"]').length`),0);
        assert(await browser.evaluate(`${exportDialog}.textContent.includes('4 features · 3 vedlegg · 1 delt originalbilde')`));
        assert(await browser.evaluate(`${exportDialog}.querySelector('[data-export-counts]').innerText.includes('3 bilder · 4 plasseringer i GML-filen')`));
        assert(await browser.evaluate(`${exportDialog}.querySelector('[data-export-counts]').innerText.includes('4 plasseringer uten posisjon utelatt')`));
        assert(await browser.evaluate(`${exportDialog}.innerText.includes('Ikke testet med import i Gemini VA.')`));
        const unlabelled = await previewNames(browser);
        assert.match(unlabelled.zip, /^\d{8}-\d{6}\.zip$/);
        assert.equal(unlabelled.gml, unlabelled.zip.replace(/\.zip$/, '.gml'));
        const legacy = await downloadZip(browser, directory);
        assert.equal(await browser.evaluate(`${exportDialog}.querySelector('[data-export-guidance]').innerText`), `Pakk ut ZIP-filen. ${legacy.gml} og Attachments-mappen må ligge ved siden av hverandre.`, 'guidance names the real file');
        assert.equal(Object.keys(legacy.entries).length,4);
        assert.deepEqual(Object.keys(legacy.entries)[0], legacy.gml);
        const legacyXml=strFromU8(legacy.entries[legacy.gml]);
        assert.equal((legacyXml.match(/<app:Skråfoto /g)||[]).length,4); assert(legacyXml.includes('<app:fotograf>Batch Artist</app:fotograf>'));
        for (const degrees of [0,90,359.875]) assert(legacyXml.includes(`<app:retningsverdi>${degrees}</app:retningsverdi>`));
        assert(legacyXml.includes('2026-09-17T10:30:02.125+02:00'));
        for(const [name,data] of Object.entries(legacy.entries))if(!name.endsWith('.gml'))assert.deepEqual(data,Uint8Array.from(Buffer.from(/\/(flat|line)\.png$/.test(name)?unresolvedBytes:bytes,'base64')));
        await setLabel(browser, '  Grøft / nord  ');
        assert.equal(await browser.evaluate(`Boolean(${exportDialog}.querySelector('[data-export-zip]'))`), false, 'a new label needs a new plan: going back to change it discarded the one with the old name');
        assert(await browser.evaluate(`${exportDialog}.querySelector('[data-export-name-format]').innerText.includes('-Groeft-nord.zip')`));
        assert.equal(await browser.evaluate(`${exportDialog}.querySelector('[aria-label="Eksportetikett"]').value`), '  Grøft / nord  ');
        await chooseFormat(browser, 'gemini-legacy2019'); await buildPreview(browser);
        assert(await browser.evaluate(`${exportDialog}.textContent.includes('EPSG:5972') && ${exportDialog}.textContent.includes('Z-plassholdere')`));
        assert.equal(await browser.evaluate(`${exportDialog}.querySelectorAll('[data-diagnostic-code="capture-time-required"]').length`), 0);
        const labelled = await previewNames(browser);
        assert.match(labelled.zip, /^\d{8}-\d{6}-Groeft-nord\.zip$/);
        assert(await browser.evaluate(`${exportDialog}.querySelector('[data-diagnostic-code="compatibility-import"]').textContent.includes(${JSON.stringify(labelled.gml)})`));
        const gemini = await downloadZip(browser, directory);
        const geminiXml = strFromU8(gemini.entries[gemini.gml]);
        assertGeminiConventions(geminiXml);
        assert(geminiXml.includes('2026-09-17T10:30:02</app:fotograferingstidspunkt>'));
        assert(!geminiXml.includes('fotoinformasjon'));
        assert.equal(Object.keys(gemini.entries).length, 4);
        for (const [name, data] of Object.entries(gemini.entries)) if (name !== gemini.gml) assert.deepEqual(data, legacy.entries[name]);
        await chooseFormat(browser, 'asbuilt52');
        assert(await browser.evaluate(`${exportDialog}.textContent.includes('Datafangstdato: oppgi')`));
        assert(!await canAdvance(browser)); assert(!await canDownload(browser));
        // All seven fields go through the hub, the only form for them.
        await openCompletionFromExport(browser);
        await fillContextInHub(browser, { surveyDate: '2026-05-12', datasetName: 'Synthetic export dataset', projectName: 'Synthetic export project', horizontalMethod: '99', verticalMethod: '99', surveyReason: 'nytt', surveyConditions: 'åpenGrøft' });
        await browser.waitFor(`${hub}.querySelector('[data-task="context"] .photo-completion-task-done')`);
        await returnToExport(browser);
        assert.equal(await selectedFormat(browser), 'asbuilt52');
        assert.equal(await browser.evaluate(`Boolean(${exportDialog}.querySelector('[data-diagnostic-code="invalid-context"]'))`), false, 'the wizard uses what the hub accepted');
        await setLabel(browser, 'AsBuilt');
        await buildPreview(browser);
        assert(await browser.evaluate(`${exportDialog}.textContent.includes('fotograf utelates i AsBuilt 5.2')`));
        assert(await browser.evaluate(`${exportDialog}.textContent.includes('Eksperimentell 2D')`));
        for (const [width, height] of [[1920, 1080], [1280, 720]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          const bounds = await browser.evaluate(`(() => {const d=${exportDialog},r=d.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,overflow:d.scrollWidth>d.clientWidth};})()`);
          assert(bounds.left >= 0 && bounds.right <= width && bounds.top >= 0 && bounds.bottom <= height);
          assert.equal(bounds.overflow, false);
          if (process.env.PHOTO_SCREENSHOT_DIR) {
            await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive: true });
            const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
            await writeFile(path.join(process.env.PHOTO_SCREENSHOT_DIR, `photo-export-${width}x${height}.png`), Buffer.from(data, 'base64'));
          }
        }
        const modern = await downloadZip(browser, directory);
        assert.match(modern.zip, /^\d{8}-\d{6}-AsBuilt\.zip$/);
        const modernXml=strFromU8(modern.entries[modern.gml]);assert(!modernXml.includes('<app:fotoinformasjon>')); assert(modernXml.includes('Synthetic export dataset'));
        for (const value of ['Synthetic export project', '2026-05-12', 'åpenGrøft', 'nytt']) assert(modernXml.includes(value), value);
        assert.equal((modernXml.match(/<app:Skråfoto /g)||[]).length,4);
        for(const [name,data] of Object.entries(modern.entries))if(!name.endsWith('.gml'))assert.deepEqual(data,Uint8Array.from(Buffer.from(/\/(flat|line)\.png$/.test(name)?unresolvedBytes:bytes,'base64')));
        assert.equal(await browser.evaluate('photoWfsCalls'),2);
        await closeExport(browser);
      });
      let expectedPhotographerAfterAppend;
      await t.test('repeated image occurrences select independently with one original URL; current GMI inspector, preview and panes remain', async () => {
        const rows = await repeatedRows();
        assert.equal(rows.length, 2);
        const urls = [];
        for (const id of rows.slice(0, 2)) {
          await selectRow(id);
          await browser.waitFor('document.querySelector(".photo-workspace-inspector img")?.getAttribute("src")');
          urls.push(await browser.evaluate('document.querySelector(".photo-workspace-inspector img").src'));
          assert.equal(await browser.evaluate(inspectorFact('Plassering', 'Kilde')), 'GMI');
        }
        assert.equal(urls[0], urls[1]);
        assert.equal(await browser.evaluate('getComputedStyle(document.querySelector(".leaflet-photo-markers-pane")).zIndex'), '620');
        expectedPhotographerAfterAppend = await browser.evaluate(inspectorFact('Opptak', 'Fotograf'));
        await click(browser, 'Tilbake til appen', 'document');
      });
      await t.test('append reuses existing assets and recheck does not multiply occurrences or issue WFS requests', async () => {
        await openEntry(); await folder(); await waitForThumbnails(browser);
        await click(browser, 'Neste', 'document.querySelector(".photo-collection-dialog")');
        await browser.evaluate(`(() => {const s=document.querySelector('select[aria-label="Velg FOTO-mållag"]');s.value=s.options[1].value;s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
        await click(browser, 'Legg til i fotolaget', 'document.querySelector(".photo-collection-dialog")');
        await browser.waitFor('!document.querySelector(".photo-collection-dialog")');
        assert.equal(await browser.evaluate('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length'), 8);
        assert.equal(await browser.evaluate('document.querySelectorAll(".photo-camera-marker").length'), 4);
        assert.equal(await browser.evaluate('photoWfsCalls'), 2);
        assert.equal(await browser.evaluate(inspectorFact('Opptak', 'Fotograf')),expectedPhotographerAfterAppend);
      });
      await t.test('ordinary Bilder import still works independently and does not fetch WFS', async () => {
        await click(browser, 'Tilbake til appen', 'document'); await click(browser, 'Bilder', 'document');
        await browser.evaluate(`(() => {const data=Uint8Array.from(atob(${JSON.stringify(bytes)}),c=>c.charCodeAt(0)),t=new DataTransfer();t.items.add(new File([data],'ordinary.png',{type:'image/png'}));
          const i=document.querySelector('input[aria-label="Velg bildefiler"]');i.files=t.files;i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
        await createLayerWithoutPlacement(browser);
        await browser.waitFor('document.querySelector(".photo-workspace-shell")');
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
