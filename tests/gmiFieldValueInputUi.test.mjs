import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromePath, openTestChrome } from './helpers/chromeHarness.mjs';
import { setPhotoFiles } from './helpers/photoSourceWorkflow.mjs';
import { clickGmiTableObject } from './helpers/gmiTableNavigation.mjs';
import { gmiFieldBatchFixture } from './helpers/gmiFieldBatchFixture.mjs';
import { loadGmiDocument, verifyCellChanges } from './helpers/gmiEditHarness.mjs';

const app = process.env.PHOTO_UI_URL;
const editor = `document.querySelector('[data-gmi-object]')`, workspace = `document.querySelector('.gmi-edit-workspace')`;
const row = (field) => `${editor}.querySelector('tr[data-field="${field}"]')`;
const value = (field) => `${row(field)}.querySelector('input, select')`;
const review = `${editor}.querySelector('.gmi-edit-review')`;

test('G5 D1/D2 production: authoritative controls, exact lexemes, keyboard search, review FEIL gate and exported bytes',
  { skip: !app || !chromePath, timeout: 180000 }, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'gmi-g5-ui-'));
    const file = path.join(directory, 'Synthetic G5.gmi'), downloads = path.join(directory, 'downloads');
    await mkdir(downloads);
    const bytes = gmiFieldBatchFixture({
      pointFields: ['Tema', 'InnvendigUtvendig', 'Type', 'Kumform', 'Merknad', 'Bredde', 'Datafangstdato'],
      points: [['LOK', '', '', '', '', '650', ''], ['LOK', ' id ', 'unlisted-original', '', '', '650', '']],
    });
    await writeFile(file, bytes);
    const browser = await openTestChrome();
    const click = (label, root = editor) => browser.evaluate(`(() => {
      const b = Array.from((${root}).querySelectorAll('button')).find(e => e.innerText.trim() === ${JSON.stringify(label)} || e.getAttribute('aria-label') === ${JSON.stringify(label)});
      if (!b || b.disabled) throw new Error('Unavailable: ' + ${JSON.stringify(label)}); b.click();
    })()`);
    const change = (field, text) => browser.evaluate(`(() => {
      const e = ${value(field)}, select = e.tagName === 'SELECT';
      Object.getOwnPropertyDescriptor(select ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(text)});
      e.dispatchEvent(new Event(select ? 'change' : 'input', { bubbles: true }));
    })()`);
    const key = async (name, code) => {
      await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name, windowsVirtualKeyCode: code });
      await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: code });
    };
    const select = async (object) => { await clickGmiTableObject(browser, object); await browser.waitFor(`${editor}?.dataset.gmiObject === ${JSON.stringify(object)}`); };
    const confirmForm = () => browser.evaluate(`Array.from(${editor}.querySelectorAll('.gmi-edit-form .gmi-edit-confirm input')).filter(e => !e.checked).forEach(e => e.click())`);
    const openReview = async (count = 1) => { await confirmForm(); await click(`Se gjennom (${count})`); await browser.waitFor(review); };
    const stage = async () => { await click('Legg til retting'); await browser.waitFor(`!${review}`); };
    const custom = async (field) => {
      const option = await browser.evaluate(`Array.from(${value(field)}.options).find(o => o.textContent === 'Annen verdi…').value`);
      await change(field, option); await browser.waitFor(`${row(field)}.querySelector('input')`);
    };
    const exportBytes = async () => {
      await browser.evaluate(`${workspace}.querySelector('.gmi-edit-download').click()`);
      const dialog = `document.querySelector('dialog[open].delivery-wizard')`;
      await browser.waitFor(dialog); await click('Kontroller leveransen', dialog);
      await browser.waitFor(`${dialog}.dataset.exportPhase === 'ready'`);
      await click('Til pakke', dialog); await click('Last ned GMI', dialog);
      await browser.waitFor(`${dialog}?.dataset.exportPhase === 'done'`);
      const filename = await browser.evaluate(`${dialog}.querySelector('[data-downloaded-filename]').innerText`);
      for (let attempt = 0; attempt < 100; attempt++) {
        if ((await readdir(downloads)).includes(filename)) {
          const output = new Uint8Array(await readFile(path.join(downloads, filename)));
          await click('Lukk', dialog); return output;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error('No verified GMI download');
    };
    try {
      await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
      await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear(); window.confirm = () => true;' });
      await browser.send('Page.navigate', { url: `${app}?testmodus=1` });
      await browser.waitFor('document.querySelector("button[aria-label=Lukk]")'); await click('Lukk', 'document');
      await setPhotoFiles(browser, 'input[type=file]', [file]);
      await browser.waitFor('document.querySelector("[data-gmi-edit-action]")');
      await browser.evaluate('document.querySelector("[data-gmi-edit-action]").click()');
      await browser.waitFor(`${workspace}.querySelector('[data-gmi-edit-status]')?.innerText === 'Redigerbar'`);

      await t.test('out-of-list originals remain exact, untouched, and navigable without a draft guard', async () => {
        await select('point:1');
        assert.equal(await browser.evaluate(`${value('InnvendigUtvendig')}.value`), ' id ');
        assert.match(await browser.evaluate(`${value('InnvendigUtvendig')}.selectedOptions[0].textContent`), / id .*ikke i kodelisten/);
        assert.equal(await browser.evaluate(`${value('Type')}.value`), 'unlisted-original');
        await browser.evaluate(`${value('Type')}.focus()`); await key('Escape', 27);
        assert.equal(await browser.evaluate(`${editor}.querySelectorAll('[data-state=draft]').length`), 0);
        await select('point:0');
        assert.equal(await browser.evaluate(`Boolean(document.querySelector('dialog[open]'))`), false);
      });

      await t.test('point ID/OD show meanings; choosing ID, reviewing, staging and export preserve exact bytes', async () => {
        const options = await browser.evaluate(`Array.from(${value('InnvendigUtvendig')}.options).map(o => [o.value, o.textContent])`);
        assert.deepEqual(options.filter(([code]) => ['ID', 'OD'].includes(code)).map(([code]) => code), ['ID', 'OD']);
        assert(options.some(([code, label]) => code === 'ID' && label.includes('Innvendig')));
        assert(options.some(([code, label]) => code === 'OD' && label.includes('Utvendig')));
        await browser.evaluate(`${value('InnvendigUtvendig')}.focus()`); await key('Home', 36); await key('ArrowDown', 40); await key('Tab', 9);
        assert.equal(await browser.evaluate(`${value('InnvendigUtvendig')}.value`), 'ID');
        await openReview(); assert.equal(await browser.evaluate(`Boolean(${editor}.querySelector('[data-gmi-new-errors]'))`), false);
        await stage();
        const output = await exportBytes();
        assert.deepEqual(verifyCellChanges(loadGmiDocument(bytes), output, [{ scope: 'point', sourceIndex: 0, field: 'InnvendigUtvendig', lexeme: 'ID' }]).failures, []);
        await click('Bruk original', row('InnvendigUtvendig'));
        assert.equal(await browser.evaluate(`${value('InnvendigUtvendig')}.value`), '');
        await click('Angre skrivingen i InnvendigUtvendig');
        assert.equal(await browser.evaluate(`${value('InnvendigUtvendig')}.value`), 'ID');
      });

      await t.test('custom short values uppercase only typed drafts and keep undo/reset intact', async () => {
        await custom('InnvendigUtvendig');
        assert.equal(await browser.evaluate(`${editor}.querySelectorAll('[data-state=draft]').length`), 0, 'changing control mode alone is not a draft');
        await change('InnvendigUtvendig', 'od');
        assert.equal(await browser.evaluate(`${value('InnvendigUtvendig')}.value`), 'OD');
        await click('Angre skrivingen i InnvendigUtvendig');
        assert.equal(await browser.evaluate(`${value('InnvendigUtvendig')}.value`), 'ID');
        await click('Vis kodeliste', row('InnvendigUtvendig'));
      });

      await t.test('long lists search meaning and code, select by keyboard, and preserve existing draft guards', async () => {
        await browser.evaluate(`${value('Type')}.focus()`); await change('Type', 'bremsekum');
        const list = `${row('Type')}.querySelector('[role=listbox]')`;
        await browser.waitFor(list); assert.match(await browser.evaluate(`${list}.innerText`), /KBRE.*Bremsekum/);
        assert.equal(await browser.evaluate(`${value('Type')}.getAttribute('role')`), 'combobox');
        await key('ArrowDown', 40);
        assert(await browser.evaluate(`document.getElementById(${value('Type')}.getAttribute('aria-activedescendant')) !== null`));
        await key('Enter', 13); assert.equal(await browser.evaluate(`${value('Type')}.value`), 'KBRE');
        assert.equal(await browser.evaluate(`${value('Type')}.getAttribute('aria-expanded')`), 'false');
        await clickGmiTableObject(browser, 'point:1');
        const guard = `document.querySelector('dialog[open][data-gmi-confirm=workspace]')`;
        await browser.waitFor(guard); await click('Avbryt', guard);
        assert.equal(await browser.evaluate(`${value('Type')}.value`), 'KBRE');
        await click('Angre skrivingen i Type');
        await browser.evaluate(`${value('Type')}.focus()`); await change('Type', 'kbre'); await key('ArrowDown', 40); await key('Enter', 13);
        assert.equal(await browser.evaluate(`${value('Type')}.value`), 'KBRE');
        await click('Angre skrivingen i Type');
      });

      await t.test('numeric, date and free-text controls retain typed lexemes; laptop layout and list scrolling work', async () => {
        assert.equal(await browser.evaluate(`${value('Bredde')}.inputMode`), 'numeric');
        await change('Bredde', '0650'); assert.equal(await browser.evaluate(`${value('Bredde')}.value`), '0650');
        await change('Datafangstdato', '20261112'); assert.equal(await browser.evaluate(`${value('Datafangstdato')}.type`), 'text');
        assert.equal(await browser.evaluate(`${value('Datafangstdato')}.value`), '20261112');
        await change('Merknad', 'Blandet tekst'); assert.equal(await browser.evaluate(`${value('Merknad')}.value`), 'Blandet tekst');
        await click('Forkast skjema');
        for (const [width, height] of [[1280, 720], [1366, 768]]) {
          await browser.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
          await browser.evaluate(`${value('Type')}.focus()`);
          await key('ArrowDown', 40); await key('ArrowDown', 40);
          assert(await browser.evaluate(`document.documentElement.scrollWidth <= ${width}`));
          assert(await browser.evaluate(`(() => { const l=${row('Type')}.querySelector('[role=listbox]'); return l.scrollHeight > l.clientHeight && l.clientHeight <= 160; })()`));
          const { data } = await browser.send('Page.captureScreenshot', { format: 'png' });
          await writeFile(path.join(tmpdir(), `gmi-g5-controls-${width}x${height}.png`), Buffer.from(data, 'base64'));
          await key('Escape', 27);
        }
      });

      await t.test('new FEIL requires a review-specific confirmation; returning to the form resets approval', async () => {
        await custom('InnvendigUtvendig'); await change('InnvendigUtvendig', 'ugyldig'); await openReview();
        const stageDisabled = () => browser.evaluate(`Array.from(${review}.querySelectorAll('button')).find(b => b.innerText === 'Legg til retting').disabled`);
        assert.equal(await stageDisabled(), true);
        const confirmation = `${review}.querySelector('[data-gmi-new-errors] input')`;
        assert.match(await browser.evaluate(`${review}.innerText`), /Legg til selv om Validator gir ny FEIL/);
        await browser.evaluate(`${confirmation}.click()`); assert.equal(await stageDisabled(), false);
        await click('Tilbake'); await openReview(); assert.equal(await stageDisabled(), true);
        await browser.evaluate(`${review}.querySelector('[data-gmi-new-errors] input').click()`); await stage();
        assert.equal(await browser.evaluate(`${value('InnvendigUtvendig')}.value`), 'UGYLDIG');
      });

      await t.test('restoring an out-of-list original preserves its case and spaces without control normalization', async () => {
        await select('point:1'); await change('InnvendigUtvendig', 'OD'); await openReview(); await stage();
        await click('Bruk original', row('InnvendigUtvendig'));
        assert.equal(await browser.evaluate(`${value('InnvendigUtvendig')}.value`), ' id ');
        await click('Angre skrivingen i InnvendigUtvendig');
        assert.equal(await browser.evaluate(`${value('InnvendigUtvendig')}.value`), 'OD');
      });
      assert.deepEqual(new Uint8Array(await readFile(file)), bytes);
      assert.equal(browser.events.filter(e => e.method === 'Runtime.exceptionThrown').length, 0);
    } finally { await browser.close(); await rm(directory, { recursive: true, force: true }); }
  });
