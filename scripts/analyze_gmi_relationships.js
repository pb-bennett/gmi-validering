const fs = require('fs');
const path = require('path');

const GMI_DIR = path.join(__dirname, '../REF_FILES/GMI/FK');
const OUTPUT_FILE = path.join(__dirname, '../GMI_ANALYSIS.md');

const TARGET_FIELDS = [
  {
    key: 'Bredde',
    aliases: [
      'Bredde',
      'Bredde (diameter)',
      'DIMENSJON',
      'DIM',
      'BREDDE',
    ],
  },
  { key: 'Kjegle', aliases: ['Kjegle', 'KJEGLE'] },
  { key: 'Adkomst', aliases: ['Adkomst', 'ADKOMST'] },
  { key: 'Byggemetode', aliases: ['Byggemetode', 'BYGGEMETODE'] },
  { key: 'Kumform', aliases: ['Kumform', 'KUMFORM', 'Rørform'] }, // Rørform sometimes used for kumform?
  { key: 'Type', aliases: ['Type', 'TYPE'] },
];

const FCODE_ALIASES = ['S_FCODE', 'Tema', 'TEMA', 'FCODE'];

function getFieldValue(fieldNames, fieldValues, aliases) {
  for (const alias of aliases) {
    const index = fieldNames.indexOf(alias);
    if (index !== -1 && fieldValues[index]) {
      return fieldValues[index];
    }
  }
  return null;
}

function parseGmiFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8'); // Use utf-8, might need latin1 if encoding issues
  const lines = content.split(/\r?\n/);

  let currentSection = null;
  let fieldNames = [];
  let features = [];

  // We only care about P_ (Points) for now based on the fields requested
  // But let's check L_ too just in case

  let pFieldNames = [];
  let lFieldNames = [];

  for (const line of lines) {
    if (line.startsWith('[P_]')) {
      currentSection = 'P';
    } else if (line.startsWith('[L_]')) {
      currentSection = 'L';
    } else if (line.startsWith('[+P_]')) {
      currentSection = 'P_DATA';
    } else if (line.startsWith('[+L_]')) {
      currentSection = 'L_DATA';
    } else if (line.startsWith('_FIELDNAMES')) {
      const names = line
        .substring(12)
        .split(';')
        .map((s) => s.trim());
      if (currentSection === 'P') pFieldNames = names;
      if (currentSection === 'L') lFieldNames = names;
    } else if (line.startsWith('_FIELDVALUES')) {
      const values = line
        .substring(13)
        .split(';')
        .map((s) => s.trim());

      let names = [];
      if (currentSection === 'P_DATA') names = pFieldNames;
      else if (currentSection === 'L_DATA') names = lFieldNames;
      else continue;

      const fcode = getFieldValue(names, values, FCODE_ALIASES);

      if (fcode) {
        const feature = { fcode };
        TARGET_FIELDS.forEach((field) => {
          feature[field.key] = getFieldValue(
            names,
            values,
            field.aliases
          );
        });
        features.push(feature);
      }
    }
  }
  return features;
}

function analyze() {
  const files = fs
    .readdirSync(GMI_DIR)
    .filter((f) => f.endsWith('.gmi'));
  let allFeatures = [];

  console.log(`Found ${files.length} GMI files.`);

  for (const file of files) {
    try {
      const features = parseGmiFile(path.join(GMI_DIR, file));
      allFeatures = allFeatures.concat(features);
    } catch (e) {
      console.error(`Error parsing ${file}:`, e.message);
    }
  }

  console.log(`Parsed ${allFeatures.length} features.`);

  // Aggregation
  // Map<FCODE, { count: number, fields: Map<FieldKey, { present: number, values: Map<Value, number> }> }>
  const stats = {};

  for (const feature of allFeatures) {
    const fcode = feature.fcode;
    if (!stats[fcode]) {
      stats[fcode] = { count: 0, fields: {} };
      TARGET_FIELDS.forEach((f) => {
        stats[fcode].fields[f.key] = { present: 0, values: {} };
      });
    }

    stats[fcode].count++;

    TARGET_FIELDS.forEach((field) => {
      const val = feature[field.key];
      if (val) {
        stats[fcode].fields[field.key].present++;
        const valStr = String(val);
        stats[fcode].fields[field.key].values[valStr] =
          (stats[fcode].fields[field.key].values[valStr] || 0) + 1;
      }
    });
  }

  // Generate Markdown
  let md =
    '# GMI Analysis: Relationship between S_FCODE and Attributes\n\n';
  md += `Analyzed ${files.length} files containing ${allFeatures.length} features.\n\n`;

  const sortedFcodes = Object.keys(stats).sort();

  for (const fcode of sortedFcodes) {
    const fcodeStats = stats[fcode];
    md += `## S_FCODE: **${fcode}** (Count: ${fcodeStats.count})\n\n`;

    md += '| Field | Present | % Present | Top Values |\n';
    md += '|---|---|---|---|\n';

    TARGET_FIELDS.forEach((field) => {
      const fieldStats = fcodeStats.fields[field.key];
      const percent = (
        (fieldStats.present / fcodeStats.count) *
        100
      ).toFixed(1);

      // Get top 5 values
      const sortedValues = Object.entries(fieldStats.values)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([v, c]) => `${v} (${c})`)
        .join(', ');

      md += `| ${field.key} | ${fieldStats.present} | ${percent}% | ${
        sortedValues || '-'
      } |\n`;
    });
    md += '\n';
  }

  fs.writeFileSync(OUTPUT_FILE, md);
  console.log(`Analysis saved to ${OUTPUT_FILE}`);
}

analyze();
