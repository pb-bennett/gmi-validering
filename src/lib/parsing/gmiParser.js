// src/lib/parsing/gmiParser.js
// Modular GMI file parser for Next.js (JavaScript only)
// Adapted from reference implementation

import proj4 from 'proj4';

/**
 * GMI Parser Class - provides stateful parsing with analysis methods
 * @class GMIParser
 */
export class GMIParser {
  constructor(fileContent = '') {
    this.fileContent = fileContent;
    this.lines = fileContent ? fileContent.split(/\r?\n/) : [];
    this.header = {};
    this.points = [];
    this.linesParsed = [];
    this.warnings = [];
    this.errors = [];
    this.lineFieldNames = [];
    this.pointFieldNames = [];
    this._parsed = false;

    // Validate and parse content, catching any errors
    if (fileContent) {
      try {
        this._validateContent();
        this.parse();
      } catch (error) {
        // Capture validation/parse errors instead of throwing
        this.errors.push({
          type: 'VALIDATION_ERROR',
          message: error.message,
          details: error.stack,
        });
        this.warnings.push(`Parsing stoppet: ${error.message}`);
      }
    }
  }

  /**
   * Validate file content before parsing
   * @private
   */
  _validateContent() {
    if (!this.fileContent || typeof this.fileContent !== 'string') {
      throw new Error(
        'Ugyldig filinnhold: Filen er tom eller har feil format.'
      );
    }

    if (this.lines.length === 0) {
      throw new Error(
        'Ugyldig GMI-fil: Filen inneholder ingen linjer.'
      );
    }

    // Check for GMI file signature
    const firstLine = this.lines[0]?.trim();
    if (!firstLine || !firstLine.startsWith('[GMIFILE_ASCII]')) {
      throw new Error(
        'Ugyldig GMI-fil: Filen starter ikke med [GMIFILE_ASCII]. ' +
          'Kontroller at filen er en gyldig GMI-fil.'
      );
    }

    // Check for minimum required sections
    const hasLineSection = this.lines.some(
      (l) =>
        l.trim().startsWith('[L_]') || l.trim().startsWith('[+L_]')
    );
    const hasPointSection = this.lines.some(
      (l) =>
        l.trim().startsWith('[P_]') || l.trim().startsWith('[+P_]')
    );

    if (!hasLineSection && !hasPointSection) {
      throw new Error(
        'Ugyldig GMI-fil: Filen mangler datadefinisjoner ([L_] eller [P_] seksjoner). ' +
          'Filen kan være ødelagt eller ufullstendig.'
      );
    }
  }

  /**
   * Construct parser from a Buffer (supports latin1 by default)
   * @param {Buffer|string} buffer
   * @param {string} encoding - e.g. 'latin1' or 'utf8'
   * @returns {GMIParser}
   */
  static fromBuffer(buffer, encoding = 'latin1') {
    const content =
      typeof buffer === 'string'
        ? buffer
        : Buffer.isBuffer(buffer)
        ? buffer.toString(encoding)
        : String(buffer);
    return new GMIParser(content);
  }

  /**
   * Returns backwards-compatible plain object output
   */
  toObject() {
    return {
      format: 'GMI',
      header: this.header,
      points: this.points,
      lines: this.linesParsed,
      warnings: this.warnings,
      errors: this.errors,

      fieldAnalysis: this.analyzeFields(), // Add field analysis to output
    };
  }

  /**
   * Parse attribute values from _FIELDVALUES
   * @private
   */
  _parseFieldValues(fieldValues, fieldNames) {
    const values = String(fieldValues || '').split(';');
    const attributes = {};

    fieldNames.forEach((fieldName, index) => {
      if (index < values.length) {
        let raw = values[index] || '';
        raw = raw.trim();

        // Normalize empty -> null
        if (raw === '') {
          attributes[fieldName] = null;
          return;
        }

        // Try to coerce types: integer, float, boolean
        if (/^-?\d+$/.test(raw)) {
          attributes[fieldName] = parseInt(raw, 10);
        } else if (/^-?\d+\.\d+$/.test(raw)) {
          attributes[fieldName] = parseFloat(raw);
        } else if (/^(true|false)$/i.test(raw)) {
          attributes[fieldName] = /^true$/i.test(raw);
        } else {
          attributes[fieldName] = raw;
        }
      } else {
        attributes[fieldName] = null;
      }
    });

    // Warn when values exceed fieldNames length
    if (values.length > fieldNames.length) {
      this.warnings.push(
        `More _FIELDVALUES (${values.length}) than _FIELDNAMES (${fieldNames.length})`
      );
    }

    return attributes;
  }

