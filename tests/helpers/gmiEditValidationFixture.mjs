import { encodeSingleByte } from './gmiEditFixtures.mjs';

// Fabricated M5A acceptance data; never derived from a contractor delivery.
export function gmiEditValidationFixture({ captureDate } = {}) {
  const fields = ['Tema', 'Material', 'SDR', 'Ringstivhet', 'Dimensjon', 'Målemetode', 'Anleggsår', 'Stedfestingsårsak', 'Merknad'];
  const lines = [
    ['SP', 'PVC', '', 'SN8', 'BAD', '12', '2026', 'NYTT', 'Syntetisk ledning'],
    ['SP', 'PVC', '11.0', 'SN8', '200', '96', '2026', 'UENDR', 'Eksisterende konflikt'],
    ['VL', 'BET', '11.0', '', '200', '96', '2026', 'NYTT', 'Materialkontekst'],
  ];
  if (captureDate) { fields.push('Datafangstdato'); lines.forEach((values) => values.push(captureDate)); }
  const out = ['[GMIFILE_ASCII]', '_VERSION 2', '_FILETYPE GMI', '_INDEX !!!!!!!!!!!!!!!!!!!!',
    '_EXTENT 581900 6565900 582100 6566100 !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!', 'COSYS_EPSG 25832',
    '[L_]', `_FIELDNAMES ${fields.join(';')};`, '[P_]', '_FIELDNAMES Tema;Type;Merknad;', '[+L_]'];
  lines.forEach((values, index) => out.push(`:L ${index + 1}`, `_FIELDVALUES ${values.join(';')};`,
    '/XYZ', `581940 ${6566000 + index} 101`, `581945 ${6566001 + index} 101`));
  out.push('[+P_]', ':P 1', '_FIELDVALUES KUM;KBRE;Syntetisk punkt;', '/XYZ', '581940 6566000 101', '[END]', '');
  return encodeSingleByte(out.join('\r\n'));
}
