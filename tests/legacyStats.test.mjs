import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ANALYTICS_START_DATE,
  SUPABASE_PAGE_SIZE,
  STATS_UNAVAILABLE_ERROR,
  UNRESOLVED_SERIES_KEY,
  buildKommuneOptions,
  formatAnalyticsStartDate,
  filterRowsByKommune,
  getRecordsFromSupabase,
  MAX_KOMMUNE_IDS,
  normaliseRecords,
  parseKommuneFilter,
  processRows,
  processRecords,
  readLegacyRecords,
} from '../src/lib/stats/legacyStats.mjs';
import { buildStatsResponse } from '../src/lib/stats/statsRoute.mjs';

const records = [
  {
    date: '2026-02-19',
    hour: 9,
    area_id: 'sandefjord',
    area_name: 'Sandefjord',
    kommune_number: '3804',
    event_type: 'upload_success',
    count: 2,
  },
  {
    date: '2026-02-20',
    hour: 10,
    area_id: 'sandefjord',
    area_name: 'Sandefjord',
    kommune_number: '3804',
    event_type: 'upload_success',
    count: 1,
  },
  {
    date: '2026-03-10',
    hour: 11,
    area_id: 'bergen',
    area_name: 'Bergen',
    kommune_number: '4601',
    event_type: 'upload_success',
    count: 3,
  },
  {
    date: '2026-03-11',
    hour: 12,
    area_id: 'unknown',
    area_name: 'unknown',
    kommune_number: null,
    event_type: 'upload_success',
    count: 1,
  },
];

const toRows = (input = records) => normaliseRecords(input);

test('preserves all-data behavior and derives ordered monthly/cumulative uptake', () => {
  const stats = processRecords(records);

  assert.equal(stats.summary.totalUploads, 7);
  assert.equal(stats.summary.unresolvedUploads, 1);
  assert.equal(stats.byKommune.some((item) => !item.kommuneNumber), false);
  assert.deepEqual(stats.monthly, [
    { month: '2026-02', count: 3 },
    { month: '2026-03', count: 4 },
  ]);
  assert.deepEqual(stats.cumulative, [
    { month: '2026-02', count: 3, cumulative: 3 },
    { month: '2026-03', count: 4, cumulative: 7 },
  ]);
  assert.equal(stats.cumulative.at(-1).cumulative, stats.summary.totalUploads);
});

test('filters selected municipalities and unresolved uploads consistently across totals, ranking, and map timeline data', () => {
  const rows = toRows();
  const only = filterRowsByKommune(rows, {
    ids: ['3804'],
    includeUnknown: false,
  });
  const excluded = filterRowsByKommune(rows, {
    ids: ['4601'],
    includeUnknown: true,
  });
  const onlyStats = processRows(only);
  const excludedStats = processRows(excluded);

  assert.equal(onlyStats.summary.totalUploads, 3);
  assert.deepEqual(onlyStats.byKommune.map((item) => item.kommuneNumber), ['3804']);
  assert.ok(onlyStats.timeline.every((item) => item.kommuneNumber === '3804'));
  assert.equal(onlyStats.cumulative.at(-1).cumulative, 3);

  assert.equal(excludedStats.summary.totalUploads, 4);
  assert.equal(excludedStats.summary.unresolvedUploads, 1);
  assert.equal(excludedStats.byKommune.some((item) => item.kommuneNumber === '3804'), false);
  assert.equal(excludedStats.cumulative.at(-1).cumulative, 4);

  assert.deepEqual(buildKommuneOptions(rows), [
    { kommuneNumber: '4601', areaId: 'bergen', areaName: 'Bergen' },
    { kommuneNumber: '3804', areaId: 'sandefjord', areaName: 'Sandefjord' },
  ]);
  assert.equal(
    filterRowsByKommune(rows, { ids: [], includeUnknown: false }).length,
    0,
  );
});

