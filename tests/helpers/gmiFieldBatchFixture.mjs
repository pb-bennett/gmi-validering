import { encodeSingleByte } from './gmiEditFixtures.mjs';

// Synthetic columns and rows only; preserves a deliberately opaque section.
export function gmiFieldBatchFixture({
  pointFields = ['Tema', 'InnvendigUtvendig', 'Kumform', 'Merknad', 'Anleggsår', 'Datafangstdato'],
  points = [['LOK', '', '', '', '', ''], ['LOK', ' ', '', 'original', '', ''], ['KUM', 'ID', 'R', '', '', ''],
    ['LOK', 'delivered-code', '', '', '', ''], ['INVALID', '', '', '', '', '']],
  lineFields = ['Tema', 'Material', 'Merknad', 'SDR', 'Trykklasse', 'Ringstivhet', 'Dimensjon', 'Rørform', 'VertikalDimensjon'],
  lines = [['VL', '', '', '', '', '', '160', 'S', ''], ['VL', 'PE', 'old', '', '', '', '200', 'R', ''],
    ['SP', 'unlisted', '', '', '', '', '200', 'S', '']],
} = {}) {
  const out = ['[GMIFILE_ASCII]', '_VERSION 2', '_FILETYPE GMI', '_INDEX !!!!!!!!!!!!!!!!!!!!', 'COSYS_EPSG 25832',
    '[P_]', `_FIELDNAMES ${pointFields.join(';')};`, '[L_]', `_FIELDNAMES ${lineFields.join(';')};`];
  for (const [marker, rows] of [['P', points], ['L', lines]]) {
    out.push(`[+${marker}_]`);
    rows.forEach((values, index) => {
      out.push(`:${marker} ${index + 1}`, `_FIELDVALUES ${values.join(';')};`, '/XYZ', `581940 ${6566000 + index} 101`);
      if (marker === 'L') out.push(`581945 ${6566001 + index} 101`);
    });
  }
  out.push('[PRIVATE_SYNTHETIC_SECTION]', 'Opaque bytes: keep this exactly;with;separators', '[END]', '');
  return encodeSingleByte(out.join('\r\n'));
}
