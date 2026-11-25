import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { TEST_CONNECTION } from './fixtures/gemini-wfs/connection.mjs';
register('./esmJsLoader.mjs', import.meta.url);
const { DEFAULT_GEMINI_FILTERS, GEMINI_FILTER_GROUPS, GEMINI_FILTER_SIDES, getGeminiFilterView, classifyGeminiResult, isDefaultGeminiFilters } =
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
const edit = (filters, side, id, group) => ({ ...filters, groups: { ...filters.groups,
  [side]: { ...filters.groups[side], [id]: { ...filters.groups[side][id], ...group } } } });
const both = (filters, id, group) => edit(edit(filters, 'lines', id, group), 'points', id, group);
const hidden = (result, filters) => [...getGeminiFilterView(result, filters).hiddenKeys];
const rows = (result, side, id, filters = known) => getGeminiFilterView(result, filters).groups[side].find((group) => group.id === id).rows;

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
  assert.deepEqual(view.loaded, { lines: 14, points: 3 });
  const status = rows(result, 'lines', 'status');
  assert.deepEqual(status.filter((row) => row.checked).map((row) => [row.key, row.count]), [['t:drift', 2]]);
  assert.deepEqual(rows(result, 'points', 'status').map((row) => [row.key, row.count, row.checked]), [['t:drift', 1, true], ['t:fjernet', 1, false], ['m', 1, false]]);
  assert.deepEqual(status.at(-1), { key: 'm', label: 'Mangler verdi', count: 4, checked: false });
  assert(status.some((row) => row.label === 'Kode D' && !row.checked));
  assert(status.some((row) => row.label === 'Ukjent' && row.key === 't:ukjent'), 'A literal unknown title is not a missing value');
});

test('line-only groups never hide points, and point FCODE/CUST_FUNC/NETTYPE are not asset categories', () => {
  const point = S('Drift', { FCODE_TITLE: 'Overvannskum', CUST_FUNC_TITLE: 'Ikke i nett', MATERIAL_TITLE: 'PVC', DIM: '160', OWNER_TITLE: 'Kommunal' });
  const result = pair([S('Drift', { FCODE_TITLE: 'Vannledning', NETTYPE_TITLE: 'Hovednett', MATERIAL_TITLE: 'PE', DIM: '160' })], [point]);
  let filters = known;
  for (const id of ['type', 'material', 'dimension']) {
    filters = edit(filters, 'lines', id, { base: 'none' });
    assert.equal(rows(result, 'lines', id).length, 1);
  }
  assert.deepEqual(hidden(result, filters), ['lines0']);
  assert.deepEqual(Object.fromEntries(GEMINI_FILTER_SIDES.map((side) => [side, getGeminiFilterView(result, known).groups[side].map(({ id }) => id)])),
    { lines: ['status', 'type', 'owner', 'material', 'dimension'], points: ['status', 'owner'] });
  assert.deepEqual(Object.keys(known.groups.points), ['status', 'owner']);
  assert.deepEqual(hidden(result, both(known, 'owner', { overrides: { 't:kommunal': false } })), ['points0']);
  assert.deepEqual(rows(result, 'lines', 'type').map((row) => row.label), ['Vannledning']);
  assert(GEMINI_FILTER_GROUPS.every((group) => !Object.values(group.fields).some((name) => ['NETTYPE', 'CUST_FUNC', 'RESPONSIBLE'].includes(name))));
});

test('OR within a group, AND across groups, and an empty group hides its applicable objects', () => {
  const result = pair([
    S('Drift', { MATERIAL_TITLE: 'PE', DIM: '110' }), S('Drift', { MATERIAL_TITLE: 'PVC', DIM: '160' }),
    S('Drift', { MATERIAL_TITLE: 'Betong', DIM: '160' }), S('Nedlagt', { MATERIAL_TITLE: 'PVC', DIM: '160' })]);
  const material = edit(known, 'lines', 'material', { base: 'none', overrides: { 't:pe': true, 't:pvc': true } });
  assert.deepEqual(hidden(result, material), ['lines2', 'lines3']);
  assert.deepEqual(hidden(result, edit(material, 'lines', 'dimension', { overrides: { 'n:110': false } })), ['lines0', 'lines2', 'lines3']);
  assert.equal(hidden(result, edit(known, 'lines', 'status', { base: 'none' })).length, 4);
  assert.equal(hidden(result, edit(known, 'lines', 'status', { base: 'all' })).length, 0);
});

