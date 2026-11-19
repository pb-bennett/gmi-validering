import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { gpsPng } from './helpers/photoGpsFixtures.mjs';
import { clickSourceControl, closePhotoSources, includePhotoSource, openPhotoSources, saveSourceWizardChanges, setPhotoFiles, sourceWizard, stagePhotoSource } from './helpers/photoSourceWorkflow.mjs';
import { chooseImportPlacement, clickImport, createLayerWithoutPlacement, importDialog, waitForThumbnails } from './helpers/photoImportWizard.mjs';

// M3: GML capture time is an explicit, unchecked-by-default choice in Koblinger and in import Kontroll («Fra GML-fil»).
const app = process.env.PHOTO_UI_URL;
const screenshotRoot = process.env.PHOTO_SCREENSHOT_DIR || path.join(tmpdir(), 'photo-gml-capture-acceptance');
const TEAL = 'rgb(0, 117, 149)';
const gmlText = (features) => `<gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:app="http://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101"><gml:boundedBy><gml:Envelope srsName="EPSG:5972"/></gml:boundedBy>${features.map(({ name, time }, index) => `<gml:featureMember><app:Skråfoto gml:id="p${index}"><app:fotolink>${name}</app:fotolink>${time ? `<app:fotograferingstidspunkt>${time}</app:fotograferingstidspunkt>` : ''}<app:fotograferingspunkt><gml:Point srsDimension="3"><gml:pos>${581930 + index * 20} 6566000 0</gml:pos></gml:Point></app:fotograferingspunkt></app:Skråfoto></gml:featureMember>`).join('')}</gml:FeatureCollection>`;
const FEATURES = [{ name: 'a.png', time: '2026-05-12T15:00:00' }, { name: 'b.png', time: '2026-05-12T10:00:00' }, { name: 'c.png', time: '2026-05-12' },
  { name: 'e.png', time: '2026-05-12T11:00:00' }, { name: 'e.png', time: '2026-05-12T12:00:00' }];
const files = { 'a.png': { captureTime: '2026:05:12 14:33:02' }, 'b.png': {}, 'c.png': {}, 'e.png': {} };

const start = async (browser) => {
  await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear();' });
  await browser.send('Page.navigate', { url: app + '?testmodus=1' });
  await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
  await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
};
const choicesIn = (root) => `Array.from(${root}.querySelectorAll('[data-gml-capture] .photo-gml-capture-choice')).map(l=>[l.textContent.trim(),l.querySelector('input').checked,getComputedStyle(l.querySelector('input')).accentColor])`;
const toggle = (root, label) => `Array.from(${root}.querySelectorAll('[data-gml-capture] .photo-gml-capture-choice')).find(l=>l.textContent.trim().startsWith(${JSON.stringify(label)})).querySelector('input').click()`;
const inspector = 'document.querySelector(".photo-workspace-inspector")';
const captureFact = `Array.from(${inspector}.querySelectorAll('section[aria-label=Opptak] dt')).find(e=>e.textContent==='Opptakstid')?.nextElementSibling.textContent.trim()`;
const captureSource = `Array.from(${inspector}.querySelectorAll('section[aria-label=Opptak] dt')).find(e=>e.textContent==='Opptakstid fra')?.nextElementSibling.textContent.trim() || ''`;
async function inspect(browser, filename) {
  await browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-row')).find(e=>e.getAttribute('aria-label').startsWith(${JSON.stringify(`${filename},`)})).click()`);
  await browser.waitFor(`document.querySelector('.photo-workspace-inspector h2').innerText===${JSON.stringify(filename)}`);
  return browser.evaluate(`({ time: (t => t === 'Ikke angitt' ? null : t)(${captureFact} || null), source: ${captureSource} })`);
}
async function layout(browser, dialog, scroller, name) {
  await mkdir(screenshotRoot, { recursive: true });
  for (const [width, height] of [[1280, 720], [1366, 768]]) {
    await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const g = await browser.evaluate(`(()=>{const d=${dialog},body=d.querySelector(${JSON.stringify(scroller)}),panel=d.querySelector('[data-gml-capture]').getBoundingClientRect(),
      buttons=Array.from(d.querySelectorAll('footer button')).map(b=>b.getBoundingClientRect());
      return {overflow:d.scrollWidth>d.clientWidth||body.scrollWidth>body.clientWidth+1,panelRight:panel.right,frame:d.getBoundingClientRect().right,
        footer:buttons.every(r=>r.right<=${width}&&r.bottom<=${height}),heights:new Set(buttons.map(r=>Math.round(r.height))).size};})()`);
    assert(!g.overflow, `${name} ${width}x${height} overflow`); assert(g.panelRight <= g.frame, name); assert(g.footer, name); assert.equal(g.heights, 1, `${name} one footer height`);
    const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(screenshotRoot, `gml-capture-${name}-${width}x${height}.png`), Buffer.from(data, 'base64'));
  }
}

