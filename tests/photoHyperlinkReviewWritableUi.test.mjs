// Batch 1B.4A production browser: the writable photo hyperlink review end to end on synthetic data — pairing with the
// simplified evidence map, consolidated Kontroll, one atomic save (repeated clicks), receipt, «Kontroller i Validator» on
// the actual Foreslått dataset, FOTO proposed state and locks, Rettinger history, undo/redo, reopening with an active
// transfer and the delivery wizard. No test hook writes state: every step goes through the application's own controls.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { gmiText } from './helpers/gmiPhotoFixtures.mjs';
import { gpsPng } from './helpers/photoGpsFixtures.mjs';
import { setPhotoFiles, clickSourceControl } from './helpers/photoSourceWorkflow.mjs';
import { waitForThumbnails } from './helpers/photoImportWizard.mjs';

const app = process.env.PHOTO_UI_URL;
const click = (browser, label, root = 'document') => clickSourceControl(browser, label, root);
const dialog = 'document.querySelector(".photo-link-review[open]")';
const workspace = 'document.querySelector(".gmi-edit-workspace")';
const link = (name) => `h:1(link:"${name}" sign:"Synthetic surveyor") `;

test('Batch 1B.4A production: pairing, Kontroll, one atomic save, receipt, Validator on Foreslått, FOTO, Rettinger undo/redo, reopening and delivery',
  { skip: !app || !chromePath, timeout: 300000 }, async (t) => {
    const temporaryRoot = path.resolve(tmpdir()), directory = await mkdtemp(path.join(temporaryRoot, 'gmi-link-save-'));
    const source = path.join(directory, 'Synthetic transfer.gmi');
    const images = ['SYNT_TOPP_1.png', 'SYNT_KUM_1.png'].map((name) => path.join(directory, name));
    // A LOK with one photograph and an SLU without links 0,16 m away (the acceptance shape), an unrelated KUM with its own
    // photograph and further point objects that the evidence map hides by default.
    const objects = [
      { parserId: 293, tema: 'LOK', label: 'SYNT-L293', hyperlink: link('SYNT_TOPP_1.png'), xyz: '581950.000 6566010.000 101.250' },
      { parserId: 108, tema: 'SLU', label: 'SYNT-S8', hyperlink: '', xyz: '581950.096 6566010.128 100.900' },
      { parserId: 12, tema: 'KUM', label: 'SYNT-K12', hyperlink: link('SYNT_KUM_1.png'), xyz: '581964.000 6566024.000 99.000' },
      ...Array.from({ length: 6 }, (_, index) => ({ parserId: 400 + index, tema: 'KUM', label: `SYNT-K${400 + index}`, xyz: `${581952 + index * 2}.000 ${6566012 + index}.000 99.500` })),
    ];
    await writeFile(source, Buffer.from(gmiText(objects), 'latin1'));
    await writeFile(images[0], gpsPng({ noLocation: true, captureTime: '2026:09:23 14:38:01' }));
    await writeFile(images[1], gpsPng({ noLocation: true, captureTime: '2026:09:23 14:40:12' }));
    const browser = await openTestChrome();
    const shot = async (name) => {
      if (!process.env.PHOTO_LINK_SCREENSHOT_DIR) return;
      await mkdir(process.env.PHOTO_LINK_SCREENSHOT_DIR, { recursive: true });
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.PHOTO_LINK_SCREENSHOT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
    };
    const size = (width, height) => browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const bounded = async (width, height, label) => {
      await size(width, height);
      assert(await browser.evaluate(`(() => {const d=${dialog},r=d.getBoundingClientRect(),pane=d.querySelector('.photo-link-detail, .photo-link-control-body');
        return r.top>=0&&r.bottom<=innerHeight&&d.scrollWidth<=d.clientWidth+1&&pane.scrollWidth<=pane.clientWidth+1
          &&Array.from(d.querySelectorAll('footer button')).every(b=>{const q=b.getBoundingClientRect();return q.bottom<=innerHeight&&q.right<=innerWidth;});})()`), `${label} ${width}×${height}: bounded, footer reachable`);
      await shot(`${label}-${width}x${height}`);
    };
    const openReview = async () => {
      await browser.evaluate('document.querySelector(".photo-tools-trigger").click()');
      await browser.waitFor('document.querySelector(".photo-tools-popup")');
      await browser.evaluate(`Array.from(document.querySelectorAll('.photo-tools-popup button')).find(e=>e.textContent.includes('Gjennomgå bildelenker')).click()`);
      await browser.waitFor(`${dialog}?.querySelector('.photo-link-list button')`);
    };
    const openLok = async () => {
      await browser.evaluate(`Array.from(${dialog}.querySelectorAll('.photo-link-list button')).find(e=>e.innerText.includes('Punkt 293')).click()`);
      await browser.waitFor(`${dialog}.querySelector('.photo-link-detail h3')?.textContent.includes('Punkt 293')`);
    };
    const target = (text) => `Array.from(${dialog}.querySelectorAll('.photo-link-target')).find(e=>e.textContent.includes(${JSON.stringify(text)}))?.querySelector('input')`;
    const footerButton = (text) => `Array.from(${dialog}.querySelectorAll('footer button')).find(e=>e.textContent.trim()===${JSON.stringify(text)})`;
    const mapPaths = (kind) => browser.evaluate(`${dialog}.querySelectorAll('.photo-link-map path.photo-link-map-${kind}').length`);
    const listRow = (filename) => `Array.from(document.querySelectorAll('.photo-workspace-list li[data-photo-id]')).find(li=>li.innerText.includes(${JSON.stringify(filename)}))`;
    try {
      await size(1366, 768);
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm=()=>true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")'); await click(browser, 'Lukk');
      await setPhotoFiles(browser, 'input[type=file]', [source]);
      await browser.waitFor('document.querySelector("button[aria-label=\\"Koble bilder til GMI-laget\\"]")');
      await browser.evaluate('document.querySelector("button[aria-label=\\"Koble bilder til GMI-laget\\"]").click()');
      await browser.waitFor('document.querySelector("input[aria-label=\\"Velg bildefiler\\"]")');
      await setPhotoFiles(browser, 'input[aria-label="Velg bildefiler"]', images);
      await waitForThumbnails(browser);
      await click(browser, 'Neste', 'document.querySelector(".photo-collection-dialog[open]")');
      await browser.waitFor('document.querySelector(".photo-import-review")');
      await click(browser, 'Opprett fotolag', 'document.querySelector(".photo-collection-dialog[open]")');
      await browser.waitFor('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length === 2');
      const fotoRows = () => browser.evaluate(`JSON.stringify(Array.from(document.querySelectorAll('.photo-workspace-list li[data-photo-id]')).map(e=>e.innerText))`);
      const rowsBefore = await fotoRows();

      await t.test('pairing: no automatic recipient; the evidence map shows source, recipient and photograph only, with others on request', async () => {
        await openReview(); await openLok();
        assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('.photo-link-target input:checked').length`), 0);
        await browser.evaluate(`${dialog}.querySelector('.photo-link-group-select input').click()`);
        await browser.waitFor(`${dialog}.querySelector('.photo-link-group[data-active]')`);
        await browser.waitFor(`${target('SLU · Punkt 108')} && !${target('SLU · Punkt 108')}.disabled`);
        assert(await browser.evaluate(`${dialog}.querySelector('.photo-link-target strong')?.textContent === 'SLU · Punkt 108'`), 'the 0,16 m SLU is the nearest candidate');
        await browser.evaluate(`(() => { const input=${target('SLU · Punkt 108')}; input.focus(); input.click(); })()`);
        await browser.waitFor(`${target('SLU · Punkt 108')}?.checked`);
        assert.match(await browser.evaluate(`${dialog}.querySelector('.photo-link-recipient-line').innerText`), /SLU · Punkt 108 · 0,16 m/);
        await browser.evaluate(`${dialog}.querySelector('[aria-label="Foreslått mottaker"]').scrollIntoView({block:'start'})`);
        await browser.waitFor(`${dialog}.querySelector('.photo-link-map path.photo-link-map-recipient')`);
        assert.deepEqual([await mapPaths('source'), await mapPaths('recipient'), await mapPaths('move'), await mapPaths('other')], [1, 1, 1, 0], 'default evidence view');
        // The selected recipient stays visually distinct from the source at 0,16 m: their marker centres are apart.
        const apart = await browser.evaluate(`(() => { const c=(k)=>{const r=${dialog}.querySelector('.photo-link-map path.photo-link-map-'+k).getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2];};
          const [a,b]=[c('source'),c('recipient')]; return Math.hypot(a[0]-b[0],a[1]-b[1]); })()`);
        assert(apart >= 12, `source and recipient markers are ${apart} px apart`);
        assert.match(await browser.evaluate(`${dialog}.querySelector('.photo-link-map-legend').innerText`), /Kilde: LOK · Punkt 293[\s\S]*Mottaker: SLU · Punkt 108[\s\S]*Bilde:/);
        assert.equal(await browser.evaluate(`getComputedStyle(${dialog}.querySelector('.photo-link-map-controls input')).accentColor`), 'rgb(0, 117, 149)');
        for (const [width, height] of [[1280, 720], [1366, 768]]) await bounded(width, height, 'save-pairing-map');
        await browser.evaluate(`${dialog}.querySelector('.photo-link-map-controls input').click()`);
        await browser.waitFor(`${dialog}.querySelectorAll('.photo-link-map path.photo-link-map-other').length > 0`);
        assert.equal(await mapPaths('recipient'), 1, 'the recipient is not drawn twice');
        await browser.waitFor(`(() => { const box=${dialog}.querySelector('.photo-link-map .leaflet-container').getBoundingClientRect();
          return Array.from(${dialog}.querySelectorAll('.photo-link-map path.photo-link-map-other')).every(p=>{const r=p.getBoundingClientRect();return r.left>=box.left&&r.right<=box.right&&r.top>=box.top&&r.bottom<=box.bottom;}); })()`);
        await shot('save-pairing-map-others-1366x768');
        await browser.evaluate(`${dialog}.querySelector('.photo-link-map-controls input').click()`);
        await browser.waitFor(`${dialog}.querySelectorAll('.photo-link-map path.photo-link-map-other').length === 0`);
      });

      await t.test('Kontroll: complete transfer summary; repeated save clicks save once; the receipt names the change', async () => {
        await click(browser, 'Kontroll', dialog);
        await browser.waitFor(`${dialog}.querySelector('.photo-link-save-status')?.dataset.saveState === 'ready'`);
        const row = await browser.evaluate(`${dialog}.querySelector('.photo-link-control tbody tr').innerText`);
        for (const part of ['SYNT_TOPP_1.png', 'LOK · Punkt 293', 'SLU · Punkt 108', 'AnleggsID: SYNT-S8', '0,16 m', 'Ingen eksisterende bildereferanser', 'Avklart', 'EPSG:4326'])
          assert(row.includes(part), `Kontroll row shows ${part}: ${row}`);
        assert.equal(await browser.evaluate(`${footerButton('Lagre endringer')}.disabled`), false);
        assert.equal(await browser.evaluate(`getComputedStyle(${footerButton('Lagre endringer')}).backgroundColor`), 'rgb(0, 117, 149)', 'FOTO teal primary');
        assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('footer .gmi-primary-control').length`), 1, 'one primary action');
        for (const [width, height] of [[1280, 720], [1366, 768]]) await bounded(width, height, 'save-kontroll');
        // Three synchronous clicks: one save.
        await browser.evaluate(`(() => { const b=${footerButton('Lagre endringer')}; b.click(); b.click(); b.click(); })()`);
        await browser.waitFor(`${dialog}.querySelector('.photo-link-receipt')`);
        const receipt = await browser.evaluate(`${dialog}.querySelector('.photo-link-receipt').innerText`);
        assert.match(receipt, /1 bilde flyttet · 1 bildereferanse flyttet/);
        assert.match(receipt, /SYNT_TOPP_1\.png: LOK · Punkt 293 \(AnleggsID SYNT-L293\) → SLU · Punkt 108 \(AnleggsID SYNT-S8\)/);
        assert.match(receipt, /Foreslått i Rettinger\. Originalfilen er uendret\./);
        assert.match(receipt, /Angre siste retting/);
        assert.equal(await browser.evaluate('document.activeElement?.id'), 'photo-link-receipt-heading');
        for (const [width, height] of [[1280, 720], [1366, 768]]) await bounded(width, height, 'save-receipt');
      });

      await t.test('Kontroller i Validator opens the actual Foreslått dataset on the point S_HYPERLINK rule', async () => {
        await click(browser, 'Kontroller i Validator', dialog);
        await browser.waitFor(`!${dialog} && !document.querySelector('.photo-workspace-shell') && document.querySelector('[data-validator-dataset]')`);
        assert.equal(await browser.evaluate('document.querySelector("[data-validator-dataset]").dataset.validatorDataset'), 'proposed');
        assert.equal(await browser.evaluate('document.querySelector("#validation-v2-dataset").value'), 'proposed');
        await browser.waitFor('document.querySelector(\'button[aria-label^="S_HYPERLINK:"]\')');
        const proposedRule = await browser.evaluate('document.querySelector(\'button[aria-label^="S_HYPERLINK:"]\').getAttribute("aria-label")');
        await size(1366, 768); await shot('save-validator-proposed-1366x768');
        await size(1280, 720); await shot('save-validator-proposed-1280x720');
        await size(1366, 768);
        // The Original dataset still has the source/recipient findings the transfer addresses; Foreslått is evaluated, not marked.
        await browser.evaluate(`(() => { const s=document.querySelector('#validation-v2-dataset'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'original'); s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
        await browser.waitFor('document.querySelector("[data-validator-dataset]").dataset.validatorDataset === "original"');
        await browser.waitFor('document.querySelector(\'button[aria-label^="S_HYPERLINK:"]\')');
        assert.notEqual(await browser.evaluate('document.querySelector(\'button[aria-label^="S_HYPERLINK:"]\').getAttribute("aria-label")'), proposedRule,
          `Foreslått S_HYPERLINK differs from Original (${proposedRule})`);
        await click(browser, 'Lukk Validator');
      });

      await t.test('FOTO shows the moved photograph on the recipient as Foreslått and locks only it; reopening explains the saved transfer', async () => {
        await browser.evaluate('document.querySelector("[data-photo-layer-open]").click()');
        await browser.waitFor('document.querySelector(".photo-workspace-shell")');
        await browser.waitFor(`${listRow('SYNT_TOPP_1.png')}?.innerText.includes('Foreslått: SLU')`)
          .catch(async (error) => { throw new Error(`${error.message}
FOTO list: ${await fotoRows()}`); });
        assert.notEqual(await fotoRows(), rowsBefore);
        await browser.evaluate(`${listRow('SYNT_TOPP_1.png')}.querySelector('.photo-workspace-row').click()`);
        await browser.waitFor(`document.querySelector('.photo-workspace-inspector')?.innerText.includes('Flyttet bildelenke')`);
        const inspector = await browser.evaluate(`document.querySelector('.photo-workspace-inspector').innerText`);
        assert.match(inspector, /Foreslått/); assert.match(inspector, /Original/);
        await shot('save-foto-inspector-1366x768');
        // Unrelated photograph: its delivery choice stays available.
        await browser.evaluate(`${listRow('SYNT_KUM_1.png')}.querySelector('.photo-workspace-row').click()`);
        await browser.waitFor(`document.querySelector('.photo-workspace-inspector [data-destination=excluded]') && !document.querySelector('.photo-workspace-inspector [data-destination=excluded]').disabled
          && document.querySelector('.photo-workspace-inspector [data-destination=excluded]').getAttribute('aria-disabled') !== 'true'`);
        await openReview(); await openLok();
        assert.equal(await browser.evaluate(`${dialog}.querySelector('.photo-link-group[data-saved] .photo-link-group-select input').disabled`), true);
        assert.match(await browser.evaluate(`${dialog}.querySelector('.photo-link-saved-note').innerText`), /Lagret i Rettinger: flyttet til SLU · Punkt 108 i Foreslått/);
        await shot('save-reopened-1366x768');
        await click(browser, 'Avslutt gjennomgang', dialog); await browser.waitFor(`!${dialog}`);
        await click(browser, 'Lukk FOTO');
        await browser.waitFor('!document.querySelector(".photo-workspace-shell")');
      });

      await t.test('Rettinger shows «Flytting av bildelenke» once; undo and redo drive FOTO; the delivery wizard includes the moved link', async () => {
        await browser.evaluate('document.querySelector("[data-gmi-edit-action]").click()');
        await browser.waitFor(`${workspace}?.querySelector('[data-gmi-edit-status]')`);
        await browser.evaluate(`${workspace}.querySelectorAll('button[role="tab"]')[1].click()`);
        await browser.waitFor(`${workspace}.innerText.includes('Flytting av bildelenke')`);
        const history = await browser.evaluate(`${workspace}.innerText`);
        assert.equal(history.match(/Flytting av bildelenke/g).length, 1, 'one history entry after three clicks');
        assert.match(history, /SYNT_TOPP_1\.png/);
        await shot('save-rettinger-history-1366x768');
        await browser.evaluate(`${workspace}.querySelector('button[aria-label="Angre siste retting"]').click()`);
        await browser.waitFor(`!${workspace}.innerText.includes('SYNT_TOPP_1.png: Punkt 293')`);
        await browser.waitFor('document.querySelector("[data-gmi-context-redo]")');
        await browser.evaluate('document.querySelector("[data-gmi-context-redo]").click()');
        await browser.waitFor(`${workspace}.innerText.includes('Flytting av bildelenke')`);
        assert.equal((await browser.evaluate(`${workspace}.innerText`)).match(/Flytting av bildelenke/g).length, 1, 'redo restores without duplicating');
        await browser.evaluate(`${workspace}.querySelector('.gmi-edit-download').click()`);
        const wizard = 'document.querySelector(".delivery-wizard")';
        await browser.waitFor(`${wizard}?.innerText.includes('Flyttede bildelenker')`);
        assert.match(await browser.evaluate(`${wizard}.innerText`), /Flyttede bildelenker (tas med|inkluderes): 1 bilde · 1 bildereferanse/);
        await size(1280, 720); await shot('save-delivery-content-1280x720');
        await size(1366, 768); await shot('save-delivery-content-1366x768');
        await click(browser, 'Lukk eksport');
        assert.equal((await browser.evaluate(`${workspace}.innerText`)).match(/Flytting av bildelenke/g).length, 1, 'opening the export keeps the transfer');
        // Undo once more: FOTO returns to the original association.
        await browser.evaluate(`${workspace}.querySelector('button[aria-label="Angre siste retting"]').click()`);
        await browser.waitFor('document.querySelector("[data-gmi-context-redo]")');
        await click(browser, 'Lukk Rettinger');
        await browser.evaluate('document.querySelector("[data-photo-layer-open]").click()');
        await browser.waitFor('document.querySelector(".photo-workspace-shell")');
        await browser.waitFor(`${listRow('SYNT_TOPP_1.png')} && !${listRow('SYNT_TOPP_1.png')}.innerText.includes('Foreslått')`);
        assert.equal(await fotoRows(), rowsBefore, 'undo restores the FOTO list');
      });
      assert.equal(browser.events.filter((event) => event.method === 'Runtime.exceptionThrown').length, 0);
    } catch (error) {
      await shot('save-failure');
      console.error(await browser.evaluate('document.body.innerText.slice(-4000)'));
      throw error;
    } finally {
      await browser.close();
      assert.equal(path.dirname(path.resolve(directory)), temporaryRoot);
      await rm(directory, { recursive: true, force: true });
    }
  });
