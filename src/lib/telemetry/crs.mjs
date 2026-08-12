const SUPPORTED_EPSG = Object.freeze([25832, 25833, 4326]);

const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object || {}, key);

const parseStrictEpsg = (value) => {
  if (typeof value === 'number') {
    return Number.isInteger(value) && Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(?:EPSG\s*:?\s*)?(\d+)$/i);
  return match ? Number(match[1]) : null;
};

const readDeclaredField = (header, key) => {
  if (!hasOwn(header, key)) return { present: false, epsg: null };
  const value = header[key];
  return {
    present: true,
    epsg: parseStrictEpsg(value),
  };
};

const parseSosiSrid = (value) => {
  if (typeof value !== 'string') return null;
  const match = value.match(/^EPSG:(\d+)$/i);
  return match ? Number(match[1]) : null;
};

const readExplicitCrs = (header = {}, sourceFormat = '') => {
  const format = String(sourceFormat || '').toLowerCase();

  if (format === 'kof') {
    if (hasOwn(header, 'KOORDSYS')) {
      const code = parseStrictEpsg(header.KOORDSYS);
      if (code === 22) return { status: 'declared', epsg: 25832 };
      if (code === 23) return { status: 'declared', epsg: 25833 };
      return {
        status: code === null ? 'invalid' : 'unsupported',
        epsg: code,
      };
    }

    const projectionKeys = ['Projeksjon', 'PROJEKSJON', 'Projection'];
    const projectionKey = projectionKeys.find((key) => hasOwn(header, key));
    if (projectionKey) {
      const projection = String(header[projectionKey] || '');
      const match = projection.match(/\bUTM\s+(32|33)\b/i);
      if (match) {
        return {
          status: 'declared',
          epsg: match[1] === '32' ? 25832 : 25833,
        };
      }
      return { status: 'invalid', epsg: null };
    }
  }

  for (const key of ['COSYS_EPSG', 'COSYSVER_EPSG', 'SRID']) {
    if (!hasOwn(header, key)) continue;
    const result =
      format === 'sosi' && key === 'SRID'
        ? { present: true, epsg: parseSosiSrid(header[key]) }
        : readDeclaredField(header, key);
    return {
      status: result.epsg === null ? 'invalid' : 'declared',
      epsg: result.epsg,
    };
  }

  return { status: 'missing', epsg: null };
};

export const classifyEpsgCategory = (epsg) => {
  if (!Number.isInteger(epsg) || !Number.isFinite(epsg)) return 'missing';
  if (epsg === 25832) return 'epsg_25832';
  if (epsg === 25833) return 'epsg_25833';
  if (epsg === 4326) return 'epsg_4326';
  return 'other';
};

const normalizeSource = (sourceCrs) => {
  if (!sourceCrs || typeof sourceCrs !== 'object') return null;
  const status = sourceCrs.status || sourceCrs.crsStatus;
  if (
    !['declared', 'inferred', 'missing', 'invalid', 'unsupported'].includes(
      status,
    )
  ) {
    return null;
  }

  const epsg = parseStrictEpsg(sourceCrs.epsg);
  if (status === 'missing' || status === 'invalid') {
    return { status, epsg: null };
  }
  if (epsg === null) return { status: 'invalid', epsg: null };
  if (!SUPPORTED_EPSG.includes(epsg)) {
    return { status: 'unsupported', epsg };
  }
  return { status, epsg };
};

export const classifyCrs = ({
  header = {},
  sourceFormat = '',
  sourceCrs = null,
  heuristicEpsg = null,
  userChoice = null,
} = {}) => {
  let source = normalizeSource(sourceCrs);

  if (!source) {
    source = readExplicitCrs(header, sourceFormat);
    if (
      source.status === 'missing' &&
      SUPPORTED_EPSG.includes(parseStrictEpsg(heuristicEpsg))
    ) {
      source = { status: 'inferred', epsg: parseStrictEpsg(heuristicEpsg) };
    }
  }

  if (
    source.epsg !== null &&
    !SUPPORTED_EPSG.includes(source.epsg) &&
    source.status === 'declared'
  ) {
    source = { status: 'unsupported', epsg: source.epsg };
  }

  const selected = parseStrictEpsg(userChoice);
  if (
    selected !== null &&
    SUPPORTED_EPSG.includes(selected) &&
    (source.status === 'missing' || source.status === 'invalid')
  ) {
    return {
      crsStatus: 'assumed',
      epsg: selected,
      epsgCategory: classifyEpsgCategory(selected),
    };
  }

  return {
    crsStatus: source.status,
    epsg: source.epsg,
    epsgCategory: classifyEpsgCategory(source.epsg),
  };
};

export const getOperationalEpsg = (data = {}) => {
  const result = classifyCrs({
    header: data.header || {},
    sourceFormat: data.format || data.header?.SOURCE_FORMAT || '',
    sourceCrs: data.crsContext || null,
  });

  return ['declared', 'inferred', 'assumed'].includes(result.crsStatus) &&
    SUPPORTED_EPSG.includes(result.epsg)
    ? result.epsg
    : null;
};

export const getEpsgFromHeader = (header = {}) =>
  getOperationalEpsg({ header, format: header.SOURCE_FORMAT });

export { parseStrictEpsg };
