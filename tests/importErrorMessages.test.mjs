// Batch 2C: import error messages. An unsupported file type is refused by name with its own message (not as a
// malformed GMI), before any file or parsing state changes; a malformed GMI keeps its GMI-specific parser error; and
// an error stated in «Legg til nytt lag» is dismissed with the dialog. Synthetic names and content only.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  isSupportedSurveyFileName, surveyFileExtension, unsupportedSurveyFileMessage, SURVEY_FILE_EXTENSIONS, UNRECOGNISED_TEXT_FILE_MESSAGE,
} from '../src/lib/parsing/surveyFileType.mjs';
import { surveyFileDropAccepted } from '../src/lib/fileDragState.mjs';
import { GMIParser } from '../src/lib/parsing/gmiParser.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('supported names are exactly the picker and drop formats; the drop filter uses the same rule', () => {
  assert.deepEqual([...SURVEY_FILE_EXTENSIONS], ['gmi', 'sos', 'sosi', 'kof', 'txt']);
  for (const name of ['a.gmi', 'A.GMI', 'b.sos', 'b.SOSI', 'c.kof', 'd.txt', 'rev.2.gmi']) {
    assert.equal(isSupportedSurveyFileName(name), true, name);
    assert.equal(surveyFileDropAccepted({ files: [{ name }] }), true, name);
  }
  for (const name of ['a.xlsx', 'b.pdf', 'c.zip', 'survey.gmi.exe', 'noextension', 'trailing.', '.gmi', '']) {
    assert.equal(isSupportedSurveyFileName(name), false, name);
    assert.equal(surveyFileDropAccepted({ files: [{ name }] }), false, name);
  }
  assert.equal(surveyFileExtension('Mappe\\fil.DWG'), 'dwg');
});

test('an unsupported type gets a type message; a malformed GMI keeps its GMI error', () => {
  assert.equal(unsupportedSurveyFileMessage('Tegning.dwg'), 'Filtypen .dwg støttes ikke. Velg en .gmi-, .sos-, .sosi- eller .kof-fil.');
  assert.equal(unsupportedSurveyFileMessage('README'), 'Filtypen støttes ikke: filen har ingen filendelse. Velg en .gmi-, .sos-, .sosi- eller .kof-fil.');
  for (const message of [unsupportedSurveyFileMessage('a.xlsx'), UNRECOGNISED_TEXT_FILE_MESSAGE]) {
    assert.doesNotMatch(message, /Ugyldig GMI-fil/);
  }
  assert.throws(() => new GMIParser('not a survey file').toObject(), /^Error: Ugyldig GMI-fil: Filen starter ikke med \[GMIFILE_ASCII\]/,
    'a malformed .gmi still gets the unchanged parser error');
});

test('the loader refuses by name before it reads or changes file state; unrecognised .txt content is its own error', async () => {
  const source = await read('../src/components/FileUpload.js');
  const handler = source.slice(source.indexOf('const handleFile = useCallback('));
  const refusal = handler.indexOf('if (!isSupportedSurveyFileName(file.name))');
  assert(refusal > 0);
  assert.match(handler.slice(refusal, refusal + 200), /setParsingError\(unsupportedSurveyFileMessage\(file\.name\)\);\s*return;/);
  for (const write of ['setFile({', 'startParsing();', 'new FileReader()']) assert(handler.indexOf(write) > refusal, `${write} comes after the refusal`);
  assert.match(source, /if \(!format\) throw new Error\(UNRECOGNISED_TEXT_FILE_MESSAGE\);/);
  assert.match(source, /error\.message\.startsWith\('Innholdet'\)/, 'shown as written, not as «Kunne ikke lese filen: …»');
  // The detector no longer turns an unknown file into a GMI.
  const detector = source.slice(source.indexOf('const detectFormat'), source.indexOf('const handleFile'));
  assert.match(detector, /return null;\s*\};\s*$/);
});

test('closing «Legg til nytt lag» dismisses the error it stated; the workspace notice stays for errors outside it', async () => {
  const page = await read('../src/app/page.js');
  assert.match(page, /const closeAddLayer = useCallback\(\(\) => \{\s*setShowAddLayerModal\(false\);\s*if \(useStore\.getState\(\)\.parsing\.status === 'error'\) restoreParsing\(\);\s*\}, \[restoreParsing\]\);/);
  assert.match(page, /!showAddLayerModal && parsingStatus === 'error' && parsingError && \(\s*<div role="alert" data-import-error="workspace"/);
});
