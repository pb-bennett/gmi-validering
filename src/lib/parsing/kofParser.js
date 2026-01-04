import { normalizeFeature } from './normalizeFeature';

export class KOFParser {
  constructor(fileContent) {
    this.fileContent = fileContent;
    this.header = {};
    this.points = [];
    this.linesParsed = [];
    this.warnings = [];
    this.errors = [];
  }

  parse() {
    const lines = this.fileContent.split(/\r?\n/);

    let inferredCosysEpsg = null;
    let firstCoord = null;

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const parts = trimmed.split(/\s+/);
      const code = parts[0];

      // Header info
      if (code === '00') {
        if (parts[1] === 'KOORDSYS') {
          this.header.KOORDSYS = parseInt(parts[2], 10);
        }
        return;
      }

      // Data lines (05 is common for points, or just lines starting with ID)
      // Heuristic: Look for lines with at least 2 coordinate-like numbers
      // Standard KOF: <OpCode> <PointID> <North> <East> <Height> <Code>
      // Example: 05 101 6650000.00 550000.00 100.00 1234

      if (parts.length >= 4) {
        // Find indices of numbers that look like coordinates (contain dot or are large)
        const floatValues = parts.map((p) => parseFloat(p));
        const coordIndices = [];

        parts.forEach((p, i) => {
          const val = floatValues[i];
          if (!isNaN(val) && (p.includes('.') || val > 1000)) {
            coordIndices.push(i);
          }
        });

        if (coordIndices.length >= 2) {
          // Assume first two coords are Y (North) and X (East) or X Y
          // KOF is typically North East (Y X)
          // We'll try to detect based on magnitude if possible, but for now assume Y X (North East)
          // because that's common in Norwegian surveying (Axis 1 = North, Axis 2 = East)

          const val1 = floatValues[coordIndices[0]];
          const val2 = floatValues[coordIndices[1]];
          const val3 =
            coordIndices.length > 2
              ? floatValues[coordIndices[2]]
              : 0;

          // Heuristic: In Norway (UTM32/33), North (Y) is usually > 6,000,000
          // East (X) is usually < 1,000,000 (300,000 - 900,000)

          let x, y;
          if (val1 > 5000000 && val2 < 1000000) {
            y = val1;
            x = val2;
          } else if (val2 > 5000000 && val1 < 1000000) {
            y = val2;
            x = val1;
          } else {
            // Fallback: Assume Y X (North East) as per KOF convention
            y = val1;
            x = val2;
          }

          if (!firstCoord) firstCoord = { x, y };

          this.points.push(
            normalizeFeature({
              id: parts[1] || index,
              type: 'point',
              coordinates: [x, y, val3],
              attributes: {
                raw: line,
                S_FCODE: parts[0],
                code: parts
                  .slice(coordIndices[coordIndices.length - 1] + 1)
                  .join(' '),
                SOURCE_FORMAT: 'KOF',
              },
            })
          );
        }
      }
    });

    // Infer CRS if possible.
    const koordsys = Number(this.header.KOORDSYS);
    if (koordsys === 22) inferredCosysEpsg = 25832;
    if (koordsys === 23) inferredCosysEpsg = 25833;

    if (!inferredCosysEpsg && firstCoord) {
      if (firstCoord.y > 1000000 && firstCoord.x > 100000) {
        inferredCosysEpsg = 25832;
        this.warnings.push(
          'KOF: Fant ingen KOORDSYS. Antar EPSG:25832 basert på koordinatverdier.'
        );
      }
    }

    this.header = {
      ...this.header,
      ...(inferredCosysEpsg ? { COSYS_EPSG: inferredCosysEpsg } : {}),
      SOURCE_FORMAT: 'KOF',
    };

    return this.toObject();
  }

  toObject() {
    return {
      format: 'KOF',
      header: this.header,
      points: this.points,
      lines: this.linesParsed,
      warnings: this.warnings,
      errors: this.errors,
    };
  }
}
