import { ASBUILT_CODES } from './asbuiltCodes.mjs';
import { normalizeCaptureTime } from '../photoCaptureMetadata.mjs';

export const PHOTO_EXPORT_PROFILES = Object.freeze({
  legacy2019: Object.freeze({ label: 'Legacy Skråfoto 2019', namespace: 'http://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101', schema: 'LedningsnettEtablertEllerFlyttet.xsd' }),
  asbuilt52: Object.freeze({ label: 'Norsk Vann AsBuilt 5.2', namespace: 'https://skjema.geonorge.no/SOSI/produktspesifikasjon/Norskvann-Asbuilt/5.2', schema: 'Asbuilt.xsd' }),
});
export const EXPORT_CONTEXT_FIELDS = Object.freeze([
  { key: 'surveyDate', label: 'Datafangstdato', type: 'date' },
  { key: 'datasetName', label: 'Datasettets navn', type: 'text' },
  { key: 'projectName', label: 'Prosjektnavn', type: 'text' },
  { key: 'horizontalMethod', label: 'Målemetode', type: 'code' },
  { key: 'verticalMethod', label: 'Målemetode høyde', type: 'code' },
  { key: 'surveyReason', label: 'Stedfestingsårsak', type: 'code' },
  { key: 'surveyConditions', label: 'Stedfestingsforhold', type: 'code' },
]);
export { ASBUILT_CODES };

export function isXmlText(text) {
  return typeof text === 'string' && [...text].every((char) => {
    const n = char.codePointAt(0);
    return n === 9 || n === 10 || n === 13 || (n >= 32 && n <= 0xd7ff) || (n >= 0xe000 && n <= 0xfffd) || (n >= 0x10000 && n <= 0x10ffff);
  });
}
export function fullCaptureTime(accepted) {
  const value = accepted?.value;
  const normalized = normalizeCaptureTime(value?.iso);
  return normalized && ['second', 'fraction'].includes(normalized.precision)
    && normalized.precision === value.precision && normalized.offset === value.offset
    && normalized.timezoneKnown === value.timezoneKnown ? normalized.iso : null;
}
export function validateExportContext(context) {
  return EXPORT_CONTEXT_FIELDS.flatMap(({ key, label, type }) => {
    const value = context[key];
    const date = type === 'date' ? normalizeCaptureTime(value) : null;
    const valid = typeof value === 'string' && value.trim() && isXmlText(value)
      && (type !== 'date' || date?.precision === 'date')
      && (type !== 'code' || ASBUILT_CODES[key].some((item) => item.value === value));
    return valid ? [] : [{ code: 'invalid-context', field: key, message: `${label}: oppgi ${type === 'code' ? 'en gyldig skjemakode' : type === 'date' ? 'en gyldig dato' : 'en verdi'}.` }];
  });
}

// Freeze data, not browser File objects or typed arrays. No session mutation.
export function freezeExportData(value) {
  if (Array.isArray(value) || (value && Object.getPrototypeOf(value) === Object.prototype)) {
    Object.values(value).forEach(freezeExportData);
    Object.freeze(value);
  }
  return value;
}
