const cleanHeaderValue = (value) => {
  if (!value) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const slugify = (value) => {
  if (!value) return 'unknown';
  return String(value)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .slice(0, 80);
};

const pickHeader = (headers, key) => {
  try {
    return cleanHeaderValue(headers.get(key));
  } catch {
    return null;
  }
};

export const getRoughLocationFromRequest = (request) => {
  const geo = request.geo || {};
  const headers = request.headers;

  const country =
    cleanHeaderValue(geo.country) ||
    pickHeader(headers, 'x-vercel-ip-country') ||
    null;
  const region =
    cleanHeaderValue(geo.region) ||
    pickHeader(headers, 'x-vercel-ip-country-region') ||
    null;
  const city =
    cleanHeaderValue(geo.city) ||
    pickHeader(headers, 'x-vercel-ip-city') ||
    null;

  let areaType = 'country';
  let areaName = country || 'unknown';

  if (country === 'NO') {
    if (city) {
      areaType = 'kommune';
      areaName = city;
    } else if (region) {
      areaType = 'fylke';
      areaName = region;
    }
  }

  return {
    country,
    region,
    city,
    areaType,
    areaName,
    areaId: slugify(areaName),
    source: 'vercel-geo',
  };
};
