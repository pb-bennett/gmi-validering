import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createPhotoSession } from '../src/lib/photos/photoSession.mjs';
import { gmiPointPosition, parseGmiPhotoSource } from '../src/lib/photos/gmiPhotoSource.mjs';
import { photoSourcePositionChoices, photoSourceProposalKinds, selectedPhotoSourcePositions } from '../src/lib/photos/photoPositioning.mjs';

async function inventory(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await inventory(filename));
    else files.push(filename);
  }
  return files.sort();
}
const hash = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');

for (const [label, directory] of [['corpus', process.env.GMI_PHOTO_CORPUS], ['Ekenesstokken', process.env.GMI_PHOTO_EKENES]]) {
  test(`real ${label}: repeated point occurrences reconcile exactly with source evidence; all file hashes preserved`,
    { skip: !directory, timeout: 180000 }, async () => {
      const files = await inventory(directory), before = {};
      for (const file of files) before[file] = await hash(file);
      if (process.env.GMI_PLACEMENT_HASH_DIR) await writeFile(path.join(process.env.GMI_PLACEMENT_HASH_DIR, `${label}-before.json`), JSON.stringify(before, null, 2));
      const findings = { sources: 0, assets: 0, pointPlacements: 0, automaticallyProposed: 0, sourceActions: [], repeatedAssets: 0, repeatedPointAssets: 0,
        repeatedPointPlacements: 0, lineOnlyRepeats: 0, missingCrsOrGeometry: 0, unmatchedReferences: 0, ambiguousReferences: 0, invalidReferences: 0, repeated: [] };
      for (const filename of files.filter((file) => /\.gmi$/i.test(file))) {
        const sourceFile = new File([await readFile(filename)], path.basename(filename));
        const parsed = await parseGmiPhotoSource(sourceFile);
        const attachmentRoot = path.dirname(filename) + path.sep;
        const deliveredPhotos = files.filter((file) => file.startsWith(attachmentRoot) && /\.(jpe?g|png)$/i.test(file));
        let next = 0;
        const session = createPhotoSession({ createId: () => `fixture-${++next}`,
          // No image decode or EXIF work is needed for source/occurrence reconciliation.
          // Matching uses the delivered identities, not copies of fixture image bytes.
          yieldJob: () => new Promise(() => {}), sourceAdapters: { gmi: async () => parsed } });
        const assets = deliveredPhotos.map((file) => {
          const asset = new File(['identity-only acceptance asset'], path.basename(file));
          Object.defineProperty(asset, 'webkitRelativePath', { value: path.relative(path.dirname(filename), file) });
          return asset;
        });
        const imported = session.importFiles(assets).acceptedIds, layer = session.createLayer();
        assert(layer, filename);
        const ticket = session.beginSourceWorkflow(layer.id);
        assert(await session.stageLayerSource(layer.id, sourceFile, 'gmi'));
        const review = session.getSnapshot().sourceReviews[layer.id];
        findings.unmatchedReferences += review.associationLedger.summary.unmatchedCount;
        findings.ambiguousReferences += review.associationLedger.summary.ambiguousCount;
        findings.invalidReferences += review.associationLedger.summary.invalidCount;
        const expected = new Map();
        for (const assetId of imported) {
          const edges = (review.associationLedger.reverseIndexes.byPhotoId[assetId] || []).map((id) => review.associationLedger.associationsById[id]);
          const points = edges.filter((edge) => parsed.objectsByKey[edge.objectKey].geometryScope === 'point');
          expected.set(assetId, points);
          for (const edge of points) if (gmiPointPosition(parsed, parsed.objectsByKey[edge.objectKey]).status !== 'viable') findings.missingCrsOrGeometry++;
          if (edges.length > 1) {
            findings.repeatedAssets++;
            if (points.length > 1) { findings.repeatedPointAssets++; findings.repeatedPointPlacements += points.length; }
            if (!points.length) findings.lineOnlyRepeats++;
            findings.repeated.push({ source: path.basename(filename), filename: session.getPhoto(assetId).originalFilename,
              pointCount: points.length, lineCount: edges.length - points.length,
              objects: edges.map((edge) => ({ objectKey: edge.objectKey, guid: parsed.objectsByKey[edge.objectKey].guid })) });
          }
        }
        assert(session.saveSourceWorkflowSource(ticket, review).ok);
        const photos = session.getLayerPhotos(layer.id);
        assert(photos.every((photo) => photo.spatial.current === null));
        for (const [assetId, points] of expected) {
          const occurrences = photos.filter((photo) => photo.assetId === assetId);
          assert.equal(occurrences.length, Math.max(1, points.length));
          assert.deepEqual(occurrences.flatMap((photo) => photo.occurrence ? [photo.occurrence.objectKey] : []).sort(), points.map((edge) => edge.objectKey).sort());
          if (points.length > 1) assert(occurrences.every((photo) => photo.repeatGroup.repeated));
          for (const photo of occurrences) assert.strictEqual(session.getFile(photo.id), assets[imported.indexOf(assetId)]);
        }
        const plan = session.reviewSourceWorkflowPositions(ticket);
        const requests = plan.rows.flatMap((row) => row.options.filter((option) => option.kind === 'gmi').map((candidate) => ({ photoId: row.photoId, candidateId: candidate.id })));
        const proposed = selectedPhotoSourcePositions(plan, photoSourcePositionChoices(plan));
        assert.equal(proposed.length, requests.length);
        assert(proposed.every((row) => row.proposal.kind === 'gmi'));
        const sourceActions = photoSourceProposalKinds(plan.rows);
        assert.deepEqual(sourceActions, requests.length ? ['gmi'] : []);
        findings.automaticallyProposed += proposed.length;
        findings.sourceActions.push({ source: path.basename(filename), kinds: sourceActions });
        const pointCount = [...expected.values()].reduce((sum, points) => sum + points.length, 0);
        assert.equal(requests.length, pointCount - [...expected.values()].flat().filter((edge) => gmiPointPosition(parsed, parsed.objectsByKey[edge.objectKey]).status !== 'viable').length);
        if (requests.length) assert(session.applySourceWorkflowPositions(ticket, plan, requests).ok);
        const ids = session.getLayer(layer.id).photoIds;
        session.recheckLayerSource(layer.id, review.source.id);
        assert(session.saveSourceWorkflowSource(ticket, session.getSnapshot().sourceReviews[layer.id]).ok);
        assert.strictEqual(session.getLayer(layer.id).photoIds, ids);
        findings.sources++; findings.assets += imported.length; findings.pointPlacements += pointCount;
        session.clear();
      }
      assert.deepEqual(await inventory(directory), files);
      for (const filename of files) assert.equal(await hash(filename), before[filename], filename);
      if (process.env.GMI_PLACEMENT_HASH_DIR) {
        await writeFile(path.join(process.env.GMI_PLACEMENT_HASH_DIR, `${label}-after.json`), JSON.stringify(before, null, 2));
        await writeFile(path.join(process.env.GMI_PLACEMENT_HASH_DIR, `${label}-findings.json`), JSON.stringify(findings, null, 2));
      }
      console.log(JSON.stringify({ label, ...findings, unchangedFileHashes: files.length }));
    });
}
