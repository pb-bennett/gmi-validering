import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { extractHyperlinkFilenames, extractHyperlinkSourceParts } from '../src/lib/hyperlinkFilenames.mjs';
import { createFilenameCopyAction, filenameCopyFeedback } from '../src/lib/filenameClipboard.mjs';
import { rowMatchesTableSearch } from '../src/lib/tableSearch.js';
import { GMIParser } from '../src/lib/parsing/gmiParser.js';

test('source presentation preserves exact syntax, metadata and shared extraction semantics', () => {
  for (const source of [
    '  h:2(sign:"Metadata.jpg" link:"dir/A.jpg"; link:"dir/B.jpg") h:1(link:"other/A.jpg")  ',
    'h:1(link:"A.jpg"\nsign:"NOSEVIE")',
    'h:1(sign:"Metadata.jpg")',
    'h:1(link:"A.jpg" sign:broken)',
    ' https://example.test/photos/A.jpg?token=x#preview ',
  ]) {
    const parts = extractHyperlinkSourceParts(source);
    assert.equal(parts.map((part) => part.text).join(''), source);
    assert.deepEqual(parts.filter((part) => part.filename).map((part) => part.filename), extractHyperlinkFilenames(source));
    assert(parts.filter((part) => part.filename).every((part) => !part.text.includes('sign:')));
  }
  assert.deepEqual(extractHyperlinkSourceParts(['dir/A.jpg', ['other/A.jpg', 'dir/B.jpg']]).filter((part) => part.filename).map((part) => part.filename), ['A.jpg', 'B.jpg']);
});

test('observed GMI wrapper and both path separators yield basenames only', () => {
  assert.deepEqual(extractHyperlinkFilenames(String.raw`h:1(link:"Attachments\DRENS.2.5_20260625_0909_01.jpg")`), ['DRENS.2.5_20260625_0909_01.jpg']);
  for (const value of [String.raw`Attachments\Photo_01.jpg`, 'Attachments/Photo_01.jpg', String.raw`C:\Photos\Photo_01.jpg`, 'Photo_01.jpg']) {
    assert.deepEqual(extractHyperlinkFilenames(value), ['Photo_01.jpg']);
  }
  assert.deepEqual(extractHyperlinkFilenames('unknown-directory/unknown-reference'), ['unknown-reference']);
});

test('browser-observed link plus sign metadata supports newline and same-line forms', () => {
  for (const separator of ['\n', ' ', '\r\n  ', ', ']) {
    const raw = String.raw`h:1(link:"Attachments\20251119_154646.jpg"` + separator + 'sign:"NOSEVIE")';
    assert.deepEqual(extractHyperlinkFilenames(raw), ['20251119_154646.jpg']);
  }
  assert.deepEqual(extractHyperlinkFilenames('h:1(sign:"Metadata.jpg")'), []);
  assert.deepEqual(extractHyperlinkFilenames('h:1(link:"Photo.jpg" sign:"Metadata.jpg" description:"Other.jpg")'), ['Photo.jpg']);
});

test('metadata does not hide/reorder links or make malformed wrappers valid', () => {
  assert.deepEqual(extractHyperlinkFilenames('h:2(sign:"Ignored.jpg" link:"dir/Photo_A.jpg" description:"Other.jpg" link:"dir/Photo_B.jpg")'), ['Photo_A.jpg', 'Photo_B.jpg']);
  for (const raw of [
    'h:1(link:"Photo.jpg" sign:NOSEVIE)',
    'h:1(link:"Photo.jpg" sign:"NOSEVIE"',
    'h:1(link:"Photo.jpg" unrelated text)',
    'h:1(link:"Photo.jpg" sign:"NOSEVIE") trailing',
    'arbitrary link:"Photo.jpg" sign:"NOSEVIE"',
  ]) assert.deepEqual(extractHyperlinkFilenames(raw), []);
});

