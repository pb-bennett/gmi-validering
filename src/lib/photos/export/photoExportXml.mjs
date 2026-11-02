import { assertExportablePlan } from './photoExportPlan.mjs';
import { PHOTO_EXPORT_PROFILES, fullCaptureTime, isXmlText } from './exportContract.mjs';

function escape(text) {
  const value = String(text);
  if (!isXmlText(value)) throw new Error('Ugyldige XML-tegn.');
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}
const tag = (depth, name, value) => `${'  '.repeat(depth)}<app:${name}>${escape(value)}</app:${name}>\n`;
function geometry(plan, occurrence) {
  return '      <app:fotograferingspunkt>\n'
    + `        <gml:Point gml:id="${occurrence.geometryId}" srsName="urn:ogc:def:crs:EPSG::${plan.crs.slice(5)}" srsDimension="2">\n`
    + `          <gml:pos>${occurrence.point.easting} ${occurrence.point.northing}</gml:pos>\n`
    + '        </gml:Point>\n      </app:fotograferingspunkt>\n';
}
function direction(occurrence, modern) {
  if (!occurrence.direction) return '';
  const type = modern ? 'Retningsvektor' : 'Retning';
  const value = tag(5, 'retningsverdi', occurrence.direction.degrees);
  const codes = tag(5, 'retningsenhet', '1') + tag(5, 'retningsreferanse', '1');
  return `      <app:retningsvektor>\n        <app:${type}>\n${modern ? codes + value : value + codes}        </app:${type}>\n      </app:retningsvektor>\n`;
}
function identification(occurrence, modern) {
  return '      <app:identifikasjon>\n        <app:Identifikasjon>\n'
    + (modern ? tag(5, 'guid', occurrence.guid) : tag(5, 'lokalId', occurrence.guid) + tag(5, 'navnerom', 'urn:gmi-validator:experimental-photo-export:v1'))
    + '        </app:Identifikasjon>\n      </app:identifikasjon>\n';
}
function legacyFeature(plan, occurrence, asset, attachment) {
  return geometry(plan, occurrence) + tag(3, 'fotolink', attachment.path) + direction(occurrence, false)
    + identification(occurrence, false) + tag(3, 'fotograferingstidspunkt', fullCaptureTime(asset.metadata.captureTime))
    + (asset.metadata.photographer ? '      <app:fotoinformasjon>\n        <app:Bildeinformasjon>\n'
      + tag(5, 'fotograf', asset.metadata.photographer.value) + '        </app:Bildeinformasjon>\n      </app:fotoinformasjon>\n' : '');
}
function asbuiltFeature(plan, occurrence, asset, attachment) {
  const c = plan.context;
  // Inherited SOSI_Objekt sequence precedes the Skråfoto extension sequence.
  return tag(3, 'datafangstdato', c.surveyDate) + tag(3, 'datasett_navn', c.datasetName)
    + identification(occurrence, true)
    + '      <app:kvalitet>\n        <app:Posisjonskvalitet>\n'
    + tag(5, 'målemetode', c.horizontalMethod) + tag(5, 'målemetodeHøyde', c.verticalMethod)
    + '        </app:Posisjonskvalitet>\n      </app:kvalitet>\n'
    + tag(3, 'prosjektnavn', c.projectName) + tag(3, 'stedfestingsårsak', c.surveyReason) + tag(3, 'stedfestingsforhold', c.surveyConditions)
    + geometry(plan, occurrence) + tag(3, 'fotograferingstidspunkt', fullCaptureTime(asset.metadata.captureTime))
    // Optional modern image info is deliberately omitted: required camera/focal
    // siblings have no canonical accepted values in the current photo domain.
    + tag(3, 'fotolink', attachment.path) + direction(occurrence, true);
}
function geminiFeature(occurrence, asset, attachment) {
  const time = fullCaptureTime(asset.metadata?.captureTime)?.replace(/(?:Z|[+-]\d{2}:\d{2})$/, '').replace(/\.\d+$/, '');
  return `      <gml:name>${escape(attachment.filename)}</gml:name>\n`
    + '      <app:fotograferingspunkt>\n'
    + `        <gml:Point gml:id="${occurrence.geometryId}" srsDimension="3">\n`
    + `          <gml:pos srsDimension="3">${occurrence.point.easting} ${occurrence.point.northing} ${occurrence.point.z}</gml:pos>\n`
    + '        </gml:Point>\n      </app:fotograferingspunkt>\n'
    + tag(3, 'fotolink', attachment.path.replaceAll('/', '\\')) + direction(occurrence, false)
    + '      <app:identifikasjon>\n        <app:Identifikasjon>\n'
    + tag(5, 'lokalId', occurrence.guid) + '          <app:navnerom/>\n'
    + '        </app:Identifikasjon>\n      </app:identifikasjon>\n'
    + (time ? tag(3, 'fotograferingstidspunkt', time) : '');
}
function geminiBounds(plan) {
  // Values are export-only XYZ. Zero is not accepted or measured camera height.
  const points = plan.occurrences.map(({ point }) => [Number(point.easting), Number(point.northing), Number(point.z)]);
  const corner = (operation) => [0, 1, 2].map((axis) => points.reduce((value, point) => operation(value, point[axis]), points[0][axis]).toFixed(6)).join(' ');
  return '  <gml:boundedBy>\n    <gml:Envelope srsDimension="3" srsName="urn:ogc:def:crs:EPSG::5972">\n'
    + `      <gml:lowerCorner>${corner(Math.min)}</gml:lowerCorner>\n      <gml:upperCorner>${corner(Math.max)}</gml:upperCorner>\n`
    + '    </gml:Envelope>\n  </gml:boundedBy>\n';
}
export function serializePhotoExport(plan) {
  assertExportablePlan(plan);
  const profile = PHOTO_EXPORT_PROFILES[plan.profile], gemini = plan.profile === 'gemini-legacy2019';
  let xml = (gemini ? '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n' : '<?xml version="1.0" encoding="UTF-8"?>\n')
    + '<gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" '
    + (gemini ? `gml:id="${plan.collectionId}" ` : '')
    + `xmlns:app="${profile.namespace}" ${gemini ? 'xmlns:xlink="http://www.w3.org/1999/xlink" ' : ''}xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" `
    + `xsi:schemaLocation="${profile.namespace} ${profile.namespace}/${profile.schema}"${gemini ? '' : ` gml:id="${plan.collectionId}"`}>\n`;
  if (gemini) xml += geminiBounds(plan);
  const assets = new Map(plan.assets.map((asset) => [asset.assetId, asset]));
  const attachments = new Map(plan.attachments.map((attachment) => [attachment.assetId, attachment]));
  for (const occurrence of plan.occurrences) {
    xml += `  <gml:featureMember>\n    <app:Skråfoto gml:id="${occurrence.featureId}">\n`;
    xml += gemini ? geminiFeature(occurrence, assets.get(occurrence.assetId), attachments.get(occurrence.assetId)) : (plan.profile === 'legacy2019' ? legacyFeature : asbuiltFeature)(plan, occurrence, assets.get(occurrence.assetId), attachments.get(occurrence.assetId));
    xml += '    </app:Skråfoto>\n  </gml:featureMember>\n';
  }
  return xml + '</gml:FeatureCollection>\n';
}
