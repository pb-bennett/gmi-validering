import assert from 'node:assert/strict';
import test from 'node:test';
import { importSteps, canAdvance, initialImportState, importWizardReducer } from '../src/lib/photos/photoImportWizardState.mjs';
for (const kind of ['new','append','gmi-layer']) test(`${kind} step derivation`, () => {
 const context={kind}, state=initialImportState(context);
 assert.deepEqual(importSteps(context,{kind:'gmi'}),kind==='gmi-layer'?['photos','review']:['photos','placement','review']);
 assert.deepEqual(importSteps(context,{kind:'none'}),kind==='gmi-layer'?['photos','review']:['photos','placement']);
 assert.equal(canAdvance('photos',{photos:[]},state).ok,false);
 const next=importWizardReducer(state,{type:'step',step:'review'});assert.equal(next.step,'review');
 assert.equal(canAdvance('review',{photos:[{spatial:{exifRead:{state:'ready'}}}],loadedImport:{state:'pending'}},{...state,placement:{kind:'gmi'}}).ok,false);
});
