// One narrowly defined Gemini Suite WFS profile; shared UI/server syntax policy.
export function normalizeGeminiWfsUrl(value) {
  if (typeof value !== 'string' || value.length > 500 || value !== value.trim() || /[\p{Cc}\\%]/u.test(value) ||
    !/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.geminisuite\.com(?::443)?\/portal\/api\/proxy\/map\/[a-z0-9][a-z0-9_-]{0,99}\.wfs$/i.test(value)) {
    throw new Error('Invalid Gemini WFS connection');
  }
  const url = new URL(value);
  if (!/^\/portal\/api\/proxy\/map\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}\.wfs$/.test(url.pathname)) throw new Error('Invalid Gemini WFS connection');
  return url.toString();
}

export function validateGeminiConnection(input) {
  if (!input || typeof input.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(input.id) ||
    typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100 || /\p{Cc}/u.test(input.name)) {
    throw new Error('Invalid Gemini WFS connection');
  }
  // Whitelist fields: credentials can never enter saved/public configuration.
  return Object.freeze({ id: input.id, name: input.name.trim(), url: normalizeGeminiWfsUrl(input.url) });
}

export const GEMINI_CONNECTION_STORAGE_KEY = 'gmi-gemini-wfs-connection-v1';
export function readGeminiConnection(storage) {
  try { return validateGeminiConnection(JSON.parse((storage ?? globalThis.localStorage).getItem(GEMINI_CONNECTION_STORAGE_KEY))); }
  catch { return null; }
}
export function saveGeminiConnection(input, storage) {
  const connection = validateGeminiConnection(input);
  try { (storage ?? globalThis.localStorage).setItem(GEMINI_CONNECTION_STORAGE_KEY, JSON.stringify(connection)); return true; }
  catch { return false; }
}
