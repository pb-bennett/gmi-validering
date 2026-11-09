// Exact source-span index for GMI _FIELDVALUES lexemes, reconciled with the
// production GMIParser (M1).
//
// indexGmiSourceText is a control-flow port of GMIParser._parseInternal and
// _parseCoordinates: the same line split (/\r?\n/), header loop, last-wins
// [L_]/[P_] definitions, data sections ending at a raw line starting with '[',
// property scans ending at a raw ':' or '[', and '/XYZ' handing over to the
// coordinate scan, with the same index arithmetic afterwards. It never decides
// anything the parser does not; it only records *where* each lexeme is.
//
// reconcileGmiSourceIndex then proves the index and the parser agree:
// object counts, ids, GUIDs, extents, coordinate counts, field names, every
// lexeme against its span, structural span invariants (spans tile the value
// region between ';' bytes on the object's own _FIELDVALUES line, so a span
// cannot point at identical text elsewhere), and every parser warning against
// a predicted field_shape or coordinate warning. Anything that does not agree
// is reported; nothing is repaired.
import { GMI_SOURCE_LEXEMES } from '../parsing/gmiLexicalEvidence.js';

export const GMI_GEOMETRY_SCOPES = Object.freeze([
  Object.freeze({ scope: 'point', collection: 'points', fieldNames: 'pointFieldNames', definition: '[P_]', data: '[+P_]', marker: ':P ' }),
  Object.freeze({ scope: 'line', collection: 'linesParsed', fieldNames: 'lineFieldNames', definition: '[L_]', data: '[+L_]', marker: ':L ' }),
]);

const scopeConfig = (scope) => GMI_GEOMETRY_SCOPES.find((entry) => entry.scope === scope) || null;
export const gmiScopeConfig = scopeConfig;

const FIELDVALUES = '_FIELDVALUES';

/** Lines exactly as String.prototype.split(/\r?\n/) yields them, with offsets. */
export function splitGmiLines(text) {
  const lines = [];
  const re = /\r?\n/g;
  let start = 0, match;
  while ((match = re.exec(text))) {
    lines.push({ text: text.slice(start, match.index), start, end: match.index, eolEnd: match.index + match[0].length });
    start = re.lastIndex;
  }
  lines.push({ text: text.slice(start), start, end: text.length, eolEnd: text.length });
  return lines;
}

// Mirrors GMIParser._getRawFieldValues + _parseFieldValues splitting.
function fieldValueLine(lineRecord, lineNumber) {
  const raw = lineRecord.text;
  const markerIndex = raw.indexOf(FIELDVALUES);
  let regionStart = markerIndex + FIELDVALUES.length;
  const separator = raw[regionStart] === ' ' || raw[regionStart] === '\t' ? raw[regionStart] : null;
  if (separator) regionStart++;
  const spans = [];
  let cursor = regionStart;
  for (;;) {
    const next = raw.indexOf(';', cursor);
    if (next === -1) { spans.push([lineRecord.start + cursor, lineRecord.start + raw.length]); break; }
    spans.push([lineRecord.start + cursor, lineRecord.start + next]);
    cursor = next + 1;
  }
  return {
    line: lineNumber,
    markerStart: lineRecord.start + markerIndex,
    regionStart: lineRecord.start + regionStart,
    separator,
    spans,
  };
}

/**
 * Index a decoded GMI text. Offsets are UTF-16 offsets, which equal byte
 * offsets because the upload decoder is 1:1 (checked by the source document).
 */
