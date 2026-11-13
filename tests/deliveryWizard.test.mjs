import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { deliveryFixture } from './helpers/deliveryFixtures.mjs';
import { recordDeliveryDownload } from '../src/lib/delivery/index.mjs';
import { DELIVERY_WIZARD_START, deliveryWizardReducer as reduce, deliveryWizardStatus, deliverySummary,
  deliveryContents, deliveryReport, deliveryMessage, deliveryDiagnostics, initiateDeliveryDownload } from '../src/lib/delivery/deliveryWizard.mjs';

test('all four mode reviews describe the actual M9 artifact, correction choice and original-source safety', async () => {
  const f = await deliveryFixture();
  try {
    f.transfer(); f.stage();
    for (const mode of ['gmi-only', 'photos-only', 'split', 'combined']) {
      const snapshot = f.capture(mode, { includeFieldChanges: false });
      const plan = await f.plan(mode, {}, { includeFieldChanges: false });
      assert.equal(plan.status, 'ready', JSON.stringify(plan.errors));
      const review = { plan, snapshot, fieldCount: 1 };
      const summary = Object.fromEntries(deliverySummary(review));
      if (mode === 'split') assert.match(summary.Rettinger, /1 feltretting utelates.*uttrykkelig/);
      if (['combined', 'gmi-only'].includes(mode)) assert.match(summary.Rettinger, /1 feltretting tas med/);
      let blob, filename;
      const result = await initiateDeliveryDownload(plan, { save: (value, name) => { blob = value; filename = name; } });
      assert(result.started); assert.equal(filename, plan.filename);
      if (mode !== 'gmi-only') assert.deepEqual(Object.keys(unzipSync(new Uint8Array(await blob.arrayBuffer()))), deliveryContents(plan));
      else assert.deepEqual(deliveryContents(plan), [plan.naming.gmiFilename]);
      const report = deliveryReport(review);
      assert(report.includes(plan.filename)); assert(report.includes('ikke en ny Validator-kjøring'));
      assert(!deliveryContents(plan).some((name) => /rapport|manifest/.test(name)));
    }
    assert.deepEqual(new Uint8Array(await f.file.arrayBuffer()), f.bytes);
  } finally { f.session.clear(); }
});

test('step transitions cannot bypass M9 blockers or retain a review after returning to content', async () => {
  const f = await deliveryFixture();
  try {
    f.stage();
    const plan = await f.plan('split');
    let state = reduce(DELIVERY_WIZARD_START, { type: 'build', run: 1 });
    assert.equal(state.step, 'review'); assert.equal(state.phase, 'building');
    assert.equal(reduce(state, { type: 'built', run: 0, review: {} }), state);
    state = reduce(state, { type: 'built', run: 1, review: { plan, snapshot: f.capture('split'), fieldCount: 1 } });
    assert.equal(deliveryWizardStatus(state), 'blocked');
    assert.equal(reduce(state, { type: 'package', run: 1 }), state);
    state = reduce(state, { type: 'back' });
    assert.equal(state.step, 'content'); assert.equal(state.review, null);
    assert.equal(reduce(state, { type: 'built', run: 1, review: {} }), state);
    assert.match(deliveryMessage(plan.errors[0]), /Bekreft/);
  } finally { f.session.clear(); }
});

test('review, download failure, retry and staleness preserve meaningful state and cannot auto-download', async () => {
  const f = await deliveryFixture();
  try {
    const plan = await f.plan();
    let state = reduce(DELIVERY_WIZARD_START, { type: 'build', run: 1 });
    state = reduce(state, { type: 'built', run: 1, review: { plan, snapshot: f.capture() } });
    assert.equal(deliveryWizardStatus(state), 'ready');
    state = reduce(state, { type: 'package', run: 1 }); assert.equal(state.step, 'package');
    state = reduce(state, { type: 'download', run: 1 });
    assert.equal(reduce(state, { type: 'back' }), state);
    state = reduce(state, { type: 'download-failed', run: 1, error: 'Synthetic failure' });
    assert.equal(deliveryWizardStatus(state), 'download-failed');
    state = reduce(state, { type: 'download', run: 1 });
    state = reduce(state, { type: 'downloaded', run: 1, recorded: true });
    assert.equal(deliveryWizardStatus(state), 'done');
    f.stage(); assert.equal(deliveryWizardStatus(state), 'stale');
    assert.equal(reduce(state, { type: 'download', run: 1 }), state);
  } finally { f.session.clear(); }
});

