import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'exifr/dist/full.esm.mjs';
import { unzipSync, strFromU8 } from 'fflate';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { assertGeminiConventions } from './helpers/geminiPhotoConventions.mjs';
import { exportedTimes } from './helpers/photoEvidenceFixtures.mjs';
import { gpsPng } from './helpers/photoGpsFixtures.mjs';
import { addImportFiles, createLayerWithoutPlacement, importDialog, retainGmlInWorkspace } from './helpers/photoImportWizard.mjs';
import { applyPhotoSourcePositions, clickSourceControl } from './helpers/photoSourceWorkflow.mjs';

// Capture-time and direction evidence in the real app: File objects, chunked exifr and the browser XML parser.
const app = process.env.PHOTO_UI_URL, corpus = process.env.PHOTO_GML_FIXTURE;
const inspector = 'document.querySelector(".photo-workspace-inspector")';
const exportDialog = 'document.querySelector(".photo-export-dialog")';
const metadataDialog = 'document.querySelector(".photo-metadata-dialog[open]")';
const evidenceRow = (action) => `${exportDialog}.querySelector('[data-evidence-action="${action}"]')`;

async function openApp(browser) {
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1680, height: 900, deviceScaleFactor: 1, mobile: false });
  await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
  await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
  await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
}
const setInput = (browser, selector, value) => browser.evaluate(`(() => { const element = ${selector};
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, ${JSON.stringify(value)});
  element.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const selectFile = async (browser, name) => {
  const row = `Array.from(document.querySelectorAll('.photo-workspace-list li[data-photo-id]')).find((item) => item.innerText.includes(${JSON.stringify(name)})).querySelector('.photo-workspace-row')`;
  await browser.evaluate(`${row}.click()`);
  await browser.waitFor(`${row}.getAttribute('aria-pressed') === 'true' && ${inspector}.querySelector('h2')?.innerText.includes(${JSON.stringify(name)})`);
};
const chips = (browser) => browser.evaluate(`${inspector}.querySelector('.photo-inspector-chips').innerText`);
// textContent, because the evidence sits in a collapsed disclosure.
const directionEvidence = (browser) => browser.evaluate(`${inspector}.textContent`);

const syntheticGml = (features) => `<gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:app="http://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101"><gml:boundedBy><gml:Envelope srsName="urn:ogc:def:crs:EPSG::5972"/></gml:boundedBy>${features.map(({ name, time, direction }, index) => `<gml:featureMember><app:Skråfoto gml:id="f${index}"><gml:name>${name}</gml:name><app:fotograferingspunkt><gml:Point gml:id="p${index}" srsDimension="3"><gml:pos srsDimension="3">${581930 + index * 20} 6566000 0</gml:pos></gml:Point></app:fotograferingspunkt><app:fotolink>Attachments\\${name}</app:fotolink><app:retningsvektor><app:Retning><app:retningsverdi>${direction}</app:retningsverdi><app:retningsenhet>1</app:retningsenhet><app:retningsreferanse>1</app:retningsreferanse></app:Retning></app:retningsvektor>${time ? `<app:fotograferingstidspunkt>${time}</app:fotograferingstidspunkt>` : ''}</app:Skråfoto></gml:featureMember>`).join('')}</gml:FeatureCollection>`;

test('source evidence in the workspace: chip, shared formatter, minute precision and GML direction', { skip: !chromePath || !app, timeout: 180000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'photo-evidence-ui-'));
  const browser = await openTestChrome();
  try {
    const files = { 'a.png': gpsPng({ noLocation: true, captureTime: '2026:05:12 14:33:02', subsecond: '012' }), 'b.png': gpsPng({ noLocation: true }), 'c.png': gpsPng({ noLocation: true }) };
    const photos = await Promise.all(Object.entries(files).map(async ([name, bytes]) => { const file = path.join(directory, name); await writeFile(file, bytes); return file; }));
    const gml = path.join(directory, 'directions.gml');
    await writeFile(gml, syntheticGml([{ name: 'a.png', time: '2026-05-12T14:33:02', direction: '45.5' }, { name: 'b.png', time: '2026-05-12T14:33', direction: '0' }]));
    await openApp(browser);
    await clickSourceControl(browser, 'Bilder', 'document');
    await browser.waitFor(importDialog);
    await addImportFiles(browser, photos);
    await browser.waitFor(`${importDialog}?.dataset.exifPending === '0' && ${importDialog}.querySelector('.photo-collection-facts')?.innerText.includes('Tatt')`, 60000);
    assert.match(await browser.evaluate(`${importDialog}.querySelector('.photo-collection-facts').innerText`), /Tatt\s+12\.05\.2026 14:33:02,012/, 'import preview uses the shared formatter');
    await createLayerWithoutPlacement(browser);
    await retainGmlInWorkspace(browser, gml);

    await selectFile(browser, 'a.png');
    assert.match(await chips(browser), /Opptakstid kjent/);
    assert(!await browser.evaluate(`${inspector}.innerText.includes('Kildene oppgir ulike opptakstider')`), 'subseconds against whole seconds is no conflict');
    assert.match(await directionEvidence(browser), /GML · directions\.gml: 45\.5° fra geografisk nord/);
    await selectFile(browser, 'c.png');
    assert.match(await chips(browser), /Uten opptakstid/);

    await selectFile(browser, 'b.png');
    assert.match(await chips(browser), /Opptakstid i kilde/);
    assert.match(await directionEvidence(browser), /GML · directions\.gml: 0° fra geografisk nord/);
    await clickSourceControl(browser, 'Rediger opptaksdata…', inspector);
    await browser.waitFor(metadataDialog);
    await browser.evaluate(`${metadataDialog}.querySelector('input[value="other"]').click()`);
    await browser.waitFor(`${metadataDialog}.querySelector('input[type=time]')`);
    assert.equal(await browser.evaluate(`${metadataDialog}.querySelector('input[type=time]').value.slice(0, 5)`), '14:33');
    await clickSourceControl(browser, 'Lagre', metadataDialog);
    await browser.waitFor(`${metadataDialog}?.querySelector('[role=alert]')?.innerText.includes('Kilden har ikke sekunder. Oppgi sekunder.')`);
    assert.match(await chips(browser), /Opptakstid i kilde/, 'saving the unchanged prefill wrote nothing');
    await setInput(browser, `${metadataDialog}.querySelector('input[type=time]')`, '14:33:41');
    await clickSourceControl(browser, 'Lagre', metadataDialog);
    await browser.waitFor(`!${metadataDialog}`);
    assert.match(await browser.evaluate(`${inspector}.innerText`), /12\.05\.2026 14:33:41/);
    assert.match(await chips(browser), /Opptakstid kjent/);

    await clickSourceControl(browser, 'Eksporter', 'document');
    await browser.waitFor(exportDialog);
    assert.match(await browser.evaluate(`${evidenceRow('gml:direction')}.innerText`), /GML-retning: 0 kan brukes · 3 allerede godtatt/, 'source directions are already in use');
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});

test('private corpus in the real app: with the GML attached, source values reach the downloaded Gemini package with no adoption', { skip: !chromePath || !app || !corpus, timeout: 300000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'photo-evidence-corpus-ui-'));
  const browser = await openTestChrome();
  try {
    const folder = path.join(path.dirname(corpus), 'Attachments');
    const names = (await readdir(folder)).filter((name) => /\.jpe?g$/i.test(name)).sort();
    const total = names.length;
    assert(total);
    await openApp(browser);
    await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: directory });
    await clickSourceControl(browser, 'Bilder', 'document');
    await browser.waitFor(importDialog);
    await addImportFiles(browser, names.map((name) => path.join(folder, name)));
    await browser.waitFor(`document.querySelectorAll(".photo-collection-card img").length === ${total}`, 120000);
    await createLayerWithoutPlacement(browser);
    await retainGmlInWorkspace(browser, corpus);
    await browser.waitFor(`document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length === ${total}`);
    await applyPhotoSourcePositions(browser, 'gml');
    await browser.waitFor(`document.querySelectorAll(".photo-camera-marker").length === ${total}`, 60000);

    assert.match(await chips(browser), /Opptakstid kjent/);
    assert(!await browser.evaluate(`${inspector}.innerText.includes('Kildene oppgir ulike opptakstider')`));

    await clickSourceControl(browser, 'Eksporter', 'document');
    await browser.waitFor(exportDialog);
    for (const row of ['exif:captureTime', 'gml:captureTime']) assert.match(await browser.evaluate(`${evidenceRow(row)}.innerText`), new RegExp(`0 kan brukes · ${total} allerede godtatt`));
    assert.match(await browser.evaluate(`${evidenceRow('gml:direction')}.innerText`), new RegExp(`GML-retning: 0 kan brukes · ${total} allerede godtatt`));
    await browser.evaluate(`(() => { const select = ${exportDialog}.querySelector('[aria-label="Eksportprofil"]'); select.value = 'gemini-legacy2019'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await browser.waitFor(`${exportDialog}.querySelector('[data-export-status]')`);
    assert.equal(await browser.evaluate(`Boolean(${exportDialog}.querySelector('[data-export-warning]'))`), false, 'every time is in place, so there is nothing to warn about');
    assert.match(await browser.evaluate(`${exportDialog}.querySelector('[data-export-level="import"] dd').innerText`), /denne pakken er ikke testet/);
    await clickSourceControl(browser, 'Lag eksportforhåndsvisning', exportDialog);
    await browser.waitFor(`${exportDialog}.querySelector('section[aria-label="Eksportforhåndsvisning"]') && !${exportDialog}.innerText.includes('Bygger forhåndsvisning')`, 120000);
    assert.match(await browser.evaluate(`${exportDialog}.querySelector('[data-diagnostic-code="compatibility-time"] summary').innerText`), /^Opptakstid i Gemini-filen/);
    await clickSourceControl(browser, 'Last ned testpakke', exportDialog);
    await browser.waitFor(`${exportDialog}.innerText.includes('ZIP-pakken er klar')`, 120000);

    const file = path.join(directory, 'photos-gemini-legacy2019-5972.zip');
    let zip;
    for (let attempt = 0; attempt < 300 && !zip; attempt++) {
      try { zip = unzipSync(new Uint8Array(await readFile(file))); } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    assert(zip, 'ZIP download not completed');
    const xml = strFromU8(zip['photos.gml']);
    assertGeminiConventions(xml);
    const times = exportedTimes(xml);
    assert.equal(times.size, total);
    let matching = 0;
    for (const name of names) {
      const tags = await parse(await readFile(path.join(folder, name)), { tiff: false, ifd0: false, exif: ['DateTimeOriginal'], reviveValues: false, translateValues: false });
      if (times.get(name) === tags.DateTimeOriginal.trim().replace(/^(\d{4}):(\d{2}):(\d{2}) /, '$1-$2-$3T')) matching++;
    }
    assert.equal(matching, total, 'each exported time equals the JPEG clock, read independently of the app');
  } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
});
