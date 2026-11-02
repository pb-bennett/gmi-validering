import { DOMParser } from '@xmldom/xmldom';
import assert from 'node:assert/strict';
export const elements = (node) => [...node.childNodes].filter((child) => child.nodeType === 1);
export function assertGeminiConventions(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const all = (name) => [...doc.getElementsByTagNameNS('*', name)];
  assert.equal(doc.documentElement.localName, 'FeatureCollection');
  assert.equal(doc.documentElement.namespaceURI, 'http://www.opengis.net/gml/3.2');
  assert.equal(elements(doc.documentElement)[0].localName, 'boundedBy');
  const envelope = all('Envelope')[0];
  assert.equal(envelope.getAttribute('srsDimension'), '3');
  assert.equal(envelope.getAttribute('srsName'), 'urn:ogc:def:crs:EPSG::5972');
  const photos = all('Skråfoto'); assert(photos.length);
  const ids = all('*').map((node) => node.getAttribute('gml:id')).filter(Boolean);
  assert.equal(ids.length, new Set(ids).size);
  for (const photo of photos) {
    assert.equal(photo.namespaceURI, 'http://skjema.geonorge.no/SOSI/produktspesifikasjon/LedningsnettEtablertEllerFlyttet/20190101');
    const children = elements(photo), names = children.map((node) => node.localName);
    assert.deepEqual(names, ['name', 'fotograferingspunkt', 'fotolink', 'retningsvektor', 'identifikasjon', ...(names.includes('fotograferingstidspunkt') ? ['fotograferingstidspunkt'] : [])]);
    const text = (name) => photo.getElementsByTagNameNS('*', name)[0]?.textContent;
    const link = text('fotolink'); assert(link.startsWith('Attachments\\')); assert(!link.includes('/'));
    assert.equal(text('name'), link.slice('Attachments\\'.length));
    assert.equal(text('navnerom'), '');
    assert.equal(photo.getAttribute('gml:id'), `id${text('lokalId')}`);
    for (const node of [photo, photo.getElementsByTagNameNS('*', 'Point')[0]]) assert.match(node.getAttribute('gml:id'), /^id[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
    const point = photo.getElementsByTagNameNS('*', 'Point')[0];
    assert.equal(point.getAttribute('srsDimension'), '3'); assert(!point.hasAttribute('srsName'));
    const pos = text('pos').trim().split(/\s+/); assert.equal(pos.length, 3);
    pos.forEach((value) => assert.match(value, /^-?\d+\.\d{6}$/));
    assert.deepEqual(elements(photo.getElementsByTagNameNS('*', 'Retning')[0]).map((node) => node.localName), ['retningsverdi', 'retningsenhet', 'retningsreferanse']);
    assert.equal(text('retningsenhet'), '1'); assert.equal(text('retningsreferanse'), '1');
    if (text('fotograferingstidspunkt')) assert.match(text('fotograferingstidspunkt'), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  }
  return { doc, photos, envelope };
}