test('dimensions group by number without losing raw or missing values; titles merge, code-only values do not', () => {
  const result = pair([{ DIM: '160.00' }, { DIM: '160' }, { DIM: '32' }, { DIM: '0' }, { DIM: 'ukjent' }, {}]);
  assert.deepEqual(rows(result, 'lines', 'dimension').map((row) => [row.key, row.label, row.count]),
    [['n:0', '0', 1], ['n:32', '32', 1], ['n:160', '160', 2], ['c:ukjent', 'ukjent', 1], ['m', 'Mangler verdi', 1]]);
  const owners = pair([{ OWNER: '1', OWNER_TITLE: 'Kommunal' }, { OWNER: '1' }, { OWNER: '7', OWNER_TITLE: 'kommunal' }], [{ OWNER: '7', OWNER_TITLE: 'kommunal' }]);
  assert.deepEqual(rows(owners, 'lines', 'owner').map((row) => [row.key, row.count]), [['t:kommunal', 2], ['c:1', 1]]);
  assert.deepEqual(rows(owners, 'points', 'owner').map((row) => [row.key, row.count]), [['t:kommunal', 1]]);
});

test('counts come from deduplicated areas, ignore other filters and never alter source records', () => {
  const one = pair([S('Drift', { key: 'shared' }), S('Nedlagt', { key: 'a' })]), two = pair([S('Drift', { key: 'shared' }), S('Drift', { key: 'b' })]);
  const merged = mergeGeminiCoverages([{ result: one }, { result: two }], {}, 1);
  const before = JSON.stringify(merged);
  assert.deepEqual(rows(merged, 'lines', 'status').map((row) => [row.label, row.count]), [['Drift', 2], ['Nedlagt', 1]]);
  assert.deepEqual(rows(merged, 'lines', 'status', edit(known, 'lines', 'material', { base: 'none' })).map((row) => row.count), [2, 1]);
  assert.equal(JSON.stringify(merged), before);
  assert.equal(classifyGeminiResult(merged), classifyGeminiResult(merged));
});

test('unrecognised vocabulary shows everything with an explicit notice, without treating it as operational', () => {
  const result = pair([S('I drift'), { STATUS: '3' }], [{}]);
  const view = getGeminiFilterView(result, DEFAULT_GEMINI_FILTERS);
  assert.equal(view.hiddenCount, 0); assert.equal(view.statusNotice?.kind, 'unrecognised');
  assert.equal(view.statusNotice.side, null);
  assert.deepEqual(getGeminiFilterView(result, edit(DEFAULT_GEMINI_FILTERS, 'lines', 'status', { base: 'all' })).statusNotice, { kind: 'unrecognised', side: 'points' });
  assert.equal(getGeminiFilterView(result, both(DEFAULT_GEMINI_FILTERS, 'status', { base: 'all' })).statusNotice, null);
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
    assert.equal(getGeminiFilterView(result, filters).statusNotice.kind, 'no-operational');
  }
  publish({ result: null });
  assert.equal(create().getSnapshot().filters.statusRecognised, true, 'Recognition survives a page reload');
  presentation.resetFilters();
  assert.equal(presentation.getSnapshot().filters.statusRecognised, true);
});

