// Source/database lifecycle codes. Unknown codes remain authoritative.
export const STATUS_LABELS = Object.freeze({
  D: 'Drift',
  R: 'Reserve',
  I: 'Ikke i bruk',
  P: 'Prosjektert',
  UB: 'Under bygging',
  N: 'Nedlagt',
  E: 'Erstattet',
  EF: 'Erstattet fjernet',
  EN: 'Erstattet nedlagt',
  F: 'Fjernet',
  UK: 'Ukjent',
  MIDL: 'Midlertidig (provisorisk)',
  MIDLUTED: 'Midlertidig ute av drift',
});

export function getStatusLabel(code) {
  if (typeof code !== 'string' || code.trim() === '') return null;
  return Object.hasOwn(STATUS_LABELS, code) ? STATUS_LABELS[code] : code;
}

export function formatStatusChoice(code) {
  const label = getStatusLabel(code);
  return label === null ? null : label === code ? code : `${code} · ${label}`;
}
