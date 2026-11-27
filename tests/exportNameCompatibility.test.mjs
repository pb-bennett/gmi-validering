// Batch 2C: advisory compatibility of export file and folder names (Gemini VA could not open a GMI whose extracted
// folder name had an en dash; the same file opened with '_'). Advisory only: no name, plan or byte is changed.
// Synthetic names only.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeExportNameCharacter, exportNameCompatibilitySuggestion, exportNameUncommonCharacters, photoExportNames,
  EXPORT_PACKAGE_PATH_NOTICE_LENGTH,
} from '../src/lib/photos/export/photoExportNaming.mjs';
import { deliveryDiagnostics, deliveryNameCompatibility } from '../src/lib/delivery/deliveryWizard.mjs';

test('typographic dashes, quotes, special spaces and non-Latin-1 characters are reported; ASCII and æøå are not', () => {
  assert.deepEqual(exportNameUncommonCharacters('Kum og ledning - Ås_(rev) æøå ÆØÅ é ü 1.2'), []);
  assert.deepEqual(exportNameUncommonCharacters('Prosjekt – Område — Fase'), ['–', '—']);
  assert.deepEqual(exportNameUncommonCharacters('“Navn” ’s'), ['“', '”', '’']);
  assert.deepEqual(exportNameUncommonCharacters('a b­c → d 😀 ½ ×'), [' ', '­', '→', '😀', '½', '×']);
  assert.equal(describeExportNameCharacter('–'), 'tankestrek (U+2013, –)');
  assert.equal(describeExportNameCharacter(' '), 'hardt mellomrom (U+00A0)');
  assert.equal(describeExportNameCharacter('→'), 'U+2192, →');
});

test('the suggestion replaces only what it must, keeps æøå and spaces, and the names it gives are safe', () => {
  assert.equal(exportNameCompatibilitySuggestion('Prosjekt – Område—Fase'), 'Prosjekt - Område-Fase');
  assert.equal(exportNameCompatibilitySuggestion('“Ås” kum → ledning'), 'Ås kum _ ledning');
  assert.equal(exportNameCompatibilitySuggestion('Gate  12'), 'Gate 12');
  const suggested = exportNameCompatibilitySuggestion('Prosjekt – Område');
  assert.deepEqual(exportNameUncommonCharacters(suggested), []);
  const names = photoExportNames({ date: new Date('2026-11-27T12:00:00Z'), descriptive: suggested });
  assert.equal(names.basename, '20261127-1300-Prosjekt - Område');
  // The export itself is unchanged by the advisory: the user's text is kept as written.
  assert.equal(photoExportNames({ date: new Date('2026-11-27T12:00:00Z'), descriptive: 'Prosjekt – Område' }).basename, '20261127-1300-Prosjekt – Område');
});

const plan = ({ mode = 'combined', basename = '20261127-1300-Leveranse', attachments = [] } = {}) => Object.freeze({
  mode, errors: [], warnings: [], attachments, photoPlan: mode === 'gmi-only' ? null : {},
  naming: { basename, gmiFilename: `${basename}.gmi`, gmlFilename: `${basename}.gml`, zipFilename: `${basename}.zip` } });
const attachment = (filename) => ({ assetId: filename, filename, path: `Attachments/${filename}` });

test('review: attachment names with such characters and long extracted paths are advisory warnings, never errors', () => {
  assert.deepEqual(deliveryNameCompatibility(plan({ attachments: [attachment('kum-1.jpg'), attachment('Kum ø.jpg')] })), []);
  const named = deliveryNameCompatibility(plan({ attachments: [attachment('kum – 1.jpg'), attachment('kum-2.jpg'), attachment('kum — 3.jpg')] }));
  assert.deepEqual(named.map((item) => item.code), ['package-name-characters']);
  assert.match(named[0].text, /^2 bildenavn/);
  assert.match(named[0].text, /tankestrek \(U\+2013, –\), lang tankestrek \(U\+2014, —\)/);
  assert.match(named[0].text, /kum – 1\.jpg, kum — 3\.jpg/);
  assert.match(named[0].text, /endres ikke/);

  const long = 'a'.repeat(EXPORT_PACKAGE_PATH_NOTICE_LENGTH);
  const lengthy = deliveryNameCompatibility(plan({ attachments: [attachment(`${long}.jpg`)] }));
  assert.deepEqual(lengthy.map((item) => item.code), ['package-path-length']);
  const expected = [...`20261127-1300-Leveranse/Attachments/${long}.jpg`].length;
  assert.match(lengthy[0].text, new RegExp(`er ${expected} tegn, regnet fra mappen ZIP-filen pakkes ut i`));
  assert.match(lengthy[0].text, /vet ikke appen/);
  // Exactly at the advisory length: no note.
  const edge = 'b'.repeat(EXPORT_PACKAGE_PATH_NOTICE_LENGTH - [...'20261127-1300-Leveranse/Attachments/.jpg'].length);
  assert.deepEqual(deliveryNameCompatibility(plan({ attachments: [attachment(`${edge}.jpg`)] })), []);
  // A standalone GMI has no folder or attachments.
  assert.deepEqual(deliveryNameCompatibility(plan({ mode: 'gmi-only' })), []);

  const groups = deliveryDiagnostics(plan({ attachments: [attachment('kum – 1.jpg')] }));
  assert.deepEqual(groups.errors, []);
  assert.deepEqual(groups.warnings.map((item) => item.code), ['package-name-characters']);
});
