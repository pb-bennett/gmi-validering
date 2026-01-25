import { normalizeFeature } from './normalizeFeature';

export class KOFParser {
  constructor(fileContent) {
    this.fileContent = fileContent;
    this.header = {};
    this.points = [];
    this.linesParsed = [];
    this.warnings = [];
    this.errors = [];
    this._lineIdCounter = 0;
  }

  parse() {
    const lines = this.fileContent.split(/\r?\n/);

    let inferredCosysEpsg = null;
    let firstCoord = null;
    let activeLine = null;
    let currentSection = null;

    const numericPattern = /^-?\d+(?:\.\d+)?$/;

    const finalizeLine = () => {
      if (!activeLine) return;
      if (activeLine.coordinates.length >= 2) {
        this.linesParsed.push(
          normalizeFeature({
            id: activeLine.id,
            type: 'line',
            coordinates: activeLine.coordinates,
            attributes: activeLine.attributes,
          })
        );
      } else if (activeLine.coordinates.length > 0) {
        this.warnings.push(
          `KOF: Linje ${activeLine.id} har for få punkter (${activeLine.coordinates.length}).`,
        );
      }
      activeLine = null;
    };

    const parseHeaderLine = (trimmed) => {
      const content = trimmed.replace(/^00\s*/, '');
      if (!content) return;

      const colonIndex = content.indexOf(':');
      if (colonIndex >= 0) {
        const key = content.slice(0, colonIndex).trim();
        const value = content.slice(colonIndex + 1).trim();
        if (key) this.header[key] = value;
        return;
      }

      const parts = content.split(/\s+/);
      if (parts.length >= 2 && parts[0].toUpperCase() === 'KOORDSYS') {
        this.header.KOORDSYS = parseInt(parts[1], 10);
        return;
      }

      if (parts.length >= 2) {
        this.header[parts[0]] = parts.slice(1).join(' ');
      }
    };

    const parseDataLine = (trimmed, index) => {
      const parts = trimmed.split(/\s+/);
      if (parts.length < 3) return null;

      const numericIndices = [];
      parts.forEach((token, i) => {
        if (numericPattern.test(token)) numericIndices.push(i);
      });

      if (numericIndices.length < 2) return null;

      const looksLikeUtm = (yVal, xVal) =>
        Number.isFinite(yVal) &&
        Number.isFinite(xVal) &&
        yVal > 1000000 &&
        xVal > 100000 &&
        xVal < 1000000;

      const candidateA = {
        yIndex: numericIndices[numericIndices.length - 3],
        xIndex: numericIndices[numericIndices.length - 2],
        zIndex: numericIndices[numericIndices.length - 1],
        accuracyIndex: null,
      };

      const candidateB =
        numericIndices.length >= 4
          ? {
              yIndex: numericIndices[numericIndices.length - 4],
              xIndex: numericIndices[numericIndices.length - 3],
              zIndex: numericIndices[numericIndices.length - 2],
              accuracyIndex: numericIndices[numericIndices.length - 1],
            }
          : null;

      let selected = candidateA;
      if (candidateB) {
        const yB = parseFloat(parts[candidateB.yIndex]);
        const xB = parseFloat(parts[candidateB.xIndex]);
        const accuracyValue = parseFloat(
          parts[candidateB.accuracyIndex],
        );

        if (looksLikeUtm(yB, xB) && Math.abs(accuracyValue) < 5) {
          selected = candidateB;
        }
      }

      const val1 = parseFloat(parts[selected.yIndex]);
      const val2 = parseFloat(parts[selected.xIndex]);
      const val3 =
        selected.zIndex !== null
          ? parseFloat(parts[selected.zIndex])
          : null;
      const accuracy = selected.accuracyIndex
        ? parseFloat(parts[selected.accuracyIndex])
        : null;

      let x;
      let y;
      if (val1 > 5000000 && val2 < 1000000) {
        y = val1;
        x = val2;
      } else if (val2 > 5000000 && val1 < 1000000) {
        y = val2;
        x = val1;
      } else {
        y = val1;
        x = val2;
      }

      if (!firstCoord) firstCoord = { x, y };

      const metaTokens = parts.slice(1, selected.yIndex);
      let pointName = null;
      let codeValue = null;
      let extraMeta = null;

      if (metaTokens.length === 1) {
        if (numericPattern.test(metaTokens[0])) {
          codeValue = metaTokens[0];
        } else {
          pointName = metaTokens[0];
        }
      } else if (metaTokens.length >= 2) {
        const firstIsNumeric = numericPattern.test(metaTokens[0]);
        const secondIsNumeric = numericPattern.test(metaTokens[1]);

        if (firstIsNumeric && !secondIsNumeric) {
          codeValue = metaTokens[0];
          pointName = metaTokens[1];
        } else {
          pointName = metaTokens[0];
          codeValue = metaTokens[1];
        }

        if (metaTokens.length > 2) {
          extraMeta = metaTokens.slice(2).join(' ');
        }
      }

      return {
        id: metaTokens[0] || index,
        x,
        y,
        z: Number.isFinite(val3) ? val3 : null,
        accuracy: Number.isFinite(accuracy) ? accuracy : null,
        pointName,
        codeValue,
        extraMeta,
        raw: trimmed,
      };
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      if (trimmed.startsWith('-')) return;

      const parts = trimmed.split(/\s+/);
      const code = parts[0];
      const normalizedCode = code.replace('_', ' ');

      // Header info
      if (code === '00' || normalizedCode === '00') {
        parseHeaderLine(trimmed);
        return;
      }

      if (code.startsWith('09') || normalizedCode.startsWith('09')) {
        const segment = parts[1] || normalizedCode.split(' ')[1];
        if (segment === '91') {
          finalizeLine();
          activeLine = {
            id: this._lineIdCounter++,
            coordinates: [],
            attributes: {
              SOURCE_FORMAT: 'KOF',
              KOF_GROUP: '09 91',
            },
          };
          if (currentSection) {
            activeLine.attributes.KOF_SECTION = currentSection;
            activeLine.attributes.S_FCODE = currentSection;
          }
        } else if (parts[1] === '99') {
          finalizeLine();
        }
        return;
      }

      if (code === '08') {
        if (activeLine) {
          const key = `KOF_08_${parts[1] || 'UNKNOWN'}`;
          activeLine.attributes[key] = parts.slice(2).join(' ') || null;
        }
        return;
      }

      if (code === '12') {
        currentSection = parts.slice(1).join(' ') || null;
        if (activeLine && currentSection) {
          activeLine.attributes.KOF_SECTION = currentSection;
          activeLine.attributes.S_FCODE = currentSection;
        }
        return;
      }

      // Data lines (05 is common for points, or just lines starting with ID)
      // Heuristic: Look for lines with at least 2 coordinate-like numbers
      // Standard KOF: <OpCode> <PointID> <North> <East> <Height> <Code>
      // Example: 05 101 6650000.00 550000.00 100.00 1234

      if (code === '05') {
        const parsed = parseDataLine(trimmed, index);
        if (!parsed) return;

        const featureAttributes = {
          SOURCE_FORMAT: 'KOF',
          KOF_POINT: parsed.pointName,
          KOF_CODE: parsed.codeValue,
          KOF_META: parsed.extraMeta,
          KOF_SECTION: currentSection,
          KOF_ACCURACY: parsed.accuracy,
          raw: parsed.raw,
          S_FCODE: parsed.codeValue || parsed.pointName || 'KOF',
        };

        this.points.push(
          normalizeFeature({
            id: parsed.id,
            type: 'point',
            coordinates: [parsed.x, parsed.y, parsed.z],
            attributes: featureAttributes,
          })
        );

        if (activeLine) {
          activeLine.coordinates.push({
            x: parsed.x,
            y: parsed.y,
            z: parsed.z,
          });

          if (!activeLine.attributes.KOF_CODE && parsed.codeValue) {
            activeLine.attributes.KOF_CODE = parsed.codeValue;
          }
          if (!activeLine.attributes.KOF_NAME && parsed.pointName) {
            activeLine.attributes.KOF_NAME = parsed.pointName;
          }
          if (!activeLine.attributes.KOF_SECTION && currentSection) {
            activeLine.attributes.KOF_SECTION = currentSection;
          }
          activeLine.attributes.S_FCODE =
            activeLine.attributes.KOF_CODE ||
            activeLine.attributes.KOF_NAME ||
            activeLine.attributes.KOF_SECTION ||
            'KOF_LINE';
        }
      }
    });

    finalizeLine();

    // Infer CRS if possible.
    const koordsys = Number(this.header.KOORDSYS);
    if (koordsys === 22) inferredCosysEpsg = 25832;
    if (koordsys === 23) inferredCosysEpsg = 25833;

    const projectionText =
      this.header.Projeksjon ||
      this.header.PROJEKSJON ||
      this.header.Projection ||
      null;
    if (!inferredCosysEpsg && projectionText) {
      if (projectionText.includes('UTM 32')) inferredCosysEpsg = 25832;
      if (projectionText.includes('UTM 33')) inferredCosysEpsg = 25833;
    }

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