test('planning, packaging failures, initiation failures, report downloads and cancelled work never clear field guards', async () => {
  for (const failure of ['package', 'save', 'closed']) {
    const f = await deliveryFixture();
    try {
      f.stage(); const plan = await f.plan('gmi-only');
      assert(f.registry.hasUnsavedChanges());
      deliveryReport({ plan, snapshot: f.capture('gmi-only') }); assert(f.registry.hasUnsavedChanges());
      const run = initiateDeliveryDownload(plan, { save: () => { if (failure === 'save') throw new Error('Blocked browser download'); },
        isActive: () => failure !== 'closed', ...(failure === 'package' ? { buildPackage: async () => { throw new Error('Synthetic packaging failure'); } } : {}) });
      if (failure === 'closed') assert.equal((await run).started, false); else await assert.rejects(run);
      assert(f.registry.hasUnsavedChanges());
    } finally { f.session.clear(); }
  }
});

test('only a successfully initiated A/D artifact records the captured field state, never B/C', async () => {
  for (const mode of ['gmi-only', 'photos-only', 'split', 'combined']) {
    const f = await deliveryFixture();
    try {
      f.stage(); const session = f.registry.getSession(f.handle).session;
      const plan = await f.plan(mode, {}, { includeFieldChanges: false });
      let handedOff = false;
      await initiateDeliveryDownload(plan, { save: () => { assert(f.registry.hasUnsavedChanges()); handedOff = true; },
        recordDownload: (value) => { assert(handedOff); return recordDeliveryDownload(value); } });
      assert.equal(f.registry.hasUnsavedChanges(), !['gmi-only', 'combined'].includes(mode));
      assert.equal(f.registry.getSession(f.handle).session, session);
    } finally { f.session.clear(); }
  }
});

test('file verification failure requires renewed review and a handoff-time edit keeps the new state unsaved', async () => {
  const f = await deliveryFixture();
  try {
    f.stage(); const plan = await f.plan('gmi-only');
    const result = await initiateDeliveryDownload(plan, { save: () => { f.registry.undo(f.handle); } });
    assert(result.started); assert.equal(result.recorded, false);
    const review = { plan, snapshot: f.capture('gmi-only') };
    const state = reduce({ ...DELIVERY_WIZARD_START, run: 1, step: 'package', phase: 'packaging', review }, { type: 'invalidate', run: 1 });
    assert.equal(deliveryWizardStatus(state), 'stale');
    assert.equal(reduce(state, { type: 'download', run: 1 }), state);
  } finally { f.session.clear(); }
});

test('shared photo review counts retained and transferred references independently; blockers have actionable Norwegian text', async () => {
  const f = await deliveryFixture();
  try {
    f.transfer(); const plan = await f.plan();
    const summary = Object.fromEntries(deliverySummary({ plan, snapshot: f.capture() }));
    assert.equal(summary.Bildelenker, '1 beholdes i GMI · 1 overføres');
    assert.equal(summary.FOTO, '1 post i GML'); assert.equal(summary.Vedlegg, '1 fil');
    assert(deliveryDiagnostics(plan).warnings.some((item) => item.code === 'photo-linked-elsewhere'));
    assert.match(deliveryMessage('retained-photo-unresolved'), /Last inn riktig bilde/);
    assert.match(deliveryMessage('invalid-gml'), /Ingen bildelenker fjernes/);
    assert.match(deliveryMessage('selected-photo-not-exported'), /Godkjenn plassering/);
    f.stage(); await assert.rejects(initiateDeliveryDownload(plan, { save: () => assert.fail('stale download') }), { code: 'stale-plan' });
  } finally { f.session.clear(); }
});

test('both entry points use the one wizard and contextual redo changes only typography', async () => {
  for (const name of ['photos/PhotoExportWizard.js', 'gmi-edit/GmiExportDialog.js']) {
    const source = await readFile(new URL(`../src/components/${name}`, import.meta.url), 'utf8');
    assert(source.includes('DeliveryWizard'));
    assert.doesNotMatch(source, /buildPhotoExportPackage|buildGmiFieldExport|serializePhotoExport/);
  }
  const css = await readFile(new URL('../src/components/gmi-edit/gmiEdit.css', import.meta.url), 'utf8');
  const rule = css.match(/\[data-gmi-context-redo\]\.gmi-edit-link \{([^}]+)\}/)[1];
  assert.match(rule, /font-weight: 400/); assert.match(rule, /font-size: 12px/); assert.match(rule, /cursor: pointer/);
  assert(css.includes('[data-gmi-context-redo].gmi-edit-link:focus-visible'));
});
