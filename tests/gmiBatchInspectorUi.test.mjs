import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { gmiEditBatchFixture } from './helpers/gmiEditBatchFixture.mjs';
import { gmiFieldBatchFixture } from './helpers/gmiFieldBatchFixture.mjs';
import { loadGmiDocument, verifyCellChanges } from './helpers/gmiEditHarness.mjs';

const app = process.env.PHOTO_UI_URL;
const inspector = `document.querySelector('[data-gmi-batch-inspector]')`;
const workspace = `document.querySelector('.gmi-edit-workspace')`;
const grid = `document.querySelector('[role=grid]')`;
const bar = `document.querySelector('[data-gmi-selection-bar]')`;
const confirm = `document.querySelector('dialog[open][data-gmi-confirm=workspace]')`;
const box = (index) => `${grid}.querySelector('[data-table-row="${index}"] input[type=checkbox]')`;
const row = (index) => `${grid}.querySelector('[data-table-row="${index}"]')`;

test('G4 production: general points/lines, exact reviewed bytes, gates, cancellation and laptop layout',
  { skip: !app || !chromePath, timeout: 240000 }, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gmi-g4-ui-'));
    const file = path.join(directory, 'Synthetic G4.gmi'), downloads = path.join(directory, 'downloads');
    await mkdir(downloads);
    const bytes = gmiFieldBatchFixture({
      pointFields: ['Tema', 'InnvendigUtvendig', 'Bredde', 'Kumform', 'Merknad', 'EgetFelt'],
      points: [...Array.from({ length: 4 }, () => ['LOK', '', '650', '', '', '']), ['KUM', 'ID', '1000', 'R', '', '']],
      lineFields: ['Tema', 'Material', 'Merknad', 'SDR', 'Trykklasse', 'Ringstivhet', 'Dimensjon', 'Rørform', 'VertikalDimensjon', 'Anleggsår'],
      lines: [['VL', '', '', '', '', '', '160', 'S', '', ''], ['VL', 'PE', 'old', '', '', '', '200', 'R', '', ''],
        ['SP', 'unlisted', '', '', '', '', '200', 'S', '', '']],
    });
    await writeFile(file, bytes);
    const browser = await openTestChrome();
    const risk = `document.querySelector('dialog[open][data-gmi-confirm=batch-risk]')`;
    const click = (label, root = 'document') => browser.evaluate(`(() => {
      const b=Array.from((${root}).querySelectorAll('button')).find(e=>e.innerText.trim()===${JSON.stringify(label)} || e.getAttribute('aria-label')===${JSON.stringify(label)});
      if(!b || b.disabled) throw new Error('Unavailable: '+${JSON.stringify(label)}); b.click(); })()`);
    const choose = (label, value) => browser.evaluate(`(() => { const s=${inspector}.querySelector('[aria-label=${JSON.stringify(label)}]'), select=s.tagName==='SELECT';
      Object.getOwnPropertyDescriptor(select?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(s,${JSON.stringify(value)}); s.dispatchEvent(new Event(select?'change':'input',{bubbles:true})); })()`);
    const input = (value) => browser.evaluate(`(() => { const e=${inspector}.querySelector('[aria-label="Ny verdi"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    const text = (root = inspector) => browser.evaluate(`${root}.innerText`);
    const ready = () => browser.waitFor(`${inspector}.querySelector('[data-gmi-batch-dry-run]')?.innerText.includes('OK') && ${inspector}.getAttribute('aria-busy')==='false'`);
    const preview = async () => { await click('Forhåndsvis endringer', inspector); await ready(); };
    const stage = async (expectRisk = false) => {
      await ready(); await click('Legg til endringer', inspector);
      if (expectRisk) { await browser.waitFor(risk); await click('Godkjenn og legg til', risk); }
      await browser.waitFor(`${inspector}.dataset.batchStep==='3'`);
    };
    const selectObjects = async (scope, indices) => {
      if (await browser.evaluate(`Boolean(${inspector})`)) {
        await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-cancel]').click()`);
        if (await browser.evaluate(`Boolean(${confirm})`)) await click('Forkast skjemaet', confirm);
        await browser.waitFor(`!${inspector}`);
      }
      if (await browser.evaluate(`Boolean(${bar})`)) await click('Fjern utvalg', bar);
      await click(scope, `document.querySelector('[data-table-geometry]')`);
      await browser.waitFor(box(indices[0]));
      for (const index of indices) await browser.evaluate(`${box(index)}.click()`);
      await click(`Rediger valgte (${indices.length})`, bar); await browser.waitFor(inspector);
    };
    try {
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm=()=>true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")'); await click('Lukk');
      await setPhotoFiles(browser, 'input[type=file]', [file]); await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await browser.evaluate(`document.querySelector('[data-gmi-edit-action]').click()`); await browser.waitFor(workspace);

      await t.test('four LOK points, listed OD, one ChangeSet, undo/redo, exact downloaded spans at both laptop sizes', async () => {
        await selectObjects('Punkter', [0, 1, 2, 3]);
        assert.equal(await browser.evaluate(`${inspector}.querySelector('select').value`), '');
        assert(await browser.evaluate(`Array.from(${inspector}.querySelector('select').options).some(o=>o.disabled&&o.textContent.includes('Finnes ikke i filen'))`));
        await choose('Felt for masseendring', 'InnvendigUtvendig');
        assert.deepEqual(await browser.evaluate(`Array.from(${inspector}.querySelector('[aria-label="Ny verdi"]').options).slice(0,-1).map(o=>o.value)`), ['', 'ID', 'OD']);
        // Native keyboard value selection and form submission.
        await browser.evaluate(`${inspector}.querySelector('[aria-label="Ny verdi"]').focus()`);
        for (const key of ['Home', 'ArrowDown', 'ArrowDown', 'Tab', 'Tab', 'Enter']) {
          await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key });
          await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key });
        }
        // Native platform select behavior can differ; exercise the same accessible control explicitly if needed.
        if (await browser.evaluate(`!${inspector}.querySelector('[data-gmi-batch-counts]')`)) {
          await choose('Ny verdi', 'OD'); await preview();
        } else await ready();
        assert.match(await text(), /4 av 4 punkter endres/);
        assert.match(await text(), /4 FEIL og 0 SJEKK løst/);
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          const bounds = await browser.evaluate(`(() => { const i=${inspector}.closest('aside').getBoundingClientRect(), g=${grid}.getBoundingClientRect(); return {width:document.documentElement.scrollWidth, right:i.right, bottom:i.bottom, tableHeight:g.height}; })()`);
          assert(bounds.width <= width && bounds.right <= width && bounds.bottom <= height && bounds.tableHeight > 120, JSON.stringify(bounds));
          // A1: for a single-field fill, «Legg til endringer» is visible in the inspector without scrolling.
          const reach = await browser.evaluate(`(() => { const b = Array.from(${inspector}.querySelectorAll('button')).find(e => e.innerText.trim() === 'Legg til endringer');
            let s = b.parentElement; while (s && !/(auto|scroll)/.test(getComputedStyle(s).overflowY)) s = s.parentElement;
            const r = b.getBoundingClientRect(), v = (s || document.documentElement).getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, viewTop: v.top, viewBottom: Math.min(v.bottom, innerHeight), scrollTop: s ? s.scrollTop : 0,
              hit: b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) }; })()`);
          // The earlier keyboard pass may have scrolled the inspector; the button must also fit at scroll position 0.
          assert(reach.top >= reach.viewTop && reach.bottom <= reach.viewBottom && reach.bottom + reach.scrollTop <= reach.viewBottom && reach.hit, JSON.stringify(reach));
          const proposalTop = await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-counts]').getBoundingClientRect().top - ${inspector}.closest('aside').getBoundingClientRect().top`);
          assert(proposalTop < 140, `proposal top ${proposalTop}`);
          const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
          await writeFile(path.join(tmpdir(), `gmi-g4-${width}x${height}.png`), Buffer.from(data, 'base64'));
        }
        await stage();
        assert.equal(await browser.evaluate(`${workspace}.querySelectorAll('[data-change-set]').length`), 1);
        const id = await browser.evaluate(`${workspace}.querySelector('[data-change-set]').getAttribute('data-change-set')`);
        const contextRedo = () => browser.evaluate(`Array.from(${workspace}.querySelectorAll('[data-gmi-context-redo]')).map(e => [e.dataset.gmiContextRedo, e.innerText.trim()])`);
        // S6: undo from the staged batch view offers a visible «Gjør om» that restores the same entry.
        await click('Angre', inspector);
        await browser.waitFor(`${workspace}.querySelectorAll('[data-change-set]').length===0 && ${inspector}.dataset.batchStep!=='3'`);
        assert.deepEqual((await contextRedo()).map(([where, label]) => [where, label.startsWith('Gjør om')]), [['notice', true], ['changes', true]]);
        await browser.evaluate(`${workspace}.querySelector('[data-gmi-context-redo=notice]').click()`);
        await browser.waitFor(`${workspace}.querySelectorAll('[data-change-set]').length===1`);
        assert.equal(await browser.evaluate(`${workspace}.querySelector('[data-change-set]').getAttribute('data-change-set')`), id);
        assert.deepEqual(await contextRedo(), []);
        await click('Angre siste retting', workspace);
        await browser.waitFor(`${workspace}.querySelectorAll('[data-change-set]').length===0`);
        assert.equal((await contextRedo()).length, 2, 'footer undo also offers the contextual redo');
        await click('Gjør om retting', workspace);
        await browser.waitFor(`${workspace}.querySelectorAll('[data-change-set]').length===1`);
        assert.equal(await browser.evaluate(`${workspace}.querySelector('[data-change-set]').getAttribute('data-change-set')`), id);
        assert.deepEqual(await contextRedo(), [], 'the footer redo removes the contextual actions');
        await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
        await browser.evaluate(`${workspace}.querySelector('.gmi-edit-download').click()`);
        const exportDialog = `document.querySelector('dialog[open].delivery-wizard')`;
        await browser.waitFor(exportDialog);
        await click('Kontroller leveransen', exportDialog); await browser.waitFor(`${exportDialog}.dataset.exportPhase==='ready'`);
        await click('Neste', exportDialog); await click('Last ned GMI', exportDialog);
        await browser.waitFor(`${exportDialog}?.dataset.exportPhase==='done'`);
        const filename = await text(`${exportDialog}.querySelector('[data-downloaded-filename]')`);
        let output;
        for (let i = 0; i < 100; i++) {
          if ((await readdir(downloads)).includes(filename)) { output = new Uint8Array(await readFile(path.join(downloads, filename))); break; }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        assert(output);
        assert.deepEqual(verifyCellChanges(loadGmiDocument(bytes), output, Array.from({ length: 4 }, (_, sourceIndex) => ({ scope: 'point', sourceIndex, field: 'InnvendigUtvendig', lexeme: 'OD' }))).failures, []);
        await click('Lukk', exportDialog);
      });

      await t.test('line Material fill, mixed gate, Merknad set, overwrite and previous-correction gates', async () => {
        await selectObjects('Ledninger', [0, 1]);
        await choose('Felt for masseendring', 'Material'); await choose('Ny verdi', 'PE'); await preview();
        assert.match(await text(), /1 av 2 ledninger endres/);
        // S2: the changed line keeps its unchanged existing findings out of «Funn etter endring».
        await ready();
        const cell = await browser.evaluate(`(() => { const e = ${row(0)}.querySelector('.gmi-review-none, .gmi-review-finding'); return e && { text: e.innerText, tip: e.title }; })()`);
        assert.match(cell?.tip || '', /eksisterende funn uendret/, JSON.stringify(cell));
        assert.match(cell.text, /Ingen nye funn|\(ny\)|Forverret|Forbedret/, 'only what the change does is shown');
        // S1 (deliberate update): only the empty line changes, so the populated,
        // skipped line no longer makes the selection «mixed». It stages directly.
        await ready(); await click('Legg til endringer', inspector);
        await browser.waitFor(`${risk} || ${inspector}.dataset.batchStep==='3'`);
        assert.equal(await browser.evaluate(`Boolean(${risk})`), false, 'no mixed dialog for a skipped populated object');
        await browser.waitFor(`${inspector}.dataset.batchStep==='3'`);
        await click('Ny masseendring for utvalget', inspector);
        await choose('Felt for masseendring', 'Merknad'); await input('Kontrollert');
        await browser.evaluate(`${inspector}.querySelectorAll('input[type=radio]')[1].click()`); await preview();
        await click('Legg til endringer', inspector); await browser.waitFor(risk); assert.match(await text(risk), /1 utfylte verdier overskrives/);
        // Both lines change and their current Merknad differs (tom vs «old»): still mixed.
        // B2 (deliberate update): the B1 profile column Dimensjon (160 vs 200) is now also named, with its distribution.
        assert.match(await text(risk), /Blandet blant objektene som endres: Merknad, Dimensjon\./);
        // A2 (deliberate update): the distributions are supplementary detail, collapsed until opened.
        assert.equal(await browser.evaluate(`${risk}.querySelector('[data-gmi-risk-mixed-details]').open`), false);
        assert.doesNotMatch(await text(risk), /Dimensjon: 160/);
        await browser.evaluate(`${risk}.querySelector('[data-gmi-risk-mixed-details] summary').click()`);
        assert.match(await text(risk), /Dimensjon: 160 \(1\) · 200 \(1\)/);
        assert.match(await text(risk), /Bekreft at samme verdi skal brukes på disse objektene\./);
        await click('Godkjenn og legg til', risk); await browser.waitFor(`${inspector}.dataset.batchStep==='3'`);
        await click('Ny masseendring for utvalget', inspector);
        await choose('Felt for masseendring', 'Merknad'); await input('Ny vurdering');
        await click('Forhåndsvis endringer', inspector);
        await browser.waitFor(`${inspector}.getAttribute('aria-busy')==='false'`);
        assert.match(await text(), /Erstatt tidligere rettinger for 2/);
        await browser.evaluate(`Array.from(${inspector}.querySelectorAll('label')).find(e=>e.innerText.includes('Erstatt tidligere rettinger')).querySelector('input').click()`);
        await ready(); await click('Legg til endringer', inspector); await browser.waitFor(risk);
        assert.match(await text(risk), /2 tidligere rettinger erstattes/); await click('Avbryt', risk);
        await click('Tilbake', inspector);
        assert.equal(await browser.evaluate(`${inspector}.querySelector('[aria-label="Ny verdi"]').value`), 'Ny vurdering');
        await click('Forhåndsvis endringer', inspector);
        await browser.waitFor(`${inspector}.getAttribute('aria-busy')==='false' && ${inspector}.querySelector('[data-gmi-batch-counts]')`);
        assert.equal(await browser.evaluate(`Array.from(${inspector}.querySelectorAll('label')).find(e=>e.innerText.includes('Erstatt tidligere rettinger')).querySelector('input').checked`), false, 'replacement approval belongs to one preview');
        assert.equal(await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-stage-action]').disabled`), true);
      });

      await t.test('manual non-applicable point and unvalidated field require explicit approval', async () => {
        await selectObjects('Punkter', [0]);
        await choose('Felt for masseendring', 'Kumform'); await choose('Ny verdi', 'R');
        await click('Forhåndsvis endringer', inspector);
        await browser.waitFor(`${inspector}.getAttribute('aria-busy')==='false'`);
        await browser.evaluate(`${inspector}.querySelector('.gmi-batch-advanced input').click()`);
        await browser.waitFor(`${row(0)}.querySelector('.gmi-manual-toggle')`); await click('Inkluder manuelt', row(0));
        await ready(); await click('Legg til endringer', inspector); await browser.waitFor(risk);
        assert.match(await text(risk), /1 manuelt inkludert/); await click('Avbryt', risk);
        await browser.evaluate(`void (window.__oldBatchProposal=${inspector}.querySelector('[data-gmi-batch-counts]'))`);
        await click('Tilbake', inspector);
        assert.equal(await browser.evaluate('window.__oldBatchProposal.isConnected'), false);
        await click('Forhåndsvis endringer', inspector);
        await browser.waitFor(`${inspector}.getAttribute('aria-busy')==='false' && ${inspector}.querySelector('[data-gmi-batch-counts]')`);
        assert.equal(await browser.evaluate(`${inspector}.querySelector('.gmi-batch-advanced input').checked`), false, 'manual inclusion permission resets');
        assert.equal(await browser.evaluate(`${row(0)}.querySelectorAll('.gmi-manual-toggle').length`), 0, 'manual row inclusion resets');
        assert.equal(await browser.evaluate(`window.__oldBatchProposal === ${inspector}.querySelector('[data-gmi-batch-counts]')`), false, 'Forward creates a new preview');
        await click('Tilbake', inspector); await choose('Felt for masseendring', 'EgetFelt'); await input('a;b');
        assert.match(await text(), /Semikolon/);
        await input('Vurdert'); await preview();
        await click('Legg til endringer', inspector); await browser.waitFor(risk);
        assert.match(await text(risk), /kontrolleres ikke av Validator/); await click('Avbryt', risk);
      });

      await t.test('mixed point Tema and existing values are named only across the objects that change', async () => {
        await selectObjects('Punkter', [0, 4]);
        // S1 (deliberate update): point 1 already has «OD» from the first ChangeSet and is unchanged, so only
        // the KUM point changes. The overwrite still needs approval; the LOK/KUM mix is no longer reported.
        await choose('Felt for masseendring', 'InnvendigUtvendig'); await choose('Ny verdi', 'OD');
        await browser.evaluate(`${inspector}.querySelectorAll('input[type=radio]')[1].click()`); await preview();
        assert.match(await text(), /1 av 2 punkter endres/);
        await click('Legg til endringer', inspector); await browser.waitFor(risk);
        assert.match(await text(risk), /1 utfylte verdier overskrives/);
        assert.doesNotMatch(await text(risk), /Blandet/);
        await click('Avbryt', risk);
        // Both points change (LOK 650 and KUM 1000): Tema and the edited field are still named.
        await click('Tilbake', inspector); await choose('Felt for masseendring', 'Bredde'); await input('800');
        await browser.evaluate(`${inspector}.querySelectorAll('input[type=radio]')[1].click()`); await preview();
        assert.match(await text(), /2 av 2 punkter endres/);
        await click('Legg til endringer', inspector); await browser.waitFor(risk);
        assert.match(await text(risk), /Blandet blant objektene som endres: Tema, Bredde/);
        await click('Avbryt', risk);
      });

      await t.test('S3: an actual table SJEKK uses the shared warning symbol and compact label at laptop sizes', async () => {
        await selectObjects('Ledninger', [0]);
        await choose('Felt for masseendring', 'Anleggsår'); await input('1800'); await preview();
        const finding = `${row(0)}.querySelector('.gmi-review-finding[data-validation-tone=warning]')`;
        await browser.waitFor(finding);
        assert.match(await text(finding), /SJEKK/);
        assert.equal(await browser.evaluate(`${finding}.querySelector('[data-severity-icon]').dataset.severityIcon`), 'warning');
        assert.equal(await browser.evaluate(`${finding}.querySelector('svg').getAttribute('aria-hidden')`), 'true');
        assert.match(await browser.evaluate(`${finding}.title`), /SJEKK/);
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          assert(await browser.evaluate(`document.documentElement.scrollWidth <= ${width}`));
          const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
          await writeFile(path.join(tmpdir(), `gmi-pass1-table-sjekk-${width}x${height}.png`), Buffer.from(data, 'base64'));
        }
      });

      await t.test('new FEIL is confirmed even without overwrite; cancellation blocks until a fresh full check', async () => {
        await selectObjects('Ledninger', [0]);
        await choose('Felt for masseendring', 'Anleggsår'); await input('ugyldig');
        await browser.evaluate('window.g4Timeout=window.setTimeout; window.setTimeout=(fn,ms,...args)=>window.g4Timeout(fn,ms===0?100:ms,...args)');
        await click('Forhåndsvis endringer', inspector);
        await browser.waitFor(`${inspector}.querySelector('[data-gmi-batch-dry-run]')?.innerText.includes('trinn')`);
        await click('Avbryt full kontroll', inspector);
        assert.match(await text(), /Avbrutt/);
        assert(await browser.evaluate(`Array.from(${inspector}.querySelectorAll('button')).find(b=>b.innerText==='Legg til endringer').disabled`));
        await browser.evaluate('window.setTimeout=window.g4Timeout');
        await click('Kjør full kontroll', inspector); await ready();
        // S2 (deliberate update): the line's empty Anleggsår is a SJEKK, so «ugyldig» worsens it to FEIL.
        // It is shown once as «Forverret», not also as «ny FEIL» and «løst SJEKK».
        const severity = await text(`${inspector}.querySelector('.gmi-batch-severity')`);
        assert.match(severity, /0 nye FEIL/); assert.match(severity, /1 forverret/); assert.match(severity, /0 løst/);
        assert.match(await text(row(0)), /Forverret: SJEKK → FEIL/);
        // Safety: the worsened FEIL still counts as a new FEIL for approval, so the risk dialog is required.
        await click('Legg til endringer', inspector); await browser.waitFor(risk);
        assert.match(await text(risk), /1 ny eller forverret FEIL/); assert.match(await text(risk), /Forverret: SJEKK → FEIL/);
        assert.doesNotMatch(await text(risk), /Ingen nye FEIL/);
        assert.deepEqual(await browser.evaluate(`Array.from(${risk}.querySelectorAll('.gmi-risk-group')).map(e => e.dataset.validationTone)`), ['error']);
        await click('Avbryt', risk);
        // A2 (deliberate update): whole-dataset findings sit inside the preview's «Detaljer» disclosure.
        assert.equal(await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-details]').open`), false);
        await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-details] > summary').click()`);
        await browser.evaluate(`${inspector}.querySelector('.gmi-batch-dataset-findings summary').click()`);
        assert.deepEqual(await browser.evaluate(`Array.from(${inspector}.querySelectorAll('[data-finding-group]')).map(e => e.dataset.findingGroup)`), ['Forverret']);
        await click('Angre siste retting', workspace);
        await browser.waitFor(`${inspector}.querySelector('[data-gmi-batch-counts]').dataset.state==='stale'`);
        // A1 (deliberate update): a stale preview offers no staging action at all (absent counts as blocked).
        assert(await browser.evaluate(`(() => { const b = Array.from(${inspector}.querySelectorAll('button')).find(e => e.innerText === 'Legg til endringer'); return !b || b.disabled; })()`));
      });

      await t.test('A1: exclusive Oppsett/Forhåndsvis/Lagt til stages, back navigation, narrowed draft guard and A2 detail', async () => {
        const stageOf = () => browser.evaluate(`${inspector}.dataset.batchStage`);
        const current = () => browser.evaluate(`${inspector}.querySelector('.gmi-batch-steps [aria-current=step]').innerText.replace(/\\s+/g, ' ').trim()`);
        const has = (selector) => browser.evaluate(`Boolean(${inspector}.querySelector(${JSON.stringify(selector)}))`);
        const stageButton = () => browser.evaluate(`Array.from(${inspector}.querySelectorAll('button')).some(e => e.innerText.trim() === 'Legg til endringer')`);
        const press = async (key, code, keyCode, text) => { for (const type of ['keyDown', 'keyUp']) await browser.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: keyCode, ...(type === 'keyDown' && text ? { text } : {}) }); };
        // Each visible stage at both laptop sizes: no page overflow; screenshots when GMI_EDIT_SCREENSHOT_DIR is set.
        const footerBottoms = new Map();
        const shots = async (name) => {
          for (const [width, height] of [[1280, 720], [1366, 768]]) {
            await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
            await browser.waitFor(`document.documentElement.clientWidth === ${width}`);
            assert(await browser.evaluate(`document.documentElement.scrollWidth <= ${width} && ${inspector}.scrollWidth <= ${inspector}.clientWidth`), `${name} ${width}`);
            const footer = await browser.evaluate(`(() => {
              const root=${inspector}, footer=root.querySelector('[data-gmi-batch-footer]'), pane=root.closest('aside');
              const rect=footer.getBoundingClientRect(), buttons=Array.from(footer.querySelectorAll('button'));
              const top=pane.scrollTop; pane.scrollTop=pane.scrollHeight;
              const last=root.querySelector('.gmi-batch-content').getBoundingClientRect(), end=footer.getBoundingClientRect();
              const uncovered=last.bottom <= end.top + 1; pane.scrollTop=top;
              return { bottom:rect.bottom, top:rect.top, right:rect.right, names:buttons.map(e=>e.innerText.trim()),
                heights:buttons.map(e=>e.getBoundingClientRect().height), uncovered,
                scrollOwner:getComputedStyle(pane).overflowY, internalScroll:getComputedStyle(root).overflowY,
                colour:getComputedStyle(buttons.at(-1)).backgroundColor, icon:Boolean(buttons.at(-1).querySelector('svg[aria-hidden=true]')) };
            })()`);
            const expected = name === 'staged' ? ['Lukk', 'Ny masseendring for utvalget'] : name === 'setup'
              ? ['Avbryt', 'Forhåndsvis endringer'] : ['Avbryt', 'Tilbake', name === 'stale' ? 'Oppdater forhåndsvisning' : 'Legg til endringer'];
            assert.deepEqual(footer.names, expected);
            assert(footer.top >= 0 && footer.bottom <= height && footer.right <= width, JSON.stringify(footer));
            if (footerBottoms.has(width)) assert(Math.abs(footerBottoms.get(width) - footer.bottom) < 2, 'footer keeps the same bottom edge in every stage');
            else footerBottoms.set(width, footer.bottom);
            assert(footer.heights.every(h => h === 30), JSON.stringify(footer));
            assert(footer.uncovered, 'footer does not obscure the final content at maximum scroll');
            assert.equal(footer.scrollOwner, 'auto'); assert.equal(footer.internalScroll, 'visible');
            assert.equal(footer.colour, ['preview', 'conflict'].includes(name) ? 'rgb(15, 23, 43)' : 'rgb(0, 117, 149)');
            if (name === 'preview') assert(footer.icon, 'navy final action has a named control and decorative Phosphor icon');
            if (!process.env.GMI_EDIT_SCREENSHOT_DIR) continue;
            await mkdir(process.env.GMI_EDIT_SCREENSHOT_DIR, { recursive: true });
            const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
            await writeFile(path.join(process.env.GMI_EDIT_SCREENSHOT_DIR, `a1-${name}-${width}x${height}.png`), Buffer.from(data, 'base64'));
          }
        };
        await selectObjects('Ledninger', [0, 1]);
        // Oppsett: only configuration, no proposal, options or staging action.
        assert.equal(await stageOf(), 'setup');
        assert.match(await current(), /Oppsett$/);
        assert.equal(await has('[data-gmi-batch-config]'), true);
        assert.equal(await has('[data-gmi-batch-counts]'), false); assert.equal(await has('[data-gmi-batch-dry-run]'), false);
        assert.equal(await has('.gmi-batch-options'), false); assert.equal(await stageButton(), false, 'no disabled staging button in Oppsett');
        // Draft guard: a mode and a field choice alone are no draft.
        await browser.evaluate(`${inspector}.querySelectorAll('input[type=radio]')[1].click()`);
        await choose('Felt for masseendring', 'Merknad');
        await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-cancel]').click()`);
        await browser.waitFor(`!${inspector}`);
        assert.equal(await browser.evaluate(`Boolean(${confirm})`), false, 'mode/field alone does not ask to discard');
        await selectObjects('Ledninger', [0, 1]);
        await choose('Felt for masseendring', 'Merknad'); await input('A1 test');
        await browser.evaluate(`${inspector}.querySelectorAll('input[type=radio]')[1].click()`);
        await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-cancel]').click()`); await browser.waitFor(confirm);
        assert.match(await text(confirm), /Forkaste endringer i skjemaet\?/);
        await click('Avbryt', confirm); await browser.waitFor(`!${confirm}`);
        assert.equal(await browser.evaluate(`${inspector}.querySelector('[aria-label="Ny verdi"]').value`), 'A1 test');
        await shots('setup');
        // Forhåndsvis: no configuration form; proposal, full control and one staging action.
        await preview();
        assert.equal(await stageOf(), 'preview'); assert.match(await current(), /Forhåndsvis$/);
        assert.equal(await has('[data-gmi-batch-config]'), false); assert.equal(await has('[data-gmi-field-policy]'), false);
        assert.equal(await stageButton(), true);
        assert.equal(await browser.evaluate(`${inspector}.querySelector('.gmi-batch-proposal-value').innerText.trim()`), 'A1 test');
        assert.equal(await browser.evaluate(`document.activeElement?.classList.contains('gmi-batch-proposal-kicker')`), true, 'focus continues at the proposal');
        assert.equal(await browser.evaluate(`${inspector}.querySelector('[data-gmi-selection-profile] [data-gmi-profile-disclosure]').open`), false, 'profile collapsed');
        assert.equal(await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-details]').open`), false, 'reading aids collapsed');
        assert.match(await text(`${inspector}.querySelector('[data-gmi-batch-dry-run]')`), /Full kontroll av forslaget: OK/, 'full-control status stays visible');
        const back = await browser.evaluate(`(() => { const b = ${inspector}.querySelector('[data-gmi-batch-back-setup]'); return { text: b.innerText.trim(), icon: Boolean(b.querySelector('svg[aria-hidden=true]')), primary: b.classList.contains('gmi-primary-control') }; })()`);
        assert.deepEqual(back, { text: 'Tilbake', icon: true, primary: false });
        await shots('preview');
        // A2: the inspected object shows only the edited field and its outcome, never an attribute dump.
        await browser.evaluate(`${row(0)}.click()`);
        await browser.waitFor(`${inspector}.querySelector('.gmi-batch-object-detail [data-gmi-object-outcome]')`);
        assert.equal(await has('.gmi-batch-object-detail dl'), false, 'no duplicate attribute list');
        assert.doesNotMatch(await text(`${inspector}.querySelector('.gmi-batch-object-detail')`), /Dimensjon|Stedfestingsårsak/);
        assert.match(await text(`${inspector}.querySelector('.gmi-batch-object-detail')`), /Merknad → «A1 test»/);
        await click('Lukk objektdetaljer', inspector); await browser.waitFor(`!${inspector}.querySelector('.gmi-batch-object-detail')`);
        // Back to Oppsett genuinely leaves the preview and keeps the whole configuration.
        await click('Tilbake', inspector);
        assert.equal(await stageOf(), 'setup'); assert.match(await current(), /Oppsett$/);
        assert.equal(await has('[data-gmi-batch-counts]'), false); assert.equal(await stageButton(), false);
        assert.deepEqual(await browser.evaluate(`({ field: ${inspector}.querySelector('[aria-label="Felt for masseendring"]').value, value: ${inspector}.querySelector('[aria-label="Ny verdi"]').value,
          mode: ${inspector}.querySelectorAll('input[type=radio]')[1].checked, focus: document.activeElement?.getAttribute('aria-label') })`),
          { field: 'Merknad', value: 'A1 test', mode: true, focus: 'Felt for masseendring' });
        assert.equal(await has('[data-gmi-batch-back-preview]'), false);
        assert.equal(await has('[data-gmi-batch-setup-retained]'), false);
        assert.equal(await browser.evaluate(`${grid}.querySelectorAll('[data-review-outcome]').length`), 0, 'Back clears the table preview too');
        // Unchanged inputs still calculate and validate a fresh preview.
        await preview();
        assert.deepEqual(await browser.evaluate(`({ stage: ${inspector}.dataset.batchStage, busy: ${inspector}.getAttribute('aria-busy'), state: ${inspector}.querySelector('[data-gmi-batch-counts]')?.dataset.state,
          ok: ${inspector}.querySelector('[data-gmi-batch-dry-run]')?.innerText.includes('OK') })`), { stage: 'preview', busy: 'false', state: 'valid', ok: true });
        // Keyboard only: the footer is ordered Cancel, Back, Forward; Back returns focus to the field choice.
        assert.equal(await browser.evaluate(`document.activeElement?.classList.contains('gmi-batch-proposal-kicker')`), true);
        await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-cancel]').focus()`);
        await press('Tab', 'Tab', 9);
        assert.equal(await browser.evaluate(`document.activeElement?.hasAttribute('data-gmi-batch-back-setup')`), true);
        await press('Enter', 'Enter', 13, '\r');
        await browser.waitFor(`${inspector}.dataset.batchStage === 'setup' && document.activeElement?.getAttribute('aria-label') === 'Felt for masseendring'`);
        // A changed setup invalidates the preview through the existing mechanism.
        await input('A1 endret');
        assert.equal(await has('[data-gmi-batch-back-preview]'), false, 'no return to an invalidated preview');
        assert.equal(await has('[data-gmi-batch-setup-retained]'), false);
        await preview();
        assert.equal(await browser.evaluate(`${inspector}.querySelector('.gmi-batch-proposal-value').innerText.trim()`), 'A1 endret');
        // Lagt til: the staged presentation, with the selection kept.
        await stage(true);
        assert.equal(await stageOf(), 'staged'); assert.match(await current(), /Lagt til$/);
        assert.match(await text(), /Utvalget er beholdt \(2 ledninger\)/);
        await shots('staged');
        await click('Ny masseendring for utvalget', inspector);
        assert.equal(await stageOf(), 'setup'); assert.equal(await browser.evaluate(`document.activeElement?.getAttribute('aria-label')`), 'Felt for masseendring');
        // A stale preview stays in Forhåndsvis with a non-colour cue and no staging action.
        await choose('Felt for masseendring', 'Merknad'); await input('A1 stale'); await browser.evaluate(`${inspector}.querySelectorAll('input[type=radio]')[1].click()`);
        // Same field as the staged correction: the existing conflict gate applies, so wait for the preview only.
        await click('Forhåndsvis endringer', inspector);
        await browser.waitFor(`${inspector}.querySelector('[data-gmi-batch-counts]') && ${inspector}.getAttribute('aria-busy')==='false'`);
        assert.match(await text(), /Erstatt tidligere rettinger for 2/);
        assert.equal(await browser.evaluate(`Array.from(${inspector}.querySelectorAll('button')).find(e => e.innerText.trim() === 'Legg til endringer').disabled`), true, 'conflict gate unchanged');
        await shots('conflict');
        await click('Angre siste retting', workspace);
        await browser.waitFor(`${inspector}.querySelector('[data-gmi-batch-counts]')?.dataset.state==='stale'`);
        assert.equal(await stageOf(), 'preview'); assert.match(await current(), /Forhåndsvis\s*\(ugyldig\)$/);
        assert.equal(await stageButton(), false, 'a stale preview cannot be staged');
        await shots('stale');
        await click('Tilbake', inspector);
        assert.equal(await has('[data-gmi-batch-counts]'), false);
        await preview();
        assert.equal(await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-counts]').dataset.state`), 'valid', 'Forward calculates against the current session');
        assert.equal(await stageButton(), true);
        await click('Gjør om retting', workspace);
      });
      assert.deepEqual(new Uint8Array(await readFile(file)), bytes);
      assert.equal(browser.events.filter((event) => event.method === 'Runtime.exceptionThrown').length, 0);
    } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
  });

