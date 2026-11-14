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
const actions = 'document.querySelector(".photo-exclusion-actions")';
const row = (id) => `document.querySelector('.photo-workspace-list li[data-photo-id="${id}"]')`;
const box = (id) => `${row(id)}.querySelector('input[type=checkbox]')`;
const pill = (id) => `${row(id)}.querySelector('.photo-delivery-pill')`;

test('Slice 2 production: whole-photo confirmation, scoped selections, restore, keyboard, filters and unchanged planning/removal',
  { skip: !chromePath || !app, timeout: 240000 }, async () => {
    const fixtures = await createWorkspaceFixtures(), browser = await openTestChrome();
    const originals = await Promise.all([fixtures.gmi, ...fixtures.photos.map((photo) => photo.file)].map((file) => readFile(file)));
    const key = async (name, code, number) => {
      await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code, windowsVirtualKeyCode: number });
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
      await browser.waitFor(`${pill(a)}.innerText === 'Ikke med' && ${pill(b)}.innerText === 'Ikke med'`);
      assert.match(await browser.evaluate('document.querySelector(".photo-exclusion-inspector [role=status]").innerText'), /2 plasseringer tatt ut/);

      await click(browser, 'Velg bilder som ikke skal med…', 'document');
      await browser.waitFor(`${collection}.dataset.mode === 'exclude'`);
      await browser.evaluate(`${box(a)}.click()`);
      await browser.evaluate(`Array.from(${actions}.querySelectorAll('button')).find(b=>b.innerText==='Ta med igjen').focus()`);
      await click(browser, 'Ta med igjen', actions); await browser.waitFor(dialog);
      await click(browser, 'Ta med igjen', dialog);
      await browser.waitFor(`${pill(a)}.innerText === 'GMI' && ${pill(b)}.innerText === 'GMI'`);
      assert.equal(await browser.evaluate('document.querySelectorAll(".photo-workspace-list input:checked").length'), 0);
      await browser.waitFor('document.activeElement.matches(".photo-workspace-list input[type=checkbox]")');
      // Native checkbox keyboard activation and teal accent; Escape clears this mode's selection.
      await browser.evaluate(`${box(a)}.focus()`); await key(' ', 'Space', 32);
      await browser.waitFor(`${box(a)}.checked`);
      assert.equal(await browser.evaluate(`getComputedStyle(${box(a)}).accentColor`), 'rgb(0, 117, 149)');
      await key('Tab', 'Tab', 9);
      assert(await browser.evaluate(`${collection}.contains(document.activeElement)`));
      await key('Escape', 'Escape', 27); await browser.waitFor(`${collection}.dataset.mode === 'browse'`);
      await click(browser, 'Velg bilder som ikke skal med…', 'document');
      assert.equal(await browser.evaluate('document.querySelectorAll(".photo-workspace-list input:checked").length'), 0);

      // The repeated filter shows exactly the two shared placements. Select-all ignores filtered-out records.
      await select(single);
      await browser.evaluate(`document.querySelector('button[aria-label^="Filtrer bilder"]').click()`);
      await browser.waitFor('document.querySelector(".photo-filter-panel")');
      assert.equal(await browser.evaluate('getComputedStyle(document.querySelector(".photo-filter-panel input")).accentColor'), 'rgb(0, 117, 149)');
      await browser.evaluate(`Array.from(document.querySelectorAll('.photo-filter-panel label')).find(e=>e.innerText.startsWith('Flere plasseringer')).querySelector('input').click()`);
      await browser.waitFor('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length === 3');
      await click(browser, 'Velg alle viste', 'document.querySelector(".photo-exclusion-bar")');
      assert.equal(await browser.evaluate('document.querySelectorAll(".photo-workspace-list input:checked").length'), 2);
      assert.equal(await browser.evaluate(`${box(single)}.checked`), false, 'pinned active photo is outside the filter');
      await browser.evaluate(`${box(b)}.click()`);
      await click(browser, 'Bare valgte plasseringer (1)', actions);
      await browser.waitFor(`${pill(a)}.innerText === 'Ikke med' && ${pill(b)}.innerText === 'GMI'`);
      assert.equal(await browser.evaluate(`Boolean(${dialog})`), false);
      await browser.evaluate(`${box(a)}.click()`);
      assert.match(await browser.evaluate(`${actions}.innerText`), /1 bilde delvis med/);
      // Whole-photo exclusion also changes the unselected sibling and therefore requires confirmation.
      await click(browser, 'Ta ut 1 bilde av leveransen', actions); await browser.waitFor(dialog);
      for (const [width, height] of [[1280, 720], [1366, 768]]) {
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        const geometry = await browser.evaluate(`(() => {const d=${dialog}, r=d.getBoundingClientRect();return {fits:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight, overflow:d.scrollWidth>d.clientWidth};})()`);
        assert(geometry.fits && !geometry.overflow);
        assert(await browser.evaluate(`document.querySelector('.photo-workspace-list').getBoundingClientRect().height >= 80`));
        await screenshot(`slice2-confirmation-${width}x${height}`);
      }
      await click(browser, 'Ta ut av leveransen', dialog);
      await browser.waitFor(`${pill(a)}.innerText === 'Ikke med' && ${pill(b)}.innerText === 'Ikke med'`);
      // Exclude -> filter Ikke med -> select all -> restore (linked GMI, unlinked GML).
      await browser.evaluate(`Array.from(document.querySelectorAll('.photo-filter-panel label')).find(e=>e.innerText.startsWith('Flere plasseringer')).querySelector('input').click()`);
      await browser.evaluate('document.querySelector(".photo-filter-panel input[value=not-delivered]").click()');
      await browser.waitFor('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length === 5');
      await click(browser, 'Velg alle viste', 'document.querySelector(".photo-exclusion-bar")');
      await click(browser, 'Ta med igjen', actions);
      await browser.waitFor(`${actions}.querySelector('[role=status]').innerText.includes('5 plasseringer tatt med igjen')`);
      assert.match(await browser.evaluate(`${actions}.querySelector('[role=status]').innerText`), /5 plasseringer tatt med igjen/);
      await browser.evaluate('document.querySelector(".photo-filter-panel input[value=all][name$=delivery]").click()');
      await browser.waitFor(`${pill(a)}.innerText === 'GMI' && ${pill(b)}.innerText === 'GMI'`);
      await browser.evaluate(`document.querySelector('button[aria-label^="Filtrer bilder"]').click()`);
      await select(single);
      await browser.evaluate(`${box(single)}.click()`);
      await click(browser, 'Ta ut 1 bilde av leveransen', actions);
      assert.equal(await browser.evaluate(`Boolean(${dialog})`), false, 'safe single visible placement needs no confirmation');
      await browser.waitFor(`${pill(single)}.innerText === 'Ikke med'`);
      for (const [width, height] of [[1280, 720], [1366, 768]]) {
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        assert(await browser.evaluate(`${collection}.scrollWidth <= ${collection}.clientWidth + 1`));
        assert(await browser.evaluate(`document.querySelector('.photo-workspace-list').getBoundingClientRect().height > 80`));
        await screenshot(`slice2-selection-${width}x${height}`);
      }
      await click(browser, 'Avbryt', 'document.querySelector(".photo-exclusion-bar")');
      await click(browser, 'Fordel bilder til GMI/GML', 'document');
      assert.equal(await browser.evaluate('document.querySelectorAll(".photo-workspace-list input").length'), 0);
      await browser.evaluate(`${row(a)}.querySelector('.photo-delivery-row-button').click()`);
      await browser.waitFor(`${pill(a)}.innerText === 'GML'`);
      await browser.evaluate(`${row(a)}.querySelector('.photo-delivery-row-button').click()`);
      await browser.waitFor(`${pill(a)}.innerText === 'GMI'`);
      await click(browser, 'Ferdig', 'document.querySelector(".photo-delivery-bar")');
      await click(browser, 'Fjern bilder fra laget…', 'document');
      await browser.evaluate(`${row(single)}.querySelector('input').click()`);
      await browser.evaluate(`Array.from(document.querySelectorAll('.photo-removal-actions button')).find(b=>b.innerText.startsWith('Fjern 1')).click()`);
      await browser.waitFor('document.querySelector(".photo-remove-confirmation[open]")');
      await click(browser, 'Avbryt', 'document.querySelector(".photo-remove-confirmation[open]")');
      await browser.waitFor('!document.querySelector(".photo-remove-confirmation[open]")');
      assert.equal(await browser.evaluate('document.querySelectorAll(".photo-workspace-list li[data-photo-id]").length'), 5);
      const after = await Promise.all([fixtures.gmi, ...fixtures.photos.map((photo) => photo.file)].map((file) => readFile(file)));
      assert.deepEqual(after, originals);
    } finally { await browser.close(); await fixtures.cleanup(); }
  });

test('Slice 2 production: retained line links explain atomic refusal in inspector and bulk commands',
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
      await click(browser, 'Velg bilder som ikke skal med…', 'document');
      await browser.evaluate(`${box(shared)}.click(); ${box(single)}.click()`);
      await click(browser, 'Ta ut 2 bilder av leveransen', actions);
      await browser.waitFor(dialog);
      assert.match(await browser.evaluate(`${dialog}.innerText`), /Lenken og filen beholdes/);
      await click(browser, 'Avbryt', dialog);
      assert.deepEqual(await browser.evaluate(`Array.from(document.querySelectorAll('.photo-workspace-list .photo-delivery-pill')).map(e=>e.innerText)`), before);
      assert.equal(await browser.evaluate(`${actions}.querySelector('[role=status]').innerText`), '');
    } finally { await browser.close(); await fixtures.cleanup(); }
  });
