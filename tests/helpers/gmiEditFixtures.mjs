// Deterministic generator for tests/fixtures/gmi-edit (M0 of GMI editing).
//
// Every value here is fabricated. Coordinates, GUIDs, names, filenames and
// free text are synthetic and are not derived from any delivered GMI file.
// The committed .gmi files are the source of truth for the tests; this module
// documents how their exact bytes were produced, and the tests check that the
// committed bytes, this generator and the manifest SHA-256 values all agree.
//
// Regenerate (only when intentionally changing a fixture):
//   node tests/helpers/gmiEditFixtures.mjs --write
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { realGrammarFamilies } from './gmiPhotoFixtures.mjs';

export const GMI_EDIT_FIXTURE_DIR = fileURLToPath(new URL('../fixtures/gmi-edit/', import.meta.url));

// --- byte encoders --------------------------------------------------------

// The upload decoder ('iso-8859-1' label) is WHATWG windows-1252: one byte per
// UTF-16 unit. This reverse table is the exact inverse of that decoder.
const windows1252Decoder = new TextDecoder('iso-8859-1');
export const SINGLE_BYTE_ENCODE_TABLE = (() => {
  const table = new Map();
  for (let byte = 0; byte < 256; byte++) {
    const char = windows1252Decoder.decode(Uint8Array.of(byte));
    if (char.length !== 1 || table.has(char)) throw new Error(`decoder is not 1:1 at byte ${byte}`);
    table.set(char, byte);
  }
  return table;
})();

export function encodeSingleByte(text) {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const byte = SINGLE_BYTE_ENCODE_TABLE.get(text[i]);
    if (byte === undefined) throw new Error(`character U+${text.charCodeAt(i).toString(16)} has no single-byte encoding`);
    bytes[i] = byte;
  }
  return bytes;
}

function encodeLatin1Strict(text) {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 0xff || (code >= 0x80 && code <= 0x9f)) throw new Error(`U+${code.toString(16)} is not printable ISO-8859-1`);
  }
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

const encoders = {
  latin1: encodeLatin1Strict,
  cp1252: encodeSingleByte,
  utf8: (text) => new TextEncoder().encode(text),
  'utf8-bom': (text) => Uint8Array.of(0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)),
};

// --- synthetic GMI building blocks ---------------------------------------