test('normalizes legacy unknown and malformed kommune rows into one unresolved bucket', async () => {
  const legacyRows = [
    {
      date: '2026-02-19', area_type: 'kommune', area_id: 'oslo',
      area_name: 'Oslo', kommune_number: '0301', count: 1,
    },
    {
      date: '2026-02-20', area_type: 'kommune', area_id: 'bergen',
      area_name: 'Bergen', kommune_number: '4601', count: 2,
    },
    {
      date: '2026-02-21', area_type: 'unknown', area_id: 'unknown',
      area_name: 'Unknown', kommune_number: '9999', count: 3,
    },
    {
      date: '2026-02-22', area_type: 'kommune', area_id: 'missing',
      area_name: 'Missing', count: 4,
    },
    {
      date: '2026-02-23', area_type: 'kommune', area_id: 'malformed',
      area_name: 'Malformed', kommune_number: '301', count: 5,
    },
  ];
  const rows = normaliseRecords(legacyRows);
  const options = buildKommuneOptions(rows);
  const stats = processRows(rows, {
    comparisonKommuneIds: ['0301', '4601'],
    includeUnresolvedComparison: true,
  });

  assert.deepEqual(options.map((option) => option.kommuneNumber), ['4601', '0301']);
  assert.equal(options.some((option) => option.areaName === 'Unknown'), false);
  assert.equal(rows.filter((row) => !row.kommuneNumber).length, 3);
  assert.equal(stats.summary.totalUploads, 15);
  assert.equal(stats.summary.unresolvedUploads, 12);
  assert.equal(stats.summary.uniqueKommuner, 2);
  assert.deepEqual(stats.byKommune.map((item) => item.kommuneNumber).sort(), ['0301', '4601']);
  assert.equal(stats.byKommune.some((item) => item.areaName === 'Unknown'), false);
  assert.equal(stats.byKommuneSeries[UNRESOLVED_SERIES_KEY].daily[2].count, 3);
  assert.equal(stats.byKommuneSeries[UNRESOLVED_SERIES_KEY].daily.at(-1).count, 5);

  const unresolvedExcluded = await buildStatsResponse({
    url: 'https://example.test/api/stats?kommuneIds=0301,4601&includeUnknown=0&includeComparison=1',
    configured: true,
    readSupabase: async () => legacyRows,
    readLocal: async () => [],
  });
  assert.equal(unresolvedExcluded.status, 200);
  assert.equal(unresolvedExcluded.body.summary.totalUploads, 3);
  assert.equal(Object.hasOwn(unresolvedExcluded.body.byKommuneSeries, UNRESOLVED_SERIES_KEY), false);

  const unresolvedIncluded = await buildStatsResponse({
    url: 'https://example.test/api/stats?kommuneIds=0301,4601&includeUnknown=1&includeComparison=1',
    configured: true,
    readSupabase: async () => legacyRows,
    readLocal: async () => [],
  });
  assert.equal(unresolvedIncluded.status, 200);
  assert.equal(unresolvedIncluded.body.summary.totalUploads, 15);
  assert.equal(
    Object.hasOwn(unresolvedIncluded.body.byKommuneSeries, UNRESOLVED_SERIES_KEY),
    true,
  );
  assert.equal(
    unresolvedIncluded.body.byKommuneSeries[UNRESOLVED_SERIES_KEY]
      .cumulativeByResolution.daily.at(-1).cumulative,
    12,
  );
  assert.equal(
    (await buildStatsResponse({
      url: 'https://example.test/api/stats?kommuneIds=9999&includeUnknown=1',
      configured: true,
      readSupabase: async () => legacyRows,
      readLocal: async () => [],
    })).status,
    400,
  );
  assert.equal(
    parseKommuneFilter(new URLSearchParams('kommuneIds=unknown')).error,
    'invalid_query',
  );
});

