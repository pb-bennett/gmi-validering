import assert from 'node:assert/strict';
import test from 'node:test';
import { gmiFieldBatchFixture } from './helpers/gmiFieldBatchFixture.mjs';
import { createGmiEditSession, createGmiSourceDocument, loadGmiSourceDocument, getGmiDocumentDataset, getGmiSourceBytes } from '../src/lib/gmi-edit/index.mjs';
import { internalGmiSourceState } from '../src/lib/gmi-edit/sourceDocument.mjs';
import { validatorSelectionHandoff, VALIDATOR_CORRECTION_STALE } from '../src/lib/gmiValidatorEditing.mjs';

async function setup(scope) {
  const bytes = gmiFieldBatchFixture(), document = await loadGmiSourceDocument(bytes);
  const session = createGmiEditSession(document, { layerId: 'synthetic' });
  const handle = { layerId: session.layerId, sessionId: 'live-session', fingerprint: document.fingerprint };
  const view = { session, document, handle }, layer = { id: session.layerId, data: getGmiDocumentDataset(document) };
  const request = { kind: 'validator-selection', scope, keys: [`${scope}:1`, `${scope}:0`], session, document,
    binding: { layerId: layer.id, sessionId: handle.sessionId, fingerprint: handle.fingerprint }, sessionId: handle.sessionId,
    provenance: { canonicalFieldId: 'anything', fieldLabel: 'Syntetisk felt', ruleIds: ['any-rule'], datasetKind: 'original' } };
  return { bytes, view, layer, request };
}

for (const scope of ['point', 'line']) {
  test(`H3 ${scope}: exact source order/geometry, object or empty batch setup, informational ordinary provenance and intact bytes`, async () => {
    const { bytes, view, layer, request } = await setup(scope);
    const result = validatorSelectionHandoff(request, view, layer);
    assert.equal(result.ok, true);
    assert.deepEqual(result.selection.keys, request.keys);
    assert.equal(result.selection.scope, scope);
    assert.deepEqual(result.selection.host, { kind: 'rettinger' });
    assert.equal(result.selection.showOnly, true);
    assert.equal(result.selection.origin.kind, 'validator-selection');
    assert.equal(result.handoff.mode, 'batch'); assert.equal(result.handoff.focus, null);
    assert.equal('canonicalFieldId' in result.handoff, false); assert.equal('lexeme' in result.handoff, false);
    assert.equal('preview' in result, false); assert.equal('changeSet' in result, false);
    const single = validatorSelectionHandoff({ ...request, keys: [`${scope}:1`], provenance: { ...request.provenance, datasetKind: 'proposed' } }, view, layer);
    assert.equal(single.handoff.mode, 'object'); assert.equal(single.datasetKind, 'proposed');
    assert.deepEqual(single.handoff.focus, { scope, sourceIndex: 1 }); assert.equal(single.selection.showOnly, false);
    assert.equal(view.session.changeSets.length, 0); assert.deepEqual(getGmiSourceBytes(view.document), bytes);
  });

  test(`H3 ${scope}: refusal matrix for layer/session/document/fingerprint, malformed indices, duplicates and identities`, async () => {
    const { view, layer, request } = await setup(scope), other = scope === 'line' ? 'point' : 'line';
    const refuse = (payload = request, current = view, imported = layer) => {
      assert.deepEqual(validatorSelectionHandoff(payload, current, imported), { ok: false, code: 'stale-session', message: VALIDATOR_CORRECTION_STALE });
    };
    for (const patch of [null, { kind: 'other' }, { scope: other }, { sessionId: 'old' }, { session: { ...view.session } },
      { document: createGmiSourceDocument(gmiFieldBatchFixture()) }, { keys: [] }, { keys: null },
      { keys: [`${scope}:0`, `${scope}:0`] }, { keys: [`${scope}:0`, `${other}:0`] },
      ...[-1, 0.5, 999, '01', 'NaN', '9007199254740992'].map((index) => ({ keys: [`${scope}:${index}`] })),
      { provenance: { ...request.provenance, datasetKind: 'changed' } },
      ...[{ layerId: 'foreign' }, { sessionId: 'old' }, { fingerprint: 'old' }].map((binding) => ({ binding: { ...request.binding, ...binding } }))]) {
      refuse(patch === null ? null : { ...request, ...patch });
    }
    refuse(request, null); refuse(request, view, null);
    refuse(request, view, { ...layer, id: 'other' });
    for (const patch of [{ session: null }, { document: createGmiSourceDocument(gmiFieldBatchFixture()) },
      { handle: { ...view.handle, fingerprint: 'old' } }, { handle: { ...view.handle, sessionId: 'old' } },
      { handle: { ...view.handle, layerId: 'other' } }]) refuse(request, { ...view, ...patch });
    const objects = scope === 'point' ? 'points' : 'lines';
    for (const patch of [{ id: 'wrong-id' }, { guid: 'wrong-guid' }]) {
      refuse(request, view, { ...layer, data: { ...layer.data, [objects]: layer.data[objects].map((object) => ({ ...object, ...patch })) } });
    }
    refuse(request, view, { ...layer, data: { ...layer.data, [objects]: [] } });
    internalGmiSourceState(view.document).bytes[0] ^= 1;
    refuse();
  });
}
