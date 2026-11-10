// M8 browser test: per-occurrence combined-delivery choices in the FOTO workspace.
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

test('FOTO delivery intent: independent occurrence choices, bulk scope, filter, review-free navigation and laptop widths',
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
    const radio = (label) => `Array.from(${section}.querySelectorAll('label')).find((item) => item.innerText.trim()===${JSON.stringify(label)}).querySelector('input')`;
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

      // Defaults: linked occurrences keep their link; no row indicators; no summary line.
      await select('Kum 1');
      assert.equal(await browser.evaluate(`${radio('Behold lenke i GMI')}.checked`), true);
      assert.equal(await browser.evaluate(`${radio('Overfør til GML')}.checked`), false);
      assert.equal(await browser.evaluate('document.querySelectorAll(".photo-delivery-pill").length'), 0);
      assert.equal(await browser.evaluate('Boolean(document.querySelector(".photo-delivery-summary"))'), false);
      assert(await browser.evaluate(`${section}.innerText.includes('Andre plasseringer av samme bilde') && ${section}.innerText.includes('Kum 2')`));

      // Explicit single-occurrence transfer of a shared photo: Kum 2 keeps its link.
      await browser.evaluate(`${radio('Overfør til GML')}.click()`);
      await browser.waitFor(`${radio('Overfør til GML')}.checked`);
      assert.equal(await pill('Kum 1'), 'Til GML');
      assert.equal(await pill('Kum 2'), null);
      const text = await browser.evaluate(`${section}.innerText`);
      assert(text.includes('fjernes først når en samlet leveranse lages senere'), 'explains that nothing is removed now');
      assert(text.includes('GMI-filen er ikke endret'));
      assert(text.includes('Mangler foreløpig godkjent plassering'), 'readiness is shown, the choice is kept');
      assert(/Kum 2\s*Beholdes i GMI/.test(text), 'sibling occurrence shows its own state');
      assert.equal(await browser.evaluate('document.querySelector(".photo-delivery-summary").innerText'), 'Samlet levering: 1 overføres til GML');
      await browser.evaluate(`${section}.scrollIntoView({ block: 'center' }); window.scrollTo(0, 0); document.scrollingElement.scrollTop = 0;`);
      await screenshot(browser, 'm8-inspector-transfer');

      // Navigation: to Kum 2 through the sibling link, to another photo and back.
      await browser.evaluate(`Array.from(${section}.querySelectorAll('.photo-delivery-siblings button')).find((item) => item.innerText.includes('Kum 2')).click()`);
      await browser.waitFor(`${rowOf('Kum 2')}.querySelector('button.photo-workspace-row').getAttribute('aria-pressed')==='true'`);
      assert.equal(await browser.evaluate(`${radio('Behold lenke i GMI')}.checked`), true);
      await select('d.png');
      await select('Kum 1');
      assert.equal(await browser.evaluate(`${radio('Overfør til GML')}.checked`), true, 'the decision survives inspector navigation');

      // Unlinked photo: explicit inclusion. Line-only link: no choice, stays in GMI.
      await select('d.png');
      assert(await browser.evaluate(`${section}.innerText.includes('Bildet har ingen GMI-lenke')`));
      await browser.evaluate(`${section}.querySelector('.photo-delivery-include input').click()`);
      await browser.waitFor(`${section}.querySelector('.photo-delivery-include input').checked`);
      assert.equal(await pill('d.png'), 'Tas med');
      await select('c.png');
      assert(await browser.evaluate(`${section}.innerText.includes('Lenken beholdes i GMI') && !${section}.querySelector('input')`));

      // Bulk: Kum 2, Kum 3 and d.png selected; each action applies only to its own kind, with exact counts.
      await click(browser, 'Velg samlet levering', 'document');
      await browser.waitFor('document.querySelector(".photo-delivery-bar")');
      for (const name of ['Kum 2', 'Kum 3', 'd.png']) await browser.evaluate(`${rowOf(name)}.querySelector('input[type=checkbox]').click()`);
      const buttons = await browser.evaluate(`Array.from(document.querySelectorAll('.photo-delivery-actions button')).map((button) => [button.innerText.trim(), button.disabled])`);
      // Only actions that change something are offered, each with its exact count.
      assert.deepEqual(buttons, [['Overfør 2 plasseringer til GML', false], ['Ikke ta med 1 plassering', false]]);
      assert(await browser.evaluate('document.querySelector(".photo-delivery-actions").innerText.includes("Valgt: 3 plasseringer · 2 med GMI-lenke, 1 uten")'));
      assert(await browser.evaluate('document.querySelector(".photo-delivery-actions").innerText.includes("Hver handling gjelder bare plasseringer av riktig type")'));
      await screenshot(browser, 'm8-bulk-selection');
      await click(browser, 'Overfør 2 plasseringer til GML', 'document.querySelector(".photo-delivery-actions")');
      await browser.waitFor('document.querySelector(".photo-workspace-toast-anchor")?.innerText.includes("2 plasseringer merket «Overføres til GML»")');
      assert.deepEqual(await Promise.all(['Kum 1', 'Kum 2', 'Kum 3', 'd.png'].map(pill)), ['Til GML', 'Til GML', 'Til GML', 'Tas med'], 'd.png keeps its inclusion');
      await browser.evaluate(`${rowOf('Kum 2')}.querySelector('input[type=checkbox]').click()`);
      await click(browser, 'Behold lenker for 1 plassering', 'document.querySelector(".photo-delivery-actions")');
      await browser.waitFor(`!${rowOf('Kum 2')}.querySelector('.photo-delivery-pill')`);
      assert.equal(await browser.evaluate('document.querySelector(".photo-delivery-summary").innerText'), 'Samlet levering: 2 overføres til GML · 1 tas med uten GMI-lenke');
      await browser.evaluate('document.querySelector(".photo-workspace-collection").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))');
      await browser.waitFor('!document.querySelector(".photo-delivery-bar")');

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

      // Laptop widths: nothing overflows horizontally.
      for (const [width, height] of [[1366, 768], [1280, 720], [1024, 640]]) {
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
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
