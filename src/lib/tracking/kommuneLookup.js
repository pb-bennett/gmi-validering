import { slugify } from '@/lib/tracking/location';

const KOMMUNEINFO_URL = 'https://ws.geonorge.no/kommuneinfo/v1/punkt';
const CACHE = new Map();
const VALID_EPSG = new Set([25832, 25833, 4326]);

const buildCacheKey = (epsg, x, y) =>
  `${epsg}:${x.toFixed(2)}:${y.toFixed(2)}`;

export const lookupKommuneFromCoord = async ({ x, y, epsg }) => {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (!Number.isFinite(epsg) || !VALID_EPSG.has(epsg)) return null;

  const cacheKey = buildCacheKey(epsg, x, y);
  if (CACHE.has(cacheKey)) return CACHE.get(cacheKey);

  const url = `${KOMMUNEINFO_URL}?ost=${encodeURIComponent(
    x
  )}&nord=${encodeURIComponent(y)}&koordsys=${encodeURIComponent(epsg)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const kommuneName = data?.kommunenavn || data?.kommunenavnNorsk;
    const kommuneNumber = data?.kommunenummer || null;
    const fylkeNumber = data?.fylkesnummer || null;

    if (!kommuneName) return null;

    const result = {
      country: 'NO',
      region: fylkeNumber,
      areaType: 'kommune',
      areaName: kommuneName,
      areaId: slugify(kommuneName),
      kommuneNumber,
      source: 'dataset-kartverket',
    };

    CACHE.set(cacheKey, result);
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};