test('validates multi-kommune filter IDs, unknown handling, duplicates, and bounds', () => {
  assert.deepEqual(parseKommuneFilter(new URLSearchParams()), {
    ids: null,
    includeUnknown: true,
    includeComparison: false,
  });
  assert.deepEqual(
    parseKommuneFilter(new URLSearchParams('kommuneIds=3804,4601&includeUnknown=0&includeComparison=1')),
    { ids: ['3804', '4601'], includeUnknown: false, includeComparison: true },
  );
  for (const query of [
    'kommuneIds=wat',
    'kommuneIds=3804,wat',
    'kommuneIds=3804,3804',
    'includeUnknown=2',
    'includeComparison=true',
    'other=value',
  ]) {
    assert.equal(parseKommuneFilter(new URLSearchParams(query)).error, 'invalid_query');
  }
  assert.equal(
    parseKommuneFilter(new URLSearchParams('kommuneIds=3804&kommuneIds=4601')).error,
    'invalid_query',
  );
  assert.equal(
    parseKommuneFilter(new URLSearchParams('includeUnknown=1&includeUnknown=0')).error,
    'invalid_query',
  );
  const tooManyIds = Array.from({ length: MAX_KOMMUNE_IDS + 1 }, (_, index) =>
    String(index).padStart(4, '0'),
  ).join(',');
  assert.equal(parseKommuneFilter(new URLSearchParams(`kommuneIds=${tooManyIds}`)).error, 'invalid_query');
});

