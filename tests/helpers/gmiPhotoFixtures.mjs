// Pinned literal values intentionally recorded in the completed corpus audit.
// No private GMI file is copied here.
export const sevenGuid = 'ef536e8a-9b62-468f-bdf5-c033950a2ec2';
export const sharedFilename = '2026-02-20-14-34-36_f1ea8a41a3e3fb77de80703e30920e_KG1._.jpg';
export const sharedGuids = ['b82604fa-abdb-40e2-acec-017788834274', 'cf6a001b-89ce-43a8-9450-bfbb97ada492'];

// Synthetic minimal GMI envelope, always consumed by the production parser.
export function gmiText(objects) {
  const fields = '_FIELDNAMES S_FCODE;Type;AnleggsID;S_HYPERLINK';
  const rows = (scope) => objects.filter((object) => (object.scope || 'point') === scope).map((object, index) =>
    `:${scope === 'line' ? 'L' : 'P'} ${object.parserId || index + 1}\nGUID ${object.guid || `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`}\n_FIELDVALUES ${object.tema ?? 'KUM'};${object.type ?? ''};${object.label ?? ''};${object.hyperlink ?? ''}\n/XYZ\n${object.xyz || '581930 6566000 1'}${scope === 'line' ? '\n581950 6566005 2' : ''}`
  ).join('\n');
  return `[GMIFILE_ASCII]\n_VERSION 2\nCOSYS_EPSG 25832\n[P_]\n${fields}\n[L_]\n${fields}\n[+P_]\n${rows('point')}\n[+L_]\n${rows('line')}\n[END]\n`;
}

export const gmiFile = (objects, name = 'references.gmi') => new File([
  Uint8Array.from(gmiText(objects), (character) => character.charCodeAt(0)),
], name);
export const realGrammarFamilies = [
  "h:1(link:\"Attachments\\2026-02-20-14-34-42_30abbe330410e94e249febb4949eb7_KG1._.jpg\" sign:\"GustafHerenius\") ",
  "h:1(link:\"Attachments\\425MM.1_20260218_1330_01.jpg\") h:2(link:\"Attachments\\2026-02-20-14-34-37_069476da7f24600fd1bb79b8309628_KG1._.jpg\" sign:\"GustafHerenius\") h:3(link:\"Attachments\\2026-02-20-14-34-35_fa5f4e173494affa27a1fe9fe41e41_KG1._.jpg\" sign:\"GustafHerenius\") h:4(link:\"Attachments\\2026-02-20-14-34-34_44d9e13ccc02488c6ccc9b44317b24_KG1._.jpg\" sign:\"GustafHerenius\") h:5(link:\"Attachments\\20260826dp10_073154_LOK.jpg\" sign:\"DanielPedersen\") h:6(link:\"Attachments\\20260826dp10_073154_LOK_1.jpg\" sign:\"DanielPedersen\") ",
  "h:1(link:\"Attachments\\bfba5458120ee34bdbef05b9b38b48.jpg\" sign:\"GustafHerenius\") h:2(link:\"Attachments\\8a263df76a73ee86a7246ef7d6426f.jpg\" sign:\"GustafHerenius\") ",
  "h:1(link:\"Attachments\\2026-02-20-14-34-36_f1ea8a41a3e3fb77de80703e30920e_KG1._.jpg\" sign:\"GustafHerenius\") h:2(link:\"Attachments\\20260826dp11_073417_LOK.jpg\" sign:\"DanielPedersen\") h:3(link:\"Attachments\\20260826dp11_073417_LOK_1.jpg\" sign:\"DanielPedersen\") h:4(link:\"Attachments\\IMG_20260901_072121.jpg\" sign:\"DanielPedersen\") ",
  "h:1(link:\"Attachments\\ANBMUFFE. LERKEVN 16_20260305_1356_01.jpg\") h:2(link:\"Attachments\\fbbe9d9b72c8dbff3f08db068f859a.jpg\" sign:\"GustafHerenius\") h:3(link:\"Attachments\\74aac1d5cbcca57a42b9320c915914.jpg\" sign:\"GustafHerenius\") ",
  "h:1(link:\"Attachments\\LERKEVN 16_20260309_1413_01.jpg\") h:2(link:\"Attachments\\4e92648a7cc3c14480f266cfdd404b.jpg\" sign:\"GustafHerenius\") ",
  "h:1(link:\"Attachments\\GRUSPROPP.LERKEVN15_20260317_1240_01.jpg\") ",
  "h:1(link:\"Attachments\\20260826dp42_084806_LOK_1.jpg\" sign:\"DanielPedersen\") h:2(link:\"Attachments\\20260826dp42_084806_LOK.jpg\" sign:\"DanielPedersen\") h:3(link:\"Attachments\\IMG_20260901_072851.jpg\" sign:\"DanielPedersen\") ",
  "h:1(link:\"Attachments\\20260826dp14_074511_SLU.jpg\") h:2(link:\"Attachments\\20260826dp14_074511_SLU_1.jpg\") ",
  "h:1(link:\"Attachments\\20260826dp21_080007_KUM.jpg\") h:2(link:\"Attachments\\20260826dp21_080007_KUM_1.jpg\") h:3(link:\"Attachments\\IMG_20260901_072341.jpg\" sign:\"DanielPedersen\") ",
  "h:1(link:\"Attachments\\2025-11-21-12-56-57_7729aa7e88b23961725358074f09cc.jpg\" sign:\"Edvard\") h:2(link:\"Attachments\\2025-11-24-14-18-19_691298b99f44bfece0aaf728cc8289.jpg\" sign:\"Edvard\") h:3(link:\"Attachments\\2025-11-24-14-18-22_3a20c4240df504c5fbde1fbcb2f586.jpg\" sign:\"Edvard\") h:4(link:\"Attachments\\2025-11-24-14-18-24_6bc0128e47d1aa92125a33e8e4f542.jpg\" sign:\"Edvard\") h:5(link:\"Attachments\\SPK1(1).jpg\" sign:\"Edvard\") h:6(link:\"Attachments\\SPK1.JPEG\" sign:\"Edvard\") ",
  "h:1(link:\"Attachments\\2025-11-21-12-57-02_344657d32243b419fedbc3bd386759.jpg\" sign:\"Edvard\") h:2(link:\"Attachments\\2025-11-21-12-57-06_5a33100c50c7af6f6b508fae003872.jpg\" sign:\"Edvard\") h:3(link:\"Attachments\\2025-11-21-12-57-08_0be69e2872ff2b426be6e8a2fee9d5.jpg\" sign:\"Edvard\") h:4(link:\"Attachments\\2025-11-21-12-57-12_be3a83aea4cbb2c4820e553c64c5d0.jpg\" sign:\"Edvard\") h:5(link:\"Attachments\\2025-11-21-12-57-16_260fb4ce90d7f81039795f96ee1f60.jpg\" sign:\"Edvard\") h:6(link:\"Attachments\\64320(1).jpg\" sign:\"Edvard\") h:7(link:\"Attachments\\64320.JPEG\" sign:\"Edvard\") "
];
