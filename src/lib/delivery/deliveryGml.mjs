import { DOMParser } from '@xmldom/xmldom';
import { PHOTO_EXPORT_PROFILES } from '../photos/export/exportContract.mjs';

const GML = 'http://www.opengis.net/gml/3.2';
const nodes = (node, ns, name) => Array.from(node.getElementsByTagNameNS(ns, name));

// Validate the serialized artifact and its correspondence to the issued FOTO plan.
// This is an XML/record-integrity check, not XSD certification. In particular the
// accepted Gemini dialect may omit timestamps; that compatibility stays intact.
export function validateDeliveryGml(xml, plan) {
  try {
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return false;
    const document = new DOMParser({ onError() { throw new Error('Invalid XML'); } }).parseFromString(xml, 'application/xml');
    const ns = PHOTO_EXPORT_PROFILES[plan.profile].namespace;
    if (document.documentElement.namespaceURI !== GML || document.documentElement.localName !== 'FeatureCollection') return false;
    const features = nodes(document, ns, 'Skråfoto');
    if (features.length !== plan.occurrences.length || nodes(document, GML, 'featureMember').length !== features.length) return false;
    const ids = nodes(document, '*', '*').map((node) => node.getAttributeNS(GML, 'id')).filter(Boolean);
    if (new Set(ids).size !== ids.length) return false;
    return features.every((feature, index) => {
      const row = plan.occurrences[index], attachment = plan.attachments.find((item) => item.assetId === row.assetId);
      const links = nodes(feature, ns, 'fotolink'), points = nodes(feature, GML, 'Point'), positions = nodes(feature, GML, 'pos');
      const expected = plan.profile === 'gemini-legacy2019' ? attachment.path.replaceAll('/', '\\') : attachment.path;
      const coords = [row.point.easting, row.point.northing, ...(row.point.z === undefined ? [] : [row.point.z])].join(' ');
      return feature.getAttributeNS(GML, 'id') === row.featureId
        && links.length === 1 && links[0].textContent === expected
        && points.length === 1 && points[0].getAttributeNS(GML, 'id') === row.geometryId
        && positions.length === 1 && positions[0].textContent === coords;
    });
  } catch { return false; }
}
