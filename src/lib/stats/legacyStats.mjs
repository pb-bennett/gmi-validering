export const STATS_UNAVAILABLE_ERROR =
  'Statistikken er midlertidig utilgjengelig.';

export const ANALYTICS_START_DATE = '2026-02-19';
export const SUPABASE_PAGE_SIZE = 500;
export const MAX_KOMMUNE_IDS = 500;
export const UNRESOLVED_SERIES_KEY = '__unresolved__';
const MAX_SUPABASE_PAGES = 10_000;
const FULL_MONTHS = [
  'januar',
  'februar',
  'mars',
  'april',
  'mai',
  'juni',
  'juli',
  'august',
  'september',
  'oktober',
  'november',
  'desember',
];

const SUPABASE_ORDER_FIELDS = [
  'date',
  'hour',
  'area_type',
  'area_id',
  'event_type',
];

const isValidDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
};

const isValidCount = (value) =>
  Number.isSafeInteger(value) && value >= 0;

const isValidKommuneNumber = (value) =>
  (typeof value === 'string' || typeof value === 'number') &&
  /^\d{4}$/.test(String(value));

const isUnknownToken = (value) =>
  typeof value === 'string' && value.trim().toLowerCase() === 'unknown';

const normaliseKommuneNumber = (row, isFile) => {
  const kommuneNumber = isFile
    ? row?.kommuneNumber
    : row?.kommune_number;
  const areaType = isFile ? row?.areaType : row?.area_type;
  const areaId = isFile ? row?.areaId : row?.area_id;
  const areaName = isFile ? row?.areaName : row?.area_name;

  if (
    !isValidKommuneNumber(kommuneNumber) ||
    isUnknownToken(areaType) ||
    isUnknownToken(areaId) ||
    isUnknownToken(areaName)
  ) {
    return null;
  }
  return String(kommuneNumber);
};

const normaliseRow = (row, isFile) => {
  const count = row?.count;
  if (!isValidDate(row?.date) || !isValidCount(count)) return null;

  const hourValue = row?.hour ?? 0;
  const hour = Number.isInteger(hourValue) && hourValue >= 0 && hourValue < 24
    ? hourValue
    : 0;
  const kommuneNumber = normaliseKommuneNumber(row, isFile);

  return isFile
    ? {
        date: row.date,
        hour,
        areaType: row.areaType,
        areaId: row.areaId,
        areaName: row.areaName,
        kommuneNumber,
        country: row.country,
        region: row.region,
        count,
      }
    : {
        date: row.date,
        hour,
        areaType: row.area_type,
        areaId: row.area_id,
        areaName: row.area_name,
        kommuneNumber,
        country: row.country,
        region: row.region,
        count,
      };
};

export const normaliseRecords = (records = [], isFile = false) =>
  records.map((row) => normaliseRow(row, isFile)).filter(Boolean);

export const filterRowsByAnalyticsStartDate = (rows = []) =>
  rows.filter((row) => row.date >= ANALYTICS_START_DATE);

export const formatAnalyticsStartDate = (dateValue = ANALYTICS_START_DATE) => {
  const date = new Date(`${dateValue}T12:00:00Z`);
  return `${date.getUTCDate()}. ${FULL_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
};

const compareMonth = (a, b) => a.localeCompare(b);

const monthKey = (date) => date.slice(0, 7);

const addMonths = (month, amount) => {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return date.toISOString().slice(0, 7);
};

const dateKey = (date) => date.toISOString().slice(0, 10);

const addDays = (dateValue, amount) => {
  const date = new Date(`${dateValue}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return dateKey(date);
};

export const isoWeekStart = (dateValue) => {
  const date = new Date(`${dateValue}T00:00:00Z`);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return dateKey(date);
};

const buildDaily = (rows, domain = null) => {
  const dailyMap = {};
  for (const row of rows) {
    dailyMap[row.date] = (dailyMap[row.date] || 0) + row.count;
  }
  const observedDates = Object.keys(dailyMap).sort();
  const dates = domain?.length
    ? [domain[0].date, domain.at(-1).date]
    : observedDates;
  if (dates.length === 0) return [];

  const daily = [];
  for (let date = dates[0]; date <= dates.at(-1); date = addDays(date, 1)) {
    daily.push({ date, count: dailyMap[date] || 0 });
  }
  return daily;
};

const buildWeekly = (rows, domain = null) => {
  const weeklyMap = {};
  for (const row of rows) {
    const week = isoWeekStart(row.date);
    weeklyMap[week] = (weeklyMap[week] || 0) + row.count;
  }
  const observedWeeks = Object.keys(weeklyMap).sort();
  const weeks = domain?.length
    ? [domain[0].week, domain.at(-1).week]
    : observedWeeks;
  if (weeks.length === 0) return [];

  const weekly = [];
  for (
    let week = weeks[0];
    week <= weeks.at(-1);
    week = addDays(week, 7)
  ) {
    weekly.push({ week, count: weeklyMap[week] || 0 });
  }
  return weekly;
};

