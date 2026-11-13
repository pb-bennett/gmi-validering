// M8 browser test: per-occurrence combined-delivery choices in the FOTO workspace (direct-click «Fordel bilder til GMI/GML»).
// Synthetic files only. Needs PHOTO_UI_URL (a running production build); saves screenshots with PHOTO_SCREENSHOT_DIR.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { gpsPng } from './helpers/photoGpsFixtures.mjs';
import { gmiFile } from './helpers/gmiPhotoFixtures.mjs';
import { createLayerWithoutPlacement, waitForThumbnails } from './helpers/photoImportWizard.mjs';
import { clickSourceControl as click, closePhotoSources, savePhotoSource, setPhotoFiles, stagePhotoSource } from './helpers/photoSourceWorkflow.mjs';

const app = process.env.PHOTO_UI_URL;
const inspector = 'document.querySelector(".photo-workspace-inspector")';
const section = `${inspector}.querySelector('section[aria-label="Samlet levering"]')`;
const rowOf = (text) => `Array.from(document.querySelectorAll('.photo-workspace-list li[data-photo-id]')).find((row) => row.innerText.includes(${JSON.stringify(text)}))`;
const screenshot = async (browser, name) => {
  if (!process.env.PHOTO_SCREENSHOT_DIR) return;
  await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive: true });
  const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(process.env.PHOTO_SCREENSHOT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
};

