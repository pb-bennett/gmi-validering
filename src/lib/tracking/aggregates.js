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

const buildAggregatePayload = ({ eventType, location }) => {
  const dateKey = toDateKey();
  const areaType = location?.areaType || 'unknown';
  const areaId = location?.areaId || 'unknown';
  const areaName = location?.areaName || 'Unknown';
  const country = location?.country || null;
  const region = location?.region || null;

  return {
    dateKey,
    areaType,
    areaId,
    areaName,
    country,
    region,
    eventType,
  };
};

const incrementAggregateInFile = async (payload) => {
  const filePath = resolveStoragePath();
  const {
    dateKey,
    areaType,
    areaId,
    areaName,
    country,
    region,
    eventType,
  } = payload;

  const recordKey = [dateKey, areaType, areaId, eventType].join('|');

  try {
    const data = await readAggregates(filePath);
    const existing = data.records[recordKey];

    if (existing) {
      existing.count += 1;
      existing.updatedAt = new Date().toISOString();
    } else {
      data.records[recordKey] = {
        date: dateKey,
        areaType,
        areaId,
        areaName,
        country,
        region,
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

export const incrementAggregate = async ({ eventType, location }) => {
  const payload = buildAggregatePayload({ eventType, location });

  if (isSupabaseConfigured()) {
    const storedInSupabase =
      await incrementAggregateInSupabase(payload);
    if (storedInSupabase) {
      return true;
    }
  }

  return incrementAggregateInFile(payload);
};