test('positioning wizard: GML capture-time choices in Koblinger are unchecked, staged through navigation, committed with the source and reset on recheck',
  { skip: !chromePath || !app, timeout: 240000 }, async () => {
    const root = path.resolve(tmpdir()), directory = await mkdtemp(path.join(root, 'photo-gml-capture-'));
    const browser = await openTestChrome();
    const click = (label, scope) => clickSourceControl(browser, label, scope);
    try {
      const photos = await Promise.all(Object.entries(files).map(async ([name, options]) => { const file = path.join(directory, name); await writeFile(file, gpsPng(options)); return file; }));
      const gml = path.join(directory, 'times.gml');
      await writeFile(gml, gmlText(FEATURES));
      await start(browser);
      await click('Bilder', 'document');
      await setPhotoFiles(browser, 'input[aria-label="Velg bildefiler"]', photos);
      await createLayerWithoutPlacement(browser);
      assert.deepEqual(await inspect(browser, 'a.png'), { time: '12.05.2026 14:33:02 · tidssone ukjent', source: 'EXIF DateTimeOriginal' });

      await stagePhotoSource(browser, gml);
      const choices = `${sourceWizard}.querySelector('[data-gml-capture]')`, review = `${sourceWizard}.querySelector('[data-gml-capture-review]')`;
      await browser.waitFor(choices);
      assert.deepEqual(await browser.evaluate(choicesIn(sourceWizard)), [['Bruk opptakstid fra GML (1)', false, TEAL], ['Bruk kun dato fra GML (1)', false, TEAL],
        ['Behold gjeldende', true, TEAL], ['Bruk GML', false, TEAL]], 'only applicable options, both unchecked, conflicts default to keep');
      assert.equal(await browser.evaluate(`${review}.dataset.validationTone`), 'warning');
      assert(await browser.evaluate(`${review}.classList.contains('gmi-validation-panel') && ${review}.querySelector('svg[aria-hidden="true"]') !== null`));
      assert.equal(await browser.evaluate(`${review}.querySelector('.photo-gml-capture-title').innerText.replace(/\\s+/g,' ').trim()`), 'SJEKK 1 bilde har en annen opptakstid i GML-filen.');
      assert.equal(await browser.evaluate(`${review}.querySelector('summary').textContent`), 'Vis avvik (1)');
      await browser.evaluate(`${review}.querySelector('summary').click()`);
      assert.equal(await browser.evaluate(`${review}.querySelector('li').innerText.replace(/\\s+/g,' ').trim()`),
        'a.png Gjeldende: 12.05.2026 14:33:02 · tidssone ukjent · EXIF DateTimeOriginal GML: 12.05.2026 15:00:00 · tidssone ukjent Annen opptakstid');
      assert(!await browser.evaluate(`${choices}.innerText.includes('e.png')`), 'ambiguous references are not offered');
      assert(await browser.evaluate(`${sourceWizard}.innerText.includes('Kilden tas med i endringene. Ingenting lagres før du velger Lagre endringer.')`));
      await layout(browser, sourceWizard, '.photo-positioning-content', 'koblinger');

      // Staged only: navigation keeps the choice and nothing is written before «Lagre endringer» (B).
      await browser.evaluate(toggle(sourceWizard, 'Bruk opptakstid fra GML'));
      await click('Tilbake'); await browser.waitFor(`${sourceWizard}.dataset.step === '1'`);
      await click('Neste'); await browser.waitFor(choices);
      assert.deepEqual((await browser.evaluate(choicesIn(sourceWizard))).map(([label, checked]) => [label, checked]),
        [['Bruk opptakstid fra GML (1)', true], ['Bruk kun dato fra GML (1)', false], ['Behold gjeldende', true], ['Bruk GML', false]]);
      // Keyboard: the radio group is reachable and changes with the arrow keys, then back.
      await browser.evaluate(`${review}.querySelector('input[type=radio]:checked').focus()`);
      for (const key of ['ArrowRight', 'ArrowLeft']) {
        await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: key === 'ArrowRight' ? 39 : 37 });
        await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: key === 'ArrowRight' ? 39 : 37 });
      }
      assert.equal(await browser.evaluate(`${review}.querySelector('input[type=radio]:checked').parentElement.textContent`), 'Behold gjeldende');
      await includePhotoSource(browser);
      assert.equal(await browser.evaluate(`${sourceWizard}.querySelector('[data-positioning-staged]').innerText`), '«times.gml» er tatt med i endringene.');
      assert.equal((await inspect(browser, 'b.png')).time, null, 'including the source wrote nothing');
      await click('Neste'); await browser.waitFor(`${sourceWizard}.dataset.step === '3'`);
      await click('Behold alle gjeldende'); await click('Neste'); await browser.waitFor(`${sourceWizard}.dataset.step === '4'`);
      assert.equal(await browser.evaluate(`${sourceWizard}.querySelector('[data-kontroll="capture"] li').innerText`), '1 bilde får opptakstid fra times.gml (fullstendig).');
      assert.equal((await inspect(browser, 'b.png')).time, null, 'Kontroll wrote nothing');
      await saveSourceWizardChanges(browser);
      assert.match(await browser.evaluate(`${sourceWizard}.querySelector('[data-positioning-receipt]').innerText`), /Opptakstid lagret for 1 bilde/);
      await closePhotoSources(browser);
      assert.deepEqual(await inspect(browser, 'a.png'), { time: '12.05.2026 14:33:02 · tidssone ukjent', source: 'EXIF DateTimeOriginal' }, 'the conflict kept EXIF');
      const b = await inspect(browser, 'b.png');
      assert.equal(b.time, '12.05.2026 10:00:00 · tidssone ukjent'); assert.match(b.source, /^GML/);
      assert.equal((await inspect(browser, 'c.png')).time, null, 'the unchecked date-only option wrote nothing');
      assert.equal((await inspect(browser, 'e.png')).time, null);

      // Recheck offers what is still open, from the unchecked defaults, and «Bruk GML» replaces only the conflict.
      await openPhotoSources(browser);
      await click('Kontroller på nytt', `${sourceWizard}.querySelector('.photo-source-inventory section[data-source-id]')`);
      await browser.waitFor(choices);
      assert.deepEqual((await browser.evaluate(choicesIn(sourceWizard))).map(([label, checked]) => [label, checked]),
        [['Bruk kun dato fra GML (1)', false], ['Behold gjeldende', true], ['Bruk GML', false]], 'the accepted value is not offered again');
      await browser.evaluate(`Array.from(${review}.querySelectorAll('input[type=radio]')).find(i=>i.value==='gml').click()`);
      await includePhotoSource(browser);
      await saveSourceWizardChanges(browser, { keepPositions: true });
      await closePhotoSources(browser);
      const a = await inspect(browser, 'a.png');
      assert.equal(a.time, '12.05.2026 15:00:00 · tidssone ukjent'); assert.match(a.source, /^GML/);
      assert.equal((await inspect(browser, 'b.png')).time, '12.05.2026 10:00:00 · tidssone ukjent');
      assert.equal((await inspect(browser, 'c.png')).time, null);
      assert.deepEqual(browser.events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.text), []);
    } catch (error) { console.error(await browser.evaluate('document.body.innerText.slice(0,6000)')); throw error; } finally {
      await browser.close();
      if (path.dirname(path.resolve(directory)) !== root || !path.basename(directory).startsWith('photo-gml-capture-')) throw new Error('Unsafe fixture cleanup');
      await rm(directory, { recursive: true, force: true });
    }
  });

