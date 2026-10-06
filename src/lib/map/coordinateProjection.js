import proj4 from 'proj4';
import { getOperationalEpsg } from '../telemetry/crs.mjs';

proj4.defs(
  'EPSG:25832',
  '+proj=utm +zone=32 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
);
proj4.defs(
  'EPSG:25833',
  '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
);
proj4.defs(
  'EPSG:32632',
  '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs',
);
proj4.defs(
  'EPSG:32633',
  '+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs',
);
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');

const getHeaderProjection = (header = {}) => {
  if (header.COSYS_EPSG) {
    const epsg = `EPSG:${header.COSYS_EPSG}`;
    if (proj4.defs(epsg)) return epsg;
  }

  const cosys = String(header.COSYS || '');
  if (cosys.includes('UTM') && cosys.includes('32')) {
    return 'EPSG:25832';
  }
  if (cosys.includes('UTM') && cosys.includes('33')) {
    return 'EPSG:25833';
  }

  return 'EPSG:4326';
};

export const getMapSourceProjection = (data = {}) => {
  const operationalEpsg = getOperationalEpsg(data);
  if (operationalEpsg && proj4.defs(`EPSG:${operationalEpsg}`)) {
    return `EPSG:${operationalEpsg}`;
  }

  return getHeaderProjection(data.header || {});
};

export const projectCoordinateToWgs84 = (data, x, y) => {
  const sourceProjection = getMapSourceProjection(data);
  if (sourceProjection === 'EPSG:4326') return [x, y];

  try {
    return proj4(sourceProjection, 'EPSG:4326', [x, y]);
  } catch {
    return [x, y];
  }
};

// Strict photo-only path: never reinterpret failed projected values as degrees.
export function projectPhotoCoordinate(sourceCrs, coordinates, transform = proj4) {
  const horizontalProjection = sourceCrs === 'EPSG:5972' ? 'EPSG:25832' : sourceCrs;
  if (!['EPSG:25832', 'EPSG:25833', 'EPSG:4326'].includes(horizontalProjection)) {
    return { status: 'unsupported-crs', position: null, errorCode: 'unsupported-crs' };
  }
  if (!Array.isArray(coordinates) || ![2, 3].includes(coordinates.length) || !coordinates.every(Number.isFinite)) {
    return { status: 'invalid', position: null, errorCode: 'invalid-coordinates' };
  }
  try {
    const [longitude, latitude] = horizontalProjection === 'EPSG:4326'
      ? coordinates : transform(horizontalProjection, 'EPSG:4326', coordinates.slice(0, 2));
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) {
      return { status: 'invalid', position: null, errorCode: 'invalid-geographic-result' };
    }
    return {
      status: 'viable', position: { crs: 'EPSG:4326', longitude, latitude }, errorCode: null,
      transform: { method: 'proj4-horizontal-map-approximation', horizontalProjection, vertical: 'not-transformed' },
    };
  } catch {
    return { status: 'invalid', position: null, errorCode: 'transform-failed' };
  }
}
