import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';

const applicationUrl = process.env.PHOTO_UI_URL, gmlPath = process.env.PHOTO_GML_FIXTURE;
test('positioning wizard: real 148-photo GML/EXIF, selection, summaries, cancellation, failures and owner lifecycle',
  { skip: !chromePath || !applicationUrl || !gmlPath, timeout: 240000 }, async () => {
    const browser = await openTestChrome(), checks = [], wizard = 'document.querySelector(".photo-positioning-wizard")';
    const markerCount = 'document.querySelectorAll(".photo-camera-marker").length';
    const click = (text, scope = 'document') => browser.evaluate(`(() => {
      const button = Array.from(${scope}.querySelectorAll('button')).find(e => e.innerText.trim() === ${JSON.stringify(text)});
      if (!button || button.disabled) throw new Error('Unavailable button: ' + ${JSON.stringify(text)}); button.click(); })()`);
    const inputFiles = async (selector, files) => {
      const { root } = await browser.send('DOM.getDocument');
      const { nodeId } = await browser.send('DOM.querySelector', { nodeId: root.nodeId, selector });
      assert(nodeId, selector); await browser.send('DOM.setFileInputFiles', { nodeId, files });
    };
    const selectedCount = () => browser.evaluate(`${wizard}.querySelectorAll('.photo-positioning-rows input:checked').length`);
    const actionCount = (action) => browser.evaluate(`${wizard}.querySelectorAll('[data-action=${action}]').length`);
    const summaryCount = (label) => browser.evaluate(`Array.from(${wizard}.querySelectorAll('dl > div')).find(e => e.querySelector('dt').innerText === ${JSON.stringify(label)}).querySelector('dd').innerText`);
    const originals = () => browser.evaluate('window.__originalUrls.size');
    const begin = async (kind = 'gml') => {
      await click('Posisjoner bilder'); await browser.waitFor(`${wizard}?.open`);
      if (kind === 'exif') await browser.evaluate(`${wizard}.querySelector('input[value=exif]').click()`);
    };
    const cancel = async () => { await click('Avbryt', wizard); await browser.waitFor(`!${wizard}`); };
    const next = () => click('Neste', wizard);
    const review = async () => { await next(); await browser.waitFor(`${wizard}.querySelector('.photo-positioning-rows')`); };
    const summary = async () => { await next(); await browser.waitFor(`${wizard}.querySelector('.photo-positioning-summary')`); };
    const apply = async (kind, count) => {
      await click(`Bruk ${kind}-posisjon for ${count} ${count === 1 ? 'bilde' : 'bilder'}`, wizard);
      await browser.waitFor(`!${wizard}`);
    };
    const screenshot = async (name) => {
      if (!process.env.PHOTO_SCREENSHOT_DIR) return;
      await browser.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive: true });
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.PHOTO_SCREENSHOT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
    };
    const deleteLayer = async () => {
      await click('Tilbake til appen'); await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
      await browser.evaluate(`document.querySelector('button[aria-label^="Fjern fotokartlag"]').click()`);
      await click('Fjern'); await browser.waitFor('!document.querySelector("section[aria-label^=Fotokartlag]")');
    };
    const loadXml = async (xml, filename = 'positioning.gml', creation = false) => browser.evaluate(`(() => {
      const transfer = new DataTransfer(); transfer.items.add(new File([${JSON.stringify(xml)}], ${JSON.stringify(filename)}));
      const input = document.querySelector(${JSON.stringify(creation ? 'input[aria-label="Velg GML med bildeposisjoner"]' : 'input[aria-label="Velg GML for posisjonering"]')});
      input.files = transfer.files; input.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    const xmlFor = (entries) => `<gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:app="http://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101"><gml:boundedBy><gml:Envelope srsName="EPSG:5972"/></gml:boundedBy>${entries.map((entry,index) => `<gml:featureMember><app:Skråfoto gml:id="row${index}"><app:fotolink>Attachments\\${entry.filename.replaceAll('&','&amp;')}</app:fotolink><app:fotograferingspunkt><gml:Point${entry.invalid ? ' srsName="EPSG:999999"' : ''} srsDimension="3"><gml:pos>${entry.x || 582932} 6566001 0</gml:pos></gml:Point></app:fotograferingspunkt></app:Skråfoto></gml:featureMember>`).join('')}</gml:FeatureCollection>`;
    const layout = async (width, height, label) => {
      await browser.send('Emulation.setDeviceMetricsOverride', { width,height,deviceScaleFactor:1,mobile:false });
      await browser.evaluate('new Promise(resolve => requestAnimationFrame(resolve))');
      const boxes = await browser.evaluate(`(() => { const dialog = ${wizard}, content = dialog.querySelector('.photo-positioning-content'), footer=dialog.querySelector('footer');
        return {dialog:dialog.getBoundingClientRect().toJSON(),footer:footer.getBoundingClientRect().toJSON(),scroll:content.scrollWidth,content:content.clientWidth}; })()`);
      assert(boxes.dialog.left >= 0 && boxes.dialog.right <= width && boxes.dialog.top >= 0 && boxes.dialog.bottom <= height);
      assert(boxes.footer.bottom <= height && boxes.scroll <= boxes.content + 1);
      await screenshot(`wizard-${label}-${width}x${height}`);
      checks.push(`${label} layout ${width}×${height}: ${boxes.dialog.width}×${boxes.dialog.height}; footer visible`);
    };
    try {
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const urls=new Set(), create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
        URL.createObjectURL=value=>{const url=create(value);if(value instanceof File)urls.add(url);return url;};URL.revokeObjectURL=url=>{urls.delete(url);revoke(url);};window.__originalUrls=urls; })();` });
      await browser.send('Emulation.setDeviceMetricsOverride', {width:1680,height:900,deviceScaleFactor:1,mobile:false});
      await browser.send('Page.navigate', {url:applicationUrl+'?testmodus=1'});
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
      await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
      const paths = (await readdir(path.join(path.dirname(gmlPath),'Attachments'))).filter(name=>/\.jpe?g$/i.test(name)).sort().map(name=>path.join(path.dirname(gmlPath),'Attachments',name));
      assert.equal(paths.length,148);
      const createRealLayer = async () => {
        await click('Bilder'); await browser.waitFor('document.querySelector(".photo-collection-dialog[open]")');
        await inputFiles('input[aria-label="Velg bildefiler"]', paths);
        await browser.waitFor('document.querySelector(".photo-collection-dialog").innerText.includes("148 bilder med EXIF GPS-kandidat")',45000);
        await click('Opprett fotokartlag (148 bilder)'); await browser.waitFor('!document.querySelector(".photo-collection-dialog")');
        const label=await browser.evaluate(`document.querySelector('button[title="Åpne bildemodul"]').getAttribute('aria-label')`);
        assert(label.startsWith('Åpne bildemodul for ')); await click('Bildemodul'); await browser.waitFor('document.querySelector(".photo-workspace-shell")');
        await browser.waitFor('document.querySelectorAll(".photo-workspace-list img").length===148'); await browser.waitFor('window.__originalUrls.size===1');
      };
      await createRealLayer(); assert.equal(await browser.evaluate(markerCount),0);
      assert.equal(await browser.evaluate('document.querySelector(".photo-preview-open").title'),'Vis stort');
      assert.equal(await browser.evaluate('document.querySelector(".photo-preview-open").getAttribute("aria-label")'),'Vis stort');
      assert(await browser.evaluate('Boolean(document.querySelector(".photo-preview-open svg"))'));
      await begin('exif'); await layout(1680,900,'source'); await cancel(); assert.equal(await browser.evaluate(markerCount),0);
      await begin('exif'); await review(); assert.equal(await selectedCount(),148); assert.equal(await actionCount('place'),148);
      await cancel(); assert.equal(await browser.evaluate(markerCount),0);
      await begin('exif'); await review(); await summary(); assert.equal(await summaryCount('Plasseres'),'148');
      await cancel(); assert.equal(await browser.evaluate(markerCount),0);
      await begin('exif'); await review();
      await layout(1680,900,'exif-review'); await layout(1024,620,'exif-review'); await layout(390,700,'exif-review');
      await browser.send('Emulation.setDeviceMetricsOverride',{width:1680,height:900,deviceScaleFactor:1,mobile:false});
      await summary(); await screenshot('wizard-exif-summary'); await apply('EXIF',148); await browser.waitFor(`${markerCount}===148`);
      assert.equal(await originals(),1); checks.push('photos-only EXIF: 148 default-selected placements; cancellation at all three steps leaves zero markers; explicit confirmation creates 148');
      await deleteLayer(); assert.equal(await originals(),0);

      await createRealLayer(); await begin(); await inputFiles('input[aria-label="Velg GML for posisjonering"]',[gmlPath]);
      await browser.waitFor(`${wizard}.innerText.includes('148 treff')`); assert.equal(await browser.evaluate(markerCount),0);
      await review(); assert.equal(await selectedCount(),148); assert.equal(await actionCount('place'),148);
      await summary(); assert.equal(await summaryCount('Plasseres'),'148'); await screenshot('wizard-gml-summary');
      await apply('GML',148); await browser.waitFor(`${markerCount}===148`);
      await begin('exif'); await review(); assert.equal(await selectedCount(),148); assert.equal(await actionCount('same'),148); assert.equal(await actionCount('move'),0);
      await browser.evaluate(`${wizard}.querySelector('.photo-positioning-comparison summary').click()`);
      assert(await browser.evaluate(`${wizard}.innerText.includes('Gjeldende (GML)') && ${wizard}.innerText.includes('Foreslått (EXIF)')`));
      await summary(); assert.equal(await summaryCount('Flyttes'),'0'); assert.equal(await summaryCount('Har allerede samme posisjon'),'148');
      await apply('EXIF',148); assert(await browser.evaluate('document.querySelector(".photo-spatial-inspector").innerText.includes("Gjeldende posisjon (EXIF)")'));
      await begin(); await inputFiles('input[aria-label="Velg GML for posisjonering"]',[gmlPath]);
      await browser.waitFor(`${wizard}.innerText.includes('brukes på nytt')`); await review(); assert.equal(await actionCount('same'),148);
      await summary(); await apply('GML',148);
      assert(await browser.evaluate('document.querySelector(".photo-workspace-sources summary").innerText.includes("1 kilde")'));
      assert.equal(await browser.evaluate(markerCount),148);
      checks.push('photos-only GML: 148 matches/placements; EXIF comparison reports 148 same and zero moves; identical source reused without duplication; reversible explicit basis');
      await deleteLayer();

      await click('Bilder'); await browser.waitFor('document.querySelector(".photo-collection-dialog[open]")');
      await inputFiles('input[aria-label="Velg bildefiler"]',paths.slice(0,2));
      await browser.evaluate(`(async()=>{const canvas=document.createElement('canvas');canvas.width=120;canvas.height=80;const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
        const transfer=new DataTransfer();for(const name of ['none.png','repeat.png','REPEAT.PNG','invalid.png'])transfer.items.add(new File([blob],name,{type:'image/png'}));
        const input=document.querySelector('input[aria-label="Velg bildefiler"]');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      const first=path.basename(paths[0]),second=path.basename(paths[1]);
      await loadXml(xmlFor([{filename:first},{filename:second}]),'initial.gml',true);
      await browser.waitFor('document.querySelector(".photo-collection-dialog").innerText.includes("2 treff")');
      await click('Opprett fotokartlag (6 bilder)'); await browser.waitFor('!document.querySelector(".photo-collection-dialog")'); await click('Bildemodul');
      await browser.waitFor('document.querySelector(".photo-workspace-shell")'); await browser.waitFor('document.body.innerText.includes("2 bilder med EXIF GPS-kandidat")');
      await begin('exif'); await review(); assert.equal(await actionCount('move'),2); assert.equal(await actionCount('unavailable'),4); assert.equal(await selectedCount(),2);
      const toggleFirst = () => browser.evaluate(`${wizard}.querySelector(${JSON.stringify(`input[aria-label="Posisjoner ${first}"]`)}).click()`);
      await toggleFirst(); assert.equal(await selectedCount(),1); await summary(); assert.equal(await summaryCount('Flyttes'),'1');
      await cancel(); assert(await browser.evaluate('document.querySelector(".photo-spatial-inspector").innerText.includes("Gjeldende posisjon (GML)")'));
      await begin('exif'); await review(); await click('Fjern alle valg',wizard); assert.equal(await selectedCount(),0);
      assert(await browser.evaluate(`Array.from(${wizard}.querySelectorAll('button')).find(e=>e.innerText==='Neste').disabled`));
      await click('Velg alle brukbare',wizard); await toggleFirst(); await summary(); await apply('EXIF',1);
      await browser.evaluate(`document.querySelector(${JSON.stringify(`.photo-workspace-list button[aria-label="Vis ${first}"]`)}).click()`);
      assert(await browser.evaluate('document.querySelector(".photo-spatial-inspector").innerText.includes("Gjeldende posisjon (GML)")'));
      await browser.evaluate(`document.querySelector(${JSON.stringify(`.photo-workspace-list button[aria-label="Vis ${second}"]`)}).click()`);
      await browser.waitFor('document.querySelector(".photo-spatial-inspector").innerText.includes("Gjeldende posisjon (EXIF)")');
      checks.push('conflicting EXIF: two visible moves, four no-GPS rows disabled; deselection updates summary; confirmation changes only selected photo');
      await begin(); await loadXml('broken XML','broken.gml'); await browser.waitFor(`${wizard}.querySelector('[role=alert]')`);
      assert(await browser.evaluate(`Array.from(${wizard}.querySelectorAll('button')).find(e=>e.innerText==='Neste').disabled`)); await screenshot('wizard-parse-error');
      await cancel();
      await begin(); await loadXml(xmlFor([{filename:first,x:583932},{filename:'repeat.png'},{filename:'invalid.png',invalid:true},{filename:'absent.png'}]),'mixed.gml');
      await browser.waitFor(`${wizard}.innerText.includes('1 tvetydige')`); await review();
      assert.equal(await selectedCount(),1); assert.equal(await actionCount('ambiguous'),2); assert.equal(await actionCount('unavailable'),1); assert.equal(await actionCount('unmatched'),2);
      await layout(1024,620,'mixed-review'); await layout(390,700,'mixed-review');
      await browser.send('Emulation.setDeviceMetricsOverride',{width:1680,height:900,deviceScaleFactor:1,mobile:false});
      await summary(); assert.equal(await summaryCount('Flyttes'),'1'); await screenshot('wizard-mixed-summary'); await apply('GML',1);
      assert(await browser.evaluate('document.querySelector(".photo-workspace-sources summary").innerText.includes("2 kilder")'));
      assert.equal(await browser.evaluate(markerCount),2);
      checks.push('parse failure is clear; mixed GML surfaces unmatched/ambiguous/invalid rows; only viable selected row applies and source evidence persists');

      await browser.evaluate('document.querySelector(".photo-workspace-list input").click()');
      await begin('exif'); await review();
      await click('Fjern fra lag','document.querySelector(".photo-workspace-selected-actions")');
      await browser.waitFor('document.querySelector(".photo-remove-confirmation[open]")');
      await click('Fjern fra lag','document.querySelector(".photo-remove-confirmation")');
      await browser.waitFor(`!${wizard} && document.querySelectorAll('.photo-workspace-list li[data-photo-id]').length===5`);
      assert(await browser.evaluate('document.querySelector(".photo-workspace-sources summary").innerText.includes("2 kilder")'));
      await begin('exif'); await review(); await browser.send('Page.reload');
      await browser.waitFor(`!${wizard} && !document.querySelector('.photo-workspace-shell,section[aria-label^=Fotokartlag]')`);
      assert.equal(await originals(),0);
      checks.push('external confirmed member removal aborts wizard and retains existing sources; hard reload clears wizard/layer/resources');
      assert.deepEqual(browser.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params.exceptionDetails.exception?.description||e.params.exceptionDetails.text),[]);
      console.log(JSON.stringify({positioningWizardChecks:checks},null,2));
    } catch(error) { console.error(await browser.evaluate('document.body.innerText.slice(0,10000)')); await screenshot('wizard-failure'); throw error; }
    finally { await browser.close(); }
  });
