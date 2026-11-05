import { readFile } from 'node:fs/promises';
import { exportFixture } from './photoExportFixtures.mjs';

// Synthetic scenarios behind the frozen Gemini output. Values are invented, never corpus data.
export const GEMINI_GOLDEN_CASES = Object.freeze({
  'time-seconds': { names: ['Grøft æ image.png', 'ordinary.png'], direction: 90 },
  'time-fraction-offset-repeated': { repeated: true, time: '2026-05-12T14:33:02.123456789+02:00', direction: null, fillDirection: 359.875 },
  'time-utc': { time: '2026-05-12T12:33:02Z' },
  'time-missing': { time: null, direction: 0 },
  'time-date-only': { time: '2026-05-12' },
  'time-minute': { time: '2026-05-12T14:33' },
  'unicode-collision': { names: ['Grøft æ image.png', 'GRØFT Æ IMAGE.PNG'] },
});

export async function geminiGoldenFixture(name) {
  const { fillDirection, ...options } = GEMINI_GOLDEN_CASES[name];
  const fixture = await exportFixture(options);
  if (fillDirection !== undefined) fixture.session.fillMissingPhotoValues(fixture.layerId, 'direction', fillDirection);
  return fixture;
}

// UUIDs are new per plan. Replacing them in order of first appearance keeps every identity
// relationship in the golden text: feature gml:id = id + lokalId, and which IDs are distinct.
export function normalizeGeminiIdentifiers(xml) {
  const seen = new Map();
  return xml.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (uuid) => {
    if (!seen.has(uuid)) seen.set(uuid, `UUID-${String(seen.size + 1).padStart(3, '0')}`);
    return seen.get(uuid);
  });
}

export const geminiGoldenPath = (name) => new URL(`../fixtures/photo-export-gemini/${name}.gml`, import.meta.url);
// core.autocrlf may rewrite the stored file on checkout. Only the stored side is folded back:
// generated XML is compared untouched, so a stray CR in the output still fails.
export const readGeminiGolden = async (name) => (await readFile(geminiGoldenPath(name), 'utf8')).replace(/\r\n/g, '\n');
