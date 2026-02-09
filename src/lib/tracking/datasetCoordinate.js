const getEpsgFromHeader = (header = {}) => {
  const candidates = [header.COSYS_EPSG, header.COSYSVER_EPSG];
  for (const value of candidates) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }

  const srid = header.SRID;
  if (typeof srid === 'string') {
    const match = srid.match(/EPSG\s*:?\s*(\d+)/i);
    if (match) return Number(match[1]);
  }

  return null;
};

const collectCoordinates = (data) => {
  const coords = [];

  (data?.points || []).forEach((point) => {
    const c = point?.coordinates?.[0];
    if (c && Number.isFinite(c.x) && Number.isFinite(c.y)) {
      coords.push({ x: c.x, y: c.y });
    }
  });

  (data?.lines || []).forEach((line) => {
    const c = line?.coordinates?.[0];
    if (c && Number.isFinite(c.x) && Number.isFinite(c.y)) {
      coords.push({ x: c.x, y: c.y });
    }
  });

  return coords;
};

const sampleCoordinates = (coords, maxSamples) => {
  if (coords.length <= maxSamples) return coords;

  const step = Math.ceil(coords.length / maxSamples);
  const sampled = [];
  for (let i = 0; i < coords.length; i += step) {
    sampled.push(coords[i]);
  }
  return sampled;
};

const centroid = (coords) => {
  if (!coords.length) return null;
  const sum = coords.reduce(
    (acc, c) => ({ x: acc.x + c.x, y: acc.y + c.y }),
    { x: 0, y: 0 }
  );
  return {
    x: sum.x / coords.length,
    y: sum.y / coords.length,
  };
};

export const getDatasetCoordinate = (data, maxSamples = 200) => {
  const epsg = getEpsgFromHeader(data?.header || {});
  if (!epsg) return null;

  const coords = collectCoordinates(data);
  if (!coords.length) return null;

  const sample = sampleCoordinates(coords, maxSamples);
  const center = centroid(sample);
  if (!center) return null;

  return {
    x: center.x,
    y: center.y,
    epsg,
    sampleCount: sample.length,
  };
};
