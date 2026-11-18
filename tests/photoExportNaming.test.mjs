import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { unzipSync, strFromU8 } from 'fflate';
import { exportFixture } from './helpers/photoExportFixtures.mjs';
import { geminiGoldenFixture, normalizeGeminiIdentifiers, readGeminiGolden } from './helpers/photoExportGolden.mjs';
import { parseSourceFilename, formatPhotoExportTimestamp, photoExportNames, sanitizeExportDescriptive, exportFilenamePreview,
  exportFilenameOptions, ExportFilenameError, EXPORT_FILENAME_NOTICE_LENGTH, EXPORT_FILENAME_ADVISORY_LENGTH, EXPORT_FILENAME_MAX_BYTES, EXPORT_REPORT_SUFFIX } from '../src/lib/photos/export/photoExportNaming.mjs';
import { PHOTO_EXPORT_PROFILES } from '../src/lib/photos/export/exportContract.mjs';
import { buildPhotoExportPackage } from '../src/lib/photos/export/photoExportPackage.mjs';
import { serializePhotoExport } from '../src/lib/photos/export/photoExportXml.mjs';

const instant = new Date('2026-11-07T14:35:00Z');   // 15:35 in Oslo
const fixedClock = { now: () => instant };
const unzip = async (plan) => unzipSync(new Uint8Array(await (await buildPhotoExportPackage(plan)).arrayBuffer()));
const bytes = (text) => new TextEncoder().encode(text).length;
const filenameError = (code) => (error) => error instanceof ExportFilenameError && error.code === code;

test('the timestamp is Oslo wall-clock time to the minute across summer time, winter time and midnight', () => {
  for (const [iso, expected] of [
    ['2026-11-07T14:35:00Z', '20261107-1535'],
    ['2026-07-01T14:35:59Z', '20260701-1635'],
    ['2026-03-29T00:59:59Z', '20260329-0159'],
    ['2026-03-29T01:00:00Z', '20260329-0300'],
    ['2026-12-31T23:00:00Z', '20270101-0000'],
  ]) assert.equal(formatPhotoExportTimestamp(new Date(iso)), expected, iso);
});

test('the timestamp does not follow the machine timezone', () => {
  // A child process, because the formatter is built on import and would otherwise keep this machine's zone.
  const script = `import { formatPhotoExportTimestamp as f } from ${JSON.stringify(new URL('../src/lib/photos/export/photoExportNaming.mjs', import.meta.url).href)}; console.log(f(new Date('2026-11-07T14:35:00Z')));`;
  for (const TZ of ['Asia/Tokyo', 'America/New_York', 'UTC']) {
    const { stdout, status } = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.equal(status, 0);
    assert.equal(stdout.trim(), '20261107-1535', TZ);
  }
});

test('an empty descriptive name gives the timestamp alone, and every artifact shares one basename', () => {
  for (const label of ['', '   ', undefined, null, '...', '/\\', '🙂']) {
    const names = photoExportNames({ label, date: instant });
    assert.equal(names.basename, '20261107-1535', String(label));
    assert.equal(names.zipFilename, '20261107-1535.zip');
    assert.equal(names.gmlFilename, '20261107-1535.gml');
    assert.equal(names.reportFilename, '20261107-1535-leveranserapport.txt');
  }
  const names = photoExportNames({ label: 'Torkopp PS', date: instant });
  assert.equal(names.zipFilename, '20261107-1535-Torkopp PS.zip');
  assert.equal(names.gmlFilename, '20261107-1535-Torkopp PS.gml');
  assert(Object.isFrozen(names));
});

test('the text as entered stays apart from the filename form', () => {
  const names = photoExportNames({ label: '  Grøft / nord  ', date: instant });
  assert.equal(names.label, '  Grøft / nord  ');
  assert.equal(names.sanitizedLabel, 'Grøft - nord');
  assert.equal(photoExportNames({ descriptive: 'A', label: 'B', date: instant }).sanitizedLabel, 'A', 'descriptive wins over the label alias');
});

