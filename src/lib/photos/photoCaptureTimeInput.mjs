import { normalizeCaptureTime } from './photoCaptureMetadata.mjs';

// Native date/time/timezone controls <-> the canonical capture-time string. Unknown timezone is the
// default and is never replaced by a guessed offset; offsets only come from evidence or an accepted value.
export const CAPTURE_TIME_ERRORS = Object.freeze({ 'missing-date': 'Velg en dato.', 'invalid-offset': 'Skriv forskyvningen som +HH:MM eller −HH:MM.',
  'offset-without-time': 'Tidssone krever klokkeslett.', 'invalid-value': 'Ugyldig dato eller klokkeslett.',
  'missing-seconds': 'Kilden har ikke sekunder. Oppgi sekunder.', 'missing-time': 'Oppgi klokkeslett med sekunder.' });

export const CAPTURE_TIMEZONE_OPTIONS = Object.freeze([
  Object.freeze({ value: '', label: 'Ukjent tidssone' }),
  Object.freeze({ value: 'Z', label: 'UTC (Z)' }),
  Object.freeze({ value: '+01:00', label: '+01:00 (norsk normaltid)' }),
  Object.freeze({ value: '+02:00', label: '+02:00 (norsk sommertid)' }),
  Object.freeze({ value: 'other', label: 'Annen forskyvning…' }),
]);

export function captureTimeFields(iso) {
  const match = typeof iso === 'string' ? iso.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(?::(\d{2}))?(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/) : null;
  if (!match) return { date: '', time: '', zone: '', customOffset: '' };
  const [, date, minutes, seconds, offset] = match;
  const preset = CAPTURE_TIMEZONE_OPTIONS.some((option) => option.value === (offset || '') && option.value !== 'other');
  return { date, time: minutes ? `${minutes}:${seconds || '00'}` : '', zone: preset ? offset || '' : 'other', customOffset: preset ? '' : offset || '' };
}

// The time control needs seconds, so a minute-precision value prefills ":00". That prefill is a starting
// point and no recorded second: while the field still shows it, saving would invent the seconds.
export const hasPlaceholderSeconds = (value, fields) => value?.precision === 'minute' && fields.time === captureTimeFields(value.iso).time;

// What a value without seconds means for the chosen delivery. Without a delivery the field stays general.
export function captureTimeHelp(profile) {
  if (profile === 'gemini-legacy2019') return 'Uten klokkeslett lagres bare dato. Bare dato eksporteres ikke til Gemini VA.';
  return profile ? 'Uten klokkeslett lagres bare dato. Denne leveransen krever sekunder.' : 'Uten klokkeslett lagres bare dato. Legacy og AsBuilt krever sekunder.';
}

// Returns { ok, value } where value is the canonical normalized capture time, or { ok:false, error }.
// requireSeconds is for bulk fill, which accepts nothing less precise.
export function composeCaptureTime({ date = '', time = '', zone = '', customOffset = '' }, { requireSeconds = false } = {}) {
  if (!date) return { ok: false, error: 'missing-date' };
  // With step=1 the field always carries seconds; browsers may omit ":00" for a zero second.
  const clock = time ? (/^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time) : '';
  const offset = zone === 'other' ? customOffset.trim() : zone;
  if (zone === 'other' && !/^[+-]\d{2}:\d{2}$/.test(offset)) return { ok: false, error: 'invalid-offset' };
  if (!clock && offset) return { ok: false, error: 'offset-without-time' };
  if (!clock && requireSeconds) return { ok: false, error: 'missing-time' };
  const value = normalizeCaptureTime(`${date}${clock ? `T${clock}` : ''}${clock ? offset : ''}`);
  return value ? { ok: true, value } : { ok: false, error: 'invalid-value' };
}