test('R4 production: exact inspector batch, draft guard, live selection, manual risk, history, fallback and laptop layout',
  { skip: !app || !chromePath, timeout: 240000 }, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gmi-r4-ui-'));
    const file = path.join(directory, 'Synthetic R4.gmi');
    const rows = Array.from({ length: 24 }, (_, i) => i === 2 ? ['SP', 'PVC', '', '', ''] : ['VL', 'PE', '', '', i === 3 ? 'SN8' : '']);
    const source = Buffer.from(gmiEditBatchFixture({ rows })).toString('latin1')
      .replace('[+L_]', '[P_]\r\n_FIELDNAMES Tema;Type;\r\n[+L_]')
      .replace('[END]', '[+P_]\r\n:P 1\r\n_FIELDVALUES KUM;KBRE;\r\n/XYZ\r\n581940 6566000 101\r\n[END]');
    await writeFile(file, Buffer.from(source, 'latin1'));
    const browser = await openTestChrome();
    const click = (label, root = 'document') => browser.evaluate(`(() => { const button = Array.from((${root}).querySelectorAll('button')).find(e => e.innerText.trim() === ${JSON.stringify(label)} || e.getAttribute('aria-label') === ${JSON.stringify(label)}); if (!button || button.disabled) throw new Error('Unavailable: ' + ${JSON.stringify(label)}); button.click(); })()`);
    const input = (element, value) => browser.evaluate(`(() => { const input = ${element};
      const select = input.tagName === 'SELECT', value = ${JSON.stringify(value)};
      Object.getOwnPropertyDescriptor(select ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event(select ? 'change' : 'input', { bubbles: true })); })()`);
    const select = (value) => browser.evaluate(`(() => { const select = ${inspector}.querySelector('select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(value)}); select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    const text = () => browser.evaluate(`${inspector}.innerText`);
    // A1 (deliberate update): Oppsett and a stale Forhåndsvis render no staging action; absent counts as blocked.
    const stageDisabled = () => browser.evaluate(`(() => { const b = Array.from(${inspector}.querySelectorAll('button')).find(e => e.innerText === 'Legg til endringer'); return !b || b.disabled; })()`);
    const calculate = async () => {
      // Stale reviews offer «Oppdater forhåndsvisning» in the summary; otherwise the configuration form.
      const label = await browser.evaluate(`(() => { const b = Array.from(${inspector}.querySelectorAll('button')); return b.some(e => e.innerText === 'Oppdater forhåndsvisning') ? 'Oppdater forhåndsvisning' : b.some(e => e.innerText === 'Forhåndsvis endringer') ? 'Forhåndsvis endringer' : null; })()`);
      // A1 (deliberate update): a valid preview returns to Oppsett first, which offers «Forhåndsvis endringer».
      if (!label) await click('Tilbake', inspector);
      await click(label || 'Forhåndsvis endringer', inspector);
      await browser.waitFor(`${inspector}.querySelector('[data-gmi-batch-counts]') && ${inspector}.getAttribute('aria-busy') === 'false'`);
    };
    try {
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm = () => true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")'); await click('Lukk');
      await setPhotoFiles(browser, 'input[type=file]', [file]);
      await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await browser.evaluate(`document.querySelector('[data-gmi-edit-action]').click()`);
      await browser.waitFor(`${box(0)}`);

      await t.test('deliberate entry guards the individual draft; cancel and confirm; initial value is empty', async () => {
        await browser.evaluate(`${row(0)}.click()`);
        const draft = `document.querySelector('.gmi-edit-editor tr[data-field=SDR] input')`;
        await browser.waitFor(draft); await input(draft, '17');
        await browser.evaluate(`${box(0)}.click(); ${box(1)}.click()`);
        assert.equal(await browser.evaluate(`Boolean(${confirm})`), false);
        assert.equal(await browser.evaluate(`getComputedStyle(Array.from(${bar}.querySelectorAll('button')).find(e => e.innerText === 'Rediger valgte (2)')).backgroundColor`), 'rgb(0, 117, 149)');
        await click('Rediger valgte (2)', bar); await browser.waitFor(confirm);
        await click('Avbryt', confirm); assert.equal(await browser.evaluate(`${draft}.value`), '17');
        await click('Rediger valgte (2)', bar); await browser.waitFor(confirm); await click('Forkast skjemaet', confirm);
        await browser.waitFor(inspector);
        assert.equal(await browser.evaluate(`${inspector}.querySelector('[aria-label="Ny verdi"]').value`), '');
        assert.equal(await browser.evaluate(`${inspector}.querySelector('select').value`), '');
        assert.equal(await stageDisabled(), true);
        assert.equal(await browser.evaluate(`Boolean(document.querySelector('dialog.gmi-batch-dialog'))`), false);
      });

      await t.test('field, value and mode changes; lexeme rejection; exact review and shrinking without recomputation', async () => {
        await select('Trykklasse');
        await browser.evaluate(`${inspector}.querySelectorAll('input[type=radio]')[1].click()`);
        assert.equal(await browser.evaluate(`${inspector}.querySelectorAll('input[type=radio]')[1].checked`), true);
        await browser.evaluate(`${inspector}.querySelectorAll('input[type=radio]')[0].click()`);
        await select('SDR');
        assert.equal(await browser.evaluate(`${inspector}.querySelector('[aria-label="Ny verdi"]').getAttribute('role')`), 'combobox');
        await input(`${inspector}.querySelector('[aria-label="Ny verdi"]')`, '11'); await calculate();
        assert.match(await text(), /2 av 2 ledninger endres/); assert.match(await text(), /0 nye FEIL/);
        assert.equal(await browser.evaluate(`${grid}.getAttribute('aria-rowcount')`), '3');
        assert.match(await browser.evaluate(`${row(0)}.innerText`), /Endres/);
        assert.match(await browser.evaluate(`${row(0)}.innerText`), /tom\s*→[\s\S]*11/);
        await browser.evaluate(`${box(1)}.click()`);
        await browser.waitFor(`${inspector}.innerText.includes('1 av 1 ledning endres')`);
        await browser.waitFor(`${inspector}.getAttribute('aria-busy') === 'false'`);
        assert.equal(await stageDisabled(), false);
      });

      await t.test('expanding requires recalculation; applicability override is separate, explicit and risky', async () => {
        await click('Filtrert visning', bar);
        await browser.waitFor(`${row(1)}.innerText.includes('Utelatt av deg')`);
        assert.doesNotMatch(await browser.evaluate(`${row(1)}.innerText`), /11/, 'an excluded object shows no proposed value');
        await browser.evaluate(`${box(1)}.click()`);
        await browser.waitFor(`${inspector}.innerText.includes('Utvalget er utvidet')`);
        assert.equal(await stageDisabled(), true);
        await browser.evaluate(`${box(1)}.click()`);
        assert.equal(await stageDisabled(), true, 'removing the addition does not revive the old review');
        await calculate();
        await browser.waitFor(box(2)); await browser.evaluate(`${box(2)}.click()`);
        await browser.waitFor(`${inspector}.innerText.includes('Utvalget er utvidet')`);
        assert.equal(await stageDisabled(), true);
        await calculate(); assert.match(await text(), /1 av 2 ledninger endres/); assert.match(await text(), /Hoppes over: 1/);
        assert.match(await browser.evaluate(`${row(2)}.innerText`), /Hoppes over/);
        await browser.evaluate(`${inspector}.querySelector('.gmi-batch-advanced input').click()`);
        assert.doesNotMatch(await text(), /Manuelt inkludert: /);
        await click('Inkluder manuelt', row(2));
        await browser.waitFor(`${inspector}.innerText.includes('Manuelt inkludert: 1')`);
        assert.match(await text(), /2 av 2 ledninger endres/);
        await browser.evaluate(`${row(2)}.click()`);
        await browser.waitFor(`${inspector}.querySelector('.gmi-batch-object-detail')`);
        // Row inspection keeps the reviewed proposal (and its draft) intact.
        assert.equal(await browser.evaluate(`${inspector}.querySelector('.gmi-batch-proposal-value').innerText.trim()`), '11');
        await click('Lukk objektdetaljer', inspector);
        await click('Legg til endringer', inspector);
        const risk = `document.querySelector('dialog[open][data-gmi-confirm=batch-risk]')`;
        await browser.waitFor(risk); assert.match(await browser.evaluate(`${risk}.innerText`), /1 manuelt inkludert/);
        await click('Avbryt', risk); await click('Legg til endringer', inspector); await browser.waitFor(risk);
        await click('Godkjenn og legg til', risk);
        await browser.waitFor(`${workspace}.querySelectorAll('[data-change-set]').length === 1`);
        await browser.waitFor(`${inspector}.innerText.includes('Utvalget er beholdt')`);
        assert.match(await text(), /Lagt til i arbeidskopien/);
        await click('Ny masseendring for utvalget', inspector);
        assert.match(await browser.evaluate(`${bar}.innerText`), /2 valgt/);
      });

      await t.test('Original/Foreslått and history; undo/redo invalidate active review', async () => {
        await click('Foreslått', `document.querySelector('.gmi-edit-table-modes')`);
        await browser.waitFor(`${row(0)}.innerText.includes('11')`);
        await click('Original', `document.querySelector('.gmi-edit-table-modes')`);
        await browser.waitFor(`!${row(0)}.innerText.includes('11')`);
        await select('SDR');
        await input(`${inspector}.querySelector('[aria-label="Ny verdi"]')`, '17');
        await browser.evaluate(`${inspector}.querySelectorAll('input[type=radio]')[1].click()`); await calculate();
        await click('Angre siste retting', workspace);
        await browser.waitFor(`${inspector}.innerText.includes('rettingene er endret')`); assert.equal(await stageDisabled(), true);
        assert.equal(await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-counts]').dataset.state`), 'stale');
        await click('Gjør om retting', workspace); assert.equal(await stageDisabled(), true);
        await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-cancel]').click()`); await browser.waitFor(confirm); await click('Avbryt', confirm);
        assert.equal(await browser.evaluate(`${inspector}.querySelector('.gmi-batch-proposal-value').innerText.trim()`), '17');
        await click('Tilbake', inspector);
        assert.equal(await browser.evaluate(`${inspector}.querySelector('[aria-label="Ny verdi"]').value`), '17');
        await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-cancel]').click()`); await browser.waitFor(confirm); await click('Forkast skjemaet', confirm);
        await browser.waitFor(`!${inspector}`);
      });

      await t.test('points offer capabilities with absent fields disabled; the integrated inspector replaces the legacy footer action', async () => {
        await click('Fjern utvalg', bar); await click('Punkter', `document.querySelector('[data-table-geometry]')`);
        await browser.waitFor(box(0)); await browser.evaluate(`${box(0)}.click()`);
        await click('Rediger valgte (1)', bar); await browser.waitFor(inspector);
        assert.equal(await browser.evaluate(`${inspector}.querySelector('select').value`), '');
        assert(await browser.evaluate(`Array.from(${inspector}.querySelector('select').options).some(o => o.disabled && o.textContent.includes('Finnes ikke i filen'))`)); assert.equal(await stageDisabled(), true);
        await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-cancel]').click()`); await browser.waitFor(`!${inspector}`);
        assert.equal(await browser.evaluate(`Array.from(${workspace}.querySelectorAll('.gmi-edit-footer button')).some(button => button.innerText.trim() === 'Masseendringer')`), false);
        assert.equal(await browser.evaluate(`document.querySelector('dialog.gmi-batch-dialog')`), null);
      });

      await t.test('expanded table shows ten rows at all required viewports and reverses without losing draft', async () => {
        await click('Fjern utvalg', bar); await click('Ledninger', `document.querySelector('[data-table-geometry]')`);
        await browser.waitFor(box(0));
        await browser.evaluate(`${grid}.querySelector('[role=columnheader] input').click()`);
        await click('Rediger valgte (24)', bar); await browser.waitFor(inspector);
        await select('SDR');
        await input(`${inspector}.querySelector('[aria-label="Ny verdi"]')`, '11'); await calculate();
        await click('Større tabell');
        for (const [width, height] of [[1920, 1080], [1366, 768], [1280, 720]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          const bounds = await browser.evaluate(`(() => { const g=${grid}, r=g.getBoundingClientRect(), i=${inspector}.closest('aside').getBoundingClientRect(); return { width: document.documentElement.scrollWidth, tableHeight: r.height, inspectorHeight: i.height, inspectorWidth: i.width }; })()`);
          assert(bounds.width <= width); assert(bounds.tableHeight >= 11 * 28, JSON.stringify(bounds)); assert(bounds.inspectorWidth >= 380); assert(bounds.inspectorHeight >= 240);
          const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
          await writeFile(path.join(tmpdir(), `gmi-r4-${width}x${height}.png`), Buffer.from(data, 'base64'));
        }
        await click('Mindre tabell');
        assert.equal(await browser.evaluate(`${inspector}.querySelector('.gmi-batch-proposal-value').innerText.trim()`), '11');
        assert.match(await text(), /av 24 ledninger endres/);
        for (const [width, height] of [[1920, 1080], [1366, 768], [1280, 720]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          assert(await browser.evaluate(`document.documentElement.scrollWidth <= ${width}`));
          const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
          await writeFile(path.join(tmpdir(), `gmi-r4-normal-${width}x${height}.png`), Buffer.from(data, 'base64'));
        }
        await click('Større tabell'); await click('Fjern utvalg', bar);
        assert.equal(await stageDisabled(), true);
        await click('Mindre tabell');
        assert.equal(await browser.evaluate(`${inspector}.querySelector('.gmi-batch-proposal-value').innerText.trim()`), '11');
      });
      assert.equal(browser.events.filter((event) => event.method === 'Runtime.exceptionThrown').length, 0);
      assert.equal(await (await import('node:fs/promises')).readFile(file, 'latin1'), source);
    } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
  });
