import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { gpsPng } from './helpers/photoGpsFixtures.mjs';
import { gmiFile } from './helpers/gmiPhotoFixtures.mjs';
import { sourceWizard, clickSourceControl as click, setPhotoFiles, openPhotoSources, closePhotoSources, stagePhotoSource, savePhotoSource, applyPhotoSourcePositions } from './helpers/photoSourceWorkflow.mjs';

const app = process.env.PHOTO_UI_URL;
const inspector = 'document.querySelector(".photo-spatial-inspector")';
const markers = 'document.querySelectorAll(".photo-camera-marker").length';

test('GMI point placements: two checkpoints, shared image/resource, exact object provenance, independent manual/direction, recheck and removal',
  { skip: !chromePath || !app, timeout: 180000 }, async () => {
    const root = path.resolve(tmpdir()), directory = await mkdtemp(path.join(root, 'gmi-placements-ui-'));
    const browser = await openTestChrome();
    const names = ['a.png', 'b.png', 'line.png'], files = names.map((name) => path.join(directory, name));
    const sourceFile = path.join(directory, 'points-and-lines.gmi');
    const guids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'];
    await Promise.all(files.map((file) => writeFile(file, gpsPng())));
    await writeFile(sourceFile, Buffer.from(await gmiFile([
      { guid: guids[0], label: 'Kum A', tema: 'KUM', type: 'DFOT', hyperlink: 'h:1(link:"a.png") ', xyz: '581930 6566000 1' },
      { guid: guids[1], label: 'Kum B', tema: 'KUM', type: 'DOVG', hyperlink: 'h:1(link:"a.png") ', xyz: '582030 6566100 1' },
      { label: 'Single', hyperlink: 'h:1(link:"b.png") ' },
      { scope: 'line', label: 'Line', hyperlink: 'h:1(link:"a.png") h:2(link:"line.png") ' },
    ]).arrayBuffer()));
    const select = async (id) => {
      await browser.evaluate(`document.querySelector('.photo-workspace-list li[data-photo-id="${id}"] button').click()`);
      await browser.waitFor(`document.querySelector('.photo-workspace-list li[data-photo-id="${id}"] button').getAttribute('aria-pressed')==='true'`);
    };
    const positionText = () => browser.evaluate(`${inspector}.querySelector('p.text-gmi-text-muted:not(.break-all)').innerText`);
    const imageUrl = () => browser.evaluate('document.querySelector(".photo-collection-original img").src');
    const openProvenance = async () => browser.evaluate(`${inspector}.querySelectorAll('details').forEach(item=>item.open=true)`);
    try {
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.clear();
        window.__assetUrls = new Set(); window.__originalCreated = 0;
        const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
        URL.createObjectURL = value => { const url=create(value); if(value instanceof File){window.__assetUrls.add(url);window.__originalCreated++;} return url; };
        URL.revokeObjectURL = url => { window.__assetUrls.delete(url); revoke(url); };` });
      await browser.send('Page.navigate', { url: app + '?testmodus=1' });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
      await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
      await click(browser, 'Bilder', 'document');
      await setPhotoFiles(browser, 'input[aria-label="Velg bildefiler"]', files);
      await browser.waitFor('!document.querySelector(".photo-collection-notice [role=status]").innerText.includes("Lager miniatyrbilder")');
      await click(browser, 'Opprett fotokartlag (3 bilder)', 'document');
      await click(browser, 'Bildemodul', 'document');
      await browser.waitFor('document.querySelector(".photo-workspace-collection")?.innerText.includes("3 bilder med EXIF")');
      assert.equal(await browser.evaluate(markers), 0);
      await stagePhotoSource(browser, sourceFile, 'gmi');
      assert(await browser.evaluate(`${sourceWizard}.innerText.includes('Gjentas')`));
      await closePhotoSources(browser);
      assert.equal(await browser.evaluate('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length'), 3);
      await stagePhotoSource(browser, sourceFile, 'gmi');
      await savePhotoSource(browser, 'gmi');
      assert.equal(await browser.evaluate(markers), 0);
      assert.equal(await browser.evaluate('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length'), 4);
      await click(browser, 'Kontroller tilgjengelige posisjoner');
      const rows = await browser.evaluate(`Array.from(${sourceWizard}.querySelectorAll('li[data-photo-id]')).map(row=>({id:row.dataset.photoId,filename:row.querySelector('strong').innerText,options:Array.from(row.querySelector('select').options).map(option=>option.text)}))`);
      const repeated = rows.filter((row) => row.filename === 'a.png');
      assert.equal(repeated.length, 2);
      for (const row of repeated) { assert(row.options.includes('GMI – objektposisjon')); assert(row.options.includes('EXIF GPS')); }
      assert(!rows.find((row) => row.filename === 'line.png').options.includes('GMI – objektposisjon'));
      assert(await browser.evaluate(`${sourceWizard}.innerText.includes('Flere plasseringer')`));
      assert(await browser.evaluate(`${sourceWizard}.innerText.includes('Kum A') && ${sourceWizard}.innerText.includes('Kum B')`));
      for (const [width, height] of [[1366, 768], [1024, 620]]) {
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        assert(await browser.evaluate(`(() => {const content=${sourceWizard}.querySelector('.photo-positioning-content');return content.scrollWidth<=content.clientWidth+1;})()`));
      }
      await applyPhotoSourcePositions(browser, 'gmi');
      assert.equal(await browser.evaluate(markers), 3);
      assert(await browser.evaluate('document.querySelector(".photo-workspace-collection header").innerText.includes("3 bilder · 4 plasseringer · 3 plassert · 1 uplassert")'));
      const [a, b] = repeated.map((row) => row.id);
      await select(a); await openProvenance();
      assert(await browser.evaluate(`${inspector}.innerText.includes(${JSON.stringify(guids[0])})`));
      assert(await browser.evaluate(`${inspector}.querySelector('.photo-occurrence-context').innerText.includes('Kum A')`));
      await browser.waitFor('document.querySelector(".photo-collection-original img")?.complete');
      const original = await imageUrl(), created = await browser.evaluate('window.__originalCreated');
      await browser.evaluate('document.querySelector(".photo-preview-open").click()');
      await browser.waitFor('document.querySelector(".photo-image-viewer[open]")');
      assert.equal(await browser.evaluate('document.querySelector(".photo-image-viewer img").src'), original);
      await click(browser, 'Lukk', 'document.querySelector(".photo-image-viewer")');
      const aPosition = await positionText();
      await select(b); await openProvenance();
      assert(await browser.evaluate(`${inspector}.querySelector('.photo-occurrence-context').innerText.includes('Kum B')`));
      assert.equal(await imageUrl(), original);
      assert.equal(await browser.evaluate('window.__originalCreated'), created);
      const bPosition = await positionText();
      assert.notEqual(aPosition, bPosition);
      await click(browser, 'Flytt på kartet', inspector);
      const box = await browser.evaluate('document.querySelector(".leaflet-container").getBoundingClientRect().toJSON()');
      const x = box.left + box.width / 2 + 35, y = box.top + box.height / 2 + 15;
      await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
      await browser.waitFor('document.querySelector(".photo-proposed-marker")');
      await click(browser, 'Bruk plassering', inspector);
      assert(await browser.evaluate(`${inspector}.innerText.includes('Gjeldende posisjon (Manuell)')`));
      await click(browser, 'Juster retning', inspector);
      await browser.evaluate(`(() => {const input=document.querySelector('.photo-direction-editor input[type=number]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'75');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await click(browser, 'Bruk retning', inspector);
      await select(a);
      assert.equal(await positionText(), aPosition);
      assert.equal(await browser.evaluate('document.querySelector(".photo-direction-accepted").innerText'), 'Ikke angitt');
      await select(b);
      assert.equal(await browser.evaluate('document.querySelector(".photo-direction-accepted").innerText'), '75°');
      await openPhotoSources(browser);
      await click(browser, 'Kontroller tilgjengelige posisjoner');
      assert.equal(await browser.evaluate(`${sourceWizard}.querySelector('li[data-photo-id="${b}"] select').value`), '');
      await closePhotoSources(browser);
      await openPhotoSources(browser);
      await click(browser, 'Kontroller på nytt');
      await savePhotoSource(browser, 'gmi'); await closePhotoSources(browser);
      assert.equal(await browser.evaluate('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length'), 4);
      await browser.evaluate(`document.querySelector('.photo-workspace-list li[data-photo-id="${a}"] input').click()`);
      await click(browser, 'Fjern fra lag', 'document.querySelector(".photo-workspace-collection")');
      await click(browser, 'Fjern fra lag', 'document.querySelector(".photo-remove-confirmation")');
      assert.equal(await browser.evaluate(markers), 2);
      await select(b);
      assert.equal(await imageUrl(), original);
      assert.equal(await browser.evaluate('window.__assetUrls.size'), 1);
      await browser.evaluate(`document.querySelector('.photo-workspace-list li[data-photo-id="${b}"] input').click()`);
      await click(browser, 'Fjern fra lag', 'document.querySelector(".photo-workspace-collection")');
      await click(browser, 'Fjern fra lag', 'document.querySelector(".photo-remove-confirmation")');
      assert.equal(await browser.evaluate(`window.__assetUrls.has(${JSON.stringify(original)})`), false);
      assert.equal(await browser.evaluate(markers), 1);
    } finally {
      await browser.close();
      if (path.dirname(path.resolve(directory)) !== root || !path.basename(directory).startsWith('gmi-placements-ui-')) throw new Error('Unsafe temporary fixture directory');
      await rm(directory, { recursive: true, force: true });
    }
  });
