import { GeminiServiceError } from './geminiErrors.mjs';

export function decodeGeminiXml(bytes, contentType) {
  const [type, ...parameters] = String(contentType || '').toLowerCase().split(';').map((part) => part.trim());
  if (!['application/xml', 'text/xml', 'application/gml+xml'].includes(type)) throw new GeminiServiceError('unsupported_upstream_mime');
  const match = parameters[0]?.match(/^charset\s*=\s*(?:"([a-z0-9-]+)"|([a-z0-9-]+))$/);
  const charset = parameters.length ? (match?.[1] || match?.[2]) : 'utf-8';
  if (parameters.length > 1 || !['utf-8', 'utf8', 'us-ascii'].includes(charset)) throw new GeminiServiceError('unsupported_response_encoding');
  // TextDecoder('us-ascii') aliases Windows-1252 in browsers; enforce ASCII bytes.
  if (charset === 'us-ascii' && bytes.some((byte) => byte > 127)) throw new GeminiServiceError('unsupported_response_encoding');
  let xml;
  try { xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new GeminiServiceError('unsupported_response_encoding'); }
  const declaration = xml.match(/^\s*<\?xml\b[^?]*\bencoding\s*=\s*(['"])([^'"]+)\1/i)?.[2].toLowerCase();
  if (declaration && (!['utf-8', 'utf8', 'us-ascii'].includes(declaration) ||
    (declaration === 'us-ascii' && bytes.some((byte) => byte > 127)))) throw new GeminiServiceError('unsupported_response_encoding');
  return xml;
}
