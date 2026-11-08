import { createLayerWithoutPlacement, waitForThumbnails, retainGmlInWorkspace } from './helpers/photoImportWizard.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { gpsPng } from './helpers/photoGpsFixtures.mjs';
import { gmiFile } from './helpers/gmiPhotoFixtures.mjs';
import { sourceWizard, clickSourceControl as click, setPhotoFiles, openPhotoSources, closePhotoSources, stagePhotoSource, savePhotoSource, applyPhotoSourcePositions } from './helpers/photoSourceWorkflow.mjs';

const app = process.env.PHOTO_UI_URL, realGml = process.env.PHOTO_GML_FIXTURE;
async function start(browser) {
  await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear();' });
  await browser.send('Page.navigate', { url: app + '?testmodus=1' });
  await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
  await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
}
const spatial = 'document.querySelector(".photo-workspace-inspector")';
const fact = (section, term) => `Array.from(${spatial}.querySelectorAll('section[aria-label=${section}] dt')).find(e=>e.textContent===${JSON.stringify(term)})?.nextElementSibling.textContent.trim()`;
const currentIs = (kind) => `${fact('Plassering', 'Kilde')}===${JSON.stringify(kind)}`;
const linkCount = `${spatial}.querySelectorAll('section[aria-label=Koblinger] .photo-inspector-links > li').length`;
// Sources and EXIF counts moved from the sidebar into the read-only Kilder og koblinger dialog.
const sourcesInfo = async (browser) => {
  await click(browser, 'Kilder og koblinger', 'document');
  await browser.waitFor('document.querySelector(".photo-sources-info[open]")');
  const info = await browser.evaluate(`({ cards: document.querySelectorAll('.photo-sources-card').length,
    exif: Number(Array.from(document.querySelectorAll('.photo-sources-info dl > div')).find(e=>e.querySelector('dt').textContent==='Bilder med EXIF GPS')?.querySelector('dd').textContent) })`);
  await click(browser, 'Lukk', 'document.querySelector(".photo-sources-info")');
  await browser.waitFor('!document.querySelector(".photo-sources-info[open]")');
  return info;
};
const markerCount = 'document.querySelectorAll(".photo-camera-marker").length';
const selectPhoto = async (browser, filename) => {
  await browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-row')).find(e=>e.getAttribute('aria-label').startsWith(${JSON.stringify(`${filename},`)})).click()`);
  await browser.waitFor(`document.querySelector('.photo-workspace-inspector h2').innerText===${JSON.stringify(filename)}`);
};

