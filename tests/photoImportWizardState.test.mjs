import assert from 'node:assert/strict';
import test from 'node:test';
import { importSteps, canAdvance, initialImportState, importWizardReducer, canNavigateBack, importGmlCaptureDecision } from '../src/lib/photos/photoImportWizardState.mjs';
for (const kind of ['new','append','gmi-layer']) test(`${kind} step derivation`, () => {
 const context={kind}, state=initialImportState(context);
 assert.deepEqual(importSteps(context,{kind:'gmi'}),kind==='gmi-layer'?['photos','review']:['photos','placement','review']);
 assert.deepEqual(importSteps(context,{kind:'none'}),kind==='gmi-layer'?['photos','review']:['photos','placement']);
 assert.equal(canAdvance('photos',{photos:[]},state).ok,false);
 const next=importWizardReducer(state,{type:'step',step:'review'});assert.equal(next.step,'review');
 assert.equal(canAdvance('review',{photos:[{spatial:{exifRead:{state:'ready'}}}],loadedImport:{state:'pending'}},{...state,placement:{kind:'gmi'}}).ok,false);
});
test('stage navigation permits only earlier steps and preserves source choices', () => {
 const context = { kind: 'new' };
 const state = { ...initialImportState(context), step: 'review', placement: { kind: 'gml', exifFallback: true }, includeUnreferenced: false };
 for (const step of ['photos', 'placement']) {
  assert(canNavigateBack(context, state, step));
  const back = importWizardReducer(state, { type: 'back', context, step });
  assert.equal(back.step, step); assert.equal(back.placement, state.placement); assert.equal(back.includeUnreferenced, false);
 }
 for (const step of ['review', 'unknown']) assert.equal(importWizardReducer(state, { type: 'back', context, step }), state);
 const photos = { ...state, step: 'photos' };
 assert.equal(canNavigateBack(context, photos, 'review'), false);
 assert.equal(importWizardReducer(photos, { type: 'back', context, step: 'review' }), photos);
 const placement = { ...state, step: 'placement' };
 assert(canNavigateBack(context, placement, 'photos'));
 assert.equal(canNavigateBack(context, placement, 'review'), false);
});
test('initiating GMI navigation never offers a placement step', () => {
 const context = { kind: 'gmi-layer' }, state = { ...initialImportState(context), step: 'review' };
 assert(canNavigateBack(context, state, 'photos'));
 assert.equal(canNavigateBack(context, state, 'placement'), false);
 assert.equal(importWizardReducer(state, { type: 'back', context, step: 'placement' }), state);
});
test('filename capture-time choices start off, are independent and survive navigation and placement changes', () => {
 const context = { kind: 'new' };
 let state = initialImportState(context);
 assert.deepEqual({ ...state.captureSuggestions }, { complete: false, dateOnly: false });
 state = importWizardReducer(state, { type: 'captureSuggestions', value: { dateOnly: true } });
 assert.deepEqual({ ...state.captureSuggestions }, { complete: false, dateOnly: true });
 state = importWizardReducer({ ...state, step: 'review', placement: { kind: 'gml', exifFallback: false } }, { type: 'back', context, step: 'placement' });
 state = importWizardReducer(state, { type: 'placement', placement: { kind: 'none', exifFallback: false } });
 state = importWizardReducer(state, { type: 'back', context, step: 'photos' });
 assert.deepEqual({ ...state.captureSuggestions }, { complete: false, dateOnly: true });
 state = importWizardReducer(state, { type: 'captureSuggestions', value: { complete: true } });
 state = importWizardReducer(state, { type: 'captureSuggestions', value: { dateOnly: false } });
 assert.deepEqual({ ...state.captureSuggestions }, { complete: true, dateOnly: false });
 const pending = { photos: [{ spatial: { exifRead: { state: 'pending' } } }] };
 assert.deepEqual(canAdvance('placement', pending, state), { ok: false, reason: 'Leser opptakstid fra bildene …' });
 assert.equal(canAdvance('placement', pending, { ...state, captureSuggestions: { complete: false, dateOnly: false } }).ok, true);
});
test('GML capture-time choices start unchecked with «Behold gjeldende», survive navigation and reset for another source', () => {
 const context = { kind: 'new' };
 let state = initialImportState(context);
 const plain = (decision) => ({ ...decision });
 assert.deepEqual(plain(importGmlCaptureDecision(state, 'gml-1')), { sourceId: 'gml-1', complete: false, partial: false, conflicts: 'keep' });
 state = importWizardReducer(state, { type: 'gmlCaptureTime', sourceId: 'gml-1', value: { complete: true } });
 state = importWizardReducer(state, { type: 'gmlCaptureTime', sourceId: 'gml-1', value: { conflicts: 'gml' } });
 assert.deepEqual(plain(importGmlCaptureDecision(state, 'gml-1')), { sourceId: 'gml-1', complete: true, partial: false, conflicts: 'gml' });
 state = importWizardReducer({ ...state, step: 'review', placement: { kind: 'gml', exifFallback: false } }, { type: 'back', context, step: 'placement' });
 state = importWizardReducer(state, { type: 'step', step: 'review' });
 assert.equal(importGmlCaptureDecision(state, 'gml-1').complete, true, 'back and forward keep the choice');
 assert.deepEqual(plain(importGmlCaptureDecision(state, 'gml-2')), { sourceId: 'gml-2', complete: false, partial: false, conflicts: 'keep' }, 'another source starts again');
 assert.equal(importGmlCaptureDecision(state, null).complete, false);
 state = importWizardReducer(state, { type: 'gmlCaptureTime', sourceId: 'gml-2', value: { partial: true } });
 assert.deepEqual(plain(importGmlCaptureDecision(state, 'gml-2')), { sourceId: 'gml-2', complete: false, partial: true, conflicts: 'keep' });
});