test('FOTO delivery intent: compact inspector toggle, direct-click planning, independent occurrences, filter and laptop/mobile widths',
  { skip: !chromePath || !app, timeout: 240000 }, async () => {
    const directory = await mkdtemp(path.join(path.resolve(tmpdir()), 'photo-delivery-ui-'));
    const browser = await openTestChrome();
    const names = ['a.png', 'b.png', 'c.png', 'd.png'], files = names.map((name) => path.join(directory, name));
    const sourceFile = path.join(directory, 'leveranse.gmi');
    await Promise.all(files.map((file) => writeFile(file, gpsPng())));
    await writeFile(sourceFile, Buffer.from(await gmiFile([
      { guid: '00000000-0000-4000-8000-000000000001', label: 'Kum 1', hyperlink: 'h:1(link:"a.png") ', xyz: '581930 6566000 1' },
      { guid: '00000000-0000-4000-8000-000000000002', label: 'Kum 2', hyperlink: 'h:1(link:"a.png") ', xyz: '582030 6566100 1' },
      { guid: '00000000-0000-4000-8000-000000000003', label: 'Kum 3', hyperlink: 'h:1(link:"b.png") ', xyz: '582050 6566120 1' },
      { scope: 'line', guid: '00000000-0000-4000-8000-000000000010', label: 'Ledning', hyperlink: 'h:1(link:"c.png") ' },
    ]).arrayBuffer()));
    const select = async (text) => {
      await browser.evaluate(`${rowOf(text)}.querySelector('button.photo-workspace-row').click()`);
      await browser.waitFor(`${rowOf(text)}.querySelector('button.photo-workspace-row').getAttribute('aria-pressed')==='true' && ${section}`);
    };
    // The compact GMI/GML toggle: rounded pill buttons in a radiogroup.
    const option = (key) => `${section}.querySelector('[role=radio][data-destination="${key}"]')`;
    const pressKey = async (key, keyCode, code = key) => {
      await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, ...(key === ' ' ? { text: ' ' } : {}) });
      await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
    };
    const pill = (text) => browser.evaluate(`${rowOf(text)}.querySelector('.photo-delivery-pill')?.innerText || null`);
    const noOverflow = () => browser.evaluate(`['.photo-workspace-collection', '.photo-workspace-inspector'].every((selector) => {
      const element = document.querySelector(selector); return element && element.scrollWidth <= element.clientWidth + 1; })`);
    try {
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear();' });
      await browser.send('Page.navigate', { url: app + '?testmodus=1' });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")');
      await browser.evaluate('document.querySelector("button[aria-label=Lukk]").click()');
      await click(browser, 'Bilder', 'document');
      await setPhotoFiles(browser, 'input[aria-label="Velg bildefiler"]', files);
      await waitForThumbnails(browser);
      await createLayerWithoutPlacement(browser);
      await stagePhotoSource(browser, sourceFile, 'gmi');
      await savePhotoSource(browser, 'gmi');
      await closePhotoSources(browser);
      await browser.waitFor('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length === 5');

      // Defaults: linked occurrences keep their link; every row shows its destination; no summary line.
      await select('Kum 1');
      assert.equal(await browser.evaluate(`${option('gmi')}.getAttribute('aria-checked')`), 'true');
      assert.equal(await browser.evaluate(`${option('gml')}.getAttribute('aria-checked')`), 'false');
      assert.match(await browser.evaluate(`${section}.querySelector('[role=radiogroup]').getAttribute('aria-label')`), /^Leveringsvalg for a.png · .*Kum 1/);
      assert.deepEqual(await Promise.all(['Kum 1', 'Kum 2', 'Kum 3', 'c.png', 'd.png'].map(pill)), ['GMI', 'GMI', 'GMI', 'GMI', 'Ikke med']);
      assert.equal(await browser.evaluate('Boolean(document.querySelector(".photo-delivery-summary"))'), false);
      assert.equal(await browser.evaluate(`${section}.querySelectorAll('input').length`), 0, 'compact pills, no permanent radio list');
      const switcher = `${inspector}.querySelector('.photo-occurrence-switcher')`;
      assert.match(await browser.evaluate(`Array.from(${switcher}.querySelectorAll('button')).map((b) => b.getAttribute('aria-label')).join('|')`), /Kum 2 · levering: beholdes i gmi/);

      // One click on GML in the inspector: Kum 1 only, at once; Kum 2 (same photograph) keeps its link.
      await browser.evaluate(`${option('gml')}.click()`);
      await browser.waitFor(`${option('gml')}.getAttribute('aria-checked') === 'true'`);
      assert.equal(await pill('Kum 1'), 'GML');
      assert.equal(await pill('Kum 2'), 'GMI');
      const text = await browser.evaluate(`${section}.innerText`);
      assert(!text.includes('fjernes først når en samlet leveranse lages senere'), 'the link-removal explanation lives in the export wizard');
      assert(text.includes('Mangler for GML: godkjent plassering'), 'readiness is shown once, the choice is kept');
      assert.equal(await browser.evaluate('document.querySelector(".photo-delivery-summary").innerText'), 'Samlet levering: 1 overføres til GML');
      assert.match(await browser.evaluate(`Array.from(${switcher}.querySelectorAll('button')).find((b) => b.innerText.includes('Kum 2')).innerText`), /GMI$/);
      await browser.evaluate(`${section}.scrollIntoView({ block: 'center' }); window.scrollTo(0, 0); document.scrollingElement.scrollTop = 0;`);
      await screenshot(browser, 'm8-inspector-transfer');

      // Keyboard: arrows move and choose within the two-position control.
      await browser.evaluate(`${option('gml')}.focus()`);
      await pressKey('ArrowLeft', 37);
      await browser.waitFor(`${option('gmi')}.getAttribute('aria-checked') === 'true' && document.activeElement === ${option('gmi')}`);
      await pressKey('ArrowRight', 39);
      await browser.waitFor(`${option('gml')}.getAttribute('aria-checked') === 'true'`);
      assert.equal(await pill('Kum 2'), 'GMI');

      // Navigation: to Kum 2 through the occurrence switcher, to another photo and back.
      await browser.evaluate(`Array.from(${switcher}.querySelectorAll('button')).find((item) => item.innerText.includes('Kum 2')).click()`);
      await browser.waitFor(`${rowOf('Kum 2')}.querySelector('button.photo-workspace-row').getAttribute('aria-pressed')==='true'`);
      assert.equal(await browser.evaluate(`${option('gmi')}.getAttribute('aria-checked')`), 'true');
      await select('d.png');
      await select('Kum 1');
      assert.equal(await browser.evaluate(`${option('gml')}.getAttribute('aria-checked')`), 'true', 'the decision survives inspector navigation');

      // Unlinked photo: «Ikke med» / GML, never an invalid GMI destination. Line-only link: fixed GMI.
      await select('d.png');
      assert.deepEqual(await browser.evaluate(`Array.from(${section}.querySelectorAll('[role=radio]')).map((b) => b.innerText.trim())`), ['Ikke med', 'GML']);
      await browser.evaluate(`${option('gml')}.click()`);
      await browser.waitFor(`${option('gml')}.getAttribute('aria-checked') === 'true'`);
      assert.equal(await pill('d.png'), 'GML');
      await select('c.png');
      assert(await browser.evaluate(`${section}.innerText.includes('Lenken beholdes i GMI') && ${section}.querySelectorAll('[role=radio]').length === 1
        && ${option('gmi')}.getAttribute('aria-disabled') === 'true' && ${option('gmi')}.getAttribute('aria-checked') === 'true'`));

      // Fordel bilder til GMI/GML: separate destination buttons toggle that occurrence; no checkboxes, selection or Apply step.
      await click(browser, 'Fordel bilder til GMI/GML', 'document');
      await browser.waitFor('document.querySelector(".photo-delivery-bar")');
      const bar = 'document.querySelector(".photo-delivery-bar")';
      assert(await browser.evaluate(`${bar}.innerText.includes('Bruk leveringsknappen for å endre GMI/GML.')`));
      assert.equal(await browser.evaluate('document.querySelectorAll(".photo-workspace-list input, .photo-delivery-actions").length'), 0);
      assert.equal(await browser.evaluate(`${bar}.innerText.includes('Velg alle viste')`), false);
      assert.equal(await browser.evaluate('document.querySelector(".photo-map-display-card select").value'), 'delivery');
      const counts = () => browser.evaluate(`Array.from(${bar}.querySelectorAll('.photo-delivery-counts li')).map((li) => li.innerText.replace(/\\s+/g, ' ').trim()).join(' | ')`);
      assert.equal(await counts(), 'GMI 3 | GML 2');
      const planRow = async (name, expected) => {
        await browser.evaluate(`${rowOf(name)}.querySelector('button.photo-delivery-row-button').click()`);
        await browser.waitFor(`${rowOf(name)}.querySelector('.photo-delivery-pill')?.innerText === ${JSON.stringify(expected)}`);
      };
      // Row, filename and thumbnail navigate in planning without changing decisions.
      await select('Kum 2');
      assert.equal(await pill('Kum 2'), 'GMI');
      assert.equal(await browser.evaluate(`${option('gmi')}.getAttribute('aria-checked')`), 'true');
      await browser.evaluate(`${rowOf('Kum 1')}.querySelector('.photo-workspace-filename').click()`);
      await browser.waitFor(`${rowOf('Kum 1')}.querySelector('.photo-workspace-row').getAttribute('aria-pressed') === 'true'`);
      await browser.evaluate(`${rowOf('Kum 2')}.querySelector('img').click()`);
      await browser.waitFor(`${rowOf('Kum 2')}.querySelector('.photo-workspace-row').getAttribute('aria-pressed') === 'true'`);
      assert.equal(await pill('Kum 2'), 'GMI');
      await select('Kum 1');
      const mapPosition = () => browser.evaluate(`Array.from(document.querySelectorAll('.leaflet-map-pane, .leaflet-marker-icon')).map(e => e.style.transform)`);
      await browser.evaluate('new Promise(resolve => setTimeout(resolve, 600))');
      const beforeMap = await mapPosition();
      await planRow('Kum 2', 'GML');
      assert.equal(await pill('Kum 1'), 'GML', 'sibling occurrence unchanged');
      assert.equal(await browser.evaluate(`${rowOf('Kum 1')}.querySelector('.photo-workspace-row').getAttribute('aria-pressed')`), 'true', 'destination editing does not navigate');
      assert.deepEqual(await mapPosition(), beforeMap, 'destination editing does not pan or zoom');
      assert.match(await browser.evaluate(`${bar}.querySelector('[role=status]').innerText`), /^a\.png · .*Kum 2: Overføres til GML$/);
      await planRow('Kum 3', 'GML');
      await planRow('d.png', 'Ikke med');
      assert.equal(await counts(), 'GMI 1 | GML 3 | Ikke med 1');
      assert.match(await browser.evaluate(`${rowOf('Kum 2')}.querySelector('button.photo-delivery-row-button').getAttribute('aria-label')`), /Overføres til GML\. Klikk for GMI$/);
      // Keyboard activation of the destination button: Space toggles it back.
      await browser.evaluate(`${rowOf('Kum 2')}.querySelector('button.photo-delivery-row-button').focus()`);
      await pressKey(' ', 32, 'Space');
      await browser.waitFor(`${rowOf('Kum 2')}.querySelector('.photo-delivery-pill')?.innerText === 'GMI'`);
      await planRow('d.png', 'GML');
      // A line-only link cannot change: explained, nothing written.
      assert.equal(await browser.evaluate(`${rowOf('c.png')}.querySelector('.photo-delivery-row-button').getAttribute('aria-disabled')`), 'true');
      assert.match(await browser.evaluate(`${rowOf('c.png')}.querySelector('.photo-delivery-row-button').title`), /Lenken beholdes i GMI/);
      await browser.evaluate(`${rowOf('c.png')}.querySelector('.photo-delivery-row-button').click()`);
      assert.equal(await pill('c.png'), 'GMI');
      assert.deepEqual(await Promise.all(['Kum 1', 'Kum 2', 'Kum 3', 'd.png'].map(pill)), ['GML', 'GMI', 'GML', 'GML']);
      assert.equal(await browser.evaluate('document.querySelectorAll("button button").length'), 0);
      for (const [width, height] of [[1280, 720], [1366, 768]]) {
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        await select('Kum 1');
        assert(await noOverflow());
        const styles = await browser.evaluate(`['gmi','gml'].map(key => {
          const e = document.querySelector('.photo-delivery-row-button[data-destination='+key+']');
          const s = getComputedStyle(e); return [s.backgroundColor,s.color]; })`);
        assert.deepEqual(styles, [['rgb(30, 64, 175)', 'rgb(255, 255, 255)'], ['rgb(22, 101, 52)', 'rgb(255, 255, 255)']]);
        assert.deepEqual(await browser.evaluate(`(() => {const s=getComputedStyle(${option('gml')}); return [s.backgroundColor,s.color];})()`), styles[1]);
        await screenshot(browser, `sidebar-destinations-${width}x${height}`);
      }
      await browser.evaluate('document.querySelector(".photo-workspace-collection").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))');
      await browser.waitFor('!document.querySelector(".photo-delivery-bar")');
      assert.equal(await browser.evaluate('document.querySelector(".photo-delivery-summary").innerText'), 'Samlet levering: 2 overføres til GML · 1 tas med uten GMI-lenke');
      assert.equal(await browser.evaluate('document.querySelectorAll(".photo-delivery-row-button").length'), 0);
      // Outside planning, a row click opens the photo again and changes nothing.
      await select('Kum 3');
      assert.equal(await pill('Kum 3'), 'GML');

      // Filter by delivery status. Select a matching photo first: a filtered-out active photo stays pinned in the list.
      await select('Kum 1');
      await browser.evaluate('document.querySelector("button[aria-label^=\'Filtrer bilder\']").click()');
      await browser.waitFor('document.querySelector(".photo-filter-panel")');
      const options = await browser.evaluate(`Array.from(document.querySelectorAll('.photo-filter-panel fieldset')).find((item) => item.querySelector('legend').innerText==='Samlet levering').innerText`);
      for (const label of ['Beholdes i GMI (2)', 'Overføres til GML (2)', 'Tas med uten GMI-lenke (1)', 'Ikke valgt (0)', 'Krever gjennomgang (0)']) assert(options.includes(label), label);
      await browser.evaluate(`document.querySelector('.photo-filter-panel input[value="transfer"]').click()`);
      await browser.waitFor('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length === 2');
      await screenshot(browser, 'm8-filter-transfer');
      await browser.evaluate(`document.querySelector('.photo-filter-panel input[value="all"][name$="-delivery"]').click()`);
      await browser.waitFor('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length === 5');

      // Laptop and narrow widths: nothing overflows horizontally.
      for (const [width, height] of [[1366, 768], [1280, 720], [1024, 640], [390, 844]]) {
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
        await select('Kum 1');
        assert(await noOverflow(), `no horizontal overflow at ${width}×${height}`);
        await browser.evaluate(`${section}.scrollIntoView({ block: 'center' }); window.scrollTo(0, 0); document.scrollingElement.scrollTop = 0;`);
        await screenshot(browser, `m8-inspector-${width}x${height}`);
      }
    } finally {
      await browser.close();
      if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('photo-delivery-ui-')) throw new Error('Unsafe temporary fixture directory');
      await rm(directory, { recursive: true, force: true });
    }
  });