  /**
   * Parse coordinates from /XYZ section
   * @private
   */
  _parseCoordinates(startIndex) {
    const coordinates = [];
    let j = startIndex;
    while (
      j < this.lines.length &&
      this.lines[j].trim() !== '' &&
      !this.lines[j].startsWith(':') &&
      !this.lines[j].startsWith('[')
    ) {
      const line = this.lines[j].trim();
      if (
        line &&
        !line.startsWith('_') &&
        !line.startsWith('GUID') &&
        !line.startsWith('/')
      ) {
        const coords = line.split(/\s+/).map(Number);
        if (
          coords.length >= 2 &&
          coords.every((coord) => !isNaN(coord))
        ) {
          coordinates.push({
            x: coords[0],
            y: coords[1],
            z: coords.length > 2 ? coords[2] : null,
          });
        } else {
          this.warnings.push(
            `Invalid coordinate at line ${j + 1}: "${this.lines[j]}"`
          );
        }
      }
      j++;
    }
    return { coordinates, nextIndex: j };
  }

  /**
   * Parse the GMI file content
   * @param {string} content - Optional content to parse (overrides constructor content)
   */
  parse(content = null) {
    if (content !== null) {
      this.fileContent = content;
      this.lines = this.fileContent.split(/\r?\n/);
      this._parsed = false; // Reset parsed state when new content is provided
    }

    if (this._parsed) return this.toObject();
    this._parsed = true;

    try {
      this._parseInternal();
    } catch (error) {
      // Add error to errors array but don't throw - allow partial parsing
      this.errors.push({
        type: 'PARSE_ERROR',
        message: `Feil under parsing: ${error.message}`,
        details: error.stack,
      });
      this.warnings.push(
        `Parsing avbrutt på grunn av feil: ${error.message}`
      );
    }

    // Validate we got some data
    if (this.points.length === 0 && this.linesParsed.length === 0) {
      this.warnings.push(
        'Ingen objekter funnet i filen. Filen kan være tom eller ha et ukjent format.'
      );
    }

    return this.toObject();
  }

