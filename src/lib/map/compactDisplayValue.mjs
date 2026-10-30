import { AUTHORITATIVE_VALUE_TABLES } from '../../data/validation-v2/authoritative-value-tables.js';
import { STATUS_LABELS } from '../statusDomain.mjs';

// Display vocabulary, never a source-data rewrite or a validation decision.
// Only unique exact descriptions can be shortened; ambiguous values stay readable.
const domains = Object.fromEntries(['material', 'owner', 'positioningCause'].map((name) =>
  [name, AUTHORITATIVE_VALUE_TABLES[name].rows.map(({ code, meaning }) => [code, meaning])]));
domains.status = Object.entries(STATUS_LABELS);
const key = (value) => value.trim().toLocaleLowerCase('nb');
export function compactDisplayValue(domain, value) {
  if (typeof value !== 'string') return value;
  const rows = domains[domain] ?? [];
  if (rows.some(([code]) => key(code) === key(value))) return value;
  const matches = rows.filter(([, description]) => description && key(description) === key(value));
  return matches.length === 1 ? matches[0][0] : value;
}