test('unified source workflow: GMI/GML checkpoints, mixed positions, manual current, recheck/removal, cancel and layouts',
  { skip: !chromePath || !app, timeout: 180000 }, async () => {
    const root = path.resolve(tmpdir()), directory = await mkdtemp(path.join(root, 'photo-source-workflow-'));
    const browser = await openTestChrome();
    const names = ['a.png', 'b.png', 'c.png'], photos = names.map((name) => path.join(directory, name));
    const gmi = path.join(directory, 'objects.gmi'), gml = path.join(directory, 'positions.gml');
    await Promise.all(photos.map((file) => writeFile(file, gpsPng())));
    await writeFile(gmi, Buffer.from(await gmiFile([{ hyperlink: 'h:1(link:"a.png") h:2(link:"b.png") ' },
      { hyperlink: 'h:1(link:"a.png") h:2(link:"missing.png") ' }]).arrayBuffer()));
    await writeFile(gml, `<gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:app="http://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101"><gml:boundedBy><gml:Envelope srsName="EPSG:5972"/></gml:boundedBy>${names.slice(0, 2).map((name, index) => `<gml:featureMember><app:Skråfoto gml:id="photo-${index}"><app:fotolink>${name}</app:fotolink><app:fotograferingstidspunkt>2026-05-12T14:33:02</app:fotograferingstidspunkt><app:fotograferingspunkt><gml:Point srsDimension="3"><gml:pos>581930 6566000 0</gml:pos></gml:Point></app:fotograferingspunkt></app:Skråfoto></gml:featureMember>`).join('')}</gml:FeatureCollection>`);
    try {
      await start(browser);
      await click(browser, 'Bilder', 'document');
      await setPhotoFiles(browser, 'input[aria-label="Velg bildefiler"]', photos);
      await waitForThumbnails(browser);
      await createLayerWithoutPlacement(browser);


      assert.equal((await sourcesInfo(browser)).exif, 3);
      assert.equal(await browser.evaluate(markerCount), 0);
      await selectPhoto(browser, 'c.png');
      // Manual placement of an unplaced photo happens in Edit mode and is committed with Lagre endringer.
      await click(browser, 'Juster plassering og retning', 'document');
      await browser.waitFor('document.querySelector(".leaflet-container.photo-edit-placing")');
      const box = await browser.evaluate('document.querySelector(".leaflet-container").getBoundingClientRect().toJSON()');
      const x = box.left + box.width / 2, y = box.top + box.height / 2;
      await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
      await browser.waitFor('document.querySelector("[data-edit-count]")');
      await click(browser, 'Lagre endringer', 'document.querySelector(".photo-edit-command-bar")');
      await browser.waitFor(`!document.querySelector(".photo-edit-command-bar") && ${currentIs('Manuell')}`);
      const manual = await browser.evaluate(`${spatial}.querySelector('section[aria-label=Plassering]').innerText`);

      await stagePhotoSource(browser, gmi, 'gmi');
      await closePhotoSources(browser);
      assert.equal((await sourcesInfo(browser)).cards, 0, 'pre-checkpoint cancellation');
      await stagePhotoSource(browser, gmi, 'gmi');
      await browser.evaluate('void (window.__unifiedDialog = document.querySelector(".photo-positioning-wizard"))');
      await savePhotoSource(browser, 'gmi');
      assert(await browser.evaluate(`${sourceWizard}===window.__unifiedDialog`));
      assert.equal(await browser.evaluate(markerCount), 1, 'GMI save creates zero positions');
      assert.equal(await browser.evaluate(`${spatial}.querySelector('section[aria-label=Plassering]').innerText`), manual, 'GMI save changes neither current nor direction');
      await stagePhotoSource(browser, gml);
      await savePhotoSource(browser);
      assert(await browser.evaluate(`${sourceWizard}===window.__unifiedDialog`));
      assert.equal(await browser.evaluate(markerCount), 1, 'GML save retains evidence only');
      await click(browser, 'Kontroller tilgjengelige posisjoner');
      assert.equal(await browser.evaluate(`${sourceWizard}.querySelector('.photo-positioning-selection strong').innerText`), '3 valgt');
      assert(await browser.evaluate(`${sourceWizard}.innerText.includes('GMI: koblet til 2 objekter')`));
      // A source difference is stated by its size, neutrally, and stays visible without opening anything.
      assert.match(await browser.evaluate(`${sourceWizard}.querySelector('.photo-positioning-comparison[data-sources-differ] summary .photo-positioning-separation').innerText`), /^ca\. .+ m mellom kildene$/);
      for (const [width, height] of [[1680, 900], [1366, 768], [1280, 720], [1024, 768], [1024, 620]]) {
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        const geometry = await browser.evaluate(`(() => {const dialog=${sourceWizard},footer=dialog.querySelector('footer'),content=dialog.querySelector('.photo-positioning-content');return {dialog:dialog.getBoundingClientRect().toJSON(),footer:footer.getBoundingClientRect().toJSON(),scroll:content.scrollWidth,width:content.clientWidth};})()`);
        assert(geometry.dialog.left >= 0 && geometry.dialog.right <= width && geometry.dialog.top >= 0 && geometry.dialog.bottom <= height);
        assert(geometry.footer.bottom <= height && geometry.footer.top >= geometry.dialog.top);
        assert(geometry.scroll <= geometry.width + 1);
        if (process.env.PHOTO_SCREENSHOT_DIR) {
          await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive: true });
          const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
          await writeFile(path.join(process.env.PHOTO_SCREENSHOT_DIR, `unified-positions-${width}x${height}.png`), Buffer.from(data, 'base64'));
        }
      }
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
      await click(browser, 'Behold alle gjeldende');
      for (const [name, kind] of [['a.png', 'EXIF'], ['b.png', 'GML']]) await browser.evaluate(`(() => {
        const select=Array.from(${sourceWizard}.querySelectorAll('select')).find(item=>item.getAttribute('aria-label')===${JSON.stringify(`Velg posisjon for ${name}`)});
        select.value=Array.from(select.options).find(option=>option.text.startsWith(${JSON.stringify(kind)})).value;
        select.dispatchEvent(new Event('change',{bubbles:true}));
      })()`);
      await click(browser, 'Neste');
      await click(browser, 'Bruk valgte posisjoner for 2 plasseringer');
      await browser.waitFor(`!${sourceWizard}`);
      assert.equal(await browser.evaluate(markerCount), 3);
      await selectPhoto(browser, 'a.png');
      assert(await browser.evaluate(currentIs('EXIF')));
      assert.equal(await browser.evaluate(linkCount), 2);
      assert(!await browser.evaluate(`Array.from(${spatial}.querySelectorAll('button')).some(button=>/^Bruk /.test(button.innerText))`), 'the inspector has no source-acceptance actions');
      await selectPhoto(browser, 'b.png');
      assert(await browser.evaluate(currentIs('GML')));
      // A complete source time needs no step of its own.
      await browser.waitFor(`${fact('Opptak', 'Opptakstid')}==='12.05.2026 14:33:02 · tidssone ukjent'`);
      assert.match(await browser.evaluate(`Array.from(${spatial}.querySelectorAll('section[aria-label=Opptak] dt')).find(e=>/^(Opptakstid|Fotograf) fra$/.test(e.textContent)).nextElementSibling.textContent`), /^GML/);

      await selectPhoto(browser, 'c.png');
      assert(await browser.evaluate(currentIs('Manuell')));

      // Per-source recheck lives in step 1 of Koble og posisjoner bilder.
      await openPhotoSources(browser);
      await click(browser, 'Kontroller på nytt', `${sourceWizard}.querySelector('.photo-source-inventory section[data-source-id]')`);
      await browser.waitFor(`${sourceWizard}.innerText.includes('Kilden finnes i laget')`);
      await savePhotoSource(browser, 'gmi');
      await closePhotoSources(browser);
      assert.equal((await sourcesInfo(browser)).cards, 2, 'recheck does not duplicate sources');
      // The layer-wide Tools entry also reviews the still-unplaced second a.png occurrence.
      // The removed inspector entry restricted default proposals to the focused c.png.
      await openPhotoSources(browser);
      await click(browser, 'Kontroller tilgjengelige posisjoner');
      assert.equal(await browser.evaluate(`${sourceWizard}.querySelector('.photo-positioning-selection strong').innerText`), '1 valgt');
      assert.deepEqual(await browser.evaluate(`Array.from(${sourceWizard}.querySelectorAll('li[data-action="place"]')).map(row => row.querySelector('.photo-positioning-filename strong').innerText)`), ['a.png']);
      assert.equal(await browser.evaluate(`Array.from(${sourceWizard}.querySelectorAll('li[data-photo-id]')).find(row => row.querySelector('.photo-positioning-filename strong').innerText === 'c.png').dataset.action`), 'keep', 'manual current is never proposed for replacement');
      await click(browser, 'Tilbake');
      await click(browser, 'Fjern kilde');
      await click(browser, 'Fjern GMI-kilde');
      await closePhotoSources(browser);
      assert.equal((await sourcesInfo(browser)).cards, 1);
      assert.equal(await browser.evaluate(markerCount), 3);
      assert(await browser.evaluate(currentIs('Manuell')));
      const activePhoto = await browser.evaluate('document.querySelector(".photo-workspace-active").dataset.photoId');
      await browser.evaluate(`document.querySelector('button[aria-label="Om appen, versjon 1.2.0"]').click()`);
      await browser.waitFor('document.querySelector(".app-info-dialog")');
      await click(browser, 'Nytt', 'document.querySelector(".app-info-dialog")');
      await browser.waitFor('document.querySelector(".app-info-dialog").innerText.includes("Nytt og mer helhetlig grensesnitt")');
      await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
      await browser.waitFor('!document.querySelector(".app-info-dialog")');
      assert.equal(await browser.evaluate('document.querySelector(".photo-workspace-active").dataset.photoId'), activePhoto);
      assert.equal(await browser.evaluate(markerCount), 3);
      console.log('Unified acceptance: one dialog, both checkpoints, GMI many-to-many, GML+EXIF mixed apply, manual preserved, recheck/removal and five desktop layouts.');
    } finally {
      await browser.close();
      if (path.dirname(path.resolve(directory)) !== root || !path.basename(directory).startsWith('photo-source-workflow-')) throw new Error('Unsafe fixture cleanup');
      await rm(directory, { recursive: true, force: true });
    }
  });