test('the sanitizer replaces only filesystem-unsafe characters and keeps Norwegian text, case, spaces and punctuation', () => {
  for (const [text, expected] of [
    ['  Torkopp PS  ', 'Torkopp PS'],
    ['Torkopp   -  PS', 'Torkopp - PS'],
    ['fase_2.v3', 'fase_2.v3'],
    ['Ledninger, nord (sone 4) & Co+ \'A\'', 'Ledninger, nord (sone 4) & Co+ \'A\''],
    ['Skøyen Ærøy Åsane', 'Skøyen Ærøy Åsane'],
    ['blåbærsyltetøy', 'blåbærsyltetøy'],
    ['a\u030As', 'ås'],
    ['Crème brûlée', 'Crème brûlée'],
    ['../../etc/passwd', '-..-etc-passwd'],
    ['..\\..\\Windows\\System32', '-..-Windows-System32'],
    ['C:\\temp\\x.zip', 'C-temp-x.zip'],
    ['a<b>c:d"e/f\\g|h?i*j', 'a-b-c-d-e-f-g-h-i-j'],
    ['a\u0000b\u0007c\nd\te\u007Ff', 'a-b-c-d-e-f'],
    ['trailing dot.', 'trailing dot'],
    ['.hidden . ', 'hidden'],
    ['\ud800x', '-x'],
    ['🙂 prosjekt 🙂', '🙂 prosjekt 🙂'],
    ['...', ''], ['/\\', ''], ['  ', ''], ['🙂', ''],
  ]) {
    assert.equal(sanitizeExportDescriptive(text), expected, JSON.stringify(text));
    assert.equal(sanitizeExportDescriptive(expected), expected, `idempotent: ${JSON.stringify(text)}`);
  }
  assert.equal(sanitizeExportDescriptive('x'.repeat(300)).length, 300, 'nothing is cut');
});