test('choices survive account change, disconnect, reload and A to B to A; unseen values follow the group rule', () => {
  const { presentation, publish, create } = setup();
  publish({ connection: connection(URL_A), result: pair([S('Drift', { MATERIAL_TITLE: 'PE' })]) });
  presentation.setFilterValue('lines', 'material', 't:pe', false); presentation.setFilterValue('lines', 'material', 't:absent', false);
  presentation.setFilterBase('lines', 'dimension', 'none'); presentation.setFilterGroupOpen('lines', 'material', true);
  presentation.setFilterValue('points', 'status', 't:absent', true); presentation.setFilterValue('lines', 'status', 't:absent', false); presentation.setFilterTab('points');
  const chosen = presentation.getSnapshot().filters;
  publish({ result: null });
  publish({ result: { ...pair([S('Drift', { MATERIAL_TITLE: 'absent', DIM: '9' })]), provenance: { connectionId: 'x', accountGeneration: 'b' } } });
  assert.equal(presentation.getSnapshot().filters, chosen);
  assert.equal(presentation.getSnapshot().sourceVisible, true);
  assert.deepEqual(presentation.getSnapshot().openFilterGroups, ['lines:material']);
  assert.equal(presentation.getSnapshot().filterTab, 'points');
  publish({ connection: { ...connection(URL_B), id: 'new-id' }, result: null });
  assert(isDefaultGeminiFilters(presentation.getSnapshot().filters));
  publish({ connection: { ...connection(URL_A), id: 'third-id' } });
  assert.deepEqual(presentation.getSnapshot().filters, chosen);
  const reloaded = create().getSnapshot();
  assert.deepEqual(reloaded.filters, chosen); assert.deepEqual(reloaded.openFilterGroups, []); assert.equal(reloaded.filterTab, 'lines');
  const absent = pair([S('absent')], [S('absent')]);
  assert.deepEqual(hidden(absent, reloaded.filters), ['lines0'], 'A value absent from earlier extents keeps its own choice per side');
  assert.equal(rows(pair([S('Drift', { DIM: '999' })]), 'lines', 'dimension', reloaded.filters)[0].checked, false);
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
  presentation.setFilterValue('lines', 'status', 't:nedlagt', true); presentation.setFilterBase('points', 'owner', 'none'); presentation.setFilterTab('points'); presentation.resetFilters();
  presentation.setFilterValue('lines', 'status', 't:nedlagt', true);
  assert.equal(requests, 1); assert.equal(session.getSnapshot().result, result);
  session.reset();
  assert.equal(presentation.getSnapshot().filters.groups.lines.status.overrides['t:nedlagt'], true);
  assert.doesNotMatch(storage.text(), /synthetic-secret|username|password|lines0|coordinates|count/);
  session.dispose();
});

test('owner names stay in the session; only known owner categories are stored', () => {
  const { presentation, publish, create, storage } = setup();
  publish({ connection: connection(URL_A), result: pair([S('Drift')]) });
  presentation.setFilterValue('points', 'owner', 't:ola eksempel', false); presentation.setFilterValue('points', 'owner', 'c:42', false);
  presentation.setFilterValue('points', 'owner', 't:kommunal', false); presentation.setFilterValue('points', 'owner', 't:privat (bygningseier)', true);
  assert.equal(presentation.getSnapshot().filters.groups.points.owner.overrides['t:ola eksempel'], false);
  assert.doesNotMatch(storage.text(), /ola|c:42/);
  assert.deepEqual(create().getSnapshot().filters.groups.points.owner.overrides, { 't:kommunal': false, 't:privat (bygningseier)': true });
});

test('malformed, foreign-schema and hostile storage fall back safely and are only replaced by an edit', () => {
  for (const text of ['{', 'null', '[]', '{"schema":3,"feeds":[]}', '{"schema":"1","feeds":[]}', '{"schema":1}']) {
    const { presentation, publish, storage } = setup(memoryStorage(text));
    publish({ connection: connection(URL_A), result: pair([S('Drift')]) });
    assert(isDefaultGeminiFilters(presentation.getSnapshot().filters));
    assert.equal(storage.text(), text, 'Automatic recognition must not overwrite unreadable storage');
    presentation.setFilterValue('lines', 'status', 't:nedlagt', true);
    assert.equal(JSON.parse(storage.text()).schema, 2);
  }
  const hostile = memoryStorage(JSON.stringify({ schema: 2, feeds: [null, { url: 'https://evil.example/x' }, { url: URL_A, secret: 'x', groups: { points: 'x', lines: {
    status: { base: 'weird', overrides: { 't:drift': 'yes', 'x:bad': true, [`t:${'a'.repeat(200)}`]: true, 't:nedlagt': true } }, owner: 3, constructor: {} } } }] }));
  assert.deepEqual(readGeminiFilters(URL_A, hostile).groups.lines.status, { base: 'default', overrides: { 't:nedlagt': true } });
  saveGeminiFilters(URL_A, readGeminiFilters(URL_A, hostile), {}, hostile);
  assert.doesNotMatch(hostile.text(), /secret|evil/);
});

test('unavailable or full storage keeps filtering in memory and reports it', () => {
  const full = { ...memoryStorage(), setItem: () => { throw new DOMException('full', 'QuotaExceededError'); } };
  const blocked = { getItem: () => { throw new Error('blocked'); } };
  for (const storage of [full, blocked]) {
    const { presentation, publish } = setup(storage);
    publish({ connection: connection(URL_A), result: pair([S('Drift')]) });
    presentation.setFilterValue('lines', 'status', 't:drift', false);
    assert.equal(presentation.getSnapshot().filters.groups.lines.status.overrides['t:drift'], false);
    assert.equal(presentation.getSnapshot().filterSaveFailed, true);
    publish({ connection: connection(URL_B), result: null }); publish({ connection: connection(URL_A) });
    assert.equal(presentation.getSnapshot().filters.groups.lines.status.overrides['t:drift'], false);
  }
});

