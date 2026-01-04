const fs = require('fs');
const path = require('path');
const SOSI = require('sosijs');

const dir = path.join(process.cwd(), 'REF_FILES', 'SOSI');
const files = fs
  .readdirSync(dir)
  .filter((f) => f.toLowerCase().endsWith('.sos'));

function inc(map, key, by = 1) {
  map.set(key, (map.get(key) || 0) + by);
}

const keyCountsLine = new Map();
const keyCountsPoint = new Map();
const valueCountsByKeyLine = new Map();
const valueCountsByKeyPoint = new Map();

let total = 0;
let totalLine = 0;
let totalPoint = 0;
let failed = 0;

const parser = new SOSI.Parser();

for (const fileName of files) {
  const fullPath = path.join(dir, fileName);
  const buf = fs.readFileSync(fullPath);

  let data;
  try {
    data = parser.parse(buf);
  } catch (e) {
    failed++;
    console.error('FAILED', fileName, '-', e.message);
    continue;
  }

  const geo = data.dumps('geojson');
  const feats = Array.isArray(geo.features) ? geo.features : [];

  for (const feat of feats) {
    total++;
    const geomType = feat?.geometry?.type;
    const props = feat?.properties || {};

    const isLineish =
      geomType === 'LineString' || geomType === 'Polygon';
    const isPoint = geomType === 'Point';

    if (isLineish) {
      totalLine++;
      for (const k of Object.keys(props)) {
        inc(keyCountsLine, k);
        if (!valueCountsByKeyLine.has(k))
          valueCountsByKeyLine.set(k, new Map());
        const vm = valueCountsByKeyLine.get(k);
        const v = props[k];
        const sv = v === null || v === undefined ? '∅' : String(v);
        inc(vm, sv);
      }
      continue;
    }

    if (isPoint) {
      totalPoint++;
      for (const k of Object.keys(props)) {
        inc(keyCountsPoint, k);
        if (!valueCountsByKeyPoint.has(k))
          valueCountsByKeyPoint.set(k, new Map());
        const vm = valueCountsByKeyPoint.get(k);
        const v = props[k];
        const sv = v === null || v === undefined ? '∅' : String(v);
        inc(vm, sv);
      }
    }
  }
}

function topEntries(map, n = 15) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

function keySummary(keyCounts, valueCountsByKey, n = 20) {
  return topEntries(keyCounts, n).map(([k, c]) => {
    const vm = valueCountsByKey.get(k);
    const distinct = vm ? vm.size : 0;
    return { key: k, count: c, distinct };
  });
}

function findCandidateTypeKeys(keyCounts, valueCountsByKey) {
  const candidates = [];
  for (const [k, c] of keyCounts.entries()) {
    if (c < 100) continue; // must be reasonably common
    const vm = valueCountsByKey.get(k);
    if (!vm) continue;
    const distinct = vm.size;
    // ignore obvious IDs / unique-ish fields
    if (distinct > 5000) continue;
    candidates.push({ k, c, distinct, ratio: distinct / c });
  }
  candidates.sort((a, b) => a.ratio - b.ratio);
  return candidates.slice(0, 12);
}

function printTopValues(title, valueMap, n = 20) {
  console.log(`\n${title}`);
  const top = Array.from(valueMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
  for (const [v, c] of top) {
    console.log(`- ${v}: ${c}`);
  }
}

console.log('SOSI type mining');
console.log('Directory:', dir);
console.log('Files:', files.length, 'Failed:', failed);
console.log(
  'Total features:',
  total,
  'points:',
  totalPoint,
  'lines/polys:',
  totalLine
);

console.log('\nTop line attribute keys (count, distinct):');
for (const r of keySummary(keyCountsLine, valueCountsByKeyLine, 15)) {
  console.log(`- ${r.key}: ${r.count} (distinct ${r.distinct})`);
}

console.log('\nTop point attribute keys (count, distinct):');
for (const r of keySummary(
  keyCountsPoint,
  valueCountsByKeyPoint,
  15
)) {
  console.log(`- ${r.key}: ${r.count} (distinct ${r.distinct})`);
}

console.log('\nCandidate line type keys (heuristic):');
for (const r of findCandidateTypeKeys(
  keyCountsLine,
  valueCountsByKeyLine
)) {
  console.log(`- ${r.k}: count ${r.c}, distinct ${r.distinct}`);
}

console.log('\nCandidate point type keys (heuristic):');
for (const r of findCandidateTypeKeys(
  keyCountsPoint,
  valueCountsByKeyPoint
)) {
  console.log(`- ${r.k}: count ${r.c}, distinct ${r.distinct}`);
}

const likelyKeys = [
  'objekttypenavn',
  'OBJTYPE',
  'OBJTYPE_1',
  'TYPE',
  'LTEMA',
  'KURVETYPE',
  'PRODUKT',
  'EIER',
  'NAVN',
  'KVALITET',
  'MEDIUM',
  'LEDNINGSTYPE',
  'VANN',
  'AVLØP',
];

for (const k of likelyKeys) {
  if (valueCountsByKeyLine.has(k)) {
    printTopValues(
      `Top line values for ${k}:`,
      valueCountsByKeyLine.get(k),
      25
    );
  }
}

for (const k of likelyKeys) {
  if (valueCountsByKeyPoint.has(k)) {
    printTopValues(
      `Top point values for ${k}:`,
      valueCountsByKeyPoint.get(k),
      25
    );
  }
}
