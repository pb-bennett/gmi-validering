import fs from 'node:fs/promises';
import path from 'node:path';
import {
  incrementAggregateInSupabase,
  isSupabaseConfigured,
} from '@/lib/tracking/supabase';

const DEFAULT_STORAGE_PATH = path.join(
  process.cwd(),
  'data',
  'usage',
  'aggregates.json',
);

const resolveStoragePath = () =>
  process.env.TRACKING_STORAGE_PATH || DEFAULT_STORAGE_PATH;

const ensureDirectory = async (filePath) => {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
};

const readAggregates = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { version: 1, records: {} };
    }
    throw error;
  }
};

const writeAggregates = async (filePath, data) => {
  await ensureDirectory(filePath);
  await fs.writeFile(
    filePath,
    JSON.stringify(data, null, 2),
    'utf-8',
  );
};

const toDateKey = (date = new Date()) =>
  new Date(date).toISOString().slice(0, 10);

const toHourKey = (date = new Date()) => new Date(date).getUTCHours();

const normalizeLocation = (location, fallback) => {
  const areaType = location?.areaType || fallback.areaType;
  const areaId = location?.areaId || fallback.areaId;
  const areaName = location?.areaName || fallback.areaName;
  const country = location?.country || fallback.country || null;
  const region = location?.region || fallback.region || null;

  return {
    areaType,
    areaId,
    areaName,
    country,
    region,
  };
};

const buildAggregatePayload = ({
  eventType,
  uploaderLocation,
  datasetLocation,
}) => {
  const dateKey = toDateKey();
  const hourKey = toHourKey();

  const dataset = normalizeLocation(datasetLocation, {
    areaType: 'unknown',
    areaId: 'unknown',
    areaName: 'Unknown',
    country: null,
    region: null,
  });

  const uploader = normalizeLocation(uploaderLocation, {
    areaType: 'unknown',
    areaId: 'unknown',
    areaName: 'Unknown',
    country: null,
    region: null,
  });

  return {
    dateKey,
    hourKey,
    datasetAreaType: dataset.areaType,
    datasetAreaId: dataset.areaId,
    datasetAreaName: dataset.areaName,
    datasetCountry: dataset.country,
    datasetRegion: dataset.region,
    uploaderAreaType: uploader.areaType,
    uploaderAreaId: uploader.areaId,
    uploaderAreaName: uploader.areaName,
    uploaderCountry: uploader.country,
    uploaderRegion: uploader.region,
    eventType,
  };
};

const incrementAggregateInFile = async (payload) => {
  const filePath = resolveStoragePath();
  const {
    dateKey,
    hourKey,
    datasetAreaType,
    datasetAreaId,
    datasetAreaName,
    datasetCountry,
    datasetRegion,
    uploaderAreaType,
    uploaderAreaId,
    uploaderAreaName,
    uploaderCountry,
    uploaderRegion,
    eventType,
  } = payload;

  const recordKey = [
    dateKey,
    hourKey,
    datasetAreaType,
    datasetAreaId,
    uploaderAreaType,
    uploaderAreaId,
    eventType,
  ].join('|');

  try {
    const data = await readAggregates(filePath);
    const existing = data.records[recordKey];

    if (existing) {
      existing.count += 1;
      existing.updatedAt = new Date().toISOString();
    } else {
      data.records[recordKey] = {
        date: dateKey,
        hour: hourKey,
        datasetAreaType,
        datasetAreaId,
        datasetAreaName,
        datasetCountry,
        datasetRegion,
        uploaderAreaType,
        uploaderAreaId,
        uploaderAreaName,
        uploaderCountry,
        uploaderRegion,
        eventType,
        count: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    data.updatedAt = new Date().toISOString();
    await writeAggregates(filePath, data);
    return true;
  } catch (error) {
    console.error('Tracking storage error:', error);
    return false;
  }
};

export const incrementAggregate = async ({
  eventType,
  uploaderLocation,
  datasetLocation,
}) => {
  const payload = buildAggregatePayload({
    eventType,
    uploaderLocation,
    datasetLocation,
  });

  if (isSupabaseConfigured()) {
    const storedInSupabase =
      await incrementAggregateInSupabase(payload);
    if (storedInSupabase) {
      return true;
    }
  }

  return incrementAggregateInFile(payload);
};
