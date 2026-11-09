import { encodeSingleByte } from './gmiEditFixtures.mjs';

export const BATCH_ROWS = [
  ['VL', 'PE', '', '', ''], ['VL', 'PE', '11.0', 'PN10', ''],
  ['SP', 'PVC', '', '', ''], ['VL', '', '', '', ''], ['VLVAR', 'PE', '', '', ''],
  ['VL', 'BET', '', '', ''], ['VL', 'PE', '', '', 'SN8'], ['VL', 'PE', ' ', '', ''],
  ['', 'PE', '', '', ''],
];
export function gmiEditBatchFixture({ rows = BATCH_ROWS, fields = ['Tema', 'Material', 'SDR', 'Trykklasse', 'Ringstivhet'] } = {}) {
  const out = ['[GMIFILE_ASCII]', '_VERSION 2', '_FILETYPE GMI', '_INDEX !!!!!!!!!!!!!!!!!!!!', 'COSYS_EPSG 25832',
    '[L_]', `_FIELDNAMES ${fields.join(';')};`, '[+L_]'];
  rows.forEach((values, index) => out.push(`:L ${index + 1}`, `_FIELDVALUES ${values.join(';')};`, '/XYZ',
    `581940 ${6566000 + index} 101`, `581945 ${6566001 + index} 101`));
  out.push('[END]', '');
  return encodeSingleByte(out.join('\r\n'));
}
