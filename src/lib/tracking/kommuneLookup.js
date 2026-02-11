import { slugify } from '@/lib/tracking/location';

const ADDRESS_API_URL = 'https://ws.geonorge.no/adresser/v1/punktsok';
const KOMMUNEINFO_URL = 'https://ws.geonorge.no/kommuneinfo/v1/punkt';
const ADDRESS_RADIUS_METERS = 200;
const CACHE = new Map();
const VALID_EPSG = new Set([25832, 25833, 4326]);

const buildCacheKey = (epsg, x, y) =>
  `${epsg}:${x.toFixed(2)}:${y.toFixed(2)}`;

const fetchJsonWithTimeout = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const buildResult = ({ kommuneName, kommuneNumber, fylkeNumber, source }) => {
  if (!kommuneName) return null;
  return {
    country: 'NO',
    region: fylkeNumber || null,
    areaType: 'kommune',
    areaName: kommuneName,
    areaId: slugify(kommuneName),
    kommuneNumber: kommuneNumber || null,
    source,
  };
};

const lookupFromAddressApi = async ({ x, y, epsg }) => {
  const url = `${ADDRESS_API_URL}?lat=${encodeURIComponent(
    y,
  )}&lon=${encodeURIComponent(
    x,
  )}&radius=${encodeURIComponent(
    ADDRESS_RADIUS_METERS,
  )}&koordsys=${encodeURIComponent(
    epsg,
  )}&treffPerSide=1`;

  const data = await fetchJsonWithTimeout(url);
  const hit = data?.adresser?.[0];
  if (!hit) return null;

  return buildResult({
    kommuneName: hit?.kommunenavn,
    kommuneNumber: hit?.kommunenummer,
    fylkeNumber: null,
    source: 'geonorge-adresse',
  });
};

const lookupFromKommuneInfo = async ({ x, y, epsg }) => {
  const url = `${KOMMUNEINFO_URL}?ost=${encodeURIComponent(
    x,
  )}&nord=${encodeURIComponent(y)}&koordsys=${encodeURIComponent(epsg)}`;

  const data = await fetchJsonWithTimeout(url);
  return buildResult({
    kommuneName: data?.kommunenavn || data?.kommunenavnNorsk,
    kommuneNumber: data?.kommunenummer,
    fylkeNumber: data?.fylkesnummer,
    source: 'dataset-kartverket',
  });
};

export const lookupKommuneFromCoord = async ({ x, y, epsg }) => {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (!Number.isFinite(epsg) || !VALID_EPSG.has(epsg)) return null;

  const cacheKey = buildCacheKey(epsg, x, y);
  if (CACHE.has(cacheKey)) return CACHE.get(cacheKey);

  const addressResult = await lookupFromAddressApi({ x, y, epsg });
  if (addressResult) {
    CACHE.set(cacheKey, addressResult);
    return addressResult;
  }

  const kommuneResult = await lookupFromKommuneInfo({ x, y, epsg });
  if (kommuneResult) {
    CACHE.set(cacheKey, kommuneResult);
    return kommuneResult;
  }

  return null;
};