test('ignores malformed counts instead of corrupting totals', () => {
  const rows = normaliseRecords([
    records[0],
    { ...records[1], count: -1 },
    { ...records[2], count: Number.NaN },
    { ...records[2], count: Number.MAX_SAFE_INTEGER + 1 },
    { ...records[3], count: '3' },
    { ...records[3], count: 0 },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(processRecords([
    records[0],
    { ...records[3], count: 0 },
  ]).summary.totalUploads, 2);
});

test('reads every deterministic Supabase page without duplicates or truncation', async () => {
  const pages = [
    records.slice(0, 2),
    records.slice(2, 4),
    [],
  ];
  const ranges = [];
  const ordered = [];
  const client = {
    from() {
      return this;
    },
    select() {
      return this;
    },
    eq() {
      return this;
    },
    order(field) {
      ordered.push(field);
      return this;
    },
    range(from, to) {
      ranges.push([from, to]);
      return Promise.resolve({
        data: pages[ranges.length - 1],
        error: null,
      });
    },
  };

  const result = await getRecordsFromSupabase(client, 2);
  assert.equal(result.length, 4);
  assert.deepEqual(ranges, [[0, 1], [2, 3], [4, 5]]);
  assert.deepEqual(ordered.slice(0, 5), [
    'date',
    'hour',
    'area_type',
    'area_id',
    'event_type',
  ]);
  assert.equal(SUPABASE_PAGE_SIZE, 500);
});

test('stops after a partial final Supabase page', async () => {
  const pages = [records.slice(0, 2), records.slice(2, 3)];
  const ranges = [];
  const client = {
    from() { return this; },
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    range(from, to) {
      ranges.push([from, to]);
      return Promise.resolve({ data: pages[ranges.length - 1], error: null });
    },
  };

  assert.equal((await getRecordsFromSupabase(client, 2)).length, 3);
  assert.deepEqual(ranges, [[0, 1], [2, 3]]);
});

test('uses a total ranking tie-break for equal counts and names', () => {
  const stats = processRows(normaliseRecords([
    {
      date: '2026-02-19', area_id: 'zeta', area_name: 'Samme',
      kommune_number: '4601', count: 1,
    },
    {
      date: '2026-02-19', area_id: 'alfa', area_name: 'Samme',
      kommune_number: '0301', count: 1,
    },
  ]));
  assert.deepEqual(stats.byKommune.map((item) => item.kommuneNumber), [
    '0301',
    '4601',
  ]);
});

test('configured Supabase failure never falls back to local statistics', async () => {
  assert.equal(
    STATS_UNAVAILABLE_ERROR,
    'Statistikken er midlertidig utilgjengelig.',
  );
  let localReads = 0;
  await assert.rejects(
    readLegacyRecords({
      configured: true,
      readSupabase: async () => {
        throw new Error('synthetic upstream failure');
      },
      readLocal: async () => {
        localReads += 1;
        return records;
      },
    }),
  );
  assert.equal(localReads, 0);

  const local = await readLegacyRecords({
    configured: false,
    readSupabase: async () => records,
    readLocal: async () => records,
  });
  assert.equal(local.source, 'file');
});

test('empty data produces empty timelines without fabricated usage', () => {
  const stats = processRecords([]);
  assert.equal(stats.summary.totalUploads, 0);
  assert.deepEqual(stats.monthly, []);
  assert.deepEqual(stats.cumulative, []);
  assert.deepEqual(stats.byKommune, []);
  assert.deepEqual(stats.timeline, []);
});

test('derives daily, ISO-week, monthly, and cumulative series chronologically', () => {
  const stats = processRecords([
    { ...records[0], date: '2026-02-19', count: 2 },
    { ...records[1], date: '2026-02-23', count: 1 },
    { ...records[2], date: '2026-02-25', count: 3 },
  ]);
  assert.deepEqual(stats.daily, [
    { date: '2026-02-19', count: 2 },
    { date: '2026-02-20', count: 0 },
    { date: '2026-02-21', count: 0 },
    { date: '2026-02-22', count: 0 },
    { date: '2026-02-23', count: 1 },
    { date: '2026-02-24', count: 0 },
    { date: '2026-02-25', count: 3 },
  ]);
  assert.deepEqual(stats.weekly, [
    { week: '2026-02-16', count: 2 },
    { week: '2026-02-23', count: 4 },
  ]);
  assert.deepEqual(stats.monthly, [
    { month: '2026-02', count: 6 },
  ]);
  for (const resolution of ['daily', 'weekly', 'monthly']) {
    const cumulative = stats.cumulativeByResolution[resolution];
    assert.ok(cumulative.every((entry, index) =>
      index === 0 || entry.cumulative >= cumulative[index - 1].cumulative,
    ));
    assert.equal(cumulative.at(-1).cumulative, stats.summary.totalUploads);
  }
});

test('derives bounded per-kommune comparison series without unresolved lines', () => {
  const stats = processRows(toRows(), {
    comparisonKommuneIds: ['3804', '4601'],
  });
  assert.deepEqual(Object.keys(stats.byKommuneSeries).sort(), ['3804', '4601']);
  assert.equal(
    stats.byKommuneSeries['3804'].monthly.reduce((sum, entry) => sum + entry.count, 0),
    3,
  );
  assert.equal(
    stats.byKommuneSeries['4601'].monthly.reduce((sum, entry) => sum + entry.count, 0),
    3,
  );
  assert.equal(Object.hasOwn(stats.byKommuneSeries, 'unknown'), false);
  assert.equal(stats.byKommuneSeries['3804'].cumulativeByResolution.daily.at(-1).cumulative, 3);
  assert.equal(stats.byKommuneSeries['3804'].daily.at(-1).count, 0);
  assert.equal(stats.byKommuneSeries['3804'].cumulativeByResolution.daily.at(-1).cumulative, 3);
});

test('applies the analytics start boundary before filtering and all derived views', async () => {
  const boundaryRecords = [
    {
      date: '2026-02-18', area_id: 'legacy', area_name: 'Legacy',
      kommune_number: '1111', count: 10,
    },
    {
      date: '2026-02-18', area_id: 'unknown', area_name: 'Unknown',
      kommune_number: null, count: 20,
    },
    {
      date: ANALYTICS_START_DATE, area_id: 'active', area_name: 'Active',
      kommune_number: '2222', count: 2,
    },
    {
      date: '2026-02-20', area_id: 'active', area_name: 'Active',
      kommune_number: '2222', count: 3,
    },
    {
      date: '2026-02-20', area_id: 'unknown', area_name: 'Unknown',
      kommune_number: null, count: 4,
    },
  ];
  const response = await buildStatsResponse({
    url: 'https://example.test/api/stats?kommuneIds=2222&includeUnknown=1&includeComparison=1',
    configured: true,
    readSupabase: async () => boundaryRecords,
    readLocal: async () => [],
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.analyticsStartDate, ANALYTICS_START_DATE);
  assert.equal(formatAnalyticsStartDate(), '19. februar 2026');
  assert.equal(response.body.summary.totalUploads, 9);
  assert.equal(response.body.summary.unresolvedUploads, 4);
  assert.equal(response.body.summary.uniqueKommuner, 1);
  assert.equal(response.body.summary.firstDate, ANALYTICS_START_DATE);
  assert.equal(response.body.summary.lastDate, '2026-02-20');
  assert.deepEqual(response.body.kommuneOptions.map((option) => option.kommuneNumber), ['2222']);
  assert.deepEqual(response.body.byKommune.map((kommune) => kommune.kommuneNumber), ['2222']);
  assert.equal(response.body.timeline.some((entry) => entry.kommuneNumber === '1111'), false);
  assert.deepEqual(response.body.daily, [
    { date: ANALYTICS_START_DATE, count: 2 },
    { date: '2026-02-20', count: 7 },
  ]);
  assert.deepEqual(response.body.weekly, [{ week: '2026-02-16', count: 9 }]);
  assert.deepEqual(response.body.monthly, [{ month: '2026-02', count: 9 }]);
  assert.equal(response.body.cumulative.at(-1).cumulative, 9);
  assert.deepEqual(
    Object.keys(response.body.byKommuneSeries).sort(),
    [UNRESOLVED_SERIES_KEY, '2222'].sort(),
  );
  assert.deepEqual(
    response.body.byKommuneSeries[UNRESOLVED_SERIES_KEY].daily.map((entry) => entry.count),
    [0, 4],
  );

  const preStartOnly = await buildStatsResponse({
    url: 'https://example.test/api/stats?kommuneIds=1111',
    configured: true,
    readSupabase: async () => boundaryRecords,
    readLocal: async () => [],
  });
  assert.equal(preStartOnly.status, 400);

  const knownOnly = await buildStatsResponse({
    url: 'https://example.test/api/stats?kommuneIds=2222&includeUnknown=0',
    configured: true,
    readSupabase: async () => boundaryRecords,
    readLocal: async () => [],
  });
  assert.equal(knownOnly.body.summary.totalUploads, 5);
  assert.equal(knownOnly.body.summary.unresolvedUploads, 0);
});

test('uses a shared period domain and carries cumulative values after final events', () => {
  const rows = normaliseRecords([
    { ...records[0], date: '2026-02-19', count: 3 },
    { ...records[0], date: '2026-02-20', count: 2 },
    { ...records[2], date: '2026-02-22', count: 4 },
  ]);
  const stats = processRows(rows, { comparisonKommuneIds: ['3804', '4601'] });
  const series = stats.byKommuneSeries['3804'];

  assert.deepEqual(series.daily.map((entry) => entry.date), stats.daily.map((entry) => entry.date));
  assert.deepEqual(series.daily.map((entry) => entry.count), [3, 2, 0, 0]);
  assert.deepEqual(series.cumulativeByResolution.daily.map((entry) => entry.cumulative), [3, 5, 5, 5]);
  assert.deepEqual(series.weekly.map((entry) => entry.week), stats.weekly.map((entry) => entry.week));
  assert.equal(series.cumulativeByResolution.weekly.at(-1).cumulative, 5);
  assert.deepEqual(series.cumulativeByResolution.monthly.map((entry) => entry.cumulative), [5]);
  assert.ok(series.cumulativeByResolution.daily.every((entry, index, all) =>
    index === 0 || entry.cumulative >= all[index - 1].cumulative,
  ));
  assert.equal(stats.cumulativeByResolution.daily.at(-1).cumulative, stats.summary.totalUploads);
});

test('includes filtered unresolved activity in ranking without changing municipality or map semantics', async () => {
  const rankingRecords = [
    {
      date: '2026-02-18', area_id: 'legacy', area_name: 'Legacy',
      kommune_number: '9999', count: 100,
    },
    {
      date: '2026-02-18', area_id: 'unknown', area_name: 'Unknown',
      kommune_number: null, count: 100,
    },
    {
      date: ANALYTICS_START_DATE, area_id: 'alpha', area_name: 'Alpha',
      kommune_number: '1111', count: 2,
    },
    {
      date: ANALYTICS_START_DATE, area_id: 'unknown', area_name: 'Unknown',
      kommune_number: null, count: 5,
    },
  ];
  const response = await buildStatsResponse({
    url: 'https://example.test/api/stats',
    configured: true,
    readSupabase: async () => rankingRecords,
    readLocal: async () => [],
    fetchKommuneCoords: async () => ({ lat: 60, lng: 10 }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.ranking.map((entry) => entry.areaName), [
    'Uten registrert kommune',
    'Alpha',
  ]);
  assert.equal(response.body.ranking[0].count, 5);
  assert.equal(response.body.summary.uniqueKommuner, 1);
  assert.deepEqual(response.body.byKommune.map((entry) => entry.areaName), ['Alpha']);
  assert.equal(response.body.byKommune.some((entry) => entry.areaName === 'Uten registrert kommune'), false);
  assert.equal(response.body.timeline.some((entry) => entry.kommuneNumber === null && entry.lat), false);
  assert.equal(response.body.ranking.some((entry) => entry.areaName === 'Unknown'), false);

  const unresolvedExcluded = await buildStatsResponse({
    url: 'https://example.test/api/stats?kommuneIds=1111&includeUnknown=0',
    configured: true,
    readSupabase: async () => rankingRecords,
    readLocal: async () => [],
  });
  assert.deepEqual(unresolvedExcluded.body.ranking.map((entry) => entry.areaName), ['Alpha']);

  const unresolvedZero = await buildStatsResponse({
    url: 'https://example.test/api/stats?kommuneIds=1111&includeUnknown=1',
    configured: true,
    readSupabase: async () => rankingRecords.map((row) =>
      row.kommune_number ? row : { ...row, date: ANALYTICS_START_DATE, count: 0 }),
    readLocal: async () => [],
  });
  assert.equal(unresolvedZero.body.summary.unresolvedUploads, 0);
  assert.deepEqual(unresolvedZero.body.ranking.map((entry) => entry.areaName), ['Alpha']);
});

test('supports all selected known municipalities and optional unresolved comparison series', () => {
  const synthetic = Array.from({ length: 12 }, (_, index) => ({
    date: '2026-02-19',
    area_id: `kommune-${index}`,
    area_name: `Kommune ${index}`,
    kommune_number: String(3000 + index).padStart(4, '0'),
    event_type: 'upload_success',
    count: index + 1,
  }));
  const rows = normaliseRecords([
    ...synthetic,
    { ...records[3], date: '2026-02-20', count: 2 },
    { ...synthetic[0], date: '2026-02-22', count: 1 },
  ]);
  const ids = synthetic.map((row) => row.kommune_number);
  const stats = processRows(rows, {
    comparisonKommuneIds: ids,
    includeUnresolvedComparison: true,
  });
  assert.equal(ids.length > 8, true);
  assert.deepEqual(Object.keys(stats.byKommuneSeries).sort(), [
    ...ids,
    UNRESOLVED_SERIES_KEY,
  ].sort());
  assert.equal(stats.summary.uniqueKommuner, 12);
  assert.equal(stats.byKommune.some((item) => !item.kommuneNumber), false);
  assert.equal(stats.byKommuneSeries[UNRESOLVED_SERIES_KEY].daily[1].count, 2);
  assert.deepEqual(
    stats.byKommuneSeries[UNRESOLVED_SERIES_KEY].cumulativeByResolution.daily.map(
      (entry) => entry.cumulative,
    ),
    [0, 2, 2, 2],
  );
  assert.equal(
    stats.byKommuneSeries[UNRESOLVED_SERIES_KEY].cumulativeByResolution.daily[1].cumulative,
    2,
  );
});

test('stats response seam rejects bad filters, sanitizes failures, and keeps unresolved rows out of municipality views', async () => {
  const response = await buildStatsResponse({
    url: 'https://example.test/api/stats',
    configured: true,
    readSupabase: async () => records,
    readLocal: async () => [],
    fetchKommuneCoords: async () => ({ lat: 60, lng: 10 }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.summary.totalUploads, 7);
  assert.equal(response.body.timeline.some((item) => item.kommuneNumber === null), true);
  assert.equal(response.body.byKommune.some((item) => !item.kommuneNumber), false);
  assert.equal(Object.hasOwn(response.body, 'records'), false);
  assert.equal(JSON.stringify(response.body).includes('event_type'), false);

  const only = await buildStatsResponse({
    url: 'https://example.test/api/stats?kommuneIds=3804&includeUnknown=0',
    configured: true,
    readSupabase: async () => records,
    readLocal: async () => [],
  });
  const exclude = await buildStatsResponse({
    url: 'https://example.test/api/stats?kommuneIds=4601&includeUnknown=1',
    configured: true,
    readSupabase: async () => records,
    readLocal: async () => [],
  });
  assert.equal(only.body.summary.totalUploads, 3);
  assert.equal(only.body.timeline.some((item) => item.kommuneNumber === null), false);
  assert.equal(exclude.body.summary.totalUploads, 4);
  assert.equal(exclude.body.summary.unresolvedUploads, 1);

  const multiple = await buildStatsResponse({
    url: 'https://example.test/api/stats?kommuneIds=3804,4601&includeUnknown=0',
    configured: true,
    readSupabase: async () => records,
    readLocal: async () => [],
  });
  assert.equal(multiple.body.summary.totalUploads, 6);
  assert.deepEqual(
    multiple.body.byKommune.map((item) => item.kommuneNumber).sort(),
    ['3804', '4601'],
  );

  const noKnown = await buildStatsResponse({
    url: 'https://example.test/api/stats?kommuneIds=&includeUnknown=0',
    configured: true,
    readSupabase: async () => records,
    readLocal: async () => [],
  });
  assert.equal(noKnown.body.summary.totalUploads, 0);
  assert.deepEqual(noKnown.body.byKommune, []);

  const unknownOnly = await buildStatsResponse({
    url: 'https://example.test/api/stats?kommuneIds=&includeUnknown=1',
    configured: true,
    readSupabase: async () => records,
    readLocal: async () => [],
  });
  assert.equal(unknownOnly.body.summary.totalUploads, 1);
  assert.equal(unknownOnly.body.byKommune.length, 0);

  const comparison = await buildStatsResponse({
    url: 'https://example.test/api/stats?kommuneIds=3804,4601&includeUnknown=1&includeComparison=1',
    configured: true,
    readSupabase: async () => records,
    readLocal: async () => [],
  });
  assert.deepEqual(Object.keys(comparison.body.byKommuneSeries).sort(), [
    '3804',
    '4601',
    UNRESOLVED_SERIES_KEY,
  ]);

  const unknown = await buildStatsResponse({
    url: 'https://example.test/api/stats?kommuneIds=9999&includeUnknown=0',
    configured: true,
    readSupabase: async () => records,
    readLocal: async () => [],
  });
  assert.equal(unknown.status, 400);

  const duplicate = await buildStatsResponse({
    url: 'https://example.test/api/stats?kommuneIds=3804&kommuneIds=3804',
    configured: true,
    readSupabase: async () => records,
    readLocal: async () => [],
  });
  assert.equal(duplicate.status, 400);

  const failure = await buildStatsResponse({
    url: 'https://example.test/api/stats',
    configured: true,
    readSupabase: async () => {
      throw new Error('raw aggregate failure');
    },
    readLocal: async () => records,
  });
  assert.equal(failure.status, 503);
  assert.deepEqual(failure.body, {
    ok: false,
    error: STATS_UNAVAILABLE_ERROR,
  });
  assert.equal(JSON.stringify(failure.body).includes('raw aggregate failure'), false);
});
