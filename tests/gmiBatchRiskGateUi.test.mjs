import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { gmiFieldBatchFixture } from './helpers/gmiFieldBatchFixture.mjs';

const app = process.env.PHOTO_UI_URL;
const shots = process.env.GMI_EDIT_SCREENSHOT_DIR || tmpdir();
const inspector = `document.querySelector('[data-gmi-batch-inspector]')`;
const split = `${inspector}?.querySelector('[data-gmi-current-split]')`;
const workspace = `document.querySelector('.gmi-edit-workspace')`;
const grid = `document.querySelector('[role=grid]')`;
const bar = `document.querySelector('[data-gmi-selection-bar]')`;
const confirm = `document.querySelector('dialog[open][data-gmi-confirm=workspace]')`;
const risk = `document.querySelector('dialog[open][data-gmi-confirm=batch-risk]')`;
const box = (index) => `${grid}.querySelector('[data-table-row="${index}"] input[type=checkbox]')`;

// Synthetic lines: Tema, Material, SDR, Trykklasse, Ringstivhet, Dimensjon, Stedfestingsårsak.
const LINE_FIELDS = ['Tema', 'Material', 'SDR', 'Trykklasse', 'Ringstivhet', 'Dimensjon', 'Stedfestingsårsak'];
const line = (tema, material, dimension, cause) => [tema, material, '', '', '', dimension, cause];
const LINES = [
  line('VL', 'PE', '110', 'NYTT'), line('VL', 'PE', '110', 'NYTT'), line('VL', 'PVC', '160', 'NYTT'), line('VL', 'PE', '110', 'UENDR'),
  line('SP', 'PE', '160', 'NYTT'), line('VL', 'PE', '110', 'NYTT'), line('VL', 'PE', '110', 'NYTT'), line('VL', '', '110', 'NYTT'), line('VL', '', '110', 'NYTT'),
];

