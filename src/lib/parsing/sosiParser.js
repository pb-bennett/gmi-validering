import sosijs from 'sosijs';
import { Buffer } from 'buffer';
import { normalizeFeature } from './normalizeFeature';

const toUpperNo = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/Å/g, 'A')
    .replace(/Æ/g, 'AE')
    .replace(/Ø/g, 'O');

const inferSosiFcode = (geomType, properties) => {
  const objNameRaw =
    properties?.objekttypenavn ||
    properties?.OBJEKTTYPENAVN ||
    properties?.OBJTYPE ||
    properties?.TYPE ||
    '';

  const objName = toUpperNo(objNameRaw);

  // Line-ish mapping
  if (geomType === 'LineString' || geomType === 'Polygon') {
    if (objName.includes('SPILLVANN')) return 'SP';
    if (objName.includes('OVERVANN')) return 'OV';

    // Combined sewer
    if (objName.includes('AVLOP') && objName.includes('FELLES'))
      return 'AF';
    if (objName.includes('AVLOPFELLES')) return 'AF';

    if (objName.includes('VANNLEDNING') || objName === 'VANNLEDNING')
      return 'VL';
    if (objName === 'VANNLEDNING' || objName === 'VANN') return 'VL';
    if (objName.includes('VANN')) return 'VL';

    // Often wastewater (try to keep consistent with existing categories)
    if (objName.includes('PUMPELEDNING')) return 'SPP';
    if (objName.includes('AVLOP')) return 'SP';

    if (objName.includes('TREKKROR') || objName.includes('TREKKR'))
      return 'TELE';

    return objName ? objName : 'DIV';
  }

  // Point mapping
  if (geomType === 'Point') {
    if (objName === 'KUM') return 'KUM';
    if (objName.includes('SLUK')) return 'SLU';
    if (objName.includes('ST-KRAN') || objName.includes('KRA'))
      return 'KRN';
    if (objName.includes('BRANNVENTIL')) return 'KRN';
    if (objName.includes('STENGEVENTIL')) return 'VL';
    if (objName === 'PS' || objName.includes('PUMPESTASJON'))
      return 'SP';
    if (objName.includes('ANBORING')) return 'ANBORING';
    if (objName === 'GREN' || objName.includes('GRENPUNKT'))
      return 'GRN';

    if (objName.includes('TRASEPUNKT')) return 'DIV';
    if (objName.includes('SELVFALL')) return 'SP';

    return objName ? objName : 'DIV';
  }

  return objName ? objName : 'DIV';
};

export class SOSIParser {
  constructor(fileContent) {
    this.fileContent = fileContent;
    this.header = {};
    this.points = [];
    this.linesParsed = [];
    this.warnings = [];
    this.errors = [];
  }

  parse() {
    try {
      // sosijs references global Buffer even when parsing strings.
      // Ensure Buffer exists in the browser bundle.
      if (typeof globalThis !== 'undefined' && !globalThis.Buffer) {
        globalThis.Buffer = Buffer;
      }

      const parser = new sosijs.Parser();
      let input = this.fileContent;

      // Prefer raw bytes so sosijs can detect and decode charset via ..TEGNSETT.
      if (input instanceof ArrayBuffer) {
        input = Buffer.from(new Uint8Array(input));
      }

      const sosiData = parser.parse(input);

      // Dump to GeoJSON for a stable structure
      const geojson = sosiData.dumps('geojson');

      // CRS is typically like "EPSG:25832" in geojson.crs.properties.name
      const crsName = geojson?.crs?.properties?.name;
      const epsgMatch =
        typeof crsName === 'string'
          ? crsName.match(/EPSG\s*:?\s*(\d+)/i)
          : null;
      const COSYS_EPSG = epsgMatch ? Number(epsgMatch[1]) : null;

      this.header = {
        ...(COSYS_EPSG ? { COSYS_EPSG } : {}),
        ...(crsName ? { SRID: crsName } : {}),
        SOURCE_FORMAT: 'SOSI',
      };

      const features = Array.isArray(geojson?.features)
        ? geojson.features
        : [];

      features.forEach((feature, index) => {
        const geomType = feature?.geometry?.type;
        const coords = feature?.geometry?.coordinates;
        const props = feature?.properties || {};

        // Provide an S_FCODE-like value for styling/filters.
        // Prefer mapping from objekttypenavn to existing GMI codes.
        const inferredFcode = inferSosiFcode(geomType, props);

        const attributes = {
          ...props,
          ...(inferredFcode
            ? { S_FCODE: String(inferredFcode) }
            : {}),
          SOURCE_FORMAT: 'SOSI',
        };

        const id = feature?.id ?? props.OBJID ?? index;

        if (geomType === 'Point') {
          this.points.push(
            normalizeFeature({
              id,
              type: 'point',
              coordinates: coords,
              attributes,
            })
          );
          return;
        }

        if (geomType === 'LineString') {
          this.linesParsed.push(
            normalizeFeature({
              id,
              type: 'line',
              coordinates: coords,
              attributes,
            })
          );
          return;
        }

        if (
          geomType === 'Polygon' &&
          Array.isArray(coords) &&
          coords[0]
        ) {
          // Keep visualization simple: treat outer ring as a line.
          this.linesParsed.push(
            normalizeFeature({
              id,
              type: 'line',
              coordinates: coords[0],
              attributes,
            })
          );
        }
      });
    } catch (err) {
      console.error('SOSI parsing error:', err);
      this.errors.push(`SOSI parsing failed: ${err.message}`);
    }

    return this.toObject();
  }

  toObject() {
    return {
      format: 'SOSI',
      header: this.header,
      points: this.points,
      lines: this.linesParsed,
      warnings: this.warnings,
      errors: this.errors,
    };
  }
}