test('stored feeds and values are bounded and URL-normalised', () => {
  const storage = memoryStorage(), changed = edit(DEFAULT_GEMINI_FILTERS, 'points', 'status', { base: 'all' });
  for (let index = 0; index < 25; index += 1) saveGeminiFilters(URL_A.replace('va-basis', `feed${index}`), changed, {}, storage);
  assert.equal(JSON.parse(storage.text()).feeds.length, GEMINI_FILTER_STORAGE_LIMITS.feeds);
  const many = edit(DEFAULT_GEMINI_FILTERS, 'lines', 'dimension', { overrides: Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`n:${i}`, false])) });
  saveGeminiFilters(URL_A.replace('tenant.geminisuite.com', 'TENANT.geminisuite.com:443'), many, {}, storage);
  assert.equal(Object.keys(readGeminiFilters(URL_A, storage).groups.lines.dimension.overrides).length, GEMINI_FILTER_STORAGE_LIMITS.overrides);
  const only = memoryStorage(); saveGeminiFilters(URL_A, changed, {}, only); saveGeminiFilters(URL_A, DEFAULT_GEMINI_FILTERS, {}, only);
  assert.equal(only.text(), null);
});

test('invalid commands are ignored', () => {
  const { presentation, publish } = setup();
  publish({ connection: connection(URL_A), result: pair([S('Drift')]) });
  const before = presentation.getSnapshot().filters;
  presentation.setFilterValue('lines', 'nope', 't:x', true); presentation.setFilterValue('lines', 'status', 3, true);
  presentation.setFilterValue('lines', 'status', 't:x', 'true'); presentation.setFilterBase('lines', 'status', 'odd'); presentation.setFilterBase('lines', 'toString', 'all');
  presentation.setFilterBase('points', 'material', 'none'); presentation.setFilterBase('toString', 'status', 'none'); presentation.setFilterTab('status');
  assert.equal(presentation.getSnapshot().filters, before); assert.equal(presentation.getSnapshot().filterTab, 'lines');
});

test('Status and Eierskap are chosen per side; counts, totals and reset cover both', () => {
  const { presentation, publish, create } = setup();
  const result = pair([S('Drift', { OWNER_TITLE: 'Kommunal' }), S('Nedlagt', { OWNER_TITLE: 'Kommunal' }), S('Drift')],
    [S('Drift', { OWNER_TITLE: 'Kommunal' }), S('Nedlagt'), S('Fjernet')]);
  publish({ connection: connection(URL_A), result });
  const at = () => getGeminiFilterView(result, presentation.getSnapshot().filters);
  const owners = (side) => rows(result, side, 'owner', presentation.getSnapshot().filters).map((row) => [row.key, row.count, row.checked]);
  presentation.setFilterValue('points', 'status', 't:nedlagt', true);
  assert.deepEqual([at().visible, at().loaded, at().hiddenCount], [{ lines: 2, points: 2 }, { lines: 3, points: 3 }, 2]);
  assert.deepEqual([...at().hiddenKeys], ['lines1', 'points2']);
  presentation.setFilterBase('lines', 'owner', 'none');
  assert.deepEqual(at().visible, { lines: 0, points: 2 });
  presentation.setFilterBase('lines', 'owner', 'default'); presentation.setFilterValue('points', 'owner', 'm', false);
  assert.deepEqual(at().visible, { lines: 2, points: 1 });
  assert.deepEqual(owners('lines'), [['t:kommunal', 2, true], ['m', 1, true]]);
  assert.deepEqual(owners('points'), [['t:kommunal', 1, true], ['m', 2, false]]);
  assert.deepEqual(create().getSnapshot().filters, presentation.getSnapshot().filters);
  const { filters } = presentation.getSnapshot(), view = at();
  presentation.setFilterTab('points');
  assert.equal(presentation.getSnapshot().filters, filters); assert.equal(at(), view);
  assert(presentation.getSnapshot().linesVisible && presentation.getSnapshot().pointsVisible && presentation.getSnapshot().sourceVisible);
  presentation.setFilterBase('lines', 'material', 'none'); presentation.resetFilters();
  assert(isDefaultGeminiFilters(presentation.getSnapshot().filters)); assert.deepEqual(at().visible, { lines: 2, points: 1 });
  assert.equal(presentation.getSnapshot().filterTab, 'points');
});

