// Names for one generated export. The ZIP and its GML share a basename: YYYYMMDD-HHmmss[-label].
//
// The timestamp is wall-clock time in Europe/Oslo whatever the machine's timezone, so the same instant always gets the
// same name. In the hour repeated when summer time ends, two instants can format alike.
//
// Only the ZIP and GML names come from here. Attachment names and paths belong to attachmentNames.mjs, and nothing in
// the XML refers to the GML's own filename.

export const PHOTO_EXPORT_LABEL_MAX_LENGTH = 48;

const NORWEGIAN_LETTERS = Object.freeze({ æ: 'ae', ø: 'oe', å: 'aa', Æ: 'Ae', Ø: 'Oe', Å: 'Aa' });

const osloClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Oslo', calendar: 'gregory', numberingSystem: 'latn', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function formatPhotoExportTimestamp(date) {
  const part = Object.fromEntries(osloClock.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${part.year}${part.month}${part.day}-${part.hour}${part.minute}${part.second}`;
}

// Plain ASCII letters, digits, underscores and hyphens, so the name survives any unzip tool or import chain. That leaves
// nothing for path traversal or Windows to object to. NFC first: å may arrive as a + combining ring, which the letter
// table would miss and the mark stripping would reduce to a plain a. The label always follows the timestamp, so it
// cannot form a reserved device name such as CON.
export function sanitizePhotoExportLabel(label) {
  return String(label ?? '').normalize('NFC').replace(/[æøåÆØÅ]/g, (letter) => NORWEGIAN_LETTERS[letter])
    .normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[^A-Za-z0-9_]+/g, '-').replace(/[-_]+/g, (run) => run.includes('_') ? '_' : '-')
    .replace(/^[-_]/, '')
    .slice(0, PHOTO_EXPORT_LABEL_MAX_LENGTH).replace(/[-_]$/, '');
}

// Derive only from the live imported source name; generated prefixes must not accumulate on re-import.
export function suggestRevisionLabel(sourceFilename) {
  if (typeof sourceFilename !== 'string' || !sourceFilename.trim()) return '';
  let stem = sourceFilename.normalize('NFC').trim().split(/[/\\]/).at(-1)
    .replace(/\.gmi$/i, '').replace(/\s*\(\d{1,3}\)$/, '');
  const timestamp = /^\d{4}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])-(?:[01]\d|2[0-3])[0-5]\d[0-5]\d(?:-|$)/;
  while (timestamp.test(stem)) stem = stem.replace(timestamp, '');
  const revision = /(?:^|[\s._-]+)rev[\s._-]?(\d{1,4})$/i.exec(stem);
  const digits = revision ? String(Number(revision[1]) + 1).padStart(Math.max(2, revision[1].length), '0') : '01';
  const suffix = `_rev${digits}`;
  const descriptive = sanitizePhotoExportLabel(revision ? stem.slice(0, revision.index) : stem)
    .slice(0, PHOTO_EXPORT_LABEL_MAX_LENGTH - suffix.length).replace(/[-_]+$/, '');
  return descriptive ? `${descriptive}${suffix}` : `rev${digits}`;
}

// `label` is kept as entered, for a form to show again. `sanitizedLabel` is the only form that reaches a filename.
export function photoExportNames({ label = '', date }) {
  const timestamp = formatPhotoExportTimestamp(date), sanitizedLabel = sanitizePhotoExportLabel(label);
  const basename = sanitizedLabel ? `${timestamp}-${sanitizedLabel}` : timestamp;
  return Object.freeze({ label: String(label ?? ''), sanitizedLabel, timestamp, basename, zipFilename: `${basename}.zip`, gmlFilename: `${basename}.gml` });
}