test('URLs use path basename, dropping query/hash and decoding filename text', () => {
  assert.deepEqual(extractHyperlinkFilenames('https://example.test/photos/Photo_01.jpg?token=x#preview'), ['Photo_01.jpg']);
  assert.deepEqual(extractHyperlinkFilenames('https://example.test/photos/Bl%C3%A5%20kum%20(1).jpg'), ['Blå kum (1).jpg']);
  assert.deepEqual(extractHyperlinkFilenames('https://example.test/'), []);
  assert.deepEqual(extractHyperlinkFilenames('https://example.test/%ZZ.jpg'), []);
});

test('spaces, Norwegian characters, parentheses and multiple dots survive intact', () => {
  assert.deepEqual(extractHyperlinkFilenames('  Attachments/Blå kum (ø).2.5_01.jpg  '), ['Blå kum (ø).2.5_01.jpg']);
  assert.deepEqual(extractHyperlinkFilenames(String.raw`h:1(link:"Attachments\Blå kum (ø).2.5_01.jpg")`), ['Blå kum (ø).2.5_01.jpg']);
});

test('missing, malformed and unsupported structures produce no misleading filename', () => {
  for (const value of [null, undefined, '', '  ', 4, true, {}, { link: 'Photo.jpg' }, 'opaque attachment reference',
    'h:1()', 'h:1(link:"")', 'h:1(link:"dir/")', 'h:1(link:"Photo.jpg"', 'h:1(link:Photo.jpg)',
    'h:1(link:"Photo.jpg") trailing', 'link:"Photo.jpg"', 'mailto:Photo.jpg', 'https://', 'folder/', '.', '..']) {
    assert.deepEqual(extractHyperlinkFilenames(value), [], `unexpected extraction from ${String(value)}`);
  }
});

test('all references preserve order and exact filename duplicates are removed', () => {
  const value = Object.freeze([
    String.raw`h:2(link:"dir\Photo_A.jpg",link:"dir/Photo_B.jpg")`,
    Object.freeze(['other/Photo_A.jpg', 'other/photo_a.jpg']),
    'h:1(link:"Photo_C.jpg") h:1(link:"Photo_D.jpg")',
  ]);
  assert.deepEqual(extractHyperlinkFilenames(value), ['Photo_A.jpg', 'Photo_B.jpg', 'photo_a.jpg', 'Photo_C.jpg', 'Photo_D.jpg']);
  assert.equal(value[1][0], 'other/Photo_A.jpg');
  const cycle = ['Photo_A.jpg'];
  cycle.push(cycle, 'Photo_B.jpg');
  assert.deepEqual(extractHyperlinkFilenames(cycle), ['Photo_A.jpg', 'Photo_B.jpg']);
});

test('tracked GMI fixture retains real repository S_HYPERLINK representation', async () => {
  const source = await readFile(new URL('./fixtures/gmi-v32/valid/batch2-oracle.gmi', import.meta.url), 'latin1');
  const parsed = new GMIParser(source).parse();
  const row = parsed.points.find((point) => point.attributes.S_HYPERLINK === 'https://synthetic.invalid/a');
  assert(row);
  assert.deepEqual(extractHyperlinkFilenames(row.attributes.S_HYPERLINK), ['a']);
  assert.equal(row.attributes.S_HYPERLINK, 'https://synthetic.invalid/a');
});