const bang = (count) => '!'.repeat(count);
const EXTENT = '581900 6565900 582100 6566100';
const guid = (n) => `5ec0e000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

const header = (extra = []) => [
  '[GMIFILE_ASCII]',
  '_VERSION 2',
  '_FILETYPE GMI',
  `_INDEX ${bang(20)}`,
  `_EXTENT ${EXTENT} ${bang(32)}`,
  'COSYS_EPSG 25832',
  'COSYSVER_EPSG 5941',
  'PRODUCER Syntetisk testprodusent',
  ...extra,
];

const definition = (tag, names, { pad = 32, guidLine = null } = {}) => [
  tag,
  `_EXTENT ${EXTENT} ${bang(pad)}`,
  ...(guidLine ? [`GUID ${guidLine}`] : []),
  ...(names ? [`_FIELDNAMES ${names.join(';')};`] : []),
];

const values = (list) => `_FIELDVALUES ${list.join(';')};`;

const xyz = (count, seed) => ['/XYZ', ...Array.from({ length: count }, (_, i) =>
  `${(581930 + seed * 10 + i * 5).toFixed(3)} ${(6566000 + seed * 7 + i * 3).toFixed(3)} ${(100 + seed + i * 0.25).toFixed(3)}`)];

function line(id, fieldValues, { guidId = id, extent = true, geometry = xyz(2, id), extra = [] } = {}) {
  return [
    `:L ${id}`,
    ...(extent ? [`_EXTENT ${EXTENT} `] : []),
    values(fieldValues),
    ...(guidId === null ? [] : [`GUID ${guid(1000 + guidId)}`]),
    ...extra,
    ...geometry,
  ];
}

function point(id, fieldValues, { guidId = id, geometry = xyz(1, id), extra = [] } = {}) {
  return [
    `:P ${id}`,
    values(fieldValues),
    ...(guidId === null ? [] : [`GUID ${guid(2000 + guidId)}`]),
    ...extra,
    ...geometry,
  ];
}

const LINE_FIELDS = ['S_FCODE', 'Tema', 'Material', 'Dimensjon', 'SDR', 'Trykklasse', 'S_HYPERLINK', 'Merknad', 'Datafangstdato'];
const LINE_FIELDS_NO_SDR = LINE_FIELDS.filter((name) => name !== 'SDR');
const POINT_FIELDS = ['S_FCODE', 'Type', 'AnleggsID', 'S_HYPERLINK', 'Merknad', 'Kumform'];

const link = (target, sign = null) => `link:"${target}"${sign ? ` sign:"${sign}"` : ''}`;
const wrappers = (members, trailing = true) => members.map((member, i) => `h:${i + 1}(${member})`).join(' ') + (trailing ? ' ' : '');

function coreLines() {
  return [
    ...header(),
    ...definition('[L_]', LINE_FIELDS),
    ...definition('[P_]', POINT_FIELDS, { pad: 24 }),
    '[+L_]',
    ...line(1, ['VL', 'VL', 'PE', '110', '11.0', 'PN10', wrappers([link('Attachments\\SYNT_L1_A.jpg')]), 'Rør lagt i grøft ved åkerkant', '2026-03-01']),
    ...line(2, ['VL', 'VL', 'PE', '160', '', 'PN16', '', 'Økt overdekning ÆØÅ æøå', '2026-03-02']),
    ...line(3, ['SP', 'SP', 'PVC', '200', '', '', '', '', '2026-03-03']),
    '[+P_]',
    ...point(1, ['KUM', 'Kum', 'SYNT-K1', wrappers([link('Attachments\\SYNT_P1_A.jpg', 'Feltmåler A'), link('Attachments\\SYNT_P1_B.jpg', 'Feltmåler A')]), 'Kum i fortau, østre side', 'S']),
    ...point(2, ['KUM', 'Kum', 'SYNT-K2', '', 'Ingen bilde', '']),
    ...point(3, ['SLU', 'Sluk', 'SYNT-S1', wrappers([link('Attachments\\SYNT_P3_A.jpg')]), '', '']),
    '[END]',
  ];
}

// Fabricated hyperlink values with the exact wrapper/sign/trailing-space shape
// of every realGrammarFamilies entry. Only the grammar shape is reused; names
// and filenames are synthetic.
export function grammarFamilySignature(value) {
  const shapes = [...value.matchAll(/h:(\d+)\(((?:[^()"]|"[^"]*")*)\)/g)].map((match) =>
    [...match[2].matchAll(/([a-z_]+):"/gi)].map((member) => member[1].toLowerCase()).join('+'));
  return `${shapes.join(',')}|${/\)\s+$/.test(value) ? 'trailing-space' : 'no-trailing-space'}`;
}

function fabricatedFamilyValue(family, index) {
  const signers = ['Feltmåler A', 'Feltmåler B'];
  const members = [...family.matchAll(/h:(\d+)\(((?:[^()"]|"[^"]*")*)\)/g)].map((match, wrapperIndex) => {
    const n = wrapperIndex + 1;
    const filename = n === 5 ? `SYNT F${index} (${n}).jpg` : n === 6 ? `SYNT_F${index}_${n}.JPEG` : `SYNT_F${index}_${n}.jpg`;
    const signed = /sign:"/.test(match[2]);
    return link(`Attachments\\${filename}`, signed ? signers[index % 2] : null);
  });
  return wrappers(members, /\)\s+$/.test(family));
}

export const HYPERLINK_CASES = Object.freeze([
  ...realGrammarFamilies.map((family, index) => ({ id: `family-${index}`, value: fabricatedFamilyValue(family, index) })),
  { id: 'five-wrappers', value: wrappers([1, 2, 3, 4, 5].map((n) => link(`Attachments\\SYNT_FEM_${n}.jpg`, n % 2 ? 'Feltmåler B' : null))) },
  { id: 'bare-relative-path', value: 'Attachments\\SYNT_BARE_1.jpg' },
  { id: 'bare-filename', value: 'SYNT_BARE_2.jpg' },
  { id: 'pdf-signed', value: wrappers([link('Attachments\\SYNT_DOK_1.pdf', 'Feltmåler A')]) },
  { id: 'sos', value: wrappers([link('Attachments\\SYNT_DATA_1.sos')]) },
  { id: 'mixed-photo-pdf-sos', value: wrappers([link('Attachments\\SYNT_MIX_1.jpg'), link('Attachments\\SYNT_MIX_2.pdf'), link('Attachments\\SYNT_MIX_3.jpg', 'Feltmåler B'), link('Attachments\\SYNT_MIX_4.sos')]) },
  { id: 'directory-only', value: wrappers([link('Attachments\\')]) },
  { id: 'deeper-relative-path', value: wrappers([link('Attachments\\Kum 1\\SYNT_DYP_1.jpg')]) },
  { id: 'no-trailing-space', value: wrappers([link('Attachments\\SYNT_NT_1.jpg'), link('Attachments\\SYNT_NT_2.jpg')], false) },
  { id: 'leading-space', value: ` ${wrappers([link('Attachments\\SYNT_LS_1.jpg')])}` },
  { id: 'multi-link-wrapper', value: `h:1(${link('Attachments\\SYNT_ML_1.jpg')} ${link('Attachments\\SYNT_ML_2.jpg')}) ` },
  { id: 'invalid-grammar', value: `h:1(${link('Attachments\\SYNT_BAD_1.jpg')} ` },
  { id: 'empty', value: '' },
]);

function hyperlinkLines() {
  return [
    ...header(),
    ...definition('[P_]', POINT_FIELDS),
    '[+P_]',
    ...HYPERLINK_CASES.flatMap((entry, index) => point(index + 1,
      ['KUM', 'Kum', `SYNT-H${index + 1}`, entry.value, `Tilfelle ${entry.id}`, 'S'])),
    '[END]',
  ];
}

function withEol(lines, eol) {
  return lines.join(eol) + eol;
}

// Alternate CRLF and LF so the file is unambiguously mixed.
function mixedEol(lines) {
  return lines.map((text, index) => text + (index % 5 === 3 ? '\n' : '\r\n')).join('');
}

// --- fixture definitions --------------------------------------------------
// expect.status is the M0 reference-harness classification:
//   reconciled      all lexemes reconcile; no file-level blocker
//   unsupported     reconciles, but a file-level fail-closed rule applies
//   parser-error    production parser throws or reports errors
export const GMI_EDIT_FIXTURES = Object.freeze([
  {
    id: 'core-crlf-latin1', file: 'core-crlf-latin1.gmi', encoding: 'latin1', eol: 'crlf',
    description: 'CRLF, ISO-8859-1 Norwegian letters, _INDEX/_EXTENT "!" padding, trailing ";" names and values, GUIDs, mid-row S_HYPERLINK with sign metadata, populated and empty SDR.',
    covers: ['crlf', 'latin1-norwegian', 'index-extent-padding', 'trailing-semicolons', 'hyperlink-mid-row', 'hyperlink-sign', 'sdr-empty-cells'],
    text: () => withEol(coreLines(), '\r\n'),
    expect: { status: 'reconciled', encodingClass: 'single-byte', eolKind: 'crlf', points: 3, lines: 3 },
  },
  {
    id: 'core-lf-latin1', file: 'core-lf-latin1.gmi', encoding: 'latin1', eol: 'lf',
    description: 'Same content as core-crlf-latin1 with LF line endings; only EOL bytes differ.',
    covers: ['lf', 'latin1-norwegian', 'index-extent-padding', 'trailing-semicolons'],
    text: () => withEol(coreLines(), '\n'),
    expect: { status: 'reconciled', encodingClass: 'single-byte', eolKind: 'lf', points: 3, lines: 3 },
  },
  {
    id: 'cp1252-c1-bytes', file: 'cp1252-c1-bytes.gmi', encoding: 'cp1252', eol: 'crlf',
    description: 'Windows-1252-only bytes 0x86 (†) and 0x98 (˜) in Merknad next to Latin-1 letters; must survive every patch byte-for-byte.',
    covers: ['crlf', 'cp1252-0x86', 'cp1252-0x98', 'latin1-norwegian'],
    text: () => withEol([
      ...header(),
      ...definition('[L_]', LINE_FIELDS),
      ...definition('[P_]', POINT_FIELDS),
      '[+L_]',
      ...line(1, ['VL', 'VL', 'PE', '110', '', 'PN10', '', 'Merket † ved påkobling', '2026-04-01']),
      '[+P_]',
      ...point(1, ['KUM', 'Kum', 'SYNT-C1', wrappers([link('Attachments\\SYNT_C1.jpg')]), 'Omtrent ˜ 2 m fra kant', 'S']),
      ...point(2, ['KUM', 'Kum', 'SYNT-C2', '', 'Kryss † og tilde ˜ i samme felt', '']),
      '[END]',
    ], '\r\n'),
    expect: { status: 'reconciled', encodingClass: 'single-byte', eolKind: 'crlf', points: 2, lines: 1, c1Bytes: [0x86, 0x98] },
  },
  {
    id: 'utf8-no-bom', file: 'utf8-no-bom.gmi', encoding: 'utf8', eol: 'crlf',
    description: 'Valid UTF-8 without BOM (multibyte Norwegian letters). Decoded per byte like upload; still 1 char per byte.',
    covers: ['crlf', 'utf8-no-bom'],
    text: () => withEol([
      ...header(),
      ...definition('[L_]', LINE_FIELDS),
      ...definition('[P_]', POINT_FIELDS),
      '[+L_]',
      ...line(1, ['VL', 'VL', 'PE', '110', '', 'PN10', '', 'Rør under bekk, østre side', '2026-05-01']),
      '[+P_]',
      ...point(1, ['KUM', 'Kum', 'SYNT-U1', wrappers([link('Attachments\\SYNT_U1.jpg')]), 'Kum ved bekken ÆØÅ', 'S']),
      '[END]',
    ], '\r\n'),
    expect: { status: 'reconciled', encodingClass: 'utf8-likely', eolKind: 'crlf', points: 1, lines: 1 },
  },
  {
    id: 'extra-sections', file: 'extra-sections.gmi', encoding: 'latin1', eol: 'crlf',
    description: 'Unparsed sections [Y_], [T_] (with _rot/_label), [N_] (_OFFSET_NE, /POINTS2) and [O_COORDOBS]; /XYH and /XY geometry variants that the parser ignores. All must survive untouched.',
    covers: ['crlf', 'section-y', 'section-t', 't-label-rot', 'section-n', 'section-o-coordobs', 'geometry-xyh', 'geometry-xy'],
    text: () => withEol([
      ...header(),
      ...definition('[L_]', LINE_FIELDS),
      ...definition('[P_]', POINT_FIELDS, { pad: 52 }),
      ...definition('[Y_]', ['S_FCODE', 'Merknad']),
      ...definition('[T_]', ['S_FCODE', 'Merknad'], { pad: 24 }),
      ...definition('[N_]', ['S_FCODE'], { pad: 24, guidLine: guid(9001) }),
      '[O_COORDOBS]',
      '[+L_]',
      ...line(1, ['VL', 'VL', 'PE', '110', '', 'PN10', '', 'Vanlig /XYZ', '2026-06-01']),
      ...line(2, ['VL', 'VL', 'PE', '110', '', 'PN10', '', 'Høyde i /XYH', '2026-06-02'], { geometry: ['/XYH 1.250', '581940.00 6566010.00', '581960.00 6566020.00'] }),
      ...line(3, ['SP', 'SP', 'PVC', '160', '', '', '', 'Kun /XY', '2026-06-03'], { geometry: ['/XY', '581945.00 6566015.00', '581965.00 6566025.00'] }),
      '[+Y_]',
      ':Y 1',
      `_EXTENT ${EXTENT} `,
      values(['VL', 'Syntetisk flate']),
      `GUID ${guid(3001)}`,
      ...xyz(4, 30),
      '[+P_]',
      ...point(1, ['KUM', 'Kum', 'SYNT-E1', wrappers([link('Attachments\\SYNT_E1.jpg')]), 'Vanlig punkt', 'S']),
      ...point(2, ['KUM', 'Kum', 'SYNT-E2', '', 'Punkt med /XYH', ''], { geometry: ['/XYH 0.850', '581950.00 6566030.00'] }),
      '[+T_]',
      ':T 1',
      values(['TEKST', 'Syntetisk tekst']),
      `GUID ${guid(4001)}`,
      '_rot 12.50',
      '_label  Kum  K1',
      ...xyz(1, 40),
      ':T 2',
      values(['TEKST', 'Påskrift']),
      `GUID ${guid(4002)}`,
      '_rot 270.00',
      '_label Ledning PE110 æøå',
      ...xyz(1, 41),
      '[+N_]',
      ':N 1',
      `_EXTENT ${EXTENT} `,
      values(['SYNT']),
      `GUID ${guid(5001)}`,
      '_OFFSET_NE 581900.000 6565900.000',
      '/POINTS2',
      '1.000 2.000 0.50',
      '3.000 4.000 0.75',
      '[END]',
    ], '\r\n'),
    expect: { status: 'reconciled', encodingClass: 'single-byte', eolKind: 'crlf', points: 2, lines: 3 },
  },
  {
    id: 'no-guid', file: 'no-guid.gmi', encoding: 'latin1', eol: 'crlf',
    description: 'Objects without GUID lines (and one line without _EXTENT); identity must come from parser order.',
    covers: ['crlf', 'no-guid'],
    text: () => withEol([
      ...header(),
      ...definition('[L_]', LINE_FIELDS),
      ...definition('[P_]', POINT_FIELDS),
      '[+L_]',
      ...line(1, ['VL', 'VL', 'PE', '110', '', 'PN10', '', '', '2026-07-01'], { guidId: null }),
      ...line(2, ['VL', 'VL', 'PE', '110', '11.0', 'PN10', '', '', '2026-07-01'], { guidId: null, extent: false }),
      '[+P_]',
      ...point(1, ['KUM', 'Kum', 'SYNT-N1', wrappers([link('Attachments\\SYNT_N1.jpg')]), '', 'S'], { guidId: null }),
      ...point(2, ['KUM', 'Kum', 'SYNT-N2', '', '', ''], { guidId: null }),
      '[END]',
    ], '\r\n'),
    expect: { status: 'reconciled', encodingClass: 'ascii', eolKind: 'crlf', points: 2, lines: 2 },
  },
  {
    id: 'hyperlink-families', file: 'hyperlink-families.gmi', encoding: 'latin1', eol: 'crlf',
    description: 'Mid-row S_HYPERLINK: 1-7 wrappers in every realGrammarFamilies shape, sign metadata, bare paths, PDF, SOS, directory-only, deeper paths, no trailing space, leading space, a multi-link wrapper and invalid grammar.',
    covers: ['crlf', 'hyperlink-mid-row', 'hyperlink-1-to-6-wrappers', 'hyperlink-sign', 'hyperlink-bare', 'hyperlink-pdf', 'hyperlink-sos', 'hyperlink-directory-only', 'hyperlink-multi-link', 'hyperlink-invalid-grammar'],
    text: () => withEol(hyperlinkLines(), '\r\n'),
    expect: { status: 'reconciled', encodingClass: 'single-byte', eolKind: 'crlf', points: HYPERLINK_CASES.length, lines: 0 },
  },
  {
    id: 'shared-photo', file: 'shared-photo.gmi', encoding: 'latin1', eol: 'crlf',
    description: 'One photograph referenced by two different objects (a point and a line); removing one link must leave the other.',
    covers: ['crlf', 'shared-photo'],
    text: () => withEol([
      ...header(),
      ...definition('[L_]', LINE_FIELDS),
      ...definition('[P_]', POINT_FIELDS),
      '[+L_]',
      ...line(1, ['VL', 'VL', 'PE', '110', '', 'PN10', wrappers([link('Attachments\\SYNT_DELT_1.jpg', 'Feltmåler A')]), 'Deler bilde med kum', '2026-08-01']),
      '[+P_]',
      ...point(1, ['KUM', 'Kum', 'SYNT-D1', wrappers([link('Attachments\\SYNT_DELT_1.jpg', 'Feltmåler A'), link('Attachments\\SYNT_EGEN_2.jpg')]), 'Deler bilde med ledning', 'S']),
      ...point(2, ['KUM', 'Kum', 'SYNT-D2', wrappers([link('Attachments\\SYNT_EGEN_3.jpg')]), '', '']),
      '[END]',
    ], '\r\n'),
    expect: { status: 'reconciled', encodingClass: 'single-byte', eolKind: 'crlf', points: 2, lines: 1 },
  },
  {
    id: 'merknad-quotes', file: 'merknad-quotes.gmi', encoding: 'latin1', eol: 'crlf',
    description: 'Merknad values with odd and irregular quotation marks (inch marks); splitting is on ";" only, never quote-aware.',
    covers: ['crlf', 'merknad-odd-quotes'],
    text: () => withEol([
      ...header(),
      ...definition('[P_]', POINT_FIELDS),
      '[+P_]',
      ...point(1, ['KUM', 'Kum', 'SYNT-Q1', wrappers([link('Attachments\\SYNT_Q1.jpg')]), 'Rør 2" stål', 'S']),
      ...point(2, ['KUM', 'Kum', 'SYNT-Q2', '', 'Sitat "ok" her', '']),
      ...point(3, ['KUM', 'Kum', 'SYNT-Q3', '', 'Tre " anførsel " tegn "', '']),
      ...point(4, ['KUM', 'Kum', 'SYNT-Q4', wrappers([link('Attachments\\SYNT_Q4.jpg')]), '"', 'S']),
      '[END]',
    ], '\r\n'),
    expect: { status: 'reconciled', encodingClass: 'single-byte', eolKind: 'crlf', points: 4, lines: 0 },
  },
  {
    id: 'sdr-empty', file: 'sdr-empty.gmi', encoding: 'latin1', eol: 'crlf',
    description: 'SDR column present: empty, whitespace-only and populated (11.0, 17.0) values; first and trailing cells empty.',
    covers: ['crlf', 'sdr-empty-cells', 'sdr-whitespace-cell', 'first-column-empty'],
    text: () => withEol([
      ...header(),
      ...definition('[L_]', LINE_FIELDS),
      '[+L_]',
      ...line(1, ['', 'VL', 'PE', '110', '', 'PN10', '', '', '']),
      ...line(2, ['VL', 'VL', 'PE', '110', ' ', 'PN10', '', '', '2026-09-01']),
      ...line(3, ['VL', 'VL', 'PE', '160', '11.0', 'PN16', '', '', '2026-09-01']),
      ...line(4, ['VL', 'VL', 'PE', '225', '17.0', 'PN10', '', '', '2026-09-01']),
      '[END]',
    ], '\r\n'),
    expect: { status: 'reconciled', encodingClass: 'ascii', eolKind: 'crlf', points: 0, lines: 4 },
  },
  {
    id: 'sdr-absent', file: 'sdr-absent.gmi', encoding: 'latin1', eol: 'crlf',
    description: 'Same lines without any SDR column; a value fill is impossible (future column add only).',
    covers: ['crlf', 'sdr-absent-column'],
    text: () => withEol([
      ...header(),
      ...definition('[L_]', LINE_FIELDS_NO_SDR),
      '[+L_]',
      ...line(1, ['VL', 'VL', 'PE', '110', 'PN10', '', '', '2026-09-01']),
      ...line(2, ['VL', 'VL', 'PE', '160', 'PN16', '', '', '2026-09-01']),
      '[END]',
    ], '\r\n'),
    expect: { status: 'reconciled', encodingClass: 'ascii', eolKind: 'crlf', points: 0, lines: 2 },
  },
  {
    id: 'guard-irregular-objects', file: 'guard-irregular-objects.gmi', encoding: 'latin1', eol: 'crlf',
    description: 'Objects with two _FIELDVALUES lines, more values than names, fewer values than names and no _FIELDVALUES. File reconciles; those objects are not editable.',
    covers: ['crlf', 'object-double-fieldvalues', 'object-more-values', 'object-fewer-values', 'object-no-fieldvalues'],
    text: () => withEol([
      ...header(),
      ...definition('[P_]', POINT_FIELDS),
      '[+P_]',
      ...point(1, ['KUM', 'Kum', 'SYNT-G1', '', 'Normal', 'S']),
      ...point(2, ['KUM', 'Kum', 'SYNT-G2', '', 'Første linje', 'S'], { extra: [values(['KUM', 'Kum', 'SYNT-G2', '', 'Andre linje', 'S'])] }),
      ...point(3, ['KUM', 'Kum', 'SYNT-G3', '', 'For mange', 'S', 'EKSTRA']),
      ':P 4', '_FIELDVALUES KUM;Kum', `GUID ${guid(2004)}`, ...xyz(1, 4),
      ':P 5', `GUID ${guid(2005)}`, ...xyz(1, 5),
      '[END]',
    ], '\r\n'),
    expect: { status: 'reconciled', encodingClass: 'single-byte', eolKind: 'crlf', points: 5, lines: 0, nonEditableObjects: 4 },
  },
  {
    id: 'guard-repeated-section', file: 'guard-repeated-section.gmi', encoding: 'latin1', eol: 'crlf',
    description: 'Two [P_] definition sections (parser keeps the last). Reconciles, but is read-only by the fail-closed rule.',
    covers: ['crlf', 'repeated-section'],
    text: () => withEol([
      ...header(),
      ...definition('[P_]', ['S_FCODE', 'Merknad']),
      ...definition('[P_]', POINT_FIELDS),
      '[+P_]',
      ...point(1, ['KUM', 'Kum', 'SYNT-R1', '', '', 'S']),
      '[END]',
    ], '\r\n'),
    expect: { status: 'unsupported', reasons: ['repeated-section'], encodingClass: 'ascii', eolKind: 'crlf', points: 1, lines: 0 },
  },
  {
    id: 'guard-mixed-eol', file: 'guard-mixed-eol.gmi', encoding: 'latin1', eol: 'mixed',
    description: 'Core content with mixed CRLF and LF. The parser accepts it; editing is refused (fail-closed).',
    covers: ['mixed-eol'],
    text: () => mixedEol(coreLines()),
    expect: { status: 'unsupported', reasons: ['mixed-eol'], encodingClass: 'single-byte', eolKind: 'mixed', points: 3, lines: 3 },
  },
  {
    id: 'guard-cr-only', file: 'guard-cr-only.gmi', encoding: 'latin1', eol: 'cr',
    description: 'Bare-CR line endings. The parser does not split on CR and throws; reported, never repaired.',
    covers: ['cr-only-eol'],
    text: () => withEol(coreLines(), '\r'),
    expect: { status: 'parser-error', encodingClass: 'single-byte', eolKind: 'cr' },
  },
  {
    id: 'guard-utf8-bom', file: 'guard-utf8-bom.gmi', encoding: 'utf8-bom', eol: 'crlf',
    description: 'UTF-8 with BOM. The signature check fails, so the parser throws; reported, never repaired.',
    covers: ['utf8-bom'],
    text: () => withEol(coreLines(), '\r\n'),
    expect: { status: 'parser-error', encodingClass: 'utf8-bom', eolKind: 'crlf' },
  },
]);

export function buildGmiEditFixtureBytes(fixture) {
  return encoders[fixture.encoding](fixture.text());
}

export const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function buildGmiEditManifest() {
  return {
    schemaVersion: '1.0.0',
    purpose: 'Fabricated, byte-exact GMI fixtures for source-preserving editing (M0). Checksums are SHA-256 of the raw committed bytes.',
    statusLegend: {
      reconciled: 'every production parser lexeme reconciles with an exact source span and no file-level fail-closed rule applies',
      unsupported: 'reconciles, but a file-level fail-closed rule applies (read-only)',
      'parser-error': 'the production GMIParser throws or reports errors (read-only, never repaired)',
    },
    fixtures: GMI_EDIT_FIXTURES.map((fixture) => {
      const bytes = buildGmiEditFixtureBytes(fixture);
      return {
        id: fixture.id,
        file: fixture.file,
        bytes: bytes.length,
        sha256: sha256Hex(bytes),
        encoding: fixture.encoding,
        eol: fixture.eol,
        description: fixture.description,
        covers: fixture.covers,
        expect: fixture.expect,
      };
    }),
  };
}

export async function writeGmiEditFixtures(directory = GMI_EDIT_FIXTURE_DIR) {
  await mkdir(directory, { recursive: true });
  for (const fixture of GMI_EDIT_FIXTURES) {
    await writeFile(path.join(directory, fixture.file), buildGmiEditFixtureBytes(fixture));
  }
  await writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify(buildGmiEditManifest(), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--write')) {
  await writeGmiEditFixtures();
  console.log(`wrote ${GMI_EDIT_FIXTURES.length} fixtures and manifest.json to ${path.relative(process.cwd(), GMI_EDIT_FIXTURE_DIR)}`);
}