test('a side without Drift is explained by name, and only while its own default applies', () => {
  const result = pair([S('Drift')], [S('Fjernet')]);
  assert.deepEqual(getGeminiFilterView(result, known).statusNotice, { kind: 'no-operational', side: 'points' });
  assert.equal(getGeminiFilterView(result, edit(known, 'points', 'status', { base: 'all' })).statusNotice, null);
  assert.deepEqual(getGeminiFilterView(pair([S('Fjernet')]), known).statusNotice, { kind: 'no-operational', side: null });
});

test('schema 1 choices move to both sides, for every service, and are independent afterwards', () => {
  const none = { base: 'default', overrides: {} };
  const old = JSON.stringify({ schema: 1, feeds: [
    { url: URL_A, statusRecognised: true, groups: { status: { base: 'default', overrides: { 't:nedlagt': true, 't:drift': false } },
      type: { base: 'none', overrides: { 't:vannledning': true } }, owner: { base: 'all', overrides: { 't:kommunal': false, 't:ola eksempel': false } },
      material: { base: 'default', overrides: { 't:pe': false } }, dimension: { base: 'all', overrides: { 'n:9': false } } } },
    { url: URL_B, statusRecognised: false, groups: { status: { base: 'all', overrides: {} }, type: none, owner: none, material: none, dimension: none } },
  ] });
  const storage = memoryStorage(old), a = readGeminiFilters(URL_A, storage);
  assert.equal(storage.text(), old, 'Reading never writes');
  assert.equal(a.statusRecognised, true);
  for (const side of GEMINI_FILTER_SIDES) {
    assert.deepEqual(a.groups[side].status, { base: 'default', overrides: { 't:nedlagt': true, 't:drift': false } });
    assert.deepEqual(a.groups[side].owner, { base: 'all', overrides: { 't:kommunal': false } });
  }
  assert.deepEqual(a.groups.lines.type, { base: 'none', overrides: { 't:vannledning': true } });
  assert.deepEqual(a.groups.lines.material, { base: 'default', overrides: { 't:pe': false } });
  assert.deepEqual(a.groups.lines.dimension, { base: 'all', overrides: { 'n:9': false } });
  assert.deepEqual(Object.keys(a.groups.points), ['status', 'owner']);
  const result = pair([S('Drift', { FCODE_TITLE: 'Vannledning' }), S('Nedlagt', { FCODE_TITLE: 'Vannledning' }), S('Nedlagt', { FCODE_TITLE: 'Annet' })],
    [S('Nedlagt'), S('Drift'), S('Nedlagt', { OWNER_TITLE: 'Kommunal' })]);
  assert.deepEqual(hidden(result, a), ['lines0', 'lines2', 'points1', 'points2'], 'The same objects as under the shared choice');

  const { presentation, publish, create } = setup(storage);
  publish({ connection: connection(URL_A), result });
  presentation.setFilterValue('points', 'status', 't:nedlagt', false);
  assert.equal(presentation.getSnapshot().filters.groups.lines.status.overrides['t:nedlagt'], true);
  const stored = JSON.parse(storage.text());
  assert.equal(stored.schema, 2); assert.equal(stored.feeds.length, 2, 'One edit migrates every service');
  assert.deepEqual(create().getSnapshot().filters, presentation.getSnapshot().filters);
  for (const side of GEMINI_FILTER_SIDES) assert.equal(readGeminiFilters(URL_B, storage).groups[side].status.base, 'all');
  presentation.resetFilters();
  assert(isDefaultGeminiFilters(readGeminiFilters(URL_A, storage)), 'A reset never brings schema 1 choices back');

  const automatic = setup(memoryStorage(old));
  automatic.publish({ connection: connection(URL_B), result });
  assert.equal(JSON.parse(automatic.storage.text()).schema, 2);
  assert.deepEqual(readGeminiFilters(URL_A, automatic.storage), a, 'Automatic recognition also keeps the other service');

  const full = { ...memoryStorage(old), setItem: () => { throw new DOMException('full', 'QuotaExceededError'); } };
  const failed = setup(full); failed.publish({ connection: connection(URL_A), result });
  failed.presentation.setFilterValue('points', 'status', 't:nedlagt', false);
  assert.equal(failed.presentation.getSnapshot().filterSaveFailed, true);
  assert.equal(full.text(), old, 'A failed migration keeps the old choices');
});
