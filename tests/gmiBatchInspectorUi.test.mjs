import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { gmiEditBatchFixture } from './helpers/gmiEditBatchFixture.mjs';

const app = process.env.PHOTO_UI_URL;
const inspector = `document.querySelector('[data-gmi-batch-inspector]')`;
const workspace = `document.querySelector('.gmi-edit-workspace')`;
const grid = `document.querySelector('[role=grid]')`;
const bar = `document.querySelector('[data-gmi-selection-bar]')`;
const confirm = `document.querySelector('dialog[open][data-gmi-confirm=workspace]')`;
const box = (index) => `${grid}.querySelector('[data-table-row="${index}"] input[type=checkbox]')`;
const row = (index) => `${grid}.querySelector('[data-table-row="${index}"]')`;

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
    const input = (element, value) => browser.evaluate(`(() => { const input = ${element}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    const select = (value) => browser.evaluate(`(() => { const select = ${inspector}.querySelector('select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(value)}); select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    const text = () => browser.evaluate(`${inspector}.innerText`);
    const stageDisabled = () => browser.evaluate(`Array.from(${inspector}.querySelectorAll('button')).find(e => e.innerText === 'Legg til masseendring').disabled`);
    const calculate = async () => {
      // Stale reviews offer «Oppdater forhåndsvisning» in the summary; otherwise the configuration form.
      const label = await browser.evaluate(`(() => { const b = Array.from(${inspector}.querySelectorAll('button')); return b.some(e => e.innerText === 'Oppdater forhåndsvisning') ? 'Oppdater forhåndsvisning' : b.some(e => e.innerText === 'Forhåndsvis endringer') ? 'Forhåndsvis endringer' : null; })()`);
      if (!label) await click('Endre oppsett', inspector);
      await click(label || 'Oppdater forhåndsvisning', inspector);
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
        assert.equal(await stageDisabled(), true);
        assert.equal(await browser.evaluate(`Boolean(document.querySelector('dialog.gmi-batch-dialog'))`), false);
      });

      await t.test('field, value and mode changes; lexeme rejection; exact review and shrinking without recomputation', async () => {
        await select('pressureClass'); await input(`${inspector}.querySelector('[aria-label="Ny verdi"]')`, 'PN16');
        await browser.evaluate(`${inspector}.querySelectorAll('input[type=radio]')[1].click()`);
        assert.equal(await browser.evaluate(`${inspector}.querySelectorAll('input[type=radio]')[1].checked`), true);
        await browser.evaluate(`${inspector}.querySelectorAll('input[type=radio]')[0].click()`);
        await select('sdr');
        await input(`${inspector}.querySelector('[aria-label="Ny verdi"]')`, 'a;b');
        assert.match(await text(), /Semikolon/);
        await input(`${inspector}.querySelector('[aria-label="Ny verdi"]')`, '11'); await calculate();
        assert.match(await text(), /2 av 2 ledninger endres/); assert.match(await text(), /0 nye FEIL/);
        assert.equal(await browser.evaluate(`${grid}.getAttribute('aria-rowcount')`), '3');
        assert.match(await browser.evaluate(`${row(0)}.innerText`), /Endres/);
        assert.match(await browser.evaluate(`${row(0)}.innerText`), /tom\s*→[\s\S]*11/);
        await browser.evaluate(`${box(1)}.click()`);
        await browser.waitFor(`${inspector}.innerText.includes('1 av 1 ledning endres')`);
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
        await click('Tilbake til masseendringen', inspector);
        await click('Legg til masseendring', inspector);
        const risk = `document.querySelector('dialog[open][data-gmi-confirm=batch-risk]')`;
        await browser.waitFor(risk); assert.match(await browser.evaluate(`${risk}.innerText`), /1 manuelt inkludert/);
        await click('Tilbake til utvalget', risk); await click('Legg til masseendring', inspector); await browser.waitFor(risk);
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
        await input(`${inspector}.querySelector('[aria-label="Ny verdi"]')`, '17');
        await browser.evaluate(`${inspector}.querySelectorAll('input[type=radio]')[1].click()`); await calculate();
        await click('Angre siste retting', workspace);
        await browser.waitFor(`${inspector}.innerText.includes('rettingene er endret')`); assert.equal(await stageDisabled(), true);
        assert.equal(await browser.evaluate(`${inspector}.querySelector('[data-gmi-batch-counts]').dataset.state`), 'stale');
        await click('Gjør om retting', workspace); assert.equal(await stageDisabled(), true);
        await click('Avslutt', inspector); await browser.waitFor(confirm); await click('Avbryt', confirm);
        assert.equal(await browser.evaluate(`${inspector}.querySelector('.gmi-batch-proposal-value').innerText.trim()`), '17');
        await click('Endre oppsett', inspector);
        assert.equal(await browser.evaluate(`${inspector}.querySelector('[aria-label="Ny verdi"]').value`), '17');
        await click('Avslutt', inspector); await browser.waitFor(confirm); await click('Forkast skjemaet', confirm);
        await browser.waitFor(`!${inspector}`);
      });

      await t.test('points explain line-only support; modal remains independently available', async () => {
        await click('Fjern utvalg', bar); await click('Punkter', `document.querySelector('[data-table-geometry]')`);
        await browser.waitFor(box(0)); await browser.evaluate(`${box(0)}.click()`);
        await click('Rediger valgte (1)', bar); await browser.waitFor(inspector);
        assert.match(await text(), /støttes bare for ledninger/); assert.equal(await stageDisabled(), true);
        await click('Avslutt', inspector); await browser.waitFor(`!${inspector}`);
        await click('Masseendringer', workspace); await browser.waitFor(`document.querySelector('dialog[open].gmi-batch-dialog')`);
        assert.equal(await browser.evaluate(`Boolean(${inspector})`), false);
        await click('Avbryt', `document.querySelector('dialog[open].gmi-batch-dialog')`);
      });

      await t.test('expanded table shows ten rows at all required viewports and reverses without losing draft', async () => {
        await click('Fjern utvalg', bar); await click('Ledninger', `document.querySelector('[data-table-geometry]')`);
        await browser.waitFor(box(0));
        await browser.evaluate(`${grid}.querySelector('[role=columnheader] input').click()`);
        await click('Rediger valgte (24)', bar); await browser.waitFor(inspector);
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
