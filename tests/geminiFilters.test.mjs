import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { TEST_CONNECTION } from './fixtures/gemini-wfs/connection.mjs';
register('./esmJsLoader.mjs', import.meta.url);
const { DEFAULT_GEMINI_FILTERS, GEMINI_FILTER_GROUPS, getGeminiFilterView, classifyGeminiResult, isDefaultGeminiFilters } =
  await import('../src/lib/gemini-wfs/geminiFilters.mjs');
const { GEMINI_FILTER_STORAGE_KEY, GEMINI_FILTER_STORAGE_LIMITS, readGeminiFilters, saveGeminiFilters } =
  await import('../src/lib/gemini-wfs/geminiFilterPreferences.mjs');
const { createGeminiPresentation } = await import('../src/lib/gemini-wfs/geminiReferencePresentation.mjs');
const { createGeminiSession, mergeGeminiCoverages } = await import('../src/lib/gemini-wfs/geminiSession.mjs');

const URL_A = TEST_CONNECTION.url, URL_B = URL_A.replace('va-basis', 'other');
const field = (rawText) => Object.freeze(rawText === null ? { state: 'nil', rawText: '' } : { state: rawText === '' ? 'empty' : 'text', rawText });
const record = (key, side, values) => Object.freeze({ key, typeName: side === 'lines' ? 'gemini:VA_LINE' : 'gemini:VA_MPNT',
  attributes: Object.freeze(Object.fromEntries(Object.entries(values).map(([name, value]) => [name, field(value)]))) });
const pair = (lines, points = []) => {
  const side = (name, items) => Object.freeze({ source: Object.freeze({ records: Object.freeze(items.map((values, i) => record(values.key ?? `${name}${i}`, name, values))) }),
    display: Object.freeze({ type: 'FeatureCollection', features: Object.freeze(items.map((values, i) => ({ id: values.key ?? `${name}${i}` }))) }) });
  const counts = { lines: lines.length, points: points.length };
  return Object.freeze({ lines: side('lines', lines), points: side('points', points), counts, provenance: { connectionId: 'x', accountGeneration: 'a' } });
};
const S = (title, extra = {}) => ({ STATUS_TITLE: title, ...extra });
const known = { ...DEFAULT_GEMINI_FILTERS, statusRecognised: true };
const edit = (filters, id, group) => ({ ...filters, groups: { ...filters.groups, [id]: { ...filters.groups[id], ...group } } });
const hidden = (result, filters) => [...getGeminiFilterView(result, filters).hiddenKeys];
const rows = (result, id, filters = known) => getGeminiFilterView(result, filters).groups.find((group) => group.id === id).rows;

function memoryStorage(initial) {
  const items = new Map(initial ? [[GEMINI_FILTER_STORAGE_KEY, initial]] : []);
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => { items.set(key, value); }, removeItem: (key) => { items.delete(key); },
    text: () => items.get(GEMINI_FILTER_STORAGE_KEY) ?? null };
}
const preferences = (storage) => ({ read: (url) => readGeminiFilters(url, storage), save: (url, filters, options) => saveGeminiFilters(url, filters, options, storage) });
function setup(storage = memoryStorage()) {
  let snapshot = { result: null, connection: null };
  const listeners = new Set();
  const session = { getSnapshot: () => snapshot, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); } };
  const create = () => createGeminiPresentation(session, preferences(storage));
  const publish = (patch) => { snapshot = { ...snapshot, ...patch }; for (const listener of listeners) listener(); };
  return { presentation: create(), create, publish, storage };
}
const connection = (url) => ({ ...TEST_CONNECTION, url });

test('default status is an exact title match; codes, missing and other statuses stay hidden', () => {
  const result = pair([S('Drift'), S(' DRIFT '), S('Nedlagt'), S('Fjernet'), S('Midlertidig ute av drift'), S('I drift'), S('Driftsatt'),
    S('Ukjent'), { STATUS: 'D' }, { STATUS: '0' }, {}, S(null), S(''), S('   ')], [S('Drift'), S('Fjernet'), {}]);
  const view = getGeminiFilterView(result, known);
  assert.deepEqual(view.visible, { lines: 2, points: 1 });
  assert.equal(view.hiddenCount, 14);
  assert.equal(view.statusNotice, null);
  const status = rows(result, 'status');
  assert.deepEqual(status.filter((row) => row.checked).map((row) => [row.key, row.count]), [['t:drift', 3]]);
  assert.deepEqual(status.at(-1), { key: 'm', label: 'Mangler verdi', count: 5, checked: false });
  assert(status.some((row) => row.label === 'Kode D' && !row.checked));
  assert(status.some((row) => row.label === 'Ukjent' && row.key === 't:ukjent'), 'A literal unknown title is not a missing value');
});