  /**
   * Internal parsing logic - separated to enable try-catch wrapper
   * @private
   */
  _parseInternal() {
    let i = 0;

    // --- 1. Parse Header Section ---
    if (this.lines[i] === '[GMIFILE_ASCII]') {
      i++;
      while (
        i < this.lines.length &&
        this.lines[i] &&
        !this.lines[i].startsWith('[')
      ) {
        const line = this.lines[i].trim();
        if (line.startsWith('_')) {
          // Example: _VERSION 2
          const [key, ...rest] = line.split(' ');
          this.header[key] = rest.join(' ');
        } else if (line.includes(' ') && !line.startsWith('COSYS')) {
          // Handle other header fields like PRODUCER
          const [key, ...rest] = line.split(' ');
          this.header[key] = rest.join(' ');
        } else if (line.startsWith('COSYS')) {
          // Handle coordinate system fields
          this.header[line.split(' ')[0]] = line
            .split(' ')
            .slice(1)
            .join(' ');
        }
        i++;
      }
    }

    // Normalize EPSG header values to numbers if present
    const normalizeEPSG = (h, key) => {
      if (h[key] != null) {
        const n = parseInt(String(h[key]).trim(), 10);
        if (!Number.isNaN(n)) h[key] = n;
      }
    };
    normalizeEPSG(this.header, 'COSYS_EPSG');
    normalizeEPSG(this.header, 'COSYSVER_EPSG');

    // --- 2. Parse Data Sections ---
    for (; i < this.lines.length; i++) {
      const line = this.lines[i].trim();

      // --- Line Feature Definitions ---
      if (line.startsWith('[L_]')) {
        i++;
        while (
          i < this.lines.length &&
          !this.lines[i].startsWith('[')
        ) {
          const defLine = this.lines[i].trim();
          if (defLine.startsWith('_FIELDNAMES')) {
            this.lineFieldNames = defLine
              .substring(11)
              .split(';')
              .map((name) => name.trim());
          }
          i++;
        }
        i--; // Back up one since the outer loop will increment
        continue;
      }

      // --- Point Feature Definitions ---
      if (line.startsWith('[P_]')) {
        i++;
        while (
          i < this.lines.length &&
          !this.lines[i].startsWith('[')
        ) {
          const defLine = this.lines[i].trim();
          if (defLine.startsWith('_FIELDNAMES')) {
            this.pointFieldNames = defLine
              .substring(11)
              .split(';')
              .map((name) => name.trim());
          }
          i++;
        }
        i--; // Back up one since the outer loop will increment
        continue;
      }

      // --- Line Feature Data ---
      if (line.startsWith('[+L_]')) {
        i++;
        while (
          i < this.lines.length &&
          !this.lines[i].startsWith('[')
        ) {
          const dataLine = this.lines[i].trim();
          if (dataLine.startsWith(':L ')) {
            // Parse line feature
            const lineId = parseInt(dataLine.split(' ')[1], 10);
            const lineFeature = {
              id: lineId,
              type: 'line',
              extent: null,
              attributes: {},
              guid: null,
              coordinates: [],
            };

            i++;
            // Parse line properties
            while (
              i < this.lines.length &&
              !this.lines[i].startsWith(':') &&
              !this.lines[i].startsWith('[')
            ) {
              const propLine = this.lines[i].trim();
              if (propLine.startsWith('_EXTENT')) {
                lineFeature.extent = propLine.substring(7).trim();
              } else if (propLine.startsWith('_FIELDVALUES')) {
                lineFeature.attributes = this._parseFieldValues(
                  propLine.substring(12),
                  this.lineFieldNames
                );
              } else if (propLine.startsWith('GUID')) {
                lineFeature.guid = propLine.split(' ')[1];
              } else if (propLine === '/XYZ') {
                i++;
                const { coordinates, nextIndex } =
                  this._parseCoordinates(i);
                lineFeature.coordinates = coordinates;
                i = nextIndex - 1; // -1 because outer loop will increment
                break;
              }
              i++;
            }

            this.linesParsed.push(lineFeature);
            continue;
          }
          i++;
        }
        i--; // Back up one since the outer loop will increment
        continue;
      }

      // --- Point Feature Data ---
      if (line.startsWith('[+P_]')) {
        i++;
        while (
          i < this.lines.length &&
          !this.lines[i].startsWith('[')
        ) {
          const dataLine = this.lines[i].trim();
          if (dataLine.startsWith(':P ')) {
            // Parse point feature
            const pointId = parseInt(dataLine.split(' ')[1], 10);
            const pointFeature = {
              id: pointId,
              type: 'point',
              extent: null,
              attributes: {},
              guid: null,
              coordinates: [],
            };

            i++;
            // Parse point properties
            while (
              i < this.lines.length &&
              !this.lines[i].startsWith(':') &&
              !this.lines[i].startsWith('[')
            ) {
              const propLine = this.lines[i].trim();
              if (propLine.startsWith('_EXTENT')) {
                pointFeature.extent = propLine.substring(7).trim();
              } else if (propLine.startsWith('_FIELDVALUES')) {
                pointFeature.attributes = this._parseFieldValues(
                  propLine.substring(12),
                  this.pointFieldNames
                );
              } else if (propLine.startsWith('GUID')) {
                pointFeature.guid = propLine.split(' ')[1];
              } else if (propLine === '/XYZ') {
                i++;
                const { coordinates, nextIndex } =
                  this._parseCoordinates(i);
                pointFeature.coordinates = coordinates;
                i = nextIndex - 1; // -1 because outer loop will increment
                break;
              }
              i++;
            }

            this.points.push(pointFeature);
            continue;
          }
          i++;
        }
        i--; // Back up one since the outer loop will increment
        continue;
      }
    }
  }

  /**
   * Analyze fields to determine which are present and their types
   */
  analyzeFields() {
    const analysis = {
      lines: {},
      points: {},
    };

    // Analyze line fields
    this.lineFieldNames.forEach((field) => {
      analysis.lines[field] = {
        present: false,
        types: new Set(),
        nullCount: 0,
        totalCount: this.linesParsed.length,
      };
    });

    this.linesParsed.forEach((line) => {
      Object.entries(line.attributes).forEach(([key, value]) => {
        if (analysis.lines[key]) {
          if (value !== null) {
            analysis.lines[key].present = true;
            analysis.lines[key].types.add(typeof value);
          } else {
            analysis.lines[key].nullCount++;
          }
        }
      });
    });

    // Analyze point fields
    this.pointFieldNames.forEach((field) => {
      analysis.points[field] = {
        present: false,
        types: new Set(),
        nullCount: 0,
        totalCount: this.points.length,
      };
    });

    this.points.forEach((point) => {
      Object.entries(point.attributes).forEach(([key, value]) => {
        if (analysis.points[key]) {
          if (value !== null) {
            analysis.points[key].present = true;
            analysis.points[key].types.add(typeof value);
          } else {
            analysis.points[key].nullCount++;
          }
        }
      });
    });

    // Convert Sets to Arrays for JSON serialization
    Object.keys(analysis.lines).forEach((key) => {
      analysis.lines[key].types = Array.from(
        analysis.lines[key].types
      );
    });
    Object.keys(analysis.points).forEach((key) => {
      analysis.points[key].types = Array.from(
        analysis.points[key].types
      );
    });

    return analysis;
  }
}
