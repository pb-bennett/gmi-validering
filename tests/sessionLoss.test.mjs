import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createSessionLossGuard, sessionLossState } from '../src/lib/sessionLoss.mjs';

// Roadmap D: session-loss protection. One consolidated check feeds the native unload warning and the reset dialog.
test('an empty session is not meaningful and gives no items', () => {
  assert.deepEqual(sessionLossState(), { meaningful: false, items: [], summary: '' });
  assert.equal(sessionLossState({ photoLayers: [] }).meaningful, false);
});

test('each meaningful item alone is enough, and the summary names what would be lost (DD1: loaded layers count)', () => {
  const cases = [
    [{ surveyLayers: 2 }, 'survey', '2 kartlag'],
    [{ photoLayers: [{ assetCount: 34, photoCount: 36 }] }, 'photo', '1 fotolag med 34 bilder'],
    [{ photoLayers: [{ photoCount: 0 }] }, 'photo', '1 fotolag med 0 bilder'],
    [{ importPhotos: 1 }, 'import', '1 bilde som ikke er lagt til ennå'],
    [{ wizardChanges: 2 }, 'wizard', 'endringer i kildekontrollen som ikke er lagret'],
    [{ photoEdits: 3 }, 'photo-edits', '3 ulagrede bildeendringer'],
    [{ rettingerLayers: 1 }, 'rettinger', 'ikke nedlastede rettinger i 1 lag'],
  ];
  for (const [input, key, text] of cases) {
    const state = sessionLossState(input);
    assert.equal(state.meaningful, true, key);
    assert.deepEqual(state.items, [{ key, text }]);
  }
  assert.equal(sessionLossState({ surveyLayers: 2, photoLayers: [{ assetCount: 34 }], rettingerLayers: 1 }).summary,
    '2 kartlag · 1 fotolag med 34 bilder · ikke nedlastede rettinger i 1 lag');
});

test('the unload guard attaches one listener only while meaningful and prevents unload only then', () => {
  const listeners = new Set();
  const target = { addEventListener: (type, fn) => { assert.equal(type, 'beforeunload'); listeners.add(fn); },
    removeEventListener: (type, fn) => listeners.delete(fn) };
  const guard = createSessionLossGuard(target);
  guard.update(false);
  assert.equal(listeners.size, 0, 'an empty session keeps normal unload');
  guard.update(true); guard.update(true);
  assert.equal(listeners.size, 1, 'one listener, never duplicated');
  const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, returnValue: undefined };
  guard.listener(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.returnValue, '');
  guard.update(false);
  assert.equal(listeners.size, 0, 'detached again when the session is empty');
  const later = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  guard.listener(later);
  assert.equal(later.defaultPrevented, false);
  guard.update(true); guard.dispose();
  assert.equal(listeners.size, 0);
});

test('the page feeds the check from the existing owners, guards reset and keeps the stronger Rettinger path', async () => {
  const [page, card] = await Promise.all(['app/page.js', 'components/photos/PhotoLayerCard.js']
    .map((file) => readFile(new URL(`../src/${file}`, import.meta.url), 'utf8')));
  assert.match(page, /sessionLossState\(\{\s*surveyLayers: Object\.keys\(surveyLayers \|\| \{\}\)\.length, photoLayers, importPhotos: importDraftPhotos\.length,/);
  assert.match(page, /wizardChanges: Object\.values\(sourceWorkflowDrafts \|\| \{\}\)\.reduce/);
  assert.match(page, /photoEdits: changedIds\.size, rettingerLayers:/);
  assert.match(page, /const guard = createSessionLossGuard\(window\)/);
  assert.match(page, /sessionLossGuard\.current\?\.update\(sessionLoss\.meaningful\)/);
  // An empty session resets at once; otherwise one dialog; staged Rettinger keep «Forkast rettinger og nullstill».
  assert.match(page, /if \(blocked \|\| sessionLoss\.meaningful\) \{ setResetConfirm\(\{ layers: blocked\?\.layers \|\| \[\], items: sessionLoss\.items \}\); return; \}\s*handleReset\(\);/);
  assert.match(page, /confirmLabel=\{resetConfirm\.layers\.length \? 'Forkast rettinger og nullstill' : 'Nullstill'\}/);
  assert.match(page, /onConfirm=\{\(\) => handleReset\(\{ discardGmiEdits: resetConfirm\.layers\.length > 0 \}\)\}/);
  // DD2: a FOTO layer with photographs is removed only through the confirmation dialog.
  assert.match(card, /if \(\(layer\.assetCount \?\? layer\.photoCount\) > 0\) setConfirmRemove\(true\); else photoSession\.deleteLayer\(layer\.id\);/);
  assert.match(card, /<GmiConfirmDialog title="Fjerne fotolaget\?" confirmLabel="Fjern"/);
});
