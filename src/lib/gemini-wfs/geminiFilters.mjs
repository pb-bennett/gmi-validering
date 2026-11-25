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

export const GEMINI_FILTER_SIDES = Object.freeze(['lines', 'points']);
// The groups each side owns. Selections are never shared between sides.
const SIDE_GROUPS = Object.freeze(Object.fromEntries(GEMINI_FILTER_SIDES.map((side) =>
  [side, Object.freeze(GEMINI_FILTER_GROUPS.filter(({ fields }) => fields[side]))])));
export const geminiTitleKey = (title) => `t:${title.trim().toLocaleLowerCase('nb')}`;
// Exact titles observed in Gemini. Never codes, substrings or GMI vocabulary.
export const GEMINI_OPERATIONAL_STATUS = geminiTitleKey('Drift');
const KNOWN_STATUSES = new Set([GEMINI_OPERATIONAL_STATUS, geminiTitleKey('Nedlagt'), geminiTitleKey('Fjernet')]);

// Builds { lines: { status, ... }, points: { status, owner } }, one value per side and group.
export const mapGeminiFilterGroups = (build) => Object.freeze(Object.fromEntries(GEMINI_FILTER_SIDES.map((side) =>
  [side, Object.freeze(Object.fromEntries(SIDE_GROUPS[side].map((group) => [group.id, build(side, group)])))])));
const defaultGroups = mapGeminiFilterGroups(() => Object.freeze({ base: 'default', overrides: Object.freeze({}) }));
// statusRecognised belongs to the feed, not to one result or extent.
export const DEFAULT_GEMINI_FILTERS = Object.freeze({ groups: defaultGroups, statusRecognised: false });

export function isDefaultGeminiFilters(filters) {
  return GEMINI_FILTER_SIDES.every((side) => Object.values(filters.groups[side]).every(({ base, overrides }) =>
    base === 'default' && Object.keys(overrides).length === 0));
}

export function getGeminiFilterValue(record, side, group) {
  const field = group.fields[side];
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
  const maps = mapGeminiFilterGroups(() => new Map());
  const entries = [], loaded = { lines: 0, points: 0 };
  for (const side of GEMINI_FILTER_SIDES) {
    for (const record of result[side]?.source?.records ?? []) {
      const values = [];
      loaded[side] += 1;
      for (const group of SIDE_GROUPS[side]) {
        const value = getGeminiFilterValue(record, side, group);
        values.push([group.id, value.key]);
        const row = maps[side][group.id].get(value.key);
        if (row) row.count += 1;
        else maps[side][group.id].set(value.key, { ...value, count: 1 });
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
    loaded,
    rows: mapGeminiFilterGroups((side, group) => [...maps[side][group.id].values()].sort(order(group))),
    statusKnown: GEMINI_FILTER_SIDES.some((side) => [...maps[side].status.keys()].some((key) => KNOWN_STATUSES.has(key))),
    operationalLoaded: { lines: maps.lines.status.has(GEMINI_OPERATIONAL_STATUS), points: maps.points.status.has(GEMINI_OPERATIONAL_STATUS) },
  };
  classifications.set(result, classification);
  return classification;
}

export function isGeminiValueChecked(filters, side, groupId, key) {
  const { base, overrides } = filters.groups[side][groupId];
  if (Object.hasOwn(overrides, key)) return overrides[key];
  if (base !== 'default') return base === 'all';
  return groupId !== 'status' || !filters.statusRecognised || key === GEMINI_OPERATIONAL_STATUS;
}

const EMPTY_VIEW = Object.freeze({ hiddenKeys: new Set(), groups: Object.freeze({ lines: Object.freeze([]), points: Object.freeze([]) }),
  visible: Object.freeze({ lines: 0, points: 0 }), loaded: Object.freeze({ lines: 0, points: 0 }), hiddenCount: 0, statusNotice: null });
const views = new WeakMap();
// Shared by card and map so both always describe the same subset.
export function getGeminiFilterView(result, filters) {
  const classification = classifyGeminiResult(result);
  if (!classification) return EMPTY_VIEW;
  const cached = views.get(result);
  if (cached?.filters === filters) return cached.view;
  const { loaded } = classification;
  const unchecked = mapGeminiFilterGroups(() => new Set());
  const groups = Object.fromEntries(GEMINI_FILTER_SIDES.map((side) => [side, SIDE_GROUPS[side].map((group) => {
    const rows = classification.rows[side][group.id].map((row) => ({ ...row, checked: isGeminiValueChecked(filters, side, group.id, row.key) }));
    for (const row of rows) if (!row.checked) unchecked[side][group.id].add(row.key);
    return { ...group, rows, hiddenValues: unchecked[side][group.id].size };
  })]));
  const hiddenKeys = new Set(), visible = { lines: 0, points: 0 };
  for (const { key, side, values } of classification.entries) {
    if (values.some(([id, value]) => unchecked[side][id].has(value))) hiddenKeys.add(key);
    else visible[side] += 1;
  }
  // Loaded sides whose default status rule needs an explanation; side is null when that is every loaded side.
  const loadedSides = GEMINI_FILTER_SIDES.filter((side) => loaded[side] > 0);
  const noticeSides = loadedSides.filter((side) => filters.groups[side].status.base === 'default' &&
    !(filters.statusRecognised && classification.operationalLoaded[side]));
  const statusNotice = noticeSides.length === 0 ? null : {
    kind: filters.statusRecognised ? 'no-operational' : 'unrecognised',
    side: noticeSides.length === loadedSides.length ? null : noticeSides[0],
  };
  const view = Object.freeze({ hiddenKeys, groups, visible, loaded, hiddenCount: hiddenKeys.size, statusNotice });
  views.set(result, { filters, view });
  return view;
}