export function indexGmiSourceText(text) {
  const lines = splitGmiLines(text);
  const n = lines.length;
  const raw = (i) => lines[i].text;
  const index = {
    lineCount: n,
    lines,
    signatureExact: raw(0) === '[GMIFILE_ASCII]',
    headerEnd: 0,
    numericIndexHeader: false,
    definitionSections: { point: [], line: [] },
    dataSections: { point: [], line: [] },
    fieldNameLines: { point: [], line: [] },
    fieldNames: { point: [], line: [] },
    objects: { point: [], line: [] },
    predictedWarnings: [],
  };
  let i = 0;
  if (raw(0) === '[GMIFILE_ASCII]') {
    i++;
    while (i < n && raw(i) && !raw(i).startsWith('[')) {
      if (/^_INDEX\s+\d/.test(raw(i).trim())) index.numericIndexHeader = true;
      i++;
    }
  }
  index.headerEnd = i;

  for (; i < n; i++) {
    const line = raw(i).trim();
    const definition = line.startsWith('[L_]') ? 'line' : line.startsWith('[P_]') ? 'point' : null;
    if (definition) {
      index.definitionSections[definition].push(i);
      i++;
      while (i < n && !raw(i).startsWith('[')) {
        const defLine = raw(i).trim();
        if (defLine.startsWith('_FIELDNAMES')) {
          index.fieldNames[definition] = Object.freeze(defLine.substring(11).split(';').map((name) => name.trim()));
          index.fieldNameLines[definition].push(i);
        }
        i++;
      }
      i--;
      continue;
    }
    const data = line.startsWith('[+L_]') ? scopeConfig('line') : line.startsWith('[+P_]') ? scopeConfig('point') : null;
    if (!data) continue;
    const { scope, marker } = data;
    index.dataSections[scope].push(i);
    i++;
    while (i < n && !raw(i).startsWith('[')) {
      const dataLine = raw(i).trim();
      if (dataLine.startsWith(marker)) {
        const object = {
          scope,
          sourceIndex: index.objects[scope].length,
          headerLine: i,
          parserId: parseInt(dataLine.split(' ')[1], 10),
          fieldNames: index.fieldNames[scope],
          fieldValueLines: [],
          guid: null,
          extent: null,
          xyzLine: null,
          coordinateLines: [],
          malformedCoordinateLines: [],
        };
        i++;
        while (i < n && !raw(i).startsWith(':') && !raw(i).startsWith('[')) {
          const propLine = raw(i).trim();
          if (propLine.startsWith('_EXTENT')) {
            object.extent = propLine.substring(7).trim();
          } else if (propLine.startsWith(FIELDVALUES)) {
            const entry = fieldValueLine(lines[i], i);
            object.fieldValueLines.push(entry);
            if (entry.spans.length > object.fieldNames.length) {
              index.predictedWarnings.push({ warningClass: 'field_shape', line: i,
                message: `More _FIELDVALUES (${entry.spans.length}) than _FIELDNAMES (${object.fieldNames.length})` });
            }
          } else if (propLine.startsWith('GUID')) {
            object.guid = propLine.split(' ')[1];
          } else if (propLine === '/XYZ') {
            object.xyzLine = i;
            i++;
            let j = i;
            while (j < n && raw(j).trim() !== '' && !raw(j).startsWith(':') && !raw(j).startsWith('[')) {
              const coordinateLine = raw(j).trim();
              if (coordinateLine && !coordinateLine.startsWith('_') && !coordinateLine.startsWith('GUID') && !coordinateLine.startsWith('/')) {
                const coords = coordinateLine.split(/\s+/).map(Number);
                if (coords.length >= 2 && coords.every((coord) => !isNaN(coord))) object.coordinateLines.push(j);
                else {
                  object.malformedCoordinateLines.push(j);
                  index.predictedWarnings.push({ warningClass: 'coordinate', line: j,
                    message: `Invalid coordinate at line ${j + 1}: "${raw(j)}"` });
                }
              }
              j++;
            }
            i = j - 1;
            break;
          }
          i++;
        }
        index.objects[scope].push(object);
        continue;
      }
      i++;
    }
    i--;
  }
  return index;
}

/** Object-level fail-closed issues (the object stays readable). */
export function gmiObjectIssues(object) {
  const issues = [];
  const names = object.fieldNames;
  if (object.fieldValueLines.length === 0) issues.push('no-fieldvalues');
  if (object.fieldValueLines.length > 1) issues.push('multiple-fieldvalues');
  const active = object.fieldValueLines.at(-1);
  if (active && active.spans.length > names.length) issues.push('more-values-than-names');
  if (active && active.spans.length < names.length) issues.push('fewer-values-than-names');
  return issues;
}

/**
 * Field name -> { position, span } for the active (parser last-wins)
 * _FIELDVALUES line; duplicate names map to the last position, as the parser.
 */
export function gmiCellSpans(object) {
  const active = object.fieldValueLines.at(-1);
  const map = new Map();
  if (!active) return map;
  object.fieldNames.forEach((name, position) => {
    if (position < active.spans.length) map.set(name, { position, span: active.spans[position] });
  });
  return map;
}

function checkSpanTiling(text, lines, entry, mismatch) {
  const lineRecord = lines[entry.line];
  if (!lineRecord) { mismatch('fieldvalues-line-missing'); return; }
  const raw = lineRecord.text;
  if (!raw.trim().startsWith(FIELDVALUES)) { mismatch('fieldvalues-line-not-fieldvalues'); return; }
  const markerIndex = raw.indexOf(FIELDVALUES);
  const expectedRegion = lineRecord.start + markerIndex + FIELDVALUES.length + (raw[markerIndex + FIELDVALUES.length] === ' ' || raw[markerIndex + FIELDVALUES.length] === '\t' ? 1 : 0);
  if (entry.regionStart !== expectedRegion || entry.spans[0]?.[0] !== expectedRegion) { mismatch('span-region-start'); return; }
  for (let k = 0; k < entry.spans.length; k++) {
    const [start, end] = entry.spans[k];
    if (!(start <= end) || start < lineRecord.start || end > lineRecord.end) { mismatch('span-outside-line'); return; }
    if (text.slice(start, end).includes(';')) { mismatch('span-contains-separator'); return; }
    const last = k === entry.spans.length - 1;
    if (last) {
      if (end !== lineRecord.end) { mismatch('span-last-not-line-end'); return; }
    } else if (text[end] !== ';' || entry.spans[k + 1][0] !== end + 1) { mismatch('span-not-contiguous'); return; }
  }
}