test('B2 production: current-finding split, mixed/new-FEIL confirmation, stale approval and direct uniform staging',
  { skip: !app || !chromePath, timeout: 240000 }, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gmi-b2-ui-'));
    const file = path.join(directory, 'Synthetic B2.gmi');
    const bytes = gmiFieldBatchFixture({ lineFields: LINE_FIELDS, lines: LINES });
    await writeFile(file, bytes);
    const browser = await openTestChrome();
    const click = (label, root = 'document') => browser.evaluate(`(() => {
      const b=Array.from((${root}).querySelectorAll('button')).find(e=>e.innerText.trim()===${JSON.stringify(label)} || e.getAttribute('aria-label')===${JSON.stringify(label)});
      if(!b || b.disabled) throw new Error('Unavailable: '+${JSON.stringify(label)}); b.click(); })()`);
    const choose = (label, value) => browser.evaluate(`(() => { const s=${inspector}.querySelector('[aria-label=${JSON.stringify(label)}]'), select=s.tagName==='SELECT';
      Object.getOwnPropertyDescriptor(select?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(s,${JSON.stringify(value)}); s.dispatchEvent(new Event(select?'change':'input',{bubbles:true})); })()`);
    const custom = async () => {
      const value = `${inspector}.querySelector('[aria-label="Ny verdi"]')`;
      if (await browser.evaluate(`${value}.tagName !== 'SELECT'`)) return; // long lists are a searchable text control
      const sentinel = await browser.evaluate(`Array.from(${value}.options).find(o => o.textContent === 'Annen verdi…').value`);
      await choose('Ny verdi', sentinel); await browser.waitFor(`${value}.tagName === 'INPUT'`);
    };
    const ready = () => browser.waitFor(`${inspector}.querySelector('[data-gmi-batch-dry-run]')?.innerText.includes('OK') && ${inspector}.getAttribute('aria-busy')==='false'`);
    const preview = async () => { await click('Forhåndsvis endringer', inspector); await browser.waitFor(`${inspector}.querySelector('[data-gmi-batch-counts]')`); await ready(); };
    const counts = () => browser.evaluate(`(() => { const s=${split}; return s && { FEIL: Number(s.dataset.feil), SJEKK: Number(s.dataset.sjekk), none: Number(s.dataset.none) }; })()`);
    const mixedRows = () => browser.evaluate(`Array.from(${risk}.querySelectorAll('[data-mixed-field]')).map(li=>li.innerText.replace(/\\s+/g,' ').trim())`);
    const changeSets = () => browser.evaluate(`${workspace}.querySelectorAll('[data-change-set]').length`);
    const selectedCount = () => browser.evaluate(`Array.from(${grid}.querySelectorAll('[data-table-row] input[type=checkbox]')).filter(e=>e.checked).length`);
    const selectLines = async (indices) => {
      if (await browser.evaluate(`Boolean(${inspector})`)) {
        await click('Avslutt', inspector);
        if (await browser.evaluate(`Boolean(${confirm})`)) await click('Forkast skjemaet', confirm);
        await browser.waitFor(`!${inspector}`);
      }
      if (await browser.evaluate(`Boolean(${bar})`)) await click('Fjern utvalg', bar);
      await click('Ledninger', `document.querySelector('[data-table-geometry]')`);
      await browser.waitFor(box(indices[0]));
      for (const index of indices) await browser.evaluate(`${box(index)}.click()`);
      await click(`Rediger valgte (${indices.length})`, bar); await browser.waitFor(inspector);
    };
    const sdrPreview = async () => { await choose('Felt for masseendring', 'SDR'); await choose('Ny verdi', '11'); await preview(); };
    try {
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm=()=>true;' });
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")'); await click('Lukk');
      await setPhotoFiles(browser, 'input[type=file]', [file]); await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await browser.evaluate(`document.querySelector('[data-gmi-edit-action]').click()`); await browser.waitFor(workspace);

      await t.test('uniform selection with no new FEIL stages directly; split shown only after a valid preview', async () => {
        await selectLines([0, 1]);
        assert.equal(await browser.evaluate(`Boolean(${split})`), false, 'no split before a preview');
        await sdrPreview();
        assert.deepEqual(await counts(), { FEIL: 2, SJEKK: 0, none: 0 });
        assert.match(await browser.evaluate(`${split}.innerText`), /Nå på SDR:/);
        assert.match(await browser.evaluate(`${split}.innerText`), /kan Validator gi SJEKK i stedet for FEIL\. Slike objekter må ikke nødvendigvis rettes\./);
        assert.equal(await browser.evaluate(`${split}.querySelector('[data-gmi-split-keep]')`), null, 'no narrowing when every object has FEIL');
        await click('Legg til masseendring', inspector);
        await browser.waitFor(`${inspector}.dataset.batchStep==='3'`);
        assert.equal(await browser.evaluate(`Boolean(${risk})`), false, 'direct staging');
        assert.equal(await changeSets(), 1);
      });

      await t.test('mixed Material/Dimensjon/Stedfestingsårsak are named with counts; FEIL narrowing; stale approval refused; uniform stages directly', async () => {
        await selectLines([2, 3, 5, 6]);
        await sdrPreview();
        assert.deepEqual(await counts(), { FEIL: 3, SJEKK: 1, none: 0 });
        await click('Legg til masseendring', inspector); await browser.waitFor(risk);
        assert.deepEqual(await mixedRows(), ['Material: PE (3) · PVC (1)', 'Dimensjon: 110 (3) · 160 (1)', 'Stedfestingsårsak: NYTT (3) · UENDR (1)']);
        assert.match(await browser.evaluate(`${risk}.innerText`), /Blandet blant objektene som endres: Material, Dimensjon, Stedfestingsårsak\./);
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          const bounds = await browser.evaluate(`(() => { const d=${risk}.getBoundingClientRect(); return { page: document.documentElement.scrollWidth, top: d.top, bottom: d.bottom, left: d.left, right: d.right }; })()`);
          assert(bounds.page <= width && bounds.left >= 0 && bounds.right <= width && bounds.top >= 0 && bounds.bottom <= height, JSON.stringify(bounds));
          const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
          await writeFile(path.join(shots, `gmi-b2-mixed-${width}x${height}.png`), Buffer.from(data, 'base64'));
        }
        await click('Tilbake til utvalget', risk); await browser.waitFor(`!${risk}`);
        assert.equal(await changeSets(), 1, 'cancel stages nothing');
        // «Behold bare FEIL» is a shrink: preview stays valid, counts follow.
        await click('Behold bare objekter med FEIL på SDR: 3 ledninger', split);
        await browser.waitFor(`${split}?.dataset.sjekk==='0'`);
        assert.equal(await selectedCount(), 3);
        assert.deepEqual(await counts(), { FEIL: 3, SJEKK: 0, none: 0 });
        assert.equal(await browser.evaluate(`document.activeElement?.classList.contains('gmi-current-split-label')`), true);
        assert.equal(await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-counts]').dataset.state`), 'valid');
        await ready();
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          const bounds = await browser.evaluate(`(() => { const a=${inspector}.closest('aside').getBoundingClientRect(), s=${split}.getBoundingClientRect();
            return { page: document.documentElement.scrollWidth, right: s.right, asideRight: a.right }; })()`);
          assert(bounds.page <= width && bounds.right <= bounds.asideRight + 1, JSON.stringify(bounds));
          const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
          await writeFile(path.join(shots, `gmi-b2-split-${width}x${height}.png`), Buffer.from(data, 'base64'));
        }
        await click('Legg til masseendring', inspector); await browser.waitFor(risk);
        assert.deepEqual(await mixedRows(), ['Material: PE (2) · PVC (1)', 'Dimensjon: 110 (2) · 160 (1)'], 'Stedfestingsårsak is uniform after narrowing');
        // The selection changes while the dialog is open: the approval is refused.
        await browser.evaluate(`${box(2)}.click()`);
        await browser.waitFor(`${split}?.dataset.feil==='2'`);
        await click('Godkjenn og legg til', risk);
        await browser.waitFor(`!${risk}`);
        assert.match(await browser.evaluate(`${inspector}.innerText`), /Utvalget er endret\. Se gjennom og godkjenn på nytt\./);
        assert.equal(await changeSets(), 1, 'stale approval staged nothing');
        // Now uniform (two PE/110/NYTT lines), no new FEIL: no mixed warning, direct staging.
        await ready();
        await click('Legg til masseendring', inspector);
        await browser.waitFor(`${inspector}.dataset.batchStep==='3'`);
        assert.equal(await browser.evaluate(`Boolean(${risk})`), false);
        assert.equal(await changeSets(), 2);
      });

      await t.test('new FEIL always needs confirmation; undo invalidates the preview and hides the split', async () => {
        await selectLines([7, 8]);
        await choose('Felt for masseendring', 'Material'); await custom(); await choose('Ny verdi', 'EGENKODE'); await preview();
        assert(await browser.evaluate(`Boolean(${split})`));
        // Undo of an earlier correction makes this preview stale: no split, no staging.
        await click('Angre siste retting', workspace);
        await browser.waitFor(`${inspector}.querySelector('[data-gmi-batch-counts]')?.dataset.state==='stale'`);
        assert.equal(await browser.evaluate(`Boolean(${split})`), false);
        assert(await browser.evaluate(`Array.from(${inspector}.querySelectorAll('button')).find(b=>b.innerText.trim()==='Legg til masseendring').disabled`));
        await click('Gjør om retting', workspace);
        await browser.waitFor(`${workspace}.querySelectorAll('[data-change-set]').length===2`);
        assert.equal(await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-counts]').dataset.state`), 'stale', 'redo does not revive an old preview');
        await click('Oppdater forhåndsvisning', `${inspector}.querySelector('.gmi-batch-stale')`); await ready();
        assert(await browser.evaluate(`Boolean(${split})`));
        await click('Legg til masseendring', inspector); await browser.waitFor(risk);
        const text = await browser.evaluate(`${risk}.innerText`);
        assert.match(text, /\d+ (ny|nye)( eller forverrede?)? FEIL/);
        assert.doesNotMatch(text, /Blandet/, 'uniform: only the new FEIL needs approval');
        assert.equal(await browser.evaluate(`${risk}.querySelector('[data-validation-tone=error] li') !== null`), true, 'the new FEIL are listed with objects');
        await click('Godkjenn og legg til', risk);
        await browser.waitFor(`${inspector}.dataset.batchStep==='3'`);
        assert.equal(await changeSets(), 3);
      });

      assert.deepEqual(new Uint8Array(await readFile(file)), new Uint8Array(bytes), 'input file unchanged');
      assert.equal(browser.events.filter((event) => event.method === 'Runtime.exceptionThrown').length, 0);
    } finally {
      await browser.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