const buildMonthly = (rows, domain = null) => {
  const monthlyMap = {};
  for (const row of rows) {
    const month = monthKey(row.date);
    monthlyMap[month] = (monthlyMap[month] || 0) + row.count;
  }

  const observedMonths = Object.keys(monthlyMap).sort(compareMonth);
  const domainMonths = domain?.length
    ? [domain[0].month, domain.at(-1).month]
    : observedMonths;
  if (domainMonths.length === 0) return [];

  const monthly = [];
  for (
    let month = domainMonths[0];
    month <= domainMonths[domainMonths.length - 1];
    month = addMonths(month, 1)
  ) {
    monthly.push({ month, count: monthlyMap[month] || 0 });
  }
  return monthly;
};

const buildCumulative = (monthly) => {
  let cumulative = 0;
  return monthly.map((entry) => {
    cumulative += entry.count;
    return { ...entry, cumulative };
  });
};

const compareRankingEntries = (a, b) =>
  b.count - a.count ||
  String(a.areaName || '').localeCompare(String(b.areaName || ''), 'nb') ||
  String(a.kommuneNumber || a.areaId || '').localeCompare(
    String(b.kommuneNumber || b.areaId || ''),
    'nb',
  ) ||
  String(a.areaId || '').localeCompare(String(b.areaId || ''), 'nb');

export const buildTimeSeries = (rows = [], { domain = null } = {}) => {
  const analyticsRows = filterRowsByAnalyticsStartDate(rows);
  const daily = buildDaily(analyticsRows, domain?.daily);
  const weekly = buildWeekly(analyticsRows, domain?.weekly);
  const monthly = buildMonthly(analyticsRows, domain?.monthly);
  return {
    daily,
    weekly,
    monthly,
    cumulativeByResolution: {
      daily: buildCumulative(daily),
      weekly: buildCumulative(weekly),
      monthly: buildCumulative(monthly),
    },
  };
};

export const processRows = (
  rows = [],
  {
    comparisonKommuneIds = [],
    includeUnresolvedComparison = false,
  } = {},
) => {
  const analyticsRows = filterRowsByAnalyticsStartDate(rows);
  const totalUploads = analyticsRows.reduce((sum, row) => sum + row.count, 0);
  const unresolvedUploads = analyticsRows
    .filter((row) => !row.kommuneNumber)
    .reduce((sum, row) => sum + row.count, 0);
  const kommuneSet = new Set(
    analyticsRows
      .filter((row) => row.kommuneNumber)
      .map((row) => row.kommuneNumber),
  );
  const dates = analyticsRows.map((row) => row.date).sort();
  const firstDate = dates[0] || null;
  const lastDate = dates[dates.length - 1] || null;

  const timeSeries = buildTimeSeries(analyticsRows);
  const { daily, weekly, monthly, cumulativeByResolution } = timeSeries;

  const hourlyMap = {};
  for (const row of analyticsRows) {
    hourlyMap[row.hour] = (hourlyMap[row.hour] || 0) + row.count;
  }
  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    count: hourlyMap[hour] || 0,
  }));

  const kommuneMap = {};
  for (const row of analyticsRows) {
    if (!row.kommuneNumber) continue;
    const key = row.kommuneNumber;
    if (!kommuneMap[key]) {
      kommuneMap[key] = {
        areaId: row.areaId,
        areaName: row.areaName || row.areaId,
        kommuneNumber: row.kommuneNumber,
        count: 0,
      };
    }
    kommuneMap[key].count += row.count;
  }
  const byKommune = Object.values(kommuneMap).sort(compareRankingEntries);
  const ranking = [...byKommune];
  if (unresolvedUploads > 0) {
    ranking.push({
      areaId: null,
      areaName: 'Uten registrert kommune',
      kommuneNumber: null,
      count: unresolvedUploads,
      isUnresolved: true,
    });
    ranking.sort(compareRankingEntries);
  }

  const heatmapMap = {};
  for (const row of analyticsRows) {
    const dayOfWeek = new Date(`${row.date}T12:00:00Z`).getUTCDay();
    const key = `${dayOfWeek}_${row.hour}`;
    heatmapMap[key] = (heatmapMap[key] || 0) + row.count;
  }
  const heatmap = [];
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      const count = heatmapMap[`${dayOfWeek}_${hour}`] || 0;
      if (count > 0) heatmap.push({ dayOfWeek, hour, count });
    }
  }

  const timelineMap = {};
  for (const row of analyticsRows) {
    const key = `${row.date}|${row.kommuneNumber || row.areaId || 'unknown'}`;
    if (!timelineMap[key]) {
      timelineMap[key] = {
        date: row.date,
        kommuneNumber: row.kommuneNumber,
        areaName: row.areaName,
        count: 0,
      };
    }
    timelineMap[key].count += row.count;
  }
  const timeline = Object.values(timelineMap).sort(
    (a, b) => a.date.localeCompare(b.date),
  );

  const byKommuneSeries = {};
  for (const kommuneNumber of new Set(comparisonKommuneIds)) {
    if (!analyticsRows.some((row) => row.kommuneNumber === kommuneNumber)) {
      continue;
    }
    byKommuneSeries[kommuneNumber] = buildTimeSeries(
      analyticsRows.filter((row) => row.kommuneNumber === kommuneNumber),
      { domain: timeSeries },
    );
  }
  if (includeUnresolvedComparison) {
    byKommuneSeries[UNRESOLVED_SERIES_KEY] = buildTimeSeries(
      analyticsRows.filter((row) => !row.kommuneNumber),
      { domain: timeSeries },
    );
  }

  return {
    summary: {
      totalUploads,
      uniqueKommuner: kommuneSet.size,
      unresolvedUploads,
      activeDays: new Set(dates).size,
      firstDate,
      lastDate,
    },
    daily,
    weekly,
    monthly,
    cumulative: cumulativeByResolution.monthly,
    cumulativeByResolution,
    byKommuneSeries,
    hourly,
    byKommune,
    ranking,
    heatmap,
    timeline,
  };
};