test('line-only groups never hide points, and point FCODE/CUST_FUNC/NETTYPE are not asset categories', () => {
  const point = S('Drift', { FCODE_TITLE: 'Overvannskum', CUST_FUNC_TITLE: 'Ikke i nett', MATERIAL_TITLE: 'PVC', DIM: '160', OWNER_TITLE: 'Kommunal' });
  const result = pair([S('Drift', { FCODE_TITLE: 'Vannledning', NETTYPE_TITLE: 'Hovednett', MATERIAL_TITLE: 'PE', DIM: '160' })], [point]);
  let filters = known;
  for (const id of ['type', 'material', 'dimension']) {
    filters = edit(filters, id, { base: 'none' });
    assert.equal(rows(result, id).length, 1);
    assert.equal(getGeminiFilterView(result, known).groups.find((group) => group.id === id).linesOnly, true);
  }
  assert.deepEqual(hidden(result, filters), ['lines0']);
  assert.deepEqual(hidden(result, edit(known, 'owner', { overrides: { 't:kommunal': false } })), ['points0']);
  assert.deepEqual(rows(result, 'type').map((row) => row.label), ['Vannledning']);
  assert(GEMINI_FILTER_GROUPS.every((group) => !Object.values(group.fields).some((name) => ['NETTYPE', 'CUST_FUNC', 'RESPONSIBLE'].includes(name))));
});

test('OR within a group, AND across groups, and an empty group hides its applicable objects', () => {
  const result = pair([
    S('Drift', { MATERIAL_TITLE: 'PE', DIM: '110' }), S('Drift', { MATERIAL_TITLE: 'PVC', DIM: '160' }),
    S('Drift', { MATERIAL_TITLE: 'Betong', DIM: '160' }), S('Nedlagt', { MATERIAL_TITLE: 'PVC', DIM: '160' })]);
  const material = edit(known, 'material', { base: 'none', overrides: { 't:pe': true, 't:pvc': true } });
  assert.deepEqual(hidden(result, material), ['lines2', 'lines3']);
  assert.deepEqual(hidden(result, edit(material, 'dimension', { overrides: { 'n:110': false } })), ['lines0', 'lines2', 'lines3']);
  assert.equal(hidden(result, edit(known, 'status', { base: 'none' })).length, 4);
  assert.equal(hidden(result, edit(known, 'status', { base: 'all' })).length, 0);
});

test('dimensions group by number without losing raw or missing values; titles merge, code-only values do not', () => {
  const result = pair([{ DIM: '160.00' }, { DIM: '160' }, { DIM: '32' }, { DIM: '0' }, { DIM: 'ukjent' }, {}]);
  assert.deepEqual(rows(result, 'dimension').map((row) => [row.key, row.label, row.count]),
    [['n:0', '0', 1], ['n:32', '32', 1], ['n:160', '160', 2], ['c:ukjent', 'ukjent', 1], ['m', 'Mangler verdi', 1]]);
  const owners = pair([{ OWNER: '1', OWNER_TITLE: 'Kommunal' }, { OWNER: '1' }], [{ OWNER: '7', OWNER_TITLE: 'kommunal' }]);
  assert.deepEqual(rows(owners, 'owner').map((row) => [row.key, row.count]), [['t:kommunal', 2], ['c:1', 1]]);
});

test('counts come from deduplicated areas, ignore other filters and never alter source records', () => {
  const one = pair([S('Drift', { key: 'shared' }), S('Nedlagt', { key: 'a' })]), two = pair([S('Drift', { key: 'shared' }), S('Drift', { key: 'b' })]);
  const merged = mergeGeminiCoverages([{ result: one }, { result: two }], {}, 1);
  const before = JSON.stringify(merged);
  assert.deepEqual(rows(merged, 'status').map((row) => [row.label, row.count]), [['Drift', 2], ['Nedlagt', 1]]);
  assert.deepEqual(rows(merged, 'status', edit(known, 'material', { base: 'none' })).map((row) => row.count), [2, 1]);
  assert.equal(JSON.stringify(merged), before);
  assert.equal(classifyGeminiResult(merged), classifyGeminiResult(merged));
});