test('every accepted name needs no further escaping on Windows, macOS or Linux', () => {
  const labels = ['..', '../..', '.gml', 'a/../b', '\\\\server\\share', 'NUL.txt', ' . ', 'æ'.repeat(100), '%2e%2e%2f', '\ud800', 'x'.repeat(200)];
  for (const label of labels) {
    const { zipFilename, gmlFilename } = photoExportNames({ label, date: instant });
    assert.doesNotMatch(zipFilename, /[\u0000-\u001F\u007F<>:"/\\|?*]|[ .]\.zip$/u, label);
    assert.match(zipFilename, /^\d{8}-\d{4}/, label);
    assert.equal(gmlFilename, zipFilename.replace(/\.zip$/, '.gml'));
  }
});

test('timestamp and revision combine independently', () => {
  const name = (descriptive, timestamp, revision) => photoExportNames({ date: instant, descriptive, timestamp, revision }).basename;
  assert.equal(name('Ledninger Nord', true, 'rev02'), '20261107-1535-Ledninger Nord_rev02');
  assert.equal(name('Ledninger Nord', true, ''), '20261107-1535-Ledninger Nord');
  assert.equal(name('Ledninger Nord', false, 'rev02'), 'Ledninger Nord_rev02');
  assert.equal(name('Ledninger Nord', false, ''), 'Ledninger Nord');
  assert.equal(name('', true, 'rev02'), '20261107-1535-rev02');
  assert.equal(name('', true, ''), '20261107-1535');
  assert.equal(name('', false, 'rev02'), 'rev02');
  assert.throws(() => name('', false, ''), filenameError('filename-empty'));
  assert.throws(() => name('...', false, ''), filenameError('filename-empty'));
  assert.throws(() => name('x', true, '02'), TypeError, 'a revision must be rev + digits');
  // A generated name parses back to its own descriptive part and the next revision.
  assert.deepEqual({ ...parseSourceFilename(`${name('', true, 'rev02')}.gmi`) }, { descriptive: '', nextRevision: '03' });
  assert.deepEqual({ ...parseSourceFilename(`${name('Ledninger Nord', true, 'rev02')}.gmi`) }, { descriptive: 'Ledninger Nord', nextRevision: '03' });
});

test('reserved Windows device names fail closed when nothing precedes or follows them', () => {
  for (const descriptive of ['CON', 'con', 'nul.txt', 'COM1', 'LPT9.gmi', 'aux ']) {
    assert.throws(() => photoExportNames({ date: instant, descriptive, timestamp: false }), filenameError('filename-reserved'), descriptive);
  }
  assert.equal(photoExportNames({ date: instant, descriptive: 'CON' }).basename, '20261107-1535-CON');
  assert.equal(photoExportNames({ date: instant, descriptive: 'CON', timestamp: false, revision: 'rev02' }).basename, 'CON_rev02');
  assert.equal(photoExportNames({ date: instant, descriptive: 'CONSOLE', timestamp: false }).basename, 'CONSOLE');
});

test('the longest artifact name (the report) must fit 255 UTF-8 bytes', () => {
  const limit = EXPORT_FILENAME_MAX_BYTES - bytes(EXPORT_REPORT_SUFFIX);
  assert.equal(limit, 234);
  const ok = photoExportNames({ date: instant, descriptive: 'x'.repeat(limit), timestamp: false });
  assert.equal(bytes(ok.reportFilename), 255);
  assert.throws(() => photoExportNames({ date: instant, descriptive: 'x'.repeat(limit + 1), timestamp: false }), filenameError('filename-too-long'));
  // Bytes, not characters: ø is two bytes.
  assert.equal(photoExportNames({ date: instant, descriptive: 'ø'.repeat(limit / 2), timestamp: false }).basename.length, limit / 2);
  assert.throws(() => photoExportNames({ date: instant, descriptive: 'ø'.repeat(limit / 2 + 1), timestamp: false }), filenameError('filename-too-long'));
  // The timestamp and revision count too.
  assert.throws(() => photoExportNames({ date: instant, descriptive: 'x'.repeat(limit - 14) + 'y', revision: '' }), filenameError('filename-too-long'));
  assert.equal(photoExportNames({ date: instant, descriptive: 'x'.repeat(limit - 14) }).basename.length, limit);
});

test('advisory thresholds count the whole primary filename and do not block', () => {
  const at = (n, options) => exportFilenamePreview({ descriptive: 'x'.repeat(n), ...options });
  // ååååmmdd-ttmm- (14) + text + _rev02 (6) + .gmi (4)
  for (const [descriptiveLength, filenameLength] of [[36, 60], [37, 61], [56, 80], [57, 81]]) {
    const preview = at(descriptiveLength, { revision: 'rev02', extension: '.gmi' });
    assert.equal(preview.length, filenameLength);
    assert.equal(preview.issue, null);
  }
  assert.equal(at(62, { extension: '.zip' }).length, 80);
  assert.equal(at(76, { timestamp: false, extension: '.zip' }).length, 80);
  assert.equal(at(77, { timestamp: false, extension: '.zip' }).length, 81);
  assert.equal(at(70, { timestamp: false, revision: 'rev02', extension: '.gmi' }).length, 80);
  assert.deepEqual([EXPORT_FILENAME_NOTICE_LENGTH, EXPORT_FILENAME_ADVISORY_LENGTH], [60, 80]);
  assert.equal(at(200, { extension: '.zip' }).issue, null, 'long is allowed');
  assert.equal(at(300, { extension: '.zip' }).issue, 'filename-too-long');
  // Code points: Norwegian letters count once.
  assert.equal(exportFilenamePreview({ descriptive: 'Grøft', timestamp: false, extension: '.gmi' }).length, 9);
});

test('the preview shows exactly the parts the real name will have', () => {
  const view = (descriptive, timestamp, revision) => { const p = exportFilenamePreview({ descriptive, timestamp, revision, extension: '.gmi' }); return `${p.prefix}|${p.suffix}|${p.issue}`; };
  assert.equal(view('Nord', true, 'rev02'), 'ååååmmdd-ttmm-|_rev02.gmi|null');
  assert.equal(view('Nord', false, 'rev02'), '|_rev02.gmi|null');
  assert.equal(view('Nord', true, ''), 'ååååmmdd-ttmm-|.gmi|null');
  assert.equal(view('', true, 'rev02'), 'ååååmmdd-ttmm-|rev02.gmi|null');
  assert.equal(view('', true, ''), 'ååååmmdd-ttmm|.gmi|null');
  assert.equal(view('', false, ''), '|.gmi|filename-empty');
  assert.equal(view('CON', false, ''), '|.gmi|filename-reserved');
});

test('configuration maps to one set of filename options', () => {
  assert.deepEqual(exportFilenameOptions({}), { descriptive: '', timestamp: true, revision: '' });
  assert.deepEqual(exportFilenameOptions({ label: 'Nord', filenameTimestamp: false, revision: 'rev02' }), { descriptive: 'Nord', timestamp: false, revision: 'rev02' });
  assert.deepEqual(exportFilenameOptions({ label: 'Nord', filenameRevision: false, revision: 'rev02' }), { descriptive: 'Nord', timestamp: true, revision: '' });
});

for (const profile of Object.keys(PHOTO_EXPORT_PROFILES)) {
  test(`${profile}: the label names the package and changes nothing inside it`, async () => {
    const f = await exportFixture({ names: ['Grøft æ image.png', 'ordinary.png'] });
    try {
      const plain = await f.plan({ profile }, fixedClock);
      const labelled = await f.plan({ profile, label: 'Torkopp PS' }, fixedClock);
      assert.equal(labelled.profile, profile);
      assert.deepEqual(labelled.errors, []);
      assert.equal(plain.naming.gmlFilename, '20261107-1535.gml');
      assert.equal(labelled.naming.gmlFilename, '20261107-1535-Torkopp PS.gml');
      assert.equal(labelled.naming.zipFilename, '20261107-1535-Torkopp PS.zip');

      assert.deepEqual(labelled.attachments, plain.attachments);
      const zip = await unzip(labelled);
      assert.deepEqual(Object.keys(zip), [labelled.naming.gmlFilename, ...labelled.attachments.map((row) => row.path)]);
      const xml = strFromU8(zip[labelled.naming.gmlFilename]);
      assert.equal(xml, serializePhotoExport(labelled));
      assert(!xml.includes('Torkopp') && !xml.includes('20261107-1535'), 'the name stays out of the data');
      assert.equal(normalizeGeminiIdentifiers(xml), normalizeGeminiIdentifiers(serializePhotoExport(plain)));
      const separator = profile === 'gemini-legacy2019' ? '\\' : '/';
      for (const attachment of labelled.attachments) {
        assert(attachment.path.startsWith('Attachments/'));
        assert(xml.includes(`<app:fotolink>Attachments${separator}${attachment.filename}</app:fotolink>`));
        assert.deepEqual(zip[attachment.path], new Uint8Array(await labelled.assets.find((asset) => asset.assetId === attachment.assetId).file.arrayBuffer()));
      }
    } finally { f.session.clear(); }
  });
}

test('the Gemini golden output is the same with a label', async () => {
  const f = await geminiGoldenFixture('time-seconds');
  try {
    const plan = await f.plan({ profile: 'gemini-legacy2019', label: 'Grøft / nord' }, fixedClock);
    assert.equal(normalizeGeminiIdentifiers(serializePhotoExport(plan)), await readGeminiGolden('time-seconds'));
  } finally { f.session.clear(); }
});

test('preview and download use the one name the plan was given', async () => {
  const f = await exportFixture();
  try {
    let reads = 0;
    const clock = { now: () => new Date(instant.getTime() + 60_000 * reads++) };
    const plan = await f.plan({ profile: 'legacy2019', label: 'Torkopp' }, clock);
    assert.equal(reads, 1, 'one clock read per generated export');
    const previewed = plan.naming.zipFilename;
    const first = await unzip(plan), second = await unzip(plan);
    assert.equal(reads, 1, 'building the package does not read the clock');
    assert.equal(plan.naming.zipFilename, previewed);
    assert.deepEqual(Object.keys(first), Object.keys(second));
    assert(plan.naming.gmlFilename in first);
    assert(Object.isFrozen(plan.naming));

    const next = await f.plan({ profile: 'legacy2019', label: 'Torkopp' }, clock);
    assert.equal(next.naming.zipFilename, '20261107-1536-Torkopp.zip', 'a plan a minute later is a new export');
    assert.equal(plan.naming.zipFilename, previewed);
    const sameMinute = await f.plan({ profile: 'legacy2019', label: 'Torkopp' }, { now: () => new Date(instant.getTime() + 59_000) });
    assert.equal(sameMinute.naming.zipFilename, previewed, 'minute precision: the same minute gives the same name (accepted, no uniqueness suffix)');
  } finally { f.session.clear(); }
});

test('the Gemini import guidance names the GML actually in the package', async () => {
  const f = await exportFixture();
  try {
    const plan = await f.plan({ profile: 'gemini-legacy2019', label: 'Torkopp PS' }, fixedClock);
    assert.match(plan.warnings.find((warning) => warning.code === 'compatibility-import').message, /Importer 20261107-1535-Torkopp PS\.gml med Attachments-mappen/);
  } finally { f.session.clear(); }
});

test('a plan built without a label or a clock still gets a timestamped name', async () => {
  const f = await exportFixture();
  try {
    const { naming } = await f.plan();
    assert.match(naming.zipFilename, /^\d{8}-\d{4}\.zip$/);
    assert.equal(naming.label, '');
  } finally { f.session.clear(); }
});

const long = 'Ledninger og overvann Storgata nord sone 4 innmåling etappe 2 – Æblegård, Øvre Å (kontroll)';
const revisionCases = [
  ['Ledninger.gmi', 'Ledninger', '01'], ['Ledninger_rev01.gmi', 'Ledninger', '02'],
  ['Ledninger_rev09.gmi', 'Ledninger', '10'], ['Ledninger-rev3.gmi', 'Ledninger', '04'],
  ['Ledninger_rev99.gmi', 'Ledninger', '100'], ['Ledninger_rev001.gmi', 'Ledninger', '002'],
  ['LEDNINGER_REV01.GMI', 'LEDNINGER', '02'], ['Ledninger Rev 1.gmi', 'Ledninger', '02'],
  ['Ledninger.rev.1.gmi', 'Ledninger', '02'], ['Ledninger_rev-1.gmi', 'Ledninger', '02'],
  ['Ledninger', 'Ledninger', '01'], ['Ledninger.txt', 'Ledninger.txt', '01'],
  // Generated prefixes: legacy HHmmss, current HHmm, stacked; only with a plausible date and time.
  ['20261116-105236-Ledninger_rev03.gmi', 'Ledninger', '04'],
  ['20261116-105236-Ledninger-rev03.gmi', 'Ledninger', '04'],
  ['20261117-1124-Ledninger Nord_rev02.gmi', 'Ledninger Nord', '03'],
  ['20261116-105236.gmi', '', '01'], ['20261117-1124.gmi', '', '01'], ['20261117-1124-rev02.gmi', '', '03'],
  ['20261116-105236-20261115-090000-Ledninger_rev02.gmi', 'Ledninger', '03'],
  ['20261117-1124-20261116-105236-Nord.gmi', 'Nord', '01'],
  ['20261399-999999-Ledninger.gmi', '20261399-999999-Ledninger', '01'],
  ['20261110-2460-Ledninger.gmi', '20261110-2460-Ledninger', '01'],
  ['20261110-14300-Ledninger.gmi', '20261110-14300-Ledninger', '01'],
  // Contractor date prefixes are kept.
  ['20261116 Ledninger.gmi', '20261116 Ledninger', '01'],
  ['20261110-Ledninger_rev03.gmi', '20261110-Ledninger', '04'],
  ['2026-11-16_Ledninger.gmi', '2026-11-16_Ledninger', '01'],
  ['20261110_1430_Ledninger.gmi', '20261110_1430_Ledninger', '01'],
  ['Ledninger 2026-11-16.gmi', 'Ledninger 2026-11-16', '01'],
  // D1, accepted ambiguity: a contractor prefix of exactly the generated YYYYMMDD-HHmm- shape is indistinguishable
  // from a generated one and is removed, so re-imports never stack timestamps.
  ['20261110-1430-Ledninger.gmi', 'Ledninger', '01'],
  ['20261116-105236-Ledninger_rev03 (1).gmi', 'Ledninger', '04'],
  ['Ledninger_rev01 - Kopi.gmi', 'Ledninger_rev01 - Kopi', '01'],
  ['Ledninger_rev01_final.gmi', 'Ledninger_rev01_final', '01'],
  ['Ledningerrev01.gmi', 'Ledningerrev01', '01'], ['Ledninger_v2.gmi', 'Ledninger_v2', '01'],
  ['Ledninger_r2.gmi', 'Ledninger_r2', '01'], ['Ledninger_rev.gmi', 'Ledninger_rev', '01'],
  ['Grøft nord.gmi', 'Grøft nord', '01'], ['日本語.gmi', '日本語', '01'], ['.gmi', '', '01'],
  [`${long}.gmi`, long, '01'], [`20261110 ${long}_rev07.gmi`, `20261110 ${long}`, '08'],
  ['rev05.gmi', '', '06'],
  ['x'.repeat(60) + '_rev0099.gmi', 'x'.repeat(60), '0100'],
  ['x'.repeat(60) + '_rev9999.gmi', 'x'.repeat(60), '10000'],
  ['  C:/imports/Ledninger_rev01.gmi  ', 'Ledninger', '02'], ['C:\\imports\\a b.gmi', 'a b', '01'],
  ['A\u030Asane.gmi', 'Åsane', '01'],
];
test('the source name parses to its raw descriptive part and the next revision', () => {
  assert(long.length > 80);
  for (const [filename, descriptive, nextRevision] of revisionCases) {
    const parts = parseSourceFilename(filename);
    assert.deepEqual({ ...parts }, { descriptive, nextRevision }, filename);
  }
  for (const input of [null, undefined, 123, {}, '', '  ']) assert.equal(parseSourceFilename(input), null);
});

test('revisions progress over repeated export and re-import with every checkbox combination', () => {
  const cycle = (source, timestamp, revisionOn) => {
    const parts = parseSourceFilename(source);
    const names = photoExportNames({ date: instant, descriptive: parts.descriptive, timestamp, revision: revisionOn ? `rev${parts.nextRevision}` : '' });
    return `${names.basename}.gmi`;
  };
  let file = `20261110 ${long}.gmi`;
  for (const expected of ['01', '02', '03']) {
    file = cycle(file, true, true);
    assert.equal(file, `20261107-1535-20261110 ${long}_rev${expected}.gmi`);
  }
  file = cycle(file, false, true);
  assert.equal(file, `20261110 ${long}_rev04.gmi`);
  file = cycle(file, false, true);
  assert.equal(file, `20261110 ${long}_rev05.gmi`);
  // Revision off restarts the cycle by design; the descriptive name is never touched.
  file = cycle(file, true, false);
  assert.equal(file, `20261107-1535-20261110 ${long}.gmi`);
  assert.equal(cycle(file, true, true), `20261107-1535-20261110 ${long}_rev01.gmi`);
  assert.equal(cycle('20261116-105236-Nord_rev001.gmi', true, true), '20261107-1535-Nord_rev002.gmi', 'legacy names continue');
});
