import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { createWorkspaceFixtures, openWorkspace } from './helpers/photoWorkspaceFixtures.mjs';
import { clickSourceControl as click } from './helpers/photoSourceWorkflow.mjs';
import { gmiText } from './helpers/gmiPhotoFixtures.mjs';

const app = process.env.PHOTO_UI_URL;
const collection = 'document.querySelector(".photo-workspace-collection")';
const dialog = 'document.querySelector(".photo-exclusion-confirmation[open]")';
const row = (id) => `document.querySelector('.photo-workspace-list li[data-photo-id="${id}"]')`;
const pill = (id) => `${row(id)}.querySelector('.photo-delivery-pill')`;

test('Direct delivery cycle: equal badges, canonical inspector sync, shared placements, keyboard and separate layer removal',
  { skip: !chromePath || !app, timeout: 240000 }, async () => {
    const fixtures = await createWorkspaceFixtures(), browser = await openTestChrome();
    const originals = await Promise.all([fixtures.gmi, ...fixtures.photos.map((photo) => photo.file)].map((file) => readFile(file)));
    const key = async (name, code, number) => {
      await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code, windowsVirtualKeyCode: number, ...(name === 'Enter' ? { text: '\r' } : {}) });
      await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code, windowsVirtualKeyCode: number });
    };
    const select = async (id) => {
      await browser.evaluate(`${row(id)}.querySelector('.photo-workspace-row').click()`);
      await browser.waitFor(`${row(id)}.querySelector('.photo-workspace-row').getAttribute('aria-pressed') === 'true'`);
    };
    const screenshot = async (name) => {
      if (!process.env.PHOTO_SCREENSHOT_DIR) return;
      await mkdir(process.env.PHOTO_SCREENSHOT_DIR, { recursive: true });
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.PHOTO_SCREENSHOT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
    };
    try {
      await openWorkspace(browser, app, fixtures, { width: 1280, height: 720 });
      const ids = await browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-list li[data-photo-id]')).map(e => ({id:e.dataset.photoId,name:e.querySelector('.photo-workspace-filename').innerText}))`);
      const [a, b] = ids.filter((item) => item.name === 'shared.png').map((item) => item.id);
      const single = ids.find((item) => item.name === 'IMG_2.png').id;
      await select(a);
      await browser.evaluate('document.querySelector(".photo-exclusion-inspector button").focus()');
      await click(browser, 'Ta ut alle plasseringer av bildet', 'document.querySelector(".photo-exclusion-inspector")');
      await browser.waitFor(dialog);
      assert.match(await browser.evaluate(`${dialog}.innerText`), /K0/);
      assert.match(await browser.evaluate(`${dialog}.innerText`), /K1/);
      assert.match(await browser.evaluate(`${dialog}.innerText`), /1 endring gjelder plasseringer som ikke er valgt/);
      assert.equal(await browser.evaluate('document.activeElement.innerText'), 'Avbryt');
      for (let index = 0; index < 8; index++) {
        await key('Tab', 'Tab', 9);
        assert(await browser.evaluate(`${dialog}.contains(document.activeElement)`));
      }
      // Escape on a named text control tests dialog cancellation; icon tooltips consume
      // their own first Escape under the established FOTO tooltip contract.
      await browser.evaluate(`${dialog}.querySelector('[data-exclusion-cancel]').focus()`);
      await key('Escape', 'Escape', 27); await browser.waitFor(`!${dialog}`);
      assert.equal(await browser.evaluate(`${pill(a)}.innerText`), 'GMI');
      assert.equal(await browser.evaluate('document.activeElement.innerText'), 'Ta ut alle plasseringer av bildet');
      await click(browser, 'Ta ut alle plasseringer av bildet', 'document.querySelector(".photo-exclusion-inspector")');
      await click(browser, 'Ta ut av leveransen', dialog);
      await browser.waitFor(`${pill(a)}.innerText === 'Ikke' && ${pill(b)}.innerText === 'Ikke'`);
      assert.match(await browser.evaluate('document.querySelector(".photo-exclusion-inspector [role=status]").innerText'), /2 plasseringer tatt ut/);

      await browser.evaluate('document.querySelector("button[aria-label=Verktøy]").click()');
      assert.equal(await browser.evaluate('Array.from(document.querySelectorAll("[role=menuitem]")).some(e=>e.innerText.includes("Velg bilder som ikke skal med"))'), false);
      assert.equal(await browser.evaluate('Array.from(document.querySelectorAll("[role=menuitem]")).some(e=>e.innerText.includes("Fordel bilder til GMI/GML"))'), false);
      assert.equal(await browser.evaluate('document.querySelectorAll(".photo-delivery-bar, [role=menuitem][data-tool=delivery]").length'), 0);
      await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      assert.equal(await browser.evaluate('document.querySelectorAll(".photo-workspace-list input, .photo-exclusion-bar, .photo-exclusion-actions").length'), 0);
      const button = (id) => `${row(id)}.querySelector('.photo-delivery-row-button')`;
      const inspectorChoice = (key) => `document.querySelector('.photo-delivery-section [role=radio][data-destination=${key}]')`;
      await select(a);
      await browser.evaluate(`${button(a)}.click()`); // restore excluded placement only
      await browser.waitFor(`${pill(a)}.innerText === 'GMI'`);
      assert.equal(await browser.evaluate(`${pill(b)}.innerText`), 'Ikke', 'sibling remains excluded');
      assert.equal(await browser.evaluate(`document.querySelector('.photo-delivery-counts [data-destination=notSelected]').innerText.replace(/\\s+/g, ' ')`), 'Ikke valgt 3');
      assert.equal(await browser.evaluate(`getComputedStyle(${pill(single)}).borderStyle`), 'dashed');
      assert.equal(await browser.evaluate(`${pill(single)}.dataset.deliveryStatus`), 'not-selected');
      for (const [width, height] of [[1280, 720], [1366, 768]]) {
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        const styles = [];
        for (const [label, destination, colour] of [['GMI','gmi','rgb(96, 165, 250)'], ['GML','gml','rgb(74, 222, 128)'], ['Ikke','excluded','rgb(203, 213, 225)']]) {
          await browser.waitFor(`${pill(a)}.innerText === ${JSON.stringify(label)}`);
          assert.equal(await browser.evaluate(`${inspectorChoice(destination)}.getAttribute('aria-checked')`), 'true');
          const css = await browser.evaluate(`(() => {const e=${button(a)},s=getComputedStyle(e),r=e.getBoundingClientRect();return {width:r.width,height:r.height,radius:s.borderRadius,font:s.fontSize,weight:s.fontWeight,padding:s.padding,align:s.textAlign,display:s.display,background:s.backgroundColor,color:s.color};})()`);
          assert.equal(css.background, colour); assert.equal(css.color, 'rgb(15, 23, 42)');
          const {background, color, ...geometry} = css; styles.push(geometry);
          assert.match(await browser.evaluate(`${button(a)}.getAttribute('aria-label')`), /Bare denne plasseringen endres/);
          await browser.evaluate(`${row(a)}.querySelector('.photo-workspace-row').focus()`);
          await key('Tab', 'Tab', 9);
          assert(await browser.evaluate(`${button(a)}.matches(':focus-visible')`));
          assert.match(await browser.evaluate(`getComputedStyle(${button(a)}).boxShadow`), /rgb\(0, 117, 149\)/);
          await screenshot(`direct-cycle-${destination}-${width}x${height}`);
          await key(' ', 'Space', 32);
        }
        assert.deepEqual(styles[0], styles[1]); assert.deepEqual(styles[1], styles[2]);
        await browser.waitFor(`${pill(a)}.innerText === 'GMI'`);
        // A row selects/locates, never cycles, even in delivery mode.
        await select(b); assert.equal(await browser.evaluate(`${pill(b)}.innerText`), 'Ikke');
        await select(a); assert.equal(await browser.evaluate(`${pill(a)}.innerText`), 'GMI');
        assert(await browser.evaluate(`${collection}.scrollWidth <= ${collection}.clientWidth + 1`));
      }
      await browser.evaluate(`${button(a)}.focus()`); await key('Enter', 'Enter', 13);
      await browser.waitFor(`${pill(a)}.innerText === 'GML'`);
      await key('Escape', 'Escape', 27);
      assert.equal(await browser.evaluate(`${collection}.dataset.mode`), 'browse');
      assert.equal(await browser.evaluate(`${pill(a)}.innerText`), 'GML');
      assert.equal(await browser.evaluate(`${row(a)}.querySelector('.photo-workspace-row').getAttribute('aria-pressed')`), 'true');
      await browser.evaluate(`${inspectorChoice('excluded')}.click()`);
      await browser.waitFor(`${pill(a)}.innerText === 'Ikke'`);
      assert.equal(await browser.evaluate(`${button(a)}.dataset.deliveryStatus`), 'exclude');
      await browser.evaluate(`${button(a)}.click()`); await browser.waitFor(`${pill(a)}.innerText === 'GMI'`);
      await click(browser, 'Fjern bilder fra laget…', 'document');
      await browser.waitFor(`${collection}.dataset.mode === 'remove'`);
      await browser.evaluate(`${row(single)}.querySelector('input').focus()`); await key(' ', 'Space', 32);
      assert.equal(await browser.evaluate(`${row(single)}.querySelector('input').checked`), true);
      await browser.evaluate(`Array.from(document.querySelectorAll('.photo-removal-actions button')).find(b=>b.innerText.startsWith('Fjern 1')).click()`);
      await browser.waitFor('document.querySelector(".photo-remove-confirmation[open]")');
      await click(browser, 'Avbryt', 'document.querySelector(".photo-remove-confirmation[open]")');
      await browser.waitFor('!document.querySelector(".photo-remove-confirmation[open]")');
      assert.equal(await browser.evaluate('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length'), 5);
      const after = await Promise.all([fixtures.gmi, ...fixtures.photos.map((photo) => photo.file)].map((file) => readFile(file)));
      assert.deepEqual(after, originals);
    } finally { await browser.close(); await fixtures.cleanup(); }
  });