test('unrecognised vocabulary shows everything with an explicit notice, without treating it as operational', () => {
  const result = pair([S('I drift'), { STATUS: '3' }], [{}]);
  const view = getGeminiFilterView(result, DEFAULT_GEMINI_FILTERS);
  assert.equal(view.hiddenCount, 0); assert.equal(view.statusNotice, 'unrecognised');
  assert.equal(getGeminiFilterView(result, edit(DEFAULT_GEMINI_FILTERS, 'status', { base: 'all' })).statusNotice, null);
});

test('a feed with a known vocabulary keeps the strict default whatever a later extent contains', () => {
  const { presentation, publish, create } = setup();
  publish({ connection: connection(URL_A), result: pair([S('Fjernet')]) });
  let { filters } = presentation.getSnapshot();
  assert.equal(filters.statusRecognised, true);
  for (const lines of [[S('Fjernet')], [S('Prosjektert')], [{}]]) {
    const result = pair(lines); publish({ result });
    ({ filters } = presentation.getSnapshot());
    assert.equal(getGeminiFilterView(result, filters).hiddenCount, 1);
    assert.equal(getGeminiFilterView(result, filters).statusNotice, 'no-operational');
  }
  publish({ result: null });
  assert.equal(create().getSnapshot().filters.statusRecognised, true, 'Recognition survives a page reload');
  presentation.resetFilters();
  assert.equal(presentation.getSnapshot().filters.statusRecognised, true);
});

test('choices survive account change, disconnect, reload and A to B to A; unseen values follow the group rule', () => {
  const { presentation, publish, create } = setup();
  publish({ connection: connection(URL_A), result: pair([S('Drift', { MATERIAL_TITLE: 'PE' })]) });
  presentation.setFilterValue('material', 't:pe', false); presentation.setFilterValue('material', 't:absent', false);
  presentation.setFilterBase('dimension', 'none'); presentation.setFilterGroupOpen('material', true);
  const chosen = presentation.getSnapshot().filters;
  publish({ result: null });
  publish({ result: { ...pair([S('Drift', { MATERIAL_TITLE: 'absent', DIM: '9' })]), provenance: { connectionId: 'x', accountGeneration: 'b' } } });
  assert.equal(presentation.getSnapshot().filters, chosen);
  assert.equal(presentation.getSnapshot().sourceVisible, true);
  assert.deepEqual(presentation.getSnapshot().openFilterGroups, ['material']);
  publish({ connection: { ...connection(URL_B), id: 'new-id' }, result: null });
  assert(isDefaultGeminiFilters(presentation.getSnapshot().filters));
  publish({ connection: { ...connection(URL_A), id: 'third-id' } });
  assert.deepEqual(presentation.getSnapshot().filters, chosen);
  const reloaded = create().getSnapshot();
  assert.deepEqual(reloaded.filters, chosen); assert.deepEqual(reloaded.openFilterGroups, []);
  assert.equal(rows(pair([S('Drift', { DIM: '999' })]), 'dimension', reloaded.filters)[0].checked, false);
  presentation.resetFilters();
  assert(isDefaultGeminiFilters(presentation.getSnapshot().filters));
  assert(isDefaultGeminiFilters(create().getSnapshot().filters));
});

test('the real session drives filters without any request, and workspace reset keeps them', async () => {
  let requests = 0;
  const session = createGeminiSession({ requestPair: async () => { requests += 1; return pair([S('Drift')]); },
    getLayers: () => ({}) });
  const storage = memoryStorage(), presentation = createGeminiPresentation(session, preferences(storage));
  session.setConnection(TEST_CONNECTION); session.setCredentials({ username: 'u', password: 'synthetic-secret' });
  await session.fetchMap([580000, 6560000, 580100, 6560100]);
  assert.equal(requests, 1);
  const result = session.getSnapshot().result;
  presentation.setFilterValue('status', 't:nedlagt', true); presentation.setFilterBase('owner', 'none'); presentation.resetFilters();
  presentation.setFilterValue('status', 't:nedlagt', true);
  assert.equal(requests, 1); assert.equal(session.getSnapshot().result, result);
  session.reset();
  assert.equal(presentation.getSnapshot().filters.groups.status.overrides['t:nedlagt'], true);
  assert.doesNotMatch(storage.text(), /synthetic-secret|username|password|lines0|coordinates|count/);
  session.dispose();
});