test('search-to-copy workflow uses original hyperlink and passes basename to clipboard', async () => {
  const raw = String.raw`h:1(link:"Attachments\IMG_4827.JPG")`;
  const row = { attributes: { S_HYPERLINK: raw } };
  assert(rowMatchesTableSearch(row, '4827'));
  const [filename] = extractHyperlinkFilenames(row.attributes.S_HYPERLINK);
  assert.equal(filename, 'IMG_4827.JPG');
  const writes = [];
  const statuses = [];
  let isolated = false;
  let reset;
  const action = createFilenameCopyAction(filename, (status) => statuses.push(status), {
    writeText: async (text) => writes.push(text), schedule: (callback) => { reset = callback; }, cancel: () => {},
  });
  await action.copy({ stopPropagation: () => { isolated = true; } });
  assert(isolated);
  assert.deepEqual(writes, ['IMG_4827.JPG']);
  assert.deepEqual(statuses, ['pending', 'copied']);
  assert.equal(filenameCopyFeedback(statuses.at(-1)), 'Kopiert');
  reset();
  assert.equal(statuses.at(-1), 'idle');
  assert.equal(row.attributes.S_HYPERLINK, raw);
  action.dispose();
});

test('clipboard failures never show success and subsequent copies still work', async () => {
  const statuses = [];
  let fail = true;
  const action = createFilenameCopyAction('Photo.jpg', (status) => statuses.push(status), {
    writeText: async () => { if (fail) throw new Error('denied'); }, schedule: () => 1, cancel: () => {},
  });
  await action.copy();
  assert.deepEqual(statuses, ['pending', 'error']);
  assert.equal(filenameCopyFeedback('error'), 'Ikke kopiert');
  fail = false;
  await action.copy();
  assert.equal(statuses.at(-1), 'copied');
  action.dispose();
});

test('disposed/pending copy actions suppress duplicate writes and late feedback', async () => {
  const statuses = [];
  let resolve;
  let writes = 0;
  const action = createFilenameCopyAction('Photo.jpg', (status) => statuses.push(status), {
    writeText: () => { writes++; return new Promise((done) => { resolve = done; }); }, schedule: () => { throw new Error('disposed'); }, cancel: () => {},
  });
  const first = action.copy();
  await action.copy();
  assert.equal(writes, 1);
  action.dispose();
  resolve();
  await first;
  assert.deepEqual(statuses, ['pending']);
  await action.copy();
  assert.equal(writes, 1);
});

test('table copy UI is field-specific and retains raw search, row IDs and virtualization', async () => {
  const table = await readFile(new URL('../src/components/LayerDataTable.js', import.meta.url), 'utf8');
  const button = await readFile(new URL('../src/components/FilenameCopyButton.js', import.meta.url), 'utf8');
  assert.match(table, /id === 'S_HYPERLINK'\s*\? <HyperlinkCell value=\{info.getValue\(\)\}/);
  assert.match(table, /: <DataCell value=\{info.getValue\(\)\}/);
  assert.match(table, /extractHyperlinkFilenames\(value\)/);
  assert.match(table, /filenames.map\(\(filename, index\)/);
  assert.match(table, /<FilenameCopyButton key=\{filename\} filename=\{filename\}/);
  assert.match(table, /<DataCell value=\{value\} searchQuery=\{searchQuery\}/);
  assert.match(table, /filterTableSearchRows\(items, normalizedSearchQuery\)/);
  assert.match(table, /getRowId: \(row\) => `\$\{layerId\}:\$\{activeTab\}:\$\{row.__index\}`/);
  assert.match(table, /useVirtualizer\(\{/);
  assert.match(button, /createFilenameCopyAction\(filename, setStatus\)/);
  assert.match(button, /type="button"/);
  assert.match(button, /Kopier filnavn \$\{filename\}/);
  assert.match(button, /role="status"/);
  assert.match(button, /CheckIcon : CopyIcon/);
  assert.match(button, /gmi-focus-ring/);
  // The table renders controls iff the shared extractor returns a usable filename.
  assert.match(table, /filenames.length > 0 &&/);
  for (const raw of ['h:1(link:"Photo.jpg")', 'h:1(link:"Photo.jpg"\nsign:"NOSEVIE")']) {
    assert.equal(extractHyperlinkFilenames(raw).length, 1);
  }
  assert.equal(extractHyperlinkFilenames('h:1(link:"Photo.jpg" sign:broken)').length, 0);
});
