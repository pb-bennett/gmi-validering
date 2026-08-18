import {
  STATS_UNAVAILABLE_ERROR,
  ANALYTICS_START_DATE,
  buildKommuneOptions,
  filterRowsByKommune,
  filterRowsByAnalyticsStartDate,
  normaliseRecords,
  parseKommuneFilter,
  processRows,
  readLegacyRecords,
} from './legacyStats.mjs';

const BAD_QUERY_ERROR = 'Ugyldig kommune-filter.';

export const buildStatsResponse = async ({
  url,
  configured,
  readSupabase,
  readLocal,
  fetchKommuneCoords = async () => null,
} = {}) => {
  const filter = parseKommuneFilter(new URL(url).searchParams);
  if (filter.error) {
    return {
      status: 400,
      body: { ok: false, error: BAD_QUERY_ERROR },
    };
  }

  try {
    const loaded = await readLegacyRecords({
      configured,
      readSupabase,
      readLocal,
    });
    const rows = filterRowsByAnalyticsStartDate(normaliseRecords(
      loaded.records,
      loaded.source === 'file',
    ));
    const kommuneOptions = buildKommuneOptions(rows);

    if (
      filter.ids !== null &&
      filter.ids.some(
        (id) => !kommuneOptions.some((option) => option.kommuneNumber === id),
      )
    ) {
      return {
        status: 400,
        body: { ok: false, error: BAD_QUERY_ERROR },
      };
    }

    const filteredRows = filterRowsByKommune(rows, filter);
    const stats = processRows(filteredRows, {
      comparisonKommuneIds: filter.includeComparison ? filter.ids || [] : [],
      includeUnresolvedComparison:
        filter.includeComparison && filter.includeUnknown,
    });
    const kommuneNumbers = [
      ...new Set(
        stats.byKommune
          .filter((kommune) => kommune.kommuneNumber)
          .map((kommune) => kommune.kommuneNumber),
      ),
    ];
    const coordinateResults = await Promise.all(
      kommuneNumbers.map(async (kommuneNumber) => ({
        kommuneNumber,
        coordinates: await fetchKommuneCoords(kommuneNumber),
      })),
    );
    const coordinates = Object.fromEntries(
      coordinateResults
        .filter((result) => result.coordinates)
        .map((result) => [result.kommuneNumber, result.coordinates]),
    );

    for (const kommune of stats.byKommune) {
      const coordinate = coordinates[kommune.kommuneNumber];
      if (coordinate) Object.assign(kommune, coordinate);
    }
    for (const timelineEntry of stats.timeline) {
      const coordinate = coordinates[timelineEntry.kommuneNumber];
      if (coordinate) Object.assign(timelineEntry, coordinate);
    }

    return {
      status: 200,
      body: {
        ok: true,
        source: loaded.source,
        analyticsStartDate: ANALYTICS_START_DATE,
        filter,
        kommuneOptions,
        unresolvedUploadsAvailable: rows.some(
          (row) => !row.kommuneNumber,
        ),
        ...stats,
      },
    };
  } catch {
    return {
      status: 503,
      body: { ok: false, error: STATS_UNAVAILABLE_ERROR },
    };
  }
};