test('owner names stay in the session; only known owner categories are stored', () => {
  const { presentation, publish, create, storage } = setup();
  publish({ connection: connection(URL_A), result: pair([S('Drift')]) });
  presentation.setFilterValue('owner', 't:ola eksempel', false); presentation.setFilterValue('owner', 'c:42', false);
  presentation.setFilterValue('owner', 't:kommunal', false); presentation.setFilterValue('owner', 't:privat (bygningseier)', true);
  assert.equal(presentation.getSnapshot().filters.groups.owner.overrides['t:ola eksempel'], false);
  assert.doesNotMatch(storage.text(), /ola|c:42/);
  assert.deepEqual(create().getSnapshot().filters.groups.owner.overrides, { 't:kommunal': false, 't:privat (bygningseier)': true });
});

test('malformed, foreign-schema and hostile storage fall back safely and are only replaced by an edit', () => {
  for (const text of ['{', 'null', '[]', '{"schema":2,"feeds":[]}']) {
    const { presentation, publish, storage } = setup(memoryStorage(text));
    publish({ connection: connection(URL_A), result: pair([S('Drift')]) });
    assert(isDefaultGeminiFilters(presentation.getSnapshot().filters));
    assert.equal(storage.text(), text, 'Automatic recognition must not overwrite unreadable storage');
    presentation.setFilterValue('status', 't:nedlagt', true);
    assert.equal(JSON.parse(storage.text()).schema, 1);
  }
  const hostile = memoryStorage(JSON.stringify({ schema: 1, feeds: [null, { url: 'https://evil.example/x' }, { url: URL_A, secret: 'x', groups: {
    status: { base: 'weird', overrides: { 't:drift': 'yes', 'x:bad': true, [`t:${'a'.repeat(200)}`]: true, 't:nedlagt': true } }, owner: 3, constructor: {} } }] }));
  assert.deepEqual(readGeminiFilters(URL_A, hostile).groups.status, { base: 'default', overrides: { 't:nedlagt': true } });
  saveGeminiFilters(URL_A, readGeminiFilters(URL_A, hostile), {}, hostile);
  assert.doesNotMatch(hostile.text(), /secret|evil/);
});

test('unavailable or full storage keeps filtering in memory and reports it', () => {
  const full = { ...memoryStorage(), setItem: () => { throw new DOMException('full', 'QuotaExceededError'); } };
  const blocked = { getItem: () => { throw new Error('blocked'); } };
  for (const storage of [full, blocked]) {
    const { presentation, publish } = setup(storage);
    publish({ connection: connection(URL_A), result: pair([S('Drift')]) });
    presentation.setFilterValue('status', 't:drift', false);
    assert.equal(presentation.getSnapshot().filters.groups.status.overrides['t:drift'], false);
    assert.equal(presentation.getSnapshot().filterSaveFailed, true);
    publish({ connection: connection(URL_B), result: null }); publish({ connection: connection(URL_A) });
    assert.equal(presentation.getSnapshot().filters.groups.status.overrides['t:drift'], false);
  }
});

test('stored feeds and values are bounded and URL-normalised', () => {
  const storage = memoryStorage(), changed = edit(DEFAULT_GEMINI_FILTERS, 'status', { base: 'all' });
  for (let index = 0; index < 25; index += 1) saveGeminiFilters(URL_A.replace('va-basis', `feed${index}`), changed, {}, storage);
  assert.equal(JSON.parse(storage.text()).feeds.length, GEMINI_FILTER_STORAGE_LIMITS.feeds);
  const many = edit(DEFAULT_GEMINI_FILTERS, 'dimension', { overrides: Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`n:${i}`, false])) });
  saveGeminiFilters(URL_A.replace('tenant.geminisuite.com', 'TENANT.geminisuite.com:443'), many, {}, storage);
  assert.equal(Object.keys(readGeminiFilters(URL_A, storage).groups.dimension.overrides).length, GEMINI_FILTER_STORAGE_LIMITS.overrides);
  const only = memoryStorage(); saveGeminiFilters(URL_A, changed, {}, only); saveGeminiFilters(URL_A, DEFAULT_GEMINI_FILTERS, {}, only);
  assert.equal(only.text(), null);
});

test('invalid commands are ignored', () => {
  const { presentation, publish } = setup();
  publish({ connection: connection(URL_A), result: pair([S('Drift')]) });
  const before = presentation.getSnapshot().filters;
  presentation.setFilterValue('nope', 't:x', true); presentation.setFilterValue('status', 3, true);
  presentation.setFilterValue('status', 't:x', 'true'); presentation.setFilterBase('status', 'odd'); presentation.setFilterBase('toString', 'all');
  assert.equal(presentation.getSnapshot().filters, before);
});
