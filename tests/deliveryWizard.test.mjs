import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { deliveryFixture } from './helpers/deliveryFixtures.mjs';
import { recordDeliveryDownload, getDeliveryGmiBytes } from '../src/lib/delivery/index.mjs';
import { createGmiObjectCorrection } from '../src/lib/gmi-edit/index.mjs';
import { GMIParser } from '../src/lib/parsing/gmiParser.js';
import { decodeGmiBytes } from '../src/lib/parsing/gmiDecoding.js';
import { DELIVERY_WIZARD_START, deliveryWizardReducer as reduce, deliveryWizardStatus, deliverySummary,
  deliveryContents, deliveryReport, deliveryReportChanges, deliveryReviewSummary, deliveryPackageFacts, deliveryReviewStatus, deliveryMessage, deliveryDiagnostics, initiateDeliveryDownload } from '../src/lib/delivery/deliveryWizard.mjs';

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

test('adjacent package back keeps the exact verified plan; content back requires a fresh review', async () => {
  const f = await deliveryFixture();
  try {
    const plan = await f.plan(), review = { plan, snapshot: f.capture() };
    let state = reduce(DELIVERY_WIZARD_START, { type: 'build', run: 1 });
    state = reduce(state, { type: 'built', run: 1, review });
    state = reduce(state, { type: 'package', run: 1 });
    state = reduce(state, { type: 'review', run: 1 });
    assert.equal(state.step, 'review'); assert.strictEqual(state.review, review);
    assert.strictEqual(state.review.plan, plan); assert.equal(deliveryWizardStatus(state), 'ready');
    state = reduce(state, { type: 'back' });
    assert.equal(state.step, 'content'); assert.equal(state.review, null);
    assert.strictEqual(reduce(state, { type: 'package', run: state.run }), state);
    state = reduce(state, { type: 'build', run: state.run + 1 });
    assert.equal(state.phase, 'building'); assert.equal(state.review, null);
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
    assert.equal(summary.Bildelenker, '1 beholdes i GMI · 1 overføres til GML · 0 fjernet (ikke med)');
    assert.equal(summary.GML, '1 post i GML'); assert.equal(summary.Vedlegg, '1 fil');
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

// A3: report identities are the parser's object numbers and GUIDs, never array
// positions. Object numbers deliberately differ from 1-based positions.
const SHARED_LINK = 'h:1(link:"Attachments\\shared.png") ';
const NUMBERED = {
  points: [{ number: 101, hyperlink: SHARED_LINK }, { number: 7, hyperlink: SHARED_LINK }, { number: 267, hyperlink: '' }],
  lines: [{ number: 38, hyperlink: '' }, { number: 43, hyperlink: '' }],
};
const stageNumbered = (f) => {
  for (const [scope, sourceIndex] of [['point', 2], ['line', 0], ['line', 1]]) {
    const session = f.registry.getSession(f.handle).session;
    const result = createGmiObjectCorrection(session, { scope, sourceIndex, values: { Merknad: `Rettet ${scope} ${sourceIndex}` },
      mode: 'overwrite', label: 'Synthetic numbered correction' });
    assert(result.ok, JSON.stringify(result)); assert(f.registry.stage(f.handle, result.changeSet).ok);
  }
};
const exportedObjects = (plan) => {
  const data = new GMIParser(decodeGmiBytes(getDeliveryGmiBytes(plan))).toObject();
  return { point: data.points, line: data.lines };
};
const assertIdentitiesMatchExport = (plan, lines) => {
  const objects = exportedObjects(plan);
  for (const item of plan.gmiSummary.diff?.changes ?? plan.gmiSummary.changes) {
    const object = objects[item.scope][item.sourceIndex];
    assert.equal(item.objectId, object.id); assert.equal(item.guid, object.guid);
    assert(lines.some((text) => text.startsWith(`${item.scope === 'line' ? 'Ledning' : 'Punkt'} ${object.id} (GUID ${object.guid}) · ${item.field}:`)),
      `${item.scope} ${object.id} missing from report`);
  }
};

test('A3: Kun GMI report names objects by GMI object number and GUID, checked against the exported GMI', async () => {
  const f = await deliveryFixture(NUMBERED);
  try {
    stageNumbered(f);
    const plan = await f.plan('gmi-only');
    assert.equal(plan.status, 'ready', JSON.stringify(plan.errors));
    const report = deliveryReport({ plan, snapshot: f.capture('gmi-only') }).split('\r\n');
    const { fields, hyperlinks } = deliveryReportChanges(plan);
    assert.equal(fields.length, 3); assert.deepEqual(hyperlinks, []);
    assert(fields.some((text) => /^Punkt 267 \(GUID [0-9a-f-]+\) · Merknad: Punkt 3 → Rettet point 2$/.test(text)), fields.join('\n'));
    assert(fields.some((text) => text.startsWith('Ledning 38 (GUID ')));
    assert(fields.some((text) => text.startsWith('Ledning 43 (GUID ')));
    // Positions (Punkt 3, Ledning 1/2) must never be used as identities.
    assert(!report.some((text) => /^(Punkt 3|Ledning 1|Ledning 2)\b/.test(text)), report.join('\n'));
    assert(!report.includes('Bildelenker endret:'));
    assertIdentitiesMatchExport(plan, fields);
  } finally { f.session.clear(); }
});

test('A3: Samlet levering lists field corrections and S_HYPERLINK changes separately, with exported identities', async () => {
  const f = await deliveryFixture(NUMBERED);
  try {
    f.transfer(); stageNumbered(f);
    const plan = await f.plan('combined');
    assert.equal(plan.status, 'ready', JSON.stringify(plan.errors));
    const report = deliveryReport({ plan, snapshot: f.capture('combined') }).split('\r\n');
    const { fields, hyperlinks } = deliveryReportChanges(plan);
    assert.equal(fields.length, 3);
    assert(fields.every((text) => !text.includes('S_HYPERLINK')));
    assert.equal(hyperlinks.length, 1); assert.match(hyperlinks[0], /^Punkt (101|7) \(GUID [0-9a-f-]+\) · S_HYPERLINK: /);
    const fieldsAt = report.indexOf('Feltendringer:'), linksAt = report.indexOf('Bildelenker endret:');
    assert(fieldsAt >= 0 && linksAt > fieldsAt);
    assert.deepEqual(report.slice(fieldsAt + 1, fieldsAt + 1 + fields.length), fields);
    assert.deepEqual(report.slice(linksAt + 1), hyperlinks);
    assertIdentitiesMatchExport(plan, [...fields, ...hyperlinks]);
  } finally { f.session.clear(); }
});

test('A3: objects without a GMI number fall back to their file position, and a missing GUID is omitted', () => {
  const plan = { gmiSummary: { changes: [
    { scope: 'point', sourceIndex: 4, objectId: null, guid: null, field: 'Merknad', original: 'a', proposed: 'b' },
    { scope: 'line', sourceIndex: 0, objectId: Number.NaN, guid: 'g-1', field: 'S_HYPERLINK', original: 'h:1(x)', proposed: '' },
  ] } };
  assert.deepEqual(deliveryReportChanges(plan), {
    fields: ['Punkt nr. 5 i filen · Merknad: a → b'],
    hyperlinks: ['Ledning nr. 1 i filen (GUID g-1) · S_HYPERLINK: h:1(x) → '],
  });
});

test('A4: Kontroll summary omits the filename; Pakke gets one compact package line and one Kontroll status line', async () => {
  const f = await deliveryFixture();
  try {
    f.transfer(); f.stage();
    for (const mode of ['gmi-only', 'photos-only', 'combined']) {
      const plan = await f.plan(mode);
      assert.equal(plan.status, 'ready', JSON.stringify(plan.errors));
      const review = { plan, snapshot: f.capture(mode), fieldCount: 1 };
      const labels = deliveryReviewSummary(review).map(([label]) => label);
      assert.deepEqual(labels, ['Leveranse', 'Rettinger', 'Bildelenker', 'Bilder', ...(mode === 'combined' ? ['Plasseringer'] : []), 'GML', 'Vedlegg', ...(mode === 'combined' ? ['Ikke valgt'] : [])]);
      assert(deliverySummary(review).some(([label]) => label === 'Filnavn'), 'the report keeps the filename');
      const facts = deliveryPackageFacts(plan);
      assert.equal(facts[0], `${deliveryContents(plan).length} ${deliveryContents(plan).length === 1 ? 'fil' : 'filer'}`);
      assert.equal(facts.some((text) => / i GML$/.test(text)), Boolean(plan.photoPlan), mode);
      assert.match(deliveryReviewStatus(plan), /^Kontroll fullført · /);
    }
  } finally { f.session.clear(); }
  // Informational items are folded in Kontroll and are not counted as notes.
  const info = { code: 'shared-attachments' }, warning = { code: 'photo-linked-elsewhere' };
  assert.equal(deliveryReviewStatus({ errors: [], warnings: [] }), 'Kontroll fullført · ingen merknader');
  assert.equal(deliveryReviewStatus({ errors: [], warnings: [info] }), 'Kontroll fullført · ingen merknader');
  assert.equal(deliveryReviewStatus({ errors: [], warnings: [warning, info] }), 'Kontroll fullført · 1 merknad');
  assert.equal(deliveryReviewStatus({ errors: [], warnings: [warning] }, 1), 'Kontroll fullført · 2 merknader');
});