test('import wizard «Fra GML-fil»: GML and filename choices sit independently on Kontroll, survive back navigation and apply only as chosen',
  { skip: !chromePath || !app, timeout: 240000 }, async () => {
    const browser = await openTestChrome();
    const inject = (selector, items) => browser.evaluate(`(() => {const transfer=new DataTransfer();for(const [name,data,type] of ${JSON.stringify(items)}){transfer.items.add(new File([type==='text'?data:Uint8Array.from(atob(data),c=>c.charCodeAt(0))],name,{type:type==='text'?'text/plain':'image/png'}));}
      const input=document.querySelector(${JSON.stringify(selector)});if(!input)throw new Error('Missing input');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    try {
      await start(browser);
      await clickSourceControl(browser, 'Bilder', 'document'); await browser.waitFor(`${importDialog}?.open`);
      await inject('input[aria-label="Velg bildefiler"]', [...Object.entries(files), ['20261014_143302.png', {}]].map(([name, options]) => [name, gpsPng(options).toString('base64'), 'png']));
      await waitForThumbnails(browser); await browser.waitFor(`${importDialog}.dataset.exifPending === '0'`, 60000);
      await chooseImportPlacement(browser, 'gml');
      await inject('input[aria-label="Velg GML med bildeposisjoner"]', [['times.gml', gmlText(FEATURES), 'text']]);
      await browser.waitFor(`${importDialog}.innerText.includes('times.gml')`);
      assert.equal(await browser.evaluate(`${importDialog}.querySelector('[data-gml-capture]')`), null, 'not on Plassering');
      await clickImport(browser, 'Neste');
      await browser.waitFor(`${importDialog}?.querySelector('.photo-import-review [data-gml-capture]')`);
      assert(await browser.evaluate(`${importDialog}.querySelector('.photo-import-capture') !== null`), 'the filename block is independent');
      assert.deepEqual(await browser.evaluate(`Array.from(${importDialog}.querySelectorAll('.photo-import-capture-choice')).map(l=>[l.textContent.trim(),l.querySelector('input').checked])`), [['Bruk dato og klokkeslett fra filnavn (1)', false]]);
      assert.deepEqual(await browser.evaluate(choicesIn(importDialog)), [['Bruk opptakstid fra GML (1)', false, TEAL], ['Bruk kun dato fra GML (1)', false, TEAL],
        ['Behold gjeldende', true, TEAL], ['Bruk GML', false, TEAL]]);
      assert.equal(await browser.evaluate(`${importDialog}.querySelector('[data-gml-capture-review]').dataset.validationTone`), 'warning');
      await layout(browser, importDialog, '.photo-import-step-body', 'import-kontroll');
      await browser.evaluate(toggle(importDialog, 'Bruk kun dato fra GML'));
      await clickImport(browser, 'Tilbake'); await clickImport(browser, 'Neste');
      await browser.waitFor(`${importDialog}?.querySelector('.photo-import-review [data-gml-capture]')`);
      assert.deepEqual((await browser.evaluate(choicesIn(importDialog))).map(([label, checked]) => [label, checked]),
        [['Bruk opptakstid fra GML (1)', false], ['Bruk kun dato fra GML (1)', true], ['Behold gjeldende', true], ['Bruk GML', false]]);
      await browser.waitFor(`!${importDialog}.querySelector('.photo-import-footer .gmi-primary-control').disabled`);
      await clickImport(browser, 'Opprett fotolag');
      await browser.waitFor('!document.querySelector(".photo-collection-dialog[open]") && document.querySelector(".photo-workspace-shell")');
      assert.deepEqual(await inspect(browser, 'a.png'), { time: '12.05.2026 14:33:02 · tidssone ukjent', source: 'EXIF DateTimeOriginal' }, 'EXIF is still adopted automatically');
      assert.equal((await inspect(browser, 'b.png')).time, null, 'the unchecked complete option wrote nothing');
      const c = await inspect(browser, 'c.png');
      assert.match(c.time, /^12\.05\.2026/); assert.match(c.time, /bare dato/); assert.match(c.source, /^GML/);
      assert.equal((await inspect(browser, '20261014_143302.png')).time, null, 'the unchecked filename option wrote nothing');
      assert.deepEqual(browser.events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.text), []);
    } catch (error) { console.error(await browser.evaluate('document.body.innerText.slice(0,6000)')); throw error; } finally { await browser.close(); }
  });
