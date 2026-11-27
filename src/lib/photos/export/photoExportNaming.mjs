// Names for one generated export. Every artifact of an export (GMI, GML, ZIP and the delivery report) shares one
// basename: [YYYYMMDD-HHmm-]<descriptive>[_revNN]. The timestamp and the revision are independent and optional; the
// descriptive part is the user's text, made safe for filesystems but otherwise kept as written (spaces, æøå, case).
//
// The timestamp is wall-clock time in Europe/Oslo whatever the machine's timezone, so the same instant always gets the
// same name. It has minute precision: two exports in the same minute with the same inputs get the same name, and the
// browser keeps both downloads. In the hour repeated when summer time ends, two instants can also format alike.
//
// Only these names come from here. Attachment names and paths belong to attachmentNames.mjs, and nothing in the XML
// refers to the GML's own filename.

/** Advisory thresholds for the primary artifact's filename. */
export const EXPORT_FILENAME_NOTICE_LENGTH = 60;
export const EXPORT_FILENAME_ADVISORY_LENGTH = 80;
/** Conservative per-name limit shared by NTFS, APFS and ext4 (UTF-8 bytes). Exceeding it blocks the export. */
export const EXPORT_FILENAME_MAX_BYTES = 255;
/** The longest artifact name of an export; the byte limit is checked against it. */
export const EXPORT_REPORT_SUFFIX = '-leveranserapport.txt';
/** What the editor shows in place of a timestamp that does not exist until the plan is built. */
export const EXPORT_TIMESTAMP_PLACEHOLDER = 'ååååmmdd-ttmm';
export const EXPORT_FILENAME_ISSUES = Object.freeze(['filename-empty', 'filename-reserved', 'filename-too-long']);

export class ExportFilenameError extends Error {
  constructor(code) { super(`Ugyldig filnavn (${code}).`); this.name = 'ExportFilenameError'; this.code = code; }
}

const osloClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', calendar: 'gregory', numberingSystem: 'latn', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

/** `YYYYMMDD-HHmm`, Europe/Oslo. */
export function formatPhotoExportTimestamp(date) {
  const part = Object.fromEntries(osloClock.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${part.year}${part.month}${part.day}-${part.hour}${part.minute}`;
}

// Filesystem safety only. NFC first, so å typed as a + combining ring is one letter. Characters Windows, macOS or
// Linux reject in a name (controls, < > : " / \ | ? *) and unpaired surrogates become '-'; whitespace runs become one
// space; leading and trailing dots and spaces go, because Windows drops or rejects them. Nothing is cut. Text with no
// letter or digit left (for example '/', '...') counts as empty, so it cannot form a name of separators alone.
export function sanitizeExportDescriptive(text) {
  const safe = String(text ?? '').normalize('NFC')
    .replace(/[\u0000-\u001F\u007F<>:"/\\|?*\p{Cs}]+/gu, '-')
    .replace(/\s+/gu, ' ')
    .replace(/^[\s.]+/u, '').replace(/[\s.]+$/u, '');
  return /[\p{L}\p{N}]/u.test(safe) ? safe : '';
}

// Batch 2C: advisory compatibility only, never applied to a name by itself. Some Windows programs open files through
// legacy code-page paths and can fail on characters outside it. A Gemini VA import failed with an en dash in the
// extracted folder name and worked with '_' instead; that shows a risk, not an exact list of refused characters. So
// everything outside printable ASCII and the Latin-1 letters (which include æøå) is reported, and the suggestion only
// replaces what it has to. The export itself stays valid and is never blocked by this.
const UNCOMMON_NAME_CHARACTER = /[^ -~À-ÖØ-öø-ÿ]/gu;
const NAME_SUGGESTIONS = [
  [/[‐-―−­]/gu, '-'],
  [/\s/gu, ' '],
  [/[​-‍⁠﻿]/gu, ''],
  [/[‘’‚‛“”„‟«»‹›]/gu, ''],
];
const NAMED_CHARACTERS = Object.freeze({ '–': 'tankestrek', '—': 'lang tankestrek', '−': 'minustegn', '­': 'myk bindestrek',
  ' ': 'hardt mellomrom', '‘': 'typografisk apostrof', '’': 'typografisk apostrof', '“': 'typografisk anførselstegn',
  '”': 'typografisk anførselstegn', '«': 'anførselstegn', '»': 'anførselstegn' });

/** The distinct characters in `text` that not every program handles in a file or folder name, in order of appearance. */
export function exportNameUncommonCharacters(text) {
  return [...new Set(String(text ?? '').normalize('NFC').match(UNCOMMON_NAME_CHARACTER) || [])];
}

/** A Norwegian description of one such character, for example «tankestrek (–)» or «U+2192 (→)». */
export function describeExportNameCharacter(char) {
  const code = `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
  const shown = /\s/u.test(char) || char === '­' ? code : `${code}, ${char}`;
  return NAMED_CHARACTERS[char] ? `${NAMED_CHARACTERS[char]} (${shown})` : shown;
}

/** The descriptive text with those characters replaced (dashes become '-', typographic quotes go, the rest '_'). */
export function exportNameCompatibilitySuggestion(descriptive) {
  let text = String(descriptive ?? '').normalize('NFC');
  for (const [pattern, replacement] of NAME_SUGGESTIONS) text = text.replace(pattern, replacement);
  return sanitizeExportDescriptive(text.replace(UNCOMMON_NAME_CHARACTER, '_'));
}

/**
 * Advisory length of the longest path inside an extracted package, counted from the folder it is extracted into
 * (`<basename>\Attachments\<name>`). Where that folder lies is unknown to the application; this leaves room for an
 * ordinary location within the classic Windows path length. It is a prompt to check, not a known limit.
 */
export const EXPORT_PACKAGE_PATH_NOTICE_LENGTH = 150;

const GENERATED_PREFIX =/^\d{4}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])-(?:[01]\d|2[0-3])[0-5]\d(?:[0-5]\d)?(?:-|$)/;
const REVISION = /(?:^|[\s._-]+)rev[\s._-]?(\d{1,4})$/i;

