import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parseGmiPhotoSource, reviewGmiPhotoSource } from '../src/lib/photos/gmiPhotoSource.mjs';
import { sevenGuid, sharedFilename } from './helpers/gmiPhotoFixtures.mjs';

const corpus = process.env.GMI_PHOTO_CORPUS;
async function inventory(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await inventory(filename));
    else files.push(filename);
  }
  return files.sort();
}
const hash = async (filename) => createHash('sha256').update(await readFile(filename)).digest('hex');

test('private real corpus: production adapter/ledger, all 302 valid references, seven edges, shared photo and revisions; every file hash unchanged',
  { skip: !corpus, timeout: 180000 }, async () => {
    const files = await inventory(corpus), before = new Map();
    for (const filename of files) before.set(filename, await hash(filename));
    const sources = [], guids = new Map(), totals = { objects: 0, references: 0, matched: 0, invalid: 0, unmatched: 0, ambiguous: 0 }, methods = {};
    for (const filename of files.filter((file) => /\.gmi$/i.test(file))) {
      const parsed = await parseGmiPhotoSource(new File([await readFile(filename)], path.basename(filename)));
      assert.equal(parsed.fingerprint, `sha256:${before.get(filename)}`);
      const source = { ...parsed, id: filename, filename: path.basename(filename) };
      const ownerFolder = path.join(path.dirname(filename), 'Attachments');
      const photos = files.filter((file) => file.startsWith(ownerFolder + path.sep) && /\.jpe?g$/i.test(file))
        .map((file) => ({ id: file, originalFilename: path.basename(file), sourceRelativePath: path.relative(path.dirname(filename), file) }));
      const ledger = reviewGmiPhotoSource(source, photos);
      sources.push({ source, ledger });
      totals.objects += ledger.summary.objectCount; totals.references += ledger.summary.referenceCount;
      totals.matched += ledger.summary.matchedReferenceCount; totals.invalid += ledger.summary.invalidCount;
      totals.unmatched += ledger.summary.unmatchedCount; totals.ambiguous += ledger.summary.ambiguousCount;
      for (const row of ledger.resolutions.filter((row) => row.status === 'confident')) methods[row.method] = (methods[row.method] || 0) + 1;
      for (const object of Object.values(source.objectsByKey)) {
        if (!guids.has(object.guid)) guids.set(object.guid, []);
        guids.get(object.guid).push(object);
      }
    }
    assert.equal(sources.length, 12);
    assert.deepEqual(totals, { objects: 1386, references: 303, matched: 302, invalid: 1, unmatched: 0, ambiguous: 0 });
    assert.deepEqual(methods, { 'exact-relative-path': 271, 'exact-basename': 31 });
    const seven = sources.filter(({ source }) => source.objectsByKey[`guid:${sevenGuid}`]);
    assert.equal(seven.length, 2);
    for (const { source, ledger } of seven) {
      assert.equal(ledger.reverseIndexes.byObjectKey[`guid:${sevenGuid}`].length, 7);
      assert.equal(source.objectsByKey[`guid:${sevenGuid}`].sourceIndex, 18);
      assert.equal(source.objectsByKey[`guid:${sevenGuid}`].parserId, 257);
    }
    assert.notEqual(seven[0].source.fingerprint, seven[1].source.fingerprint);
    const shared = sources.find(({ source }) => source.filename.includes('Lerkeveien'));
    const sharedRows = shared.source.references.filter((ref) => ref.filename === sharedFilename);
    assert.equal(sharedRows.length, 2);
    const photoId = shared.ledger.reverseIndexes.byReferenceId[sharedRows[0].id].photoId;
    assert.equal(shared.ledger.reverseIndexes.byPhotoId[photoId].length, 2);
    const repeated = [...guids.values()].filter((group) => group.length > 1);
    assert.equal(repeated.length, 95);
    assert.equal(repeated.filter((group) => new Set(group.map((object) => JSON.stringify(object.rawGeometry))).size > 1).length, 2);
    // All imported copies form one deliberately flattened owner layer for this
    // negative probe. Equal hash never suppresses its imported-asset ambiguity.
    const allPhotos = files.filter((file) => /\.jpe?g$/i.test(file)).map((file) => ({ id: file, originalFilename: path.basename(file) }));
    const collisionLedger = reviewGmiPhotoSource(seven[1].source, allPhotos);
    assert(collisionLedger.summary.ambiguousCount > 0);
    assert.deepEqual(await inventory(corpus), files);
    for (const filename of files) assert.equal(await hash(filename), before.get(filename), filename);
    console.log(JSON.stringify({ corpusAcceptance: totals, sources: sources.length, methods, sevenImageSources: 2,
      sharedPhotoObjects: 2, repeatedGuidGroups: repeated.length, changedGeometryGroups: 2,
      flattenedAmbiguousReferences: collisionLedger.summary.ambiguousCount, unchangedFileHashes: files.length }));
  });