/**
 * Prove index and parser agree. Returns { mismatches, lexemes, warnings }.
 * `warnings.unaccounted` lists parser warnings the index did not predict
 * (file-level read-only, not a reconciliation failure).
 */
export function reconcileGmiSourceIndex({ text, parser, index }) {
  const mismatches = [];
  const mismatch = (code, detail = {}) => mismatches.push(Object.freeze({ code, ...detail }));
  let lexemes = 0;
  const claimedLines = new Set();
  for (const { scope, collection, fieldNames } of GMI_GEOMETRY_SCOPES) {
    const parsed = parser[collection], indexed = index.objects[scope];
    const parserNames = parser[fieldNames];
    const indexNames = index.fieldNames[scope];
    if (parserNames.length !== indexNames.length || parserNames.some((name, k) => name !== indexNames[k])) mismatch('field-names', { scope });
    if (parsed.length !== indexed.length) { mismatch('object-count', { scope, parsed: parsed.length, indexed: indexed.length }); continue; }
    let previousHeader = -1;
    parsed.forEach((object, sourceIndex) => {
      const at = (code) => mismatch(code, { scope, sourceIndex });
      const indexedObject = indexed[sourceIndex];
      if (indexedObject.sourceIndex !== sourceIndex || indexedObject.scope !== scope) at('object-order');
      if (!(indexedObject.headerLine > previousHeader)) at('object-order');
      previousHeader = indexedObject.headerLine;
      const nextHeader = indexed[sourceIndex + 1]?.headerLine ?? index.lineCount;
      if (!Object.is(object.id, indexedObject.parserId)) at('object-id');
      if (object.guid !== indexedObject.guid) at('object-guid');
      if (object.extent !== indexedObject.extent) at('object-extent');
      if ((object.coordinates?.length ?? 0) !== indexedObject.coordinateLines.length) at('coordinate-count');
      for (const entry of indexedObject.fieldValueLines) {
        if (!(entry.line > indexedObject.headerLine && entry.line < nextHeader)) at('fieldvalues-line-outside-object');
        if (claimedLines.has(entry.line)) at('fieldvalues-line-shared');
        claimedLines.add(entry.line);
        checkSpanTiling(text, index.lines, entry, at);
      }
      const parserLexemes = object.attributes?.[GMI_SOURCE_LEXEMES];
      const spans = gmiCellSpans(indexedObject);
      if (!parserLexemes) {
        if (spans.size) at('missing-parser-lexemes');
        return;
      }
      const names = Object.keys(parserLexemes);
      if (names.length !== spans.size) at('lexeme-count');
      for (const name of names) {
        const cell = spans.get(name);
        lexemes++;
        if (!cell || text.slice(cell.span[0], cell.span[1]) !== parserLexemes[name]) at('lexeme-span');
      }
    });
  }

  // Every parser warning must be a predicted field_shape/coordinate warning,
  // in order; anything after the predicted ones is unaccounted for.
  const predicted = index.predictedWarnings;
  const actual = parser.warnings;
  const prefixAgrees = predicted.length <= actual.length && predicted.every((warning, k) => actual[k] === warning.message);
  if (!prefixAgrees) mismatch('warning-prediction');
  const predictedShape = predicted.filter((warning) => warning.warningClass === 'field_shape').length;
  const predictedCoordinate = predicted.length - predictedShape;
  const classes = parser.warningSummary?.classes || {};
  if ((classes.field_shape || 0) !== predictedShape) mismatch('field-shape-warning-count', { parser: classes.field_shape || 0, indexed: predictedShape });
  if ((classes.coordinate || 0) !== predictedCoordinate) mismatch('coordinate-warning-count', { parser: classes.coordinate || 0, indexed: predictedCoordinate });
  const unaccounted = prefixAgrees ? actual.slice(predicted.length) : actual;
  const unaccountedClasses = {};
  for (const [warningClass, count] of Object.entries(classes)) {
    const accounted = warningClass === 'field_shape' ? predictedShape : warningClass === 'coordinate' ? predictedCoordinate : 0;
    if (count - accounted > 0) unaccountedClasses[warningClass] = count - accounted;
  }
  return {
    mismatches,
    lexemes,
    warnings: {
      fieldShape: predictedShape,
      coordinate: predictedCoordinate,
      unaccounted: unaccounted.length,
      unaccountedClasses,
    },
  };
}