/**
 * Split a source GMI filename into the descriptive text to suggest and the next revision. Only generated parts are
 * removed: the path, `.gmi`, a browser ` (n)` counter, leading `YYYYMMDD-HHmm-` (current) and `YYYYMMDD-HHmmss-`
 * (legacy) timestamps with a plausible date and time, and a trailing `rev` number. A contractor prefix of exactly the
 * generated `YYYYMMDD-HHmm-` shape is removed too (accepted ambiguity); date-only and other date formats are kept.
 * The descriptive text is returned raw, neither sanitized nor shortened. `null` without a usable name.
 */
export function parseSourceFilename(sourceFilename) {
  if (typeof sourceFilename !== 'string' || !sourceFilename.trim()) return null;
  let stem = sourceFilename.normalize('NFC').trim().split(/[/\\]/).at(-1)
    .replace(/\.gmi$/i, '').replace(/\s*\(\d{1,3}\)$/, '');
  while (GENERATED_PREFIX.test(stem)) stem = stem.replace(GENERATED_PREFIX, '');
  const revision = REVISION.exec(stem);
  const nextRevision = revision ? String(Number(revision[1]) + 1).padStart(Math.max(2, revision[1].length), '0') : '01';
  return Object.freeze({ descriptive: revision ? stem.slice(0, revision.index) : stem, nextRevision });
}

const RESERVED = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/i;
const utf8Length = (text) => new TextEncoder().encode(text).length;

function compose({ stamp, descriptive, revision }) {
  if (revision && !/^rev\d{2,}$/.test(revision)) throw new TypeError('revision must look like rev01');
  const desc = sanitizeExportDescriptive(descriptive);
  const base = [stamp, desc].filter(Boolean).join('-');
  const basename = !revision ? base : desc ? `${base}_${revision}` : base ? `${base}-${revision}` : revision;
  return { desc, basename };
}

function issueOf(basename) {
  if (!basename) return 'filename-empty';
  if (RESERVED.test(basename)) return 'filename-reserved';
  if (utf8Length(`${basename}${EXPORT_REPORT_SUFFIX}`) > EXPORT_FILENAME_MAX_BYTES) return 'filename-too-long';
  return null;
}

/** The editor's view of a name before the plan's timestamp exists; the placeholder has the real timestamp's length. */
export function exportFilenamePreview({ descriptive = '', timestamp = true, revision = '', extension = '' } = {}) {
  const { desc, basename } = compose({ stamp: timestamp ? '00000000-0000' : '', descriptive, revision });
  const prefix = timestamp ? `${EXPORT_TIMESTAMP_PLACEHOLDER}${desc || revision ? '-' : ''}` : '';
  const suffix = `${revision ? `${desc ? '_' : ''}${revision}` : ''}${extension}`;
  return Object.freeze({ prefix, suffix, length: [...`${basename}${extension}`].length, issue: issueOf(basename) });
}

/** Reads the filename choices from an export configuration; `label` is the descriptive text. */
export const exportFilenameOptions = (configuration = {}) => ({
  descriptive: configuration.label ?? '',
  timestamp: configuration.filenameTimestamp !== false,
  revision: configuration.filenameRevision === false ? '' : configuration.revision ?? '',
});

/**
 * One export's names. `label` is accepted as an alias of `descriptive`. Throws ExportFilenameError with code
 * `filename-empty`, `filename-reserved` or `filename-too-long` rather than produce a name that cannot be saved.
 */
export function photoExportNames({ date, descriptive, label = '', timestamp = true, revision = '' }) {
  const raw = String(descriptive ?? label ?? '');
  const stamp = timestamp ? formatPhotoExportTimestamp(date) : '';
  const { desc, basename } = compose({ stamp, descriptive: raw, revision });
  const issue = issueOf(basename);
  if (issue) throw new ExportFilenameError(issue);
  return Object.freeze({ label: raw, sanitizedLabel: desc, timestamp: stamp, revision, basename,
    zipFilename: `${basename}.zip`, gmlFilename: `${basename}.gml`, reportFilename: `${basename}${EXPORT_REPORT_SUFFIX}` });
}
