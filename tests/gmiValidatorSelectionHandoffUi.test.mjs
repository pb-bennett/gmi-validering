import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { gmiFieldBatchFixture } from './helpers/gmiFieldBatchFixture.mjs';

const app = process.env.PHOTO_UI_URL;
const table = 'document.querySelector("[data-table-geometry]")', grid = 'document.querySelector("[role=grid]")';
const bar = 'document.querySelector("[data-gmi-selection-bar]")', batch = 'document.querySelector("[data-gmi-batch-inspector]")';
const editor = 'document.querySelector("[data-gmi-object]")';
const box = (index) => `${grid}.querySelector('[data-table-row="${index}"] input[type=checkbox]')`;
const halos = `Array.from(document.querySelectorAll('.leaflet-gmi-edit-selection-pane path.gmi-edit-selection-halo')).filter(e => Number(e.getAttribute('opacity') ?? e.getAttribute('stroke-opacity')) > 0)`;

test('H3 production: exact Validator selections enter object/batch editing, preserve datasets, reveal rows and refuse stale source identities',
  { skip: !app || !chromePath, timeout: 240000 }, async (t) => {
    const temporaryRoot = path.resolve(tmpdir()), directory = await mkdtemp(path.join(temporaryRoot, 'gmi-h3-selection-'));
    const file = path.join(directory, 'Synthetic H3.gmi');
    const bytes = gmiFieldBatchFixture({ pointFields: ['Tema', 'Type', 'InnvendigUtvendig', 'Bredde', 'Stedfestingsårsak', 'Merknad'],
      points: Array.from({ length: 160 }, (_, i) => ['KUM', 'KBRE', i === 149 ? '' : 'ID', '1000', 'NYTT', `Synthetic ${i}`]),
      lineFields: ['Tema', 'Material', 'SDR', 'Stedfestingsårsak', 'Merknad'],
      lines: Array.from({ length: 5 }, (_, i) => ['VL', 'PE', '', 'NYTT', `Synthetic line ${i}`]) });
    await writeFile(file, bytes);
    const browser = await openTestChrome();
    const click = (label, root = 'document') => browser.evaluate(`(() => { const e=Array.from((${root}).querySelectorAll('button')).find(e=>e.innerText.trim()===${JSON.stringify(label)} || e.getAttribute('aria-label')===${JSON.stringify(label)}); if(!e || e.disabled) throw new Error('Unavailable: '+${JSON.stringify(label)}); e.click(); })()`);
    const choose = (expression, value) => browser.evaluate(`(() => {const e=${expression}; e.value=${JSON.stringify(value)}; e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const shot = async (name) => {
      if (!process.env.GMI_EDIT_SCREENSHOT_DIR) return;
      await mkdir(process.env.GMI_EDIT_SCREENSHOT_DIR, { recursive: true });
      const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.GMI_EDIT_SCREENSHOT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
    };
    const selected = () => browser.evaluate(`Array.from(${grid}.querySelectorAll('[data-table-row][aria-selected=true]')).map(e=>Number(e.dataset.tableRow)).sort((a,b)=>a-b)`);
    const openInspection = async (geometry, field, datasetKind = 'original') => {
      if (await browser.evaluate('Boolean(document.querySelector(".gmi-edit-workspace"))')) await click('Tilbake til appen');
      await browser.waitFor('document.querySelector("button[title=Feltvalidering]")');
      await browser.evaluate('document.querySelector("button[title=Feltvalidering]").click()');
      await browser.waitFor(`document.querySelector('[aria-label="Datasett i Validator"]')`);
      await choose(`document.querySelector('[aria-label="Datasett i Validator"]')`, datasetKind);
      await browser.evaluate(`Array.from(document.querySelector('[role=tablist][aria-label=Geometri]').querySelectorAll('button')).find(e=>e.innerText.startsWith(${JSON.stringify(geometry)})).click()`);
      const button = `document.querySelector('button[aria-label^="${field}:"]')`;
      await browser.waitFor(button);
      if (await browser.evaluate(`${button}.getAttribute('aria-expanded') !== 'true'`)) await browser.evaluate(`${button}.click()`);
      await click(`Vis detaljer: ${field}`);
      const diagnostic = `Array.from(document.querySelectorAll('button[aria-label*="objekter i tabell:"]')).find(e=>e.closest('[data-validation-tone]')?.dataset.validationTone==='error')`;
      await browser.waitFor(diagnostic); await browser.evaluate(`${diagnostic}.click()`);
      await browser.waitFor(`${table}?.dataset.tableGeometry === '${geometry === 'Punkter' ? 'punkter' : 'ledninger'}'
        && !document.querySelector('.gmi-edit-table-modes') && ${grid}?.querySelector('input[type=checkbox]')`);
    };
    const entry = async (count) => {
      const label = `Åpne i Rettinger (${count})`;
      await browser.waitFor(`${bar}?.innerText.includes(${JSON.stringify(label)})`);
      const hit = await browser.evaluate(`(() => {const e=Array.from(${bar}.querySelectorAll('button')).find(e=>e.innerText.trim()===${JSON.stringify(label)}), r=e.getBoundingClientRect(), x=r.left+r.width/2,y=r.top+r.height/2;return {x,y,reachable:e.contains(document.elementFromPoint(x,y))};})()`);
      assert(hit.reachable, 'handoff button is pointer reachable');
      await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: hit.x, y: hit.y, button: 'left', clickCount: 1 });
      await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hit.x, y: hit.y, button: 'left', clickCount: 1 });
    };
    const noStaging = async () => {
      assert.equal(await browser.evaluate('Boolean(document.querySelector("[data-gmi-edit-counts], .gmi-edit-review, [data-gmi-batch-counts]"))'), false);
      assert.equal(await browser.evaluate('Boolean(document.querySelector(".gmi-edit-input-draft"))'), false);
    };
    try {
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm=()=>true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")'); await click('Lukk');
      await setPhotoFiles(browser, 'input[type=file]', [file]);
      await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await browser.evaluate(`document.querySelector('[title="Synthetic H3.gmi"]').click()`);

      for (const [width, height] of [[1280, 720], [1366, 768]]) {
        await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        for (const datasetKind of ['original', 'proposed']) {
          await t.test(`one late point → individual editor, row reveal and map/selection highlight; ${datasetKind}, ${width}×${height}`, async () => {
            await openInspection('Punkter', 'Innvendig/utvendig', datasetKind);
            await browser.waitFor(box(149)); await browser.evaluate(`${box(149)}.click()`);
            await shot(`h3-entry-${datasetKind}-${width}`); await entry(1);
            await browser.waitFor(`${editor}?.dataset.gmiObject === 'point:149'`);
            await browser.waitFor(`${grid}?.querySelector('[data-table-row="149"][data-table-revealed=true][aria-current=true]')`);
            await browser.waitFor(`${halos}.length === 1`);
            assert.deepEqual(await selected(), [149]);
            assert.equal(await browser.evaluate(`${table}.dataset.tableGeometry`), 'punkter');
            assert.equal(await browser.evaluate('document.querySelector(".gmi-edit-table-modes").dataset.gmiTableView'), datasetKind);
            assert.equal(await browser.evaluate(`Boolean(${batch})`), false);
            assert.equal(await browser.evaluate(`Array.from(${bar}.querySelectorAll('button')).find(e=>e.innerText==='Filtrert visning').getAttribute('aria-pressed')`), 'true');
            const bounds = await browser.evaluate(`(() => {const r=${grid}.querySelector('[data-table-row="149"]').getBoundingClientRect(), g=${grid}.getBoundingClientRect();return {visible:r.top>=g.top && r.bottom<=g.bottom,page:document.documentElement.scrollWidth};})()`);
            assert(bounds.visible); assert(bounds.page <= width);
            await noStaging(); await shot(`h3-point-${datasetKind}-${width}`);
          });
          await t.test(`several lines → empty exact batch, provenance and later widening; ${datasetKind}, ${width}×${height}`, async () => {
            await openInspection('Ledninger', 'SDR', datasetKind);
            await browser.waitFor(box(3)); await browser.evaluate(`${box(3)}.click()`); await browser.evaluate(`${box(1)}.click()`);
            await entry(2); await browser.waitFor(`${batch}?.dataset.batchStep === '1'`);
            assert.deepEqual(await selected(), [1, 3]);
            assert.equal(await browser.evaluate(`${grid}.querySelectorAll('[data-table-row]').length`), 2);
            assert.equal(await browser.evaluate(`${batch}.querySelector('[aria-label="Felt for masseendring"]').value`), '');
            assert.equal(await browser.evaluate(`${batch}.querySelector('[aria-label="Ny verdi"]').value`), '');
            assert.equal(await browser.evaluate('document.querySelector(".gmi-edit-table-modes").dataset.gmiTableView'), datasetKind);
            assert.match(await browser.evaluate('document.querySelector("[data-gmi-validator-provenance]").innerText'), /Valgt i Validator · SDR · 2 objekter/);
            assert.doesNotMatch(await browser.evaluate(`${bar}.innerText`), /bare fjerning|Gjør om til vanlig/);
            assert.equal(await browser.evaluate(`Array.from(${bar}.querySelectorAll('button')).find(e=>e.innerText==='Bare valgte').getAttribute('aria-pressed')`), 'true');
            await browser.waitFor(`${halos}.length === 2`); await noStaging(); await shot(`h3-batch-${datasetKind}-${width}`);
            assert(await browser.evaluate(`document.documentElement.scrollWidth <= ${width}`));
            await click('Filtrert visning', bar); await browser.waitFor(box(0)); await browser.evaluate(`${box(0)}.click()`);
            assert.deepEqual(await selected(), [0, 1, 3]); await noStaging();
          });
        }
      }

      await t.test('stale imported GUID refuses handoff in Validator with an explanation and no editor or ChangeSet', async () => {
        await openInspection('Punkter', 'Innvendig/utvendig');
        await browser.waitFor(box(149)); await browser.evaluate(`${box(149)}.click()`);
        // Fault injection through React's existing subscribed layer snapshot. No app test hook or source write.
        const injected = await browser.evaluate(`(() => { const e=${table}, key=Object.keys(e).find(k=>k.startsWith('__reactFiber$')); let f=e[key];
          for(;f;f=f.return) for(let h=f.memoizedState;h && typeof h==='object';h=h.next) {
            const value=h.memoizedState; if(!value || typeof value!=='object' || Array.isArray(value)) continue;
            const layer=Object.values(value).find(v=>v?.name==='Synthetic H3.gmi' && v?.data?.points?.length===160);
            if(layer && !Object.isFrozen(layer.data.points[149])) { window.h3StaleObject=layer.data.points[149]; window.h3OldGuid=layer.data.points[149].guid; layer.data.points[149].guid='synthetic-stale-guid'; return true; }
          } return false; })()`);
        assert(injected, 'located the existing imported layer snapshot for stale identity injection');
        await entry(1);
        await browser.waitFor(`Array.from(document.querySelectorAll('[role=alert]')).some(e=>e.innerText.includes('Kildegrunnlaget'))`);
        assert.equal(await browser.evaluate('Boolean(document.querySelector("#validation-v2-layer"))'), true);
        assert.equal(await browser.evaluate('Boolean(document.querySelector(".gmi-edit-workspace"))'), false);
        await browser.evaluate('window.h3StaleObject.guid=window.h3OldGuid; delete window.h3StaleObject; delete window.h3OldGuid;');
        assert.deepEqual(await selected(), [149]); await shot('h3-stale-refusal');
      });
      await t.test('Original/Foreslått handoffs retain a real existing correction and show the requested values without adding another ChangeSet', async () => {
        await click('Lukk Validator');
        await openInspection('Ledninger', 'SDR');
        await browser.waitFor(box(0)); await browser.evaluate(`${box(0)}.click()`); await entry(1);
        await browser.waitFor(`${editor}?.dataset.gmiObject === 'line:0'`);
        const value = `${editor}.querySelector('tr[data-field="SDR"] input')`;
        await browser.waitFor(value);
        await browser.evaluate(`(() => { const e=${value}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'11.0'); e.dispatchEvent(new Event('input',{bubbles:true})); })()`);
        await click('Se gjennom (1)', editor); await browser.waitFor('document.querySelector(".gmi-edit-review")');
        await click('Legg til retting', editor);
        await browser.waitFor('document.querySelector("[data-gmi-edit-counts]")');
        const counts = await browser.evaluate('document.querySelector("[data-gmi-edit-counts]").innerText');
        for (const datasetKind of ['original', 'proposed']) {
          await openInspection('Ledninger', 'SDR', datasetKind);
          await browser.evaluate(`Array.from(${table}.querySelectorAll('[aria-label="Vis objektutvalg"] button')).find(e=>e.innerText.startsWith('Alle'))?.click()`);
          await browser.waitFor(box(0)); await browser.evaluate(`${box(0)}.click()`); await browser.evaluate(`${box(3)}.click()`);
          await entry(2); await browser.waitFor(`${batch}?.dataset.batchStep === '1'`);
          assert.deepEqual(await selected(), [0, 3]);
          assert.equal(await browser.evaluate('document.querySelector("[data-gmi-edit-counts]").innerText'), counts);
          assert.equal(await browser.evaluate('document.querySelector(".gmi-edit-table-modes").dataset.gmiTableView'), datasetKind);
          assert.equal(await browser.evaluate(`${batch}.querySelector('[aria-label="Felt for masseendring"]').value`), '');
          assert.equal(await browser.evaluate(`${batch}.querySelector('[aria-label="Ny verdi"]').value`), '');
          assert.equal(await browser.evaluate('Boolean(document.querySelector("[data-gmi-batch-counts]"))'), false);
          assert.equal(await browser.evaluate(`Boolean(${grid}.querySelector('[data-table-row="0"] [data-gmi-changed-cell]'))`), datasetKind === 'proposed');
        }
      });
      assert.deepEqual(new Uint8Array(await readFile(file)), bytes);
      assert.equal(browser.events.filter(e => e.method === 'Runtime.exceptionThrown').length, 0);
    } catch (error) { await shot('h3-failure'); throw error; }
    finally {
      await browser.close();
      if (path.dirname(path.resolve(directory)) !== temporaryRoot || !path.basename(directory).startsWith('gmi-h3-selection-')) throw new Error('Unsafe temporary fixture directory');
      await rm(directory, { recursive: true, force: true });
    }
  });
