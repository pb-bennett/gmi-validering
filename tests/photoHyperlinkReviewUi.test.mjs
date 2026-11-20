import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { gmiText } from './helpers/gmiPhotoFixtures.mjs';
import { gpsPng } from './helpers/photoGpsFixtures.mjs';
import { setPhotoFiles, clickSourceControl, stagePhotoSource, savePhotoSource, closePhotoSources } from './helpers/photoSourceWorkflow.mjs';
import { createLayerWithPlacement, waitForThumbnails } from './helpers/photoImportWizard.mjs';

const app = process.env.PHOTO_UI_URL;
const click = (browser, label, root = 'document') => clickSourceControl(browser, label, root);
const dialog = 'document.querySelector(".photo-link-review[open]")';
const link = (name = 'a.png', n = 1) => `h:${n}(link:"${name}" sign:"synthetic") `;
const pressEscape = async (browser) => {
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
};

test('Batch 1A production: complete Validator handoff, FOTO review, explicit choices, no writes, cancellation, workspace return and laptop layout',
  { skip: !app || !chromePath, timeout: 240000 }, async (t) => {
    const temporaryRoot = path.resolve(tmpdir()), directory = await mkdtemp(path.join(temporaryRoot, 'gmi-link-review-'));
    const source = path.join(directory, 'Synthetic covers.gmi'), image = path.join(directory, 'a.png');
    const objects = [
      ...Array.from({ length: 65 }, (_, index) => ({ tema: index % 2 ? 'TOP' : 'LOK', label: `Cover ${index}`, hyperlink: index === 0 ? link() + link('a.png', 2) : link('missing.png'), xyz: `${581930 + index} 6566000 ${7 + index}` })),
      { tema: 'KUM', label: 'Recipient A', hyperlink: link(), xyz: '581933 6566004 2' },
      { tema: 'KUM', label: 'Recipient B', hyperlink: link('old.png'), xyz: '581926 6566003 3' },
      { tema: 'LOK', label: 'Malformed', hyperlink: 'h:1(link:"broken.png"' },
      { tema: 'LOK', label: 'Unresolved Tema', hyperlink: link('unknown.png') },
      { scope: 'line', guid: '00000000-0000-4000-8000-000000999999', tema: 'VL', label: 'Line owner', hyperlink: link() },
      ...Array.from({ length: 23 }, (_, index) => ({ tema: 'KUM', label: `Far Recipient ${index + 1}`, xyz: `${582930 + index * 100} 6566000 2` })),
    ];
    const text = gmiText(objects).replaceAll('S_FCODE;Type', 'Tema;S_FCODE;Type')
      .replace(/_FIELDVALUES ([^;]*);/g, (_match, tema) => `_FIELDVALUES ${tema};${tema};`)
      .replace('_FIELDVALUES LOK;LOK;;Unresolved Tema;', '_FIELDVALUES LOK;TOP;;Unresolved Tema;');
    await writeFile(source, Buffer.from(text, 'latin1'));
    await writeFile(image, gpsPng());
    const browser = await openTestChrome();
    const shot = async (name) => {
      if (!process.env.PHOTO_LINK_SCREENSHOT_DIR) return;
      await mkdir(process.env.PHOTO_LINK_SCREENSHOT_DIR, { recursive: true });
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.PHOTO_LINK_SCREENSHOT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
    };
    const openTools = async () => {
      await browser.evaluate('document.querySelector(".photo-tools-trigger").click()');
      await browser.waitFor('document.querySelector(".photo-tools-popup")');
      await browser.evaluate(`Array.from(document.querySelectorAll('.photo-tools-popup button')).find(e=>e.textContent.includes('Gjennomgå bildelenker')).click()`);
      await browser.waitFor(`${dialog}?.querySelector('.photo-link-list button')`);
    };
    const chooseTarget = async (index = 1) => {
      await browser.evaluate(`(() => { const input=${dialog}.querySelectorAll('.photo-link-target input')[${index}]; input.focus(); input.click(); })()`);
      await browser.waitFor(`${dialog}.querySelectorAll('.photo-link-target input')[${index}]?.checked`);
    };
    const screenshotLayout = async (width, height, label) => {
      await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      assert(await browser.evaluate(`(() => {const d=${dialog},r=d.getBoundingClientRect(),footer=d.querySelector('footer').getBoundingClientRect(), detail=d.querySelector('.photo-link-detail');return r.top>=0&&r.bottom<=innerHeight&&footer.bottom<=innerHeight&&d.scrollWidth<=d.clientWidth+1&&detail.scrollWidth<=detail.clientWidth+1&&detail.clientHeight>200;})()`), `${width}×${height}: bounded layout and reachable footer`);
      assert(await browser.evaluate(`(() => {const b=${dialog}.querySelector('footer button'),r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()`));
      assert.equal(await browser.evaluate(`getComputedStyle(${dialog}.querySelector('input[type=radio]')).accentColor`), 'rgb(0, 117, 149)');
      await shot(`${label}-${width}x${height}`);
    };
    try {
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm=()=>true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")'); await click(browser, 'Lukk');
      await setPhotoFiles(browser, 'input[type=file]', [source]);
      await browser.waitFor('document.querySelector(\'[title="Synthetic covers.gmi"]\')');
      await browser.evaluate('document.querySelector(\'[title="Synthetic covers.gmi"]\').click()');
      await browser.waitFor('document.querySelector("button[aria-label=Feltvalidering]")');
      await browser.evaluate('document.querySelector("button[aria-label=Feltvalidering]").click()');
      const rule = `document.querySelector('button[aria-label^="S_HYPERLINK:"]')`;
      await browser.waitFor(rule);
      await browser.evaluate(`${rule}.click()`);
      await browser.waitFor('Array.from(document.querySelectorAll("button")).some(e=>e.textContent==="Gjennomgå i FOTO")');
      await t.test('contextual Validator opens all affected exact findings, including malformed and absent files', async () => {
        await browser.evaluate(`Array.from(document.querySelectorAll('button')).find(e=>e.textContent==='Gjennomgå i FOTO').focus()`);
        await click(browser, 'Gjennomgå i FOTO');
        await browser.waitFor(`${dialog}?.querySelector('.photo-link-list button')`);
        assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('.photo-link-list button').length`), 66);
        assert(await browser.evaluate(`${dialog}.innerText.includes('Kun Validator-utvalget (66)')`));
        assert(await browser.evaluate(`${dialog}.innerText.includes('Bildefilen mangler')`));
        assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('.photo-link-target input:checked').length`), 1);
        await shot('validator-initial-1366x768');
        await chooseTarget(2);
        await browser.waitFor(`${dialog}.querySelectorAll('.photo-link-target input')[2].checked`);
        assert(await browser.evaluate(`${dialog}.innerText.includes('Recipient B') && /ΔZ: [−-]4/.test(${dialog}.innerText)`));
        await screenshotLayout(1280, 720, 'validator-missing-assets');
        await browser.evaluate(`${dialog}.querySelector('.photo-link-filter input[type=checkbox]').click()`);
        assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('.photo-link-list button').length`), 67);
        await pressEscape(browser); await browser.waitFor(`!${dialog}`);
        assert.equal(await browser.evaluate('document.activeElement?.textContent'), 'Gjennomgå i FOTO');
        assert.equal(await browser.evaluate('Boolean(document.querySelector("[data-gmi-edit-counts]"))'), false);
      });
      await browser.evaluate(`Array.from(document.querySelector('[role=tablist][aria-label=Geometri]').querySelectorAll('button')).find(e=>e.innerText.startsWith('Ledninger')).click()`);
      await browser.waitFor(`${rule}?.getAttribute('aria-expanded')==='false'`);
      await browser.evaluate(`${rule}.click()`);
      assert.equal(await browser.evaluate(`Array.from(document.querySelectorAll('button')).some(e=>e.textContent==='Gjennomgå i FOTO')`), false, 'line diagnostics do not offer the point-only review');
      await click(browser, 'Lukk Validator');
      await click(browser, 'Bilder');
      await setPhotoFiles(browser, 'input[aria-label="Velg bildefiler"]', [image]);
      await waitForThumbnails(browser); await createLayerWithPlacement(browser, 'exif');
      await stagePhotoSource(browser, source, 'gmi'); await savePhotoSource(browser, 'gmi'); await closePhotoSources(browser);
      await browser.waitFor('document.querySelector(".photo-workspace-inspector .photo-delivery-option[data-destination=excluded]")');
      await browser.evaluate('document.querySelector(".photo-workspace-inspector .photo-delivery-option[data-destination=excluded]").click()');
      await browser.waitFor('document.querySelector(".photo-workspace-inspector [data-delivery-status=exclude]")');
      const unchanged = () => browser.evaluate(`JSON.stringify({rows:Array.from(document.querySelectorAll('.photo-workspace-list li')).map(e=>({id:e.dataset.photoId,text:e.innerText})),markers:Array.from(document.querySelectorAll('.photo-camera-marker')).map(e=>({id:e.dataset.photoId,label:e.getAttribute('aria-label')})),inspector:document.querySelector('.photo-workspace-inspector')?.innerText,counts:document.querySelector('.photo-workspace-collection header')?.innerText,corrections:document.querySelector('[data-gmi-edit-counts]')?.innerText})`);
      const before = await unchanged();
      await t.test('FOTO choices remain temporary, duplicate/reference and target evidence are inspectable; both laptop sizes', async () => {
        await openTools();
        assert(await browser.evaluate(`${dialog}.innerText.includes('2 referanse(r)') && ${dialog}.innerText.includes('Finnes allerede på KUM')`));
        assert(await browser.evaluate(`${dialog}.innerText.includes('KUM i samme kilde (25)')`));
        await click(browser, 'Neste KUM', dialog);
        await browser.waitFor(`${dialog}.innerText.includes('Far Recipient 23')`);
        await click(browser, 'Forrige KUM', dialog);
        await browser.waitFor(`${dialog}.querySelectorAll('.photo-link-target')[1]?.textContent.includes('Recipient A')`);
        await chooseTarget();
        await browser.evaluate(`${dialog}.querySelector('.photo-link-group input[type=checkbox]').click()`);
        assert(await browser.evaluate(`${dialog}.innerText.includes('2 valgte referanser')`));
        assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('button').length>0 && Array.from(${dialog}.querySelectorAll('button')).some(e=>/Lagre|Utfør|Legg til retting/.test(e.textContent))`), false);
        assert(await browser.evaluate(`${dialog}.querySelector('.photo-collection-original img')?.src.startsWith('blob:')`));
        for (const [width, height] of [[1280, 720], [1366, 768]]) await screenshotLayout(width, height, 'foto-selected');
        await browser.evaluate(`${dialog}.querySelector('[aria-label="Foreslått mottaker"]').scrollIntoView({block:'start'})`);
        await browser.waitFor(`${dialog}.querySelector('.photo-link-map .leaflet-container')`);
        assert(await browser.evaluate(`${dialog}.innerText.includes('annen akseptert plassering') && ${dialog}.innerText.includes('Leveringsvalg for bildet må avklares')`));
        assert(await browser.evaluate(`(() => { const warning=${dialog}.querySelector('.gmi-validation-accent[data-validation-tone=warning]'), probe=document.createElement('span'); probe.style.color='var(--gmi-validation-compact-warning-text)'; ${dialog}.append(probe); const same=getComputedStyle(warning).color===getComputedStyle(probe).color; probe.remove(); return same; })()`), 'compact warnings use the approved yellow token');
        for (const [width, height] of [[1280, 720], [1366, 768]]) await screenshotLayout(width, height, 'foto-position-evidence');
        await browser.evaluate(`(() => {const detail=${dialog}.querySelector('.photo-link-detail'); detail.scrollTop=detail.scrollHeight;})()`);
        await browser.waitFor(`${dialog}.querySelectorAll('.photo-link-map svg path').length >= 5`);
        for (const [width, height] of [[1280, 720], [1366, 768]]) await screenshotLayout(width, height, 'foto-map-evidence');
        await browser.evaluate(`Array.from(${dialog}.querySelectorAll('.photo-link-list button')).find(e=>e.innerText.includes('Malformed')).click()`);
        assert(await browser.evaluate(`${dialog}.innerText.includes('Feilformet lenke')`));
        await click(browser, 'Avslutt gjennomgang', dialog); await browser.waitFor(`!${dialog}`);
        assert.equal(await unchanged(), before, 'close preserves workspace, delivery pills, inspector, marker positions and history');
        await openTools();
        assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('.photo-link-target input:checked')[0].parentElement.textContent.trim()`), 'Ingen foreslått mottaker');
        assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('.photo-link-group input:checked').length`), 0);
        await browser.evaluate(`${dialog}.querySelector('footer button').focus()`);
        await pressEscape(browser); await browser.waitFor(`!${dialog}`);
        assert.equal(await unchanged(), before, 'Escape/reopening never accepts the proposal');
        await click(browser, 'Lukk FOTO');
        await click(browser, 'Åpne FOTO');
        await browser.waitFor('document.querySelector(".photo-workspace-shell")');
        await openTools();
        assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('.photo-link-group input:checked').length`), 0);
        await chooseTarget();
        // An external workspace transition also ends the review; no proposal survives the visit.
        await click(browser, 'Lukk FOTO');
        await browser.waitFor(`!${dialog} && !document.querySelector('.photo-workspace-shell')`);
        await click(browser, 'Åpne FOTO');
        await browser.waitFor('document.querySelector(".photo-workspace-shell")');
        assert.equal(await unchanged(), before, 'workspace exit/return preserves accepted state and discards choices');
      });
      assert.equal(browser.events.filter((event) => event.method === 'Runtime.exceptionThrown').length, 0);
    } catch (error) {
      await shot('failure');
      console.error(await browser.evaluate('document.body.innerText.slice(-5000)'));
      throw error;
    } finally {
      await browser.close();
      assert.equal(path.dirname(path.resolve(directory)), temporaryRoot);
      await rm(directory, { recursive: true, force: true });
    }
  });
