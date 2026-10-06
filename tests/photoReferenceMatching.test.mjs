import assert from 'node:assert/strict';
import test from 'node:test';
import { matchPhotoReferences, photoReferenceKey } from '../src/lib/photos/photoReferenceMatching.mjs';
const photo = (id, originalFilename, sourceRelativePath = null) => ({ id, originalFilename, sourceRelativePath });
const row = (id, fotolink, status = 'viable') => ({ id, raw: { fotolink }, status });
const match = (links, photos) => matchPhotoReferences(links.map((link, index) => row(`r${index}`, link)), photos);
test('Windows separators, literal Norwegian spaces and NFC match without modifying originals', () => {
  const photos = [photo('p', 'Grøft æ.JPG')];
  const result = match(['Attachments\\Grøft æ.JPG'], photos);
  assert.equal(result.summary.matchedCount, 1);
  assert.equal(result.matches[0].method, 'exact-basename');
  assert.equal(photos[0].originalFilename, 'Grøft æ.JPG');
  assert.equal(match(['Grøft æ.JPG'.normalize('NFD')], photos).summary.matchedCount, 1);
  assert.equal(match(['café.jpg'.normalize('NFD')], [photo('p', 'café.jpg')]).summary.matchedCount, 1);
});
test('case fallback is deterministic and only unique names qualify', () => {
  assert.equal(match(['PHOTO.jpg'], [photo('p', 'photo.JPG')]).matches[0].method, 'case-insensitive-basename');
  assert.equal(match(['Photo.jpg'], [photo('p', 'Photo.jpg'), photo('q', 'photo.jpg')]).summary.ambiguousCount, 1);
  assert.equal(match(['rå.jpg'], [photo('p', 'rå.jpg'), photo('q', 'rå.jpg'.normalize('NFD'))]).summary.ambiguousCount, 1);
});
test('real relative paths distinguish duplicate basenames and collection folder suffixes', () => {
  const photos = [photo('p', 'same.jpg', 'collection/Attachments/a/same.jpg'), photo('q', 'same.jpg', 'collection/Attachments/b/same.jpg')];
  assert.equal(match(['Attachments/a/same.jpg'], photos).matches[0].photoId, 'p');
  assert.equal(match(['same.jpg'], photos).summary.ambiguousCount, 1);
  assert.equal(match(['attachments/A/same.JPG'], photos).matches[0].photoId, 'p');
  const collision = [photo('p', 'A.jpg', 'Attachments/A.jpg'), photo('q', 'a.jpg', 'Attachments/a.jpg')];
  assert.equal(match(['Attachments/A.jpg'], collision).summary.ambiguousCount, 1);
});
test('duplicate GML references and competing path/basename edges never greedily assign', () => {
  const photos = [photo('p', 'a.jpg', 'Attachments/a.jpg')];
  assert.equal(match(['a.jpg', 'Attachments\\a.jpg'], photos).summary.ambiguousCount, 2);
  assert.equal(match(['a.jpg', 'a.jpg'], photos).summary.ambiguousCount, 2);
});
test('unmatched photos remain explicit and invalid geometry differs from unmatched reference', () => {
  const result = matchPhotoReferences([row('r', 'a.jpg', 'invalid'), row('missing', 'b.jpg')], [photo('a', 'a.jpg'), photo('c', 'c.jpg')]);
  assert.equal(result.summary.matchedCount, 1);
  assert.equal(result.summary.viablePlacementCount, 0);
  assert.deepEqual(result.unmatchedPhotoIds, ['c']);
});
test('no traversal, remote fetch, fuzzy name, or percent/fragment guessing', () => {
  const photos = [photo('p', 'ø #1?.jpg'), photo('q', 'a.jpg')];
  assert.equal(match(['../a.jpg', 'https://other/a.jpg', 'prefix-a.jpg'], photos).summary.matchedCount, 0);
  assert.equal(match(['ø #1?.jpg'], photos).matches[0].photoId, 'p');
  assert.equal(match(['Attachments/%C3%B8%20%231%3F.jpg'], photos).summary.matchedCount, 0);
  assert.equal(match(['file:///folder/%C3%B8%20%231%3F.jpg'], photos).summary.matchedCount, 1);
  assert.equal(match(['file:///folder/a%2F.jpg'], photos).matches[0].reason, 'invalid-uri-reference');
  assert.equal(photoReferenceKey('C:\\folder\\a.jpg').basename, 'a.jpg');
});
