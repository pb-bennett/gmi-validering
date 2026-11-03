import test from 'node:test';
import assert from 'node:assert/strict';
import { importPlacementRequests, gmiObjectContext, previewImportPlacement, summarizeImportOutcome } from '../src/lib/photos/photoImportOutcome.mjs';
const option = (kind, issues=[]) => ({id:kind,kind,status:'viable',issues});
const row = (options,current=null) => ({photoId:'a',assetId:'a',filename:'a.jpg',options,current});
test('single source policy handles fallback, ambiguity, zero GPS, eligibility and never moves',()=>{
 for(const kind of ['gmi','gml','exif']) {
  assert.equal(importPlacementRequests({rows:[row([option(kind)])]},{kind}).length,1);
  assert.equal(importPlacementRequests({rows:[row([option(kind),option(kind)])]},{kind}).length,0);
  assert.equal(importPlacementRequests({rows:[row([option(kind)],{})]},{kind}).length,0);
 }
 assert.equal(importPlacementRequests({rows:[row([option('exif')])]},{kind:'gmi',exifFallback:true}).length,1);
 assert.equal(importPlacementRequests({rows:[row([option('exif',['questionable-zero-gps'])])]},{kind:'exif'}).length,0);
 assert.equal(importPlacementRequests({rows:[row([option('gml')])]},{kind:'gml'},[]).length,0);
});
test('repeated occurrences count photos, and partial placement remains an exception',()=>{
 const plan={rows:[row([option('gmi')]),{...row([]),photoId:'b'}]};
 const rows=previewImportPlacement({plan,placement:{kind:'gmi'}});
 assert.equal(rows.length,1);assert.equal(rows[0].occurrences,2);assert.equal(summarizeImportOutcome(rows).placed,0);
});
test('object context uses only parsed fields and existing fallback',()=>{
 assert.equal(gmiObjectContext({geometryScope:'point',attributes:{S_FCODE:'KUM',Type:'Kum'},identifiers:{AnleggsID:'123'}}),'KUM · AnleggsID 123');
 assert.equal(gmiObjectContext({geometryScope:'point',attributes:{Type:'Ventil'},identifiers:{}}),'Ventil');
 assert.match(gmiObjectContext({geometryScope:'point',parserId:28,attributes:{},identifiers:{}}),/28/);
});
