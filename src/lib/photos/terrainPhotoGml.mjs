import { projectPhotoCoordinate } from '../map/coordinateProjection.js';
import { immutable } from './photoSpatial.mjs';

export const TERRAIN_PHOTO_NAMESPACE = 'http://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101';
export const GML_NAMESPACE = 'http://www.opengis.net/gml/3.2';
export const MAX_PHOTO_GML_BYTES = 10 * 1024 * 1024;
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const children = (node, namespace, name) => Array.from(node?.children || []).filter((item) => item.namespaceURI === namespace && item.localName === name);
const child = (node, namespace, name) => children(node, namespace, name)[0];
const text = (node, namespace, name) => child(node, namespace, name)?.textContent ?? null;

export function photoGmlEpsg(value) {
  const match = String(value || '').trim().match(/^(?:EPSG:|urn:ogc:def:crs:EPSG::|https?:\/\/www\.opengis\.net\/def\/crs\/epsg\/0\/)(\d+)$/i);
  return match ? `EPSG:${Number(match[1])}` : null;
}

export function parseTerrainPhotoGml(xml, { parseXml = (value) => new globalThis.DOMParser().parseFromString(value, 'application/xml') } = {}) {
  if (new TextEncoder().encode(xml).length > MAX_PHOTO_GML_BYTES) fail('gml-too-large');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) fail('gml-doctype-not-supported');
  const document = parseXml(xml);
  if (document.getElementsByTagNameNS('*', 'parsererror').length) fail('invalid-xml');
  const root = document.documentElement;
  if (root?.namespaceURI !== GML_NAMESPACE || root.localName !== 'FeatureCollection') fail('unsupported-gml-profile');
  const members = children(root, GML_NAMESPACE, 'featureMember');
  const features = members.flatMap((member) => children(member, TERRAIN_PHOTO_NAMESPACE, 'Skråfoto'));
  if (!features.length || features.length !== members.length || members.some((member) => member.children.length !== 1)) fail('unsupported-gml-profile');
  if (features.length > 20000) fail('too-many-gml-photos');
  const envelopes = children(root, GML_NAMESPACE, 'boundedBy').flatMap((node) => children(node, GML_NAMESPACE, 'Envelope'));
  const envelopeDeclarations = envelopes.map((node) => node.getAttribute('srsName')).filter(Boolean);
  const entries = features.map((feature, index) => {
    const geometries = children(feature, TERRAIN_PHOTO_NAMESPACE, 'fotograferingspunkt');
    const geometry = geometries[0];
    const points = children(geometry, GML_NAMESPACE, 'Point');
    const point = points[0];
    const positions = children(point, GML_NAMESPACE, 'pos');
    const pos = positions[0];
    const rawText = pos?.textContent ?? null;
    const coordinates = rawText?.trim() ? rawText.trim().split(/\s+/).map(Number) : [];
    const declarationNodes = [pos, point, geometry, feature, root];
    const declarations = declarationNodes.flatMap((node) => node?.getAttribute('srsName') ? [{ location: node.localName, srsName: node.getAttribute('srsName') }] : []);
    const dimensionDeclarations = [pos, point].map((node) => node?.getAttribute('srsDimension')).filter(Boolean);
    const dimension = dimensionDeclarations.length ? Number(dimensionDeclarations[0]) : coordinates.length;
    const envelopeFallback = !declarations.length && envelopes.length === 1 && envelopeDeclarations.length === 1;
    const declaredSrsName = declarations[0]?.srsName || (envelopeFallback ? envelopeDeclarations[0] : null);
    const sourceCrs = photoGmlEpsg(declaredSrsName);
    const identification = child(child(feature, TERRAIN_PHOTO_NAMESPACE, 'identifikasjon'), TERRAIN_PHOTO_NAMESPACE, 'Identifikasjon');
    const direction = child(child(feature, TERRAIN_PHOTO_NAMESPACE, 'retningsvektor'), TERRAIN_PHOTO_NAMESPACE, 'Retning');
    const raw = {
      featureId: feature.getAttributeNS(GML_NAMESPACE, 'id'), pointId: point?.getAttributeNS(GML_NAMESPACE, 'id') || null,
      localId: text(identification, TERRAIN_PHOTO_NAMESPACE, 'lokalId'), idNamespace: text(identification, TERRAIN_PHOTO_NAMESPACE, 'navnerom'),
      name: text(feature, GML_NAMESPACE, 'name'), fotolink: text(feature, TERRAIN_PHOTO_NAMESPACE, 'fotolink'),
      posText: rawText, coordinates, dimension, dimensionDeclarations,
      declaredSrsName, declarations, envelopeDeclarations, pointSrsName: point?.getAttribute('srsName') || null,
      photographedAtText: text(feature, TERRAIN_PHOTO_NAMESPACE, 'fotograferingstidspunkt'),
      direction: { valueText: text(direction, TERRAIN_PHOTO_NAMESPACE, 'retningsverdi'), unitText: text(direction, TERRAIN_PHOTO_NAMESPACE, 'retningsenhet'), referenceText: text(direction, TERRAIN_PHOTO_NAMESPACE, 'retningsreferanse') },
    };
    let errorCode = null;
    if (geometries.length !== 1 || points.length !== 1 || positions.length !== 1 || ![2, 3].includes(dimension) || coordinates.length !== dimension || dimensionDeclarations.some((value) => Number(value) !== dimension) || (sourceCrs === 'EPSG:5972' && dimension !== 3)) errorCode = 'invalid-geometry';
    else if (!declaredSrsName) errorCode = envelopeDeclarations.length > 1 ? 'conflicting-crs' : 'missing-crs';
    // Pos and Point cannot disagree; geometry-level declarations may override outer defaults.
    else if (pos?.getAttribute('srsName') && point?.getAttribute('srsName') && photoGmlEpsg(pos.getAttribute('srsName')) !== photoGmlEpsg(point.getAttribute('srsName'))) errorCode = 'conflicting-crs';
    else if (!['EPSG:5972', 'EPSG:25832', 'EPSG:25833'].includes(sourceCrs)) errorCode = 'unsupported-crs';
    const projected = errorCode ? { status: errorCode === 'unsupported-crs' ? 'unsupported-crs' : 'invalid', position: null, errorCode } : projectPhotoCoordinate(sourceCrs, coordinates);
    return {
      id: `entry-${index + 1}`, raw, ...projected,
      crsResolution: { sourceCrs, declarationLocation: declarations[0]?.location || (envelopeFallback ? 'collection-envelope' : null), method: envelopeFallback ? 'terrain-envelope-fallback' : declarations.length ? 'explicit-declaration' : null, axisOrder: 'easting-northing-height', verticalCrs: sourceCrs === 'EPSG:5972' ? 'EPSG:5941' : null },
      issues: projected.errorCode ? [projected.errorCode] : [],
    };
  });
  return immutable({
    namespace: TERRAIN_PHOTO_NAMESPACE, collectionId: root.getAttributeNS(GML_NAMESPACE, 'id'), entries,
    issues: entries.some((entry) => entry.crsResolution.method === 'terrain-envelope-fallback') ? ['terrain-envelope-fallback'] : [],
  });
}
