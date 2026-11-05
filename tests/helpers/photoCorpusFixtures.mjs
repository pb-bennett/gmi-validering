import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Private corpus, opt-in like the other PHOTO_GML_FIXTURE suites and never stored in Git.
// Assertions report counts only, so no private values reach test output.
export const corpusGmlPath = process.env.PHOTO_GML_FIXTURE && existsSync(process.env.PHOTO_GML_FIXTURE) ? process.env.PHOTO_GML_FIXTURE : null;

export async function readPhotoCorpus(gmlPath = corpusGmlPath) {
  const folder = path.join(path.dirname(gmlPath), 'Attachments');
  const names = (await readdir(folder)).filter((name) => /\.jpe?g$/i.test(name)).sort();
  assert(names.length, 'The corpus has no JPEG files, so its count assertions would pass without testing anything.');
  const photos = await Promise.all(names.map(async (name) => new File([await readFile(path.join(folder, name))], name, { type: 'image/jpeg' })));
  return { photos, gml: new File([await readFile(gmlPath)], path.basename(gmlPath)) };
}
