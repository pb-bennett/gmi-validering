import { getGeminiNumericValue } from './parseGeminiGml.mjs';
import { geminiFieldText } from './geminiPopupContent.mjs';

// Provider fields per side. A group never applies to a side without a field here.
// Point FCODE/CUST_FUNC and NETTYPE are deliberately not asset categories.
export const GEMINI_FILTER_GROUPS = Object.freeze([
  { id: 'status', label: 'Status', fields: { lines: 'STATUS', points: 'STATUS' } },
  { id: 'type', label: 'Anleggstype', fields: { lines: 'FCODE' } },
  { id: 'owner', label: 'Eierskap', fields: { lines: 'OWNER', points: 'OWNER' } },
  { id: 'material', label: 'Materiale', fields: { lines: 'MATERIAL' } },
  { id: 'dimension', label: 'Dimensjon', fields: { lines: 'DIM' }, numeric: true },
].map((group) => Object.freeze({ ...group, fields: Object.freeze(group.fields) })));
export const GEMINI_FILTER_BASES = Object.freeze(['default', 'all', 'none']);
export const GEMINI_MISSING_VALUE = 'm';

const SIDES = ['lines', 'points'];
export const geminiTitleKey = (title) => `t:${title.trim().toLocaleLowerCase('nb')}`;
// Exact titles observed in Gemini. Never codes, substrings or GMI vocabulary.
export const GEMINI_OPERATIONAL_STATUS = geminiTitleKey('Drift');
const KNOWN_STATUSES = new Set([GEMINI_OPERATIONAL_STATUS, geminiTitleKey('Nedlagt'), geminiTitleKey('Fjernet')]);

const defaultGroups = Object.freeze(Object.fromEntries(GEMINI_FILTER_GROUPS.map(({ id }) =>
  [id, Object.freeze({ base: 'default', overrides: Object.freeze({}) })])));
// statusRecognised belongs to the feed, not to one result or extent.
export const DEFAULT_GEMINI_FILTERS = Object.freeze({ groups: defaultGroups, statusRecognised: false });

export function isDefaultGeminiFilters(filters) {
  return GEMINI_FILTER_GROUPS.every(({ id }) => {
    const { base, overrides } = filters.groups[id];
    return base === 'default' && Object.keys(overrides).length === 0;
  });
}

// Returns null when the group does not apply to this side.
export function getGeminiFilterValue(record, side, group) {
  const field = group.fields[side];
  if (!field) return null;
  if (group.numeric) {
    const number = getGeminiNumericValue(record, field);
    if (number !== null) return { key: `n:${number}`, label: String(number), number };
  }
  const title = geminiFieldText(record, `${field}_TITLE`);
  if (title !== null) return { key: geminiTitleKey(title), label: title.trim() };
  const code = geminiFieldText(record, field)?.trim();
  if (code) return { key: `c:${code}`, label: group.numeric ? code : `Kode ${code}` };
  return { key: GEMINI_MISSING_VALUE, label: 'Mangler verdi' };
}

const classifications = new WeakMap();
// One pass per immutable merged result. Source records are never copied or changed.
export function classifyGeminiResult(result) {
  if (!result) return null;
  const cached = classifications.get(result);
  if (cached) return cached;
  const rows = Object.fromEntries(GEMINI_FILTER_GROUPS.map(({ id }) => [id, new Map()]));
  const entries = [];
  for (const side of SIDES) {
    for (const record of result[side]?.source?.records ?? []) {
      const values = [];
      for (const group of GEMINI_FILTER_GROUPS) {
        const value = getGeminiFilterValue(record, side, group);
        if (!value) continue;
        values.push([group.id, value.key]);
        const row = rows[group.id].get(value.key);
        if (row) row.count += 1;
        else rows[group.id].set(value.key, { ...value, count: 1 });
      }
      entries.push({ key: record.key, side, values });
    }
  }
  const order = (group) => (a, b) => {
    if ((a.key === GEMINI_MISSING_VALUE) !== (b.key === GEMINI_MISSING_VALUE)) return a.key === GEMINI_MISSING_VALUE ? 1 : -1;
    if (group.numeric && a.number !== b.number) return (a.number ?? Infinity) - (b.number ?? Infinity);
    return (group.numeric ? 0 : b.count - a.count) || a.label.localeCompare(b.label, 'nb');
  };
  const classification = {
    entries,
    rows: Object.fromEntries(GEMINI_FILTER_GROUPS.map((group) => [group.id, [...rows[group.id].values()].sort(order(group))])),
    statusKnown: [...rows.status.keys()].some((key) => KNOWN_STATUSES.has(key)),
    operationalLoaded: rows.status.has(GEMINI_OPERATIONAL_STATUS),
  };
  classifications.set(result, classification);
  return classification;
}

export function isGeminiValueChecked(filters, groupId, key) {
  const { base, overrides } = filters.groups[groupId];
  if (Object.hasOwn(overrides, key)) return overrides[key];
  if (base !== 'default') return base === 'all';
  return groupId !== 'status' || !filters.statusRecognised || key === GEMINI_OPERATIONAL_STATUS;
}

const EMPTY_VIEW = Object.freeze({ hiddenKeys: new Set(), groups: Object.freeze([]),
  visible: Object.freeze({ lines: 0, points: 0 }), hiddenCount: 0, statusNotice: null });
const views = new WeakMap();
// Shared by card and map so both always describe the same subset.
export function getGeminiFilterView(result, filters) {
  const classification = classifyGeminiResult(result);
  if (!classification) return EMPTY_VIEW;
  const cached = views.get(result);
  if (cached?.filters === filters) return cached.view;
  const groups = GEMINI_FILTER_GROUPS.map((group) => {
    const rows = classification.rows[group.id].map((row) => ({ ...row, checked: isGeminiValueChecked(filters, group.id, row.key) }));
    return { ...group, rows, linesOnly: !group.fields.points, hiddenValues: rows.filter((row) => !row.checked).length };
  });
  const unchecked = Object.fromEntries(groups.map(({ id, rows }) =>
    [id, new Set(rows.filter((row) => !row.checked).map((row) => row.key))]));
  const hiddenKeys = new Set(), visible = { lines: 0, points: 0 };
  for (const { key, side, values } of classification.entries) {
    if (values.some(([id, value]) => unchecked[id].has(value))) hiddenKeys.add(key);
    else visible[side] += 1;
  }
  const defaultStatus = filters.groups.status.base === 'default' && classification.entries.length > 0;
  let statusNotice = null;
  if (defaultStatus && !filters.statusRecognised) statusNotice = 'unrecognised';
  else if (defaultStatus && !classification.operationalLoaded) statusNotice = 'no-operational';
  const view = Object.freeze({ hiddenKeys, groups, visible, hiddenCount: hiddenKeys.size, statusNotice });
  views.set(result, { filters, view });
  return view;
}
