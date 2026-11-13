import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { gmiFieldBatchFixture } from './helpers/gmiFieldBatchFixture.mjs';
import { loadGmiDocument, verifyCellChanges } from './helpers/gmiEditHarness.mjs';
import { getGmiFieldValueDomain } from '../src/lib/validation-v2/fieldValueDomain.js';

const app = process.env.PHOTO_UI_URL;
const inspector = `document.querySelector('[data-gmi-batch-inspector]')`;
const workspace = `document.querySelector('.gmi-edit-workspace')`;
const bar = `document.querySelector('[data-gmi-selection-bar]')`;
const value = `${inspector}.querySelector('[aria-label="Ny verdi"]')`;
const field = `${inspector}.querySelector('[aria-label="Felt for masseendring"]')`;
const risk = `document.querySelector('dialog[open][data-gmi-confirm=batch-risk]')`;
const guard = `document.querySelector('dialog[open][data-gmi-confirm=workspace]')`;

test('G5 D3 production: explicit fields, shared point/line domains, searchable offers, numeric spellings and risk gates',
  { skip: !app || !chromePath, timeout: 180000 }, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gmi-g5-d3-ui-'));
    const file = path.join(directory, 'Synthetic D3.gmi'), downloads = path.join(directory, 'downloads');
    await mkdir(downloads);
    const bytes = gmiFieldBatchFixture({
      pointFields: ['Tema', 'InnvendigUtvendig', 'Type', 'Kumform', 'Merknad', 'Bredde'],
      points: Array.from({ length: 3 }, () => ['LOK', '', '', '', '', '650']),
      lineFields: ['Tema', 'InnvendigUtvendig', 'Material', 'Merknad', 'SDR', 'Trykklasse', 'Ringstivhet', 'Dimensjon'],
      lines: [['VL', '', 'PE', '', '', '', '', '160'], ['VL', '', 'PE', '', '', '', '', '200']],
    });
    await writeFile(file, bytes);
    const browser = await openTestChrome();
    const click = (label, root = inspector) => browser.evaluate(`(() => {
      const b=Array.from((${root}).querySelectorAll('button')).find(e => e.innerText.trim() === ${JSON.stringify(label)} || e.getAttribute('aria-label') === ${JSON.stringify(label)});
      if (!b || b.disabled) throw new Error('Unavailable: ' + ${JSON.stringify(label)}); b.click();
    })()`);
    const change = (element, text) => browser.evaluate(`(() => {
      const e=${element}, select=e.tagName === 'SELECT';
      Object.getOwnPropertyDescriptor(select ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(text)});
      e.dispatchEvent(new Event(select ? 'change' : 'input', { bubbles: true }));
    })()`);
    const key = async (name, code) => {
      await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name, windowsVirtualKeyCode: code });
      await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: code });
    };
    const buttonDisabled = (label) => browser.evaluate(`Array.from(${inspector}.querySelectorAll('button')).find(b => b.innerText === ${JSON.stringify(label)}).disabled`);
    const ready = () => browser.waitFor(`${inspector}.getAttribute('aria-busy') === 'false' && ${inspector}.querySelector('[data-gmi-batch-dry-run]')?.innerText.includes('OK')`);
    const preview = async () => { await click('Forhåndsvis endringer'); await ready(); };
    const select = async (scope, indices) => {
      if (await browser.evaluate(`Boolean(${inspector})`)) {
        await click('Avslutt');
        if (await browser.evaluate(`Boolean(${guard})`)) await click('Forkast skjemaet', guard);
      }
      if (await browser.evaluate(`Boolean(${bar})`)) await click('Fjern utvalg', bar);
      await click(scope, `document.querySelector('[data-table-geometry]')`);
      for (const index of indices) await browser.evaluate(`document.querySelector('[data-table-row="${index}"] input[type=checkbox]').click()`);
      await click(`Rediger valgte (${indices.length})`, bar); await browser.waitFor(inspector);
    };
    const custom = async () => {
      const sentinel = await browser.evaluate(`Array.from(${value}.options).find(o => o.textContent === 'Annen verdi…').value`);
      await change(value, sentinel); await browser.waitFor(`${value}.tagName === 'INPUT'`);
    };
    try {
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm=()=>true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")'); await click('Lukk', 'document');
      await setPhotoFiles(browser, 'input[type=file]', [file]);
      await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await browser.evaluate('document.querySelector("[data-gmi-edit-action]").click()');

      await t.test('no default field/value; choosing a field or opening its list leaves the draft guard clean', async () => {
        await select('Punkter', [0, 1]);
        assert.equal(await browser.evaluate(`${field}.value`), '');
        assert.equal(await browser.evaluate(`${field}.selectedOptions[0].textContent`), 'Velg felt…');
        assert.equal(await browser.evaluate(`${value}.value`), '');
        assert.equal(await browser.evaluate(`${value}.disabled`), true);
        assert.equal(await buttonDisabled('Forhåndsvis endringer'), true);
        await change(field, 'Type');
        assert.equal(await browser.evaluate(`${value}.value`), '');
        await browser.evaluate(`${value}.focus()`); await key('Escape', 27);
        assert.equal(await buttonDisabled('Forhåndsvis endringer'), true);
        await click('Avslutt'); await browser.waitFor(`!${inspector}`);
        assert.equal(await browser.evaluate(`Boolean(${guard})`), false);
        await click('Rediger valgte (2)', bar); await browser.waitFor(inspector);
        assert.equal(await browser.evaluate(`${field}.value`), '');
      });

      await t.test('point long-list meaning/code search and short-list custom typing share individual controls', async () => {
        await change(field, 'Type'); await browser.evaluate(`${value}.focus()`); await change(value, 'bremsekum');
        assert.match(await browser.evaluate(`${inspector}.querySelector('[role=listbox]').innerText`), /KBRE.*Bremsekum/);
        await key('ArrowDown', 40); await key('Enter', 13);
        assert.equal(await browser.evaluate(`${value}.value`), 'KBRE');
        await change(field, 'InnvendigUtvendig');
        assert.equal(await browser.evaluate(`${value}.value`), '', 'field changes clear values and control search state');
        const expected = getGmiFieldValueDomain({ canonicalFieldId: 'insideOutside', geometryScope: 'point' }).options;
        const offered = await browser.evaluate(`Array.from(${value}.options).map(o => [o.value, o.textContent])`);
        for (const option of expected) assert(offered.some(([code, text]) => code === option.value && text.includes(option.label)));
        await custom(); await change(value, 'id');
        assert.equal(await browser.evaluate(`${value}.value`), 'ID');
        await preview(); assert.match(await browser.evaluate(`${inspector}.innerText`), /2 av 2 punkter endres/);
        await click('Legg til masseendring'); await browser.waitFor(`${inspector}.dataset.batchStep === '3'`);
        assert.equal(await browser.evaluate(`Boolean(${risk})`), false);
      });

      await t.test('line domains show code meanings and searchable Material at both laptop sizes', async () => {
        await select('Ledninger', [0, 1]); await change(field, 'InnvendigUtvendig');
        const expected = getGmiFieldValueDomain({ canonicalFieldId: 'insideOutside', geometryScope: 'line' }).options;
        const offered = await browser.evaluate(`Array.from(${value}.options).map(o => [o.value, o.textContent])`);
        for (const option of expected) assert(offered.some(([code, text]) => code === option.value && text.includes(option.label)));
        await custom(); await change(field, 'Material');
        assert.equal(await browser.evaluate(`${value}.value`), '', 'new field does not inherit custom text or choose a value');
        assert.equal(await browser.evaluate(`${value}.getAttribute('role')`), 'combobox');
        const material = getGmiFieldValueDomain({ canonicalFieldId: 'material', geometryScope: 'line' }).options.find(o => o.value === 'PE');
        await browser.evaluate(`${value}.focus()`); await change(value, material.label);
        assert.match(await browser.evaluate(`${inspector}.querySelector('[role=listbox]').innerText`), new RegExp(material.value));
        await change(value, 'pe'); assert.equal(await browser.evaluate(`${value}.value`), 'PE');
        await browser.evaluate(`Array.from(${inspector}.querySelectorAll('[role=option]')).find(e => e.innerText.startsWith('PE –')).click()`);
        await change(field, 'InnvendigUtvendig');
        // Switching between offered columns resets the control without inventing a value default.
        await change(field, 'Material'); await browser.evaluate(`${value}.focus()`);
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          await key('ArrowDown', 40);
          assert(await browser.evaluate(`document.documentElement.scrollWidth <= ${width}`));
          const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
          await writeFile(path.join(tmpdir(), `gmi-g5-d3-${width}x${height}.png`), Buffer.from(data, 'base64'));
        }
        await key('Escape', 27);
      });

      await t.test('SDR 11, 11,0 and 11.0 preview without list warnings; staging/export retain exact chosen bytes', async () => {
        await change(field, 'SDR');
        for (const lexeme of ['11', '11,0', '11.0']) {
          await change(value, lexeme);
          assert.equal(await browser.evaluate(`${value}.value`), lexeme);
          assert.equal(await browser.evaluate(`${value}.getAttribute('aria-invalid')`), 'false');
          assert.doesNotMatch(await browser.evaluate(`${inspector}.innerText`), /Velg en verdi fra listen|ikke i kodelisten/);
          assert.equal(await buttonDisabled('Forhåndsvis endringer'), false);
          await preview();
          assert.equal(await browser.evaluate(`${inspector}.querySelector('.gmi-batch-proposal-value').innerText.trim()`), lexeme);
          assert.match(await browser.evaluate(`${inspector}.innerText`), /2 av 2 ledninger endres/);
          if (lexeme !== '11.0') await click('Endre oppsett');
        }
        // B2 (deliberate update): the two lines differ in Material and Dimensjon, so staging needs the risk approval.
        await click('Legg til masseendring'); await browser.waitFor(risk);
        assert.match(await browser.evaluate(`${risk}.innerText`), /Blandet blant objektene som endres: [^.]*Dimensjon/);
        await click('Godkjenn og legg til', risk);
        await browser.waitFor(`${inspector}.dataset.batchStep === '3'`);
        await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
        await browser.evaluate(`${workspace}.querySelector('.gmi-edit-download').click()`);
        const dialog = `document.querySelector('dialog[open].delivery-wizard')`;
        await browser.waitFor(dialog);
        await click('Kontroller leveransen', dialog); await browser.waitFor(`${dialog}.dataset.exportPhase==='ready'`);
        await click('Til pakke', dialog); await click('Last ned GMI', dialog);
        await browser.waitFor(`${dialog}?.dataset.exportPhase === 'done'`);
        const filename = await browser.evaluate(`${dialog}.querySelector('[data-downloaded-filename]').innerText`);
        let output;
        for (let attempt = 0; attempt < 100; attempt++) {
          if ((await readdir(downloads)).includes(filename)) { output = new Uint8Array(await readFile(path.join(downloads, filename))); break; }
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        assert(output);
        const edits = [0, 1].flatMap(sourceIndex => [{ scope: 'point', sourceIndex, field: 'InnvendigUtvendig', lexeme: 'ID' }, { scope: 'line', sourceIndex, field: 'SDR', lexeme: '11.0' }]);
        assert.deepEqual(verifyCellChanges(loadGmiDocument(bytes), output, edits).failures, []);
        await click('Lukk', dialog);
      });

      await t.test('safe custom codes reach Validator/risk approval; unsafe lexemes and dirty drafts remain guarded', async () => {
        await select('Punkter', [2]); await change(field, 'InnvendigUtvendig'); await custom();
        await change(value, 'a;b'); assert.equal(await buttonDisabled('Forhåndsvis endringer'), true);
        assert.match(await browser.evaluate(`${inspector}.querySelector('[role=alert]').innerText`), /Semikolon/);
        await change(value, 'egenkode'); await preview();
        await click('Legg til masseendring'); await browser.waitFor(risk);
        assert.match(await browser.evaluate(`${risk}.innerText`), /FEIL/);
        assert.match(await browser.evaluate(`${risk}.innerText`), /EGENKODE/);
        await click('Tilbake til utvalget', risk);
        await click('Avslutt'); await browser.waitFor(guard); await click('Avbryt', guard);
        assert.match(await browser.evaluate(`${inspector}.innerText`), /EGENKODE/);
      });
      assert.deepEqual(new Uint8Array(await readFile(file)), bytes);
      assert.equal(browser.events.filter(e => e.method === 'Runtime.exceptionThrown').length, 0);
    } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
  });
