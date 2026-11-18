import { normalizeCaptureTime } from './photoCaptureMetadata.mjs';

// Filename capture times are local wall clocks of unknown zone. They are suggestions only: nothing here reads
// the host timezone, adds an offset, pads seconds or invents a time. `today` is a calendar date used only to
// reject implausible future dates.

const DATE_FORMS = [
  // 14 digits: date and time with seconds in one run. A 12-digit run is never read (collides with numbering).
  { form: 'ymd-14', re: /(?<!\d)(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?!\d)/g, order: 'ymd' },
  { form: 'ymd-compact', re: /(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/g, order: 'ymd' },
  { form: 'ymd-separated', re: /(?<!\d)(\d{4})([-_])(\d{2})\2(\d{2})(?!\d)/g, order: 'ymd', separated: true },
  { form: 'dmy-dotted', re: /(?<![\d.])(\d{2})\.(\d{2})\.(\d{4})(?!\d|\.\d)/g, order: 'dmy' },
];

// A time is read only when it directly follows the date with exactly one separator.
const TIME_FORMS = [
  { re: /^[_\- T](\d{2})(\d{2})(\d{2})(?!\d)/, precision: 'second', compact: true },
  { re: /^[_\- T](\d{2})([-._])(\d{2})\2(\d{2})(?!\d)/, precision: 'second' },
  { re: /^[_\- T](\d{2})(\d{2})(?!\d)/, precision: 'minute', compact: true },
  { re: /^[_\- T](\d{2})([-._])(\d{2})(?!\d|[-._ ]\d)/, precision: 'minute' },
];

export const FILENAME_CAPTURE_PATTERNS = Object.freeze([
  { id: 'ymd-hms-compact', examples: ['20261014_143302', 'IMG_20261014_143302', 'IMG_20261014_143302_1'], precision: 'second' },
  { id: 'ymd-hms-14', examples: ['20261014143302'], precision: 'second' },
  { id: 'ymd-hms-separated', examples: ['2026-10-14_14-33-02', '2026-10-14 14.33.02', 'WP_20261014_14_33_02_Pro'], precision: 'second' },
  { id: 'dmy-hms', examples: ['14.10.2026_143302', '14.10.2026 14.33.02'], precision: 'second' },
  { id: 'ymd-hm-compact', examples: ['20261014_1433'], precision: 'minute' },
  { id: 'ymd-hm-compact-seq', examples: ['20261014_1433_01', '0710261.1_20261014_1433_01'], precision: 'minute' },
  { id: 'ymd-hm-separated', examples: ['2026-10-14_14-33'], precision: 'minute' },
  { id: 'dmy-hm', examples: ['14.10.2026_1433'], precision: 'minute' },
  { id: 'ymd-compact', examples: ['20261014', 'KUM12_20261014'], precision: 'date' },
  { id: 'ymd-separated', examples: ['2026-10-14', '2026_10_14'], precision: 'date' },
  { id: 'dmy-dotted', examples: ['14.10.2026'], precision: 'date' },
].map((pattern) => Object.freeze({ ...pattern, examples: Object.freeze(pattern.examples) })));

// Names whose embedded date is not a local capture date: Pixel names are commonly UTC, and WhatsApp names
// carry the transfer date.
const EXCLUDED_NAMES = [/^PXL_/i, /^IMG-\d{8}-WA\d*/i];

const pad = (value) => String(value).padStart(2, '0');
const daysIn = (year, month) => [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
const addDay = (iso) => {
  let [year, month, day] = iso.split('-').map(Number);
  if (++day > daysIn(year, month)) { day = 1; if (++month > 12) { month = 1; year++; } }
  return `${year}-${pad(month)}-${pad(day)}`;
};

// The local calendar date, for plausibility only.
export const localCalendarDate = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function validDate(year, month, day) {
  return year >= 2000 && year <= 2099 && month >= 1 && month <= 12 && day >= 1 && day <= daysIn(year, month);
}

function dateTokens(stem) {
  const tokens = [];
  for (const { form, re, order, separated } of DATE_FORMS) {
    for (const match of stem.matchAll(re)) {
      const start = match.index, end = start + match[0].length;
      // A shorter form inside an already recognised token is not a separate date.
      if (tokens.some((token) => start < token.end && end > token.start)) continue;
      const parts = match.slice(1).filter((part) => /^\d+$/.test(part)).map(Number);
      const [year, month, day] = order === 'ymd' ? parts : [parts[2], parts[1], parts[0]];
      tokens.push({ form, start, end, year, month, day, separated: Boolean(separated), clock: form === 'ymd-14' ? parts.slice(3) : null });
    }
  }
  return tokens.sort((a, b) => a.start - b.start);
}

function followingTime(stem, token) {
  if (token.clock) return { clock: token.clock, precision: 'second', compact: true, end: token.end };
  const rest = stem.slice(token.end);
  for (const { re, precision, compact } of TIME_FORMS) {
    const match = rest.match(re);
    if (!match) continue;
    const clock = match.slice(1).filter((part) => /^\d+$/.test(part)).map(Number);
    const sequenceSuffix = precision === 'minute' && compact
      ? rest.slice(match[0].length).match(/^[_-](\d{2})(?!\d|[_-]\d)/)?.[1]
      : undefined;
    return { clock, precision, compact: Boolean(compact), end: token.end + match[0].length, sequenceSuffix };
  }
  return null;
}

function patternId(token, time) {
  if (token.form === 'ymd-14') return 'ymd-hms-14';
  const order = token.form.startsWith('dmy') ? 'dmy' : 'ymd';
  if (!time) return token.form;
  if (order === 'dmy') return time.precision === 'second' ? 'dmy-hms' : 'dmy-hm';
  if (time.sequenceSuffix) return 'ymd-hm-compact-seq';
  return `ymd-${time.precision === 'second' ? 'hms' : 'hm'}-${time.compact ? 'compact' : 'separated'}`;
}

export function parseFilenameCaptureTime(filename, { today } = {}) {
  if (typeof filename !== 'string' || !filename) return null;
  const base = filename.split(/[\\/]/).pop();
  if (EXCLUDED_NAMES.some((re) => re.test(base))) return null;
  const stem = base.replace(/\.[^.]*$/, '');
  const tokens = dateTokens(stem);
  if (!tokens.length) return null;
  const readings = [];
  for (const token of tokens) {
    // A compact minute with two numeric suffixes can also look like YYYY_MM_DD.
    // Keep checking for conflicts when the overlapping token has a supported year.
    const overlapsMinute = token.separated && (token.year < 2000 || token.year > 2099)
      && readings.some(({ time }) => time?.compact && time.precision === 'minute' && time.end === token.start + 4);
    if (!overlapsMinute) readings.push({ token, time: followingTime(stem, token) });
  }
  for (const { token, time } of readings) {
    if (!validDate(token.year, token.month, token.day)) return null;
    if (time && (time.clock[0] > 23 || time.clock[1] > 59 || (time.clock[2] ?? 0) > 59)) return null;
  }
  const dates = new Set(readings.map(({ token }) => `${token.year}-${pad(token.month)}-${pad(token.day)}`));
  if (dates.size !== 1) return null;
  const [date] = dates;
  if (today && date > addDay(today)) return null;
  const timed = readings.filter((reading) => reading.time);
  const clocks = new Set(timed.map(({ time }) => time.clock.map(pad).join(':')));
  if (clocks.size > 1) return null;
  const chosen = timed[0] || readings[0];
  const value = normalizeCaptureTime(chosen.time ? `${date}T${chosen.time.clock.map(pad).join(':')}` : date);
  if (!value) return null;
  const compactMinute = chosen.time?.precision === 'minute' && chosen.time.compact ? chosen.time.clock.map(pad).join('') : null;
  return Object.freeze({ value, precision: value.precision, pattern: patternId(chosen.token, chosen.time),
    token: stem.slice(chosen.token.start, chosen.time ? chosen.time.end : chosen.token.end), raw: base,
    compactMinute, ...(compactMinute ? { template: `${base.slice(0, chosen.time.end - 4)}####${base.slice(chosen.time.end)}` } : {}) });
}

// Low consecutive compact HHmm values can be counters. Fall back to the date for the run and matching templates.
function sequenceCounterIds(parsed) {
  const byDate = Map.groupBy(parsed.filter((item) => item.compactMinute), (item) => item.value.iso.slice(0, 10));
  const ids = new Set();
  for (const items of byDate.values()) {
    const byClock = Map.groupBy(items, (item) => Number(item.compactMinute));
    const numbers = [...byClock.keys()].sort((a, b) => a - b);
    const templates = new Set();
    for (let start = 0; start < numbers.length && numbers[start] <= 10;) {
      let end = start + 1;
      while (end < numbers.length && numbers[end] === numbers[end - 1] + 1) end++;
      if (end - start >= 3) {
        for (const number of numbers.slice(start, end)) {
          for (const item of byClock.get(number)) templates.add(item.template);
        }
      }
      start = end;
    }
    for (const item of items) {
      if (templates.has(item.template)) ids.add(item.assetId);
    }
  }
  return ids;
}

const hasUsableCaptureEvidence = (evidence = []) => evidence.some((item) => item.field === 'captureTime' && item.value);

// Candidates are unique assets with no usable EXIF or draft-GML capture time, no accepted value and no removal
// record. Photos still being read for EXIF are never offered; `pending` counts those whose filename has a date.
export function planFilenameCaptureSuggestions(photos, { draftGmlEvidenceByAsset = new Map(), today } = {}) {
  const seen = new Set(), parsed = [];
  let missing = 0, pending = 0;
  for (const photo of photos) {
    const assetId = photo.assetId || photo.id;
    if (seen.has(assetId)) continue;
    seen.add(assetId);
    if (photo.spatial?.exifRead?.state === 'pending') { if (parseFilenameCaptureTime(photo.originalFilename, { today })) pending++; continue; }
    if (photo.captureMetadata?.captureTime || photo.captureMetadata?.captureTimeCleared) continue;
    if (hasUsableCaptureEvidence(photo.metadataEvidence?.filter((item) => item.kind === 'exif'))) continue;
    if (hasUsableCaptureEvidence(draftGmlEvidenceByAsset.get(assetId))) continue;
    missing++;
    const result = parseFilenameCaptureTime(photo.originalFilename, { today });
    if (result) parsed.push({ ...result, assetId, filename: photo.originalFilename });
  }
  const counters = sequenceCounterIds(parsed);
  const complete = [], dateOnly = [];
  for (const item of parsed) {
    const downgrade = counters.has(item.assetId);
    const value = downgrade ? normalizeCaptureTime(item.value.iso.slice(0, 10)) : item.value;
    const pattern = downgrade ? (item.pattern === 'dmy-hm' ? 'dmy-dotted' : 'ymd-compact') : item.pattern;
    const token = downgrade ? item.token.slice(0, item.token.length - 5) : item.token;
    const suggestion = Object.freeze({ assetId: item.assetId, filename: item.filename, value, pattern, token,
      ...(downgrade ? { downgraded: 'sequence-counter' } : {}) });
    (value.precision === 'date' ? dateOnly : complete).push(suggestion);
  }
  return Object.freeze({ missing, pending, complete: Object.freeze(complete), dateOnly: Object.freeze(dateOnly) });
}

// The accepted value for an approved suggestion. No `acceptance` field: it is not automatically replaceable.
export const filenameCaptureTimeWrite = (suggestion, acceptedAt) => Object.freeze({ value: suggestion.value,
  provenance: Object.freeze({ kind: 'filename', raw: suggestion.filename, token: suggestion.token, pattern: suggestion.pattern,
    ...(suggestion.downgraded ? { downgraded: suggestion.downgraded } : {}), via: 'import-suggestion' }), acceptedAt });

export function selectedFilenameCaptureWrites(plan, choices = {}, acceptedAt = Date.now()) {
  return [...(choices.complete ? plan.complete : []), ...(choices.dateOnly ? plan.dateOnly : [])]
    .map((suggestion) => [suggestion.assetId, filenameCaptureTimeWrite(suggestion, acceptedAt)]);
}
