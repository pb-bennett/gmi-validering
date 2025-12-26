const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, '../REF_FILES/GMI/FK');

// Stats object: { [fcode]: { total: 0, withType: 0, withNettType: 0, typeValues: Set, nettTypeValues: Set } }
const stats = {};

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'latin1'); // GMI is often latin1/ISO-8859-1
  const lines = content.split(/\r?\n/);

  let currentSection = null; // 'L', 'P', 'T'
  let fieldNames = { L: [], P: [] };
  let fieldIndices = { L: {}, P: {} };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('[L_]')) {
      currentSection = 'DEF_L';
    } else if (line.startsWith('[P_]')) {
      currentSection = 'DEF_P';
    } else if (line.startsWith('[+L_]')) {
      currentSection = 'DATA_L';
    } else if (line.startsWith('[+P_]')) {
      currentSection = 'DATA_P';
    } else if (line.startsWith('_FIELDNAMES')) {
      if (currentSection === 'DEF_L' || currentSection === 'DEF_P') {
        const type = currentSection === 'DEF_L' ? 'L' : 'P';
        const names = line
          .substring(12)
          .split(';')
          .map((s) => s.trim());
        fieldNames[type] = names;

        // Find indices
        fieldIndices[type] = {
          S_FCODE: names.indexOf('S_FCODE'),
          Type: names.findIndex((n) => n.toLowerCase() === 'type'),
          Nett_type: names.findIndex(
            (n) => n.toLowerCase() === 'nett_type'
          ),
        };
      }
    } else if (line.startsWith('_FIELDVALUES')) {
      if (
        currentSection === 'DATA_L' ||
        currentSection === 'DATA_P'
      ) {
        const type = currentSection === 'DATA_L' ? 'L' : 'P';
        const indices = fieldIndices[type];

        if (indices && indices.S_FCODE !== -1) {
          const values = line.substring(13).split(';');

          // Get S_FCODE
          const fcode = values[indices.S_FCODE]?.trim();

          if (fcode) {
            if (!stats[fcode]) {
              stats[fcode] = {
                total: 0,
                withType: 0,
                withNettType: 0,
                typeValues: new Set(),
                nettTypeValues: new Set(),
              };
            }
            stats[fcode].total++;

            // Check for Type
            if (indices.Type !== -1) {
              const val = values[indices.Type]?.trim();
              if (val) {
                stats[fcode].withType++;
                stats[fcode].typeValues.add(val);
              }
            }

            // Check for Nett_type
            if (indices.Nett_type !== -1) {
              const val = values[indices.Nett_type]?.trim();
              if (val) {
                stats[fcode].withNettType++;
                stats[fcode].nettTypeValues.add(val);
              }
            }
          }
        }
      }
    }
  }
}

try {
  const files = fs
    .readdirSync(directoryPath)
    .filter((file) => file.endsWith('.gmi'));
  console.log(`Found ${files.length} GMI files.`);

  files.forEach((file) => {
    processFile(path.join(directoryPath, file));
  });

  console.log('\nAnalysis Results:');
  console.log(
    '------------------------------------------------------------------------------------------'
  );
  console.log(
    'S_FCODE'.padEnd(20) +
      'Total'.padEnd(10) +
      'Type'.padEnd(10) +
      'Nett_type'.padEnd(12) +
      'Examples (Type / Nett_type)'
  );
  console.log(
    '------------------------------------------------------------------------------------------'
  );

  const sortedFcodes = Object.keys(stats).sort();

  sortedFcodes.forEach((fcode) => {
    const s = stats[fcode];
    const typePct = ((s.withType / s.total) * 100).toFixed(0);
    const nettTypePct = ((s.withNettType / s.total) * 100).toFixed(0);

    const typeEx = Array.from(s.typeValues).slice(0, 3).join(',');
    const nettTypeEx = Array.from(s.nettTypeValues)
      .slice(0, 3)
      .join(',');

    // Only show if there are some occurrences
    if (s.total > 0) {
      console.log(
        fcode.padEnd(20) +
          s.total.toString().padEnd(10) +
          `${s.withType} (${typePct}%)`.padEnd(10) +
          `${s.withNettType} (${nettTypePct}%)`.padEnd(12) +
          `${typeEx} / ${nettTypeEx}`
      );
    }
  });
} catch (err) {
  console.error('Error:', err);
}