export const processRecords = (records, isFile = false) =>
  processRows(normaliseRecords(records, isFile));

export const buildKommuneOptions = (rows = []) => {
  const options = new Map();
  for (const row of filterRowsByAnalyticsStartDate(rows)) {
    if (
      !isValidKommuneNumber(row.kommuneNumber) ||
      isUnknownToken(row.areaType) ||
      isUnknownToken(row.areaId) ||
      isUnknownToken(row.areaName)
    ) continue;
    const key = String(row.kommuneNumber);
    if (!options.has(key)) {
      options.set(key, {
        kommuneNumber: key,
        areaId: row.areaId,
        areaName: row.areaName || row.areaId || key,
      });
    }
  }
  return [...options.values()]
    .sort(
      (a, b) =>
        String(a.areaName).localeCompare(String(b.areaName), 'nb') ||
        String(a.kommuneNumber).localeCompare(String(b.kommuneNumber), 'nb'),
    )
    .slice(0, MAX_KOMMUNE_IDS);
};

export const parseKommuneFilter = (searchParams) => {
  const allowedKeys = new Set([
    'kommuneIds',
    'includeUnknown',
    'includeComparison',
  ]);
  for (const key of searchParams.keys()) {
    if (!allowedKeys.has(key)) return { error: 'invalid_query' };
  }

  for (const key of allowedKeys) {
    if (searchParams.getAll(key).length > 1) {
      return { error: 'invalid_query' };
    }
  }

  const rawIds = searchParams.get('kommuneIds');
  let ids = null;
  if (rawIds !== null) {
    ids = rawIds === '' ? [] : rawIds.split(',');
    if (
      ids.length > MAX_KOMMUNE_IDS ||
      ids.some((id) => !/^\d{4}$/.test(id)) ||
      new Set(ids).size !== ids.length
    ) {
      return { error: 'invalid_query' };
    }
  }

  const includeUnknownValue = searchParams.get('includeUnknown');
  if (
    includeUnknownValue !== null &&
    !['0', '1'].includes(includeUnknownValue)
  ) {
    return { error: 'invalid_query' };
  }

  const includeComparisonValue = searchParams.get('includeComparison');
  if (
    includeComparisonValue !== null &&
    !['0', '1'].includes(includeComparisonValue)
  ) {
    return { error: 'invalid_query' };
  }

  return {
    ids,
    includeUnknown: includeUnknownValue !== '0',
    includeComparison: includeComparisonValue === '1',
  };
};

export const filterRowsByKommune = (rows, filter) => {
  const analyticsRows = filterRowsByAnalyticsStartDate(rows);
  if (!filter || filter.ids === null) {
    return filter?.includeUnknown === false
      ? analyticsRows.filter((row) => row.kommuneNumber)
      : analyticsRows;
  }
  const selectedIds = new Set(filter.ids);
  return analyticsRows.filter((row) => {
    if (!row.kommuneNumber) return filter.includeUnknown;
    return selectedIds.has(String(row.kommuneNumber));
  });
};

export const readLegacyRecords = async ({
  configured,
  readSupabase,
  readLocal,
}) => {
  if (configured) {
    return { source: 'supabase', records: await readSupabase() };
  }
  return { source: 'file', records: await readLocal() };
};

export const getRecordsFromSupabase = async (
  client,
  pageSize = SUPABASE_PAGE_SIZE,
) => {
  const records = [];
  for (let page = 0; page < MAX_SUPABASE_PAGES; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    let query = client
      .from('aggregates')
      .select(
        'date, hour, area_type, area_id, area_name, kommune_number, country, region, event_type, count',
      )
      .eq('event_type', 'upload_success');
    for (const field of SUPABASE_ORDER_FIELDS) {
      query = query.order(field, { ascending: true });
    }
    const { data, error } = await query.range(from, to);
    if (error) throw error;
    const pageRecords = Array.isArray(data) ? data : [];
    records.push(...pageRecords);
    if (pageRecords.length < pageSize) return records;
  }
  throw new Error('stats pagination limit exceeded');
};
