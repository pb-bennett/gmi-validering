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