test('Retained line links still explain atomic inspector refusal',
  { skip: !chromePath || !app, timeout: 120000 }, async () => {
    const fixtures = await createWorkspaceFixtures('photo-exclusion-blocked-'), browser = await openTestChrome();
    await writeFile(fixtures.gmi, gmiText([
      { label: 'K0', hyperlink: 'h:1(link:"shared.png") ' },
      { label: 'K1', hyperlink: 'h:1(link:"shared.png") ' },
      { scope: 'line', guid: '00000000-0000-4000-8000-000000000009', label: 'Ledning', hyperlink: 'h:1(link:"shared.png") ' },
    ]));
    try {
      await openWorkspace(browser, app, fixtures, { width: 1366, height: 768 });
      const ids = await browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-list li[data-photo-id]')).map(e=>({id:e.dataset.photoId,name:e.querySelector('.photo-workspace-filename').innerText}))`);
      const shared = ids.find((item) => item.name === 'shared.png').id, single = ids.find((item) => item.name === 'IMG_2.png').id;
      await browser.evaluate(`${row(shared)}.querySelector('.photo-workspace-row').click()`);
      await click(browser, 'Ta ut alle plasseringer av bildet', 'document.querySelector(".photo-exclusion-inspector")');
      await browser.waitFor(dialog);
      assert.match(await browser.evaluate(`${dialog}.innerText`), /Ingen leveringsvalg er endret/);
      assert.match(await browser.evaluate(`${dialog}.innerText`), /Ledning/);
      assert.match(await browser.evaluate(`${dialog}.innerText`), /uten FOTO-plassering/);
      assert.equal(await browser.evaluate(`${dialog}.querySelectorAll('.gmi-primary-control').length`), 0);
      await click(browser, 'Avbryt', dialog);
      await browser.evaluate(`${row(single)}.querySelector('.photo-workspace-row').click()`);
      await browser.evaluate('document.querySelector(".photo-delivery-section [data-destination=gml]").click()');
      await browser.waitFor(`${pill(single)}.innerText === 'GML'`);
      const before = await browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-list .photo-delivery-pill')).map(e=>e.innerText)`);
      assert.equal(await browser.evaluate(`${pill(single)}.innerText`), 'GML');
      assert.deepEqual(await browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-list .photo-delivery-pill')).map(e=>e.innerText)`), before);
    } finally { await browser.close(); await fixtures.cleanup(); }
  });