test('real 148-photo import retains GML/EXIF evidence until central explicit source-position review',
  { skip: !chromePath || !app || !realGml, timeout: 180000 }, async () => {
    const browser = await openTestChrome();
    try {
      await start(browser);
      const photos = (await readdir(path.join(path.dirname(realGml), 'Attachments'))).filter((name) => /\.jpe?g$/i.test(name)).sort()
        .map((name) => path.join(path.dirname(realGml), 'Attachments', name));
      assert.equal(photos.length, 148);
      await click(browser, 'Bilder', 'document');
      await setPhotoFiles(browser, 'input[aria-label="Velg bildefiler"]', photos);
      await createLayerWithoutPlacement(browser);
      await retainGmlInWorkspace(browser, realGml);
      await browser.waitFor('document.querySelector(".leaflet-container")');
      assert.equal(await browser.evaluate(markerCount), 0);

      await browser.waitFor(`document.querySelectorAll('.photo-workspace-list li[data-photo-id]').length===148`);
      assert.equal((await sourcesInfo(browser)).exif, 148);
      await openPhotoSources(browser);
      await click(browser, 'Kontroller tilgjengelige posisjoner');
      assert.equal(await browser.evaluate(`${sourceWizard}.querySelector('.photo-positioning-selection strong').innerText`), '148 valgt', 'GML is proposed for every photo, so nobody changes 148 dropdowns');
      assert.equal(await browser.evaluate(`${sourceWizard}.querySelectorAll('select').length`), 148);
      await closePhotoSources(browser);
      assert.equal(await browser.evaluate(markerCount), 0, 'closing review changes no current positions');
      await applyPhotoSourcePositions(browser, 'gml');
      await browser.waitFor(`${markerCount}===148`);
      await applyPhotoSourcePositions(browser, 'exif');
      assert.equal(await browser.evaluate(markerCount), 148);
      assert(await browser.evaluate(currentIs('EXIF')));
      console.log(JSON.stringify({ realUnifiedPositions: 148, retainedGmlAndExif: 148, explicitBatchSources: ['GML', 'EXIF'], automaticImportPositions: 0 }));
    } finally { await browser.close(); }
  });
