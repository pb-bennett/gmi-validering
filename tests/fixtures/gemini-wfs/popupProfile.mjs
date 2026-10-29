import { feature, field } from './syntheticProfile.mjs';

export const lineValues = {
  FCODE: '001', FCODE_TITLE: 'Vannledning – østre grøft', NETTYPE: '01', NETTYPE_TITLE: 'Vann',
  DIM: '160.00', MATERIAL: '03', MATERIAL_TITLE: 'PE', YEAR: '1980', STATUS: '0', STATUS_TITLE: 'I drift',
  OWNER_TITLE: 'Færder ÆØÅ', RESPONSIBLE_TITLE: '<img src=x onerror=alert(1)>', LENGTH: '0', LSID: '000123',
  FunctionResult1: 'HIDDEN_FUNCTION_RESULT', UNKNOWN: 'HIDDEN_UNKNOWN',
};
export const pointValues = {
  FCODE: '002', FCODE_TITLE: 'Avløpskum', TYPE: '01', TYPE_TITLE: 'Kum ÆØÅ',
  CUST_FUNC_TITLE: 'Inspeksjon', BUILDSTYLE_TITLE: 'Betong', STATION: '0007', OBJWIDTH: '0', OBJLENGTH: '1.50',
  COVER_Z: '17.75', YEAR: '2001', STATUS_TITLE: 'I drift', OWNER_TITLE: 'Færder ÆØÅ',
  RESPONSIBLE_TITLE: 'Kommunen', PSID: '000456',
};
const fields = (values) => Object.entries(values).map(([name, value]) => field(name, value)).join('');
export const popupLine = feature({ type: 'VA_LINE', xyz: '581900 6565940 12 581980 6565960 0', fields: fields(lineValues) });
export const popupPoint = feature({ xyz: '581970 6566030 0', fields: fields(pointValues) });
