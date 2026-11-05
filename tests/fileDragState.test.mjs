import assert from 'node:assert/strict';
import test from 'node:test';
import { createFileDragTracker, hasFileDrag, surveyFileDragAccepted, surveyFileDropAccepted } from '../src/lib/fileDragState.mjs';

function trackerFixture() {
  const changes = [];
  let timer = null;
  const tracker = createFileDragTracker({ onChange: (active) => changes.push(active), idleMs: 1000,
    schedule: (callback) => { timer = callback; return callback; }, cancel: () => { timer = null; } });
  return { tracker, changes, expire: () => timer?.() };
}

test('only drags that carry files count; text selection and internal column drags do not', () => {
  assert.equal(hasFileDrag({ dataTransfer: { types: ['Files'] } }), true);
  assert.equal(hasFileDrag({ dataTransfer: { types: ['text/plain', 'text/html'] } }), false);
  assert.equal(hasFileDrag({ dataTransfer: { types: [] } }), false);
  assert.equal(hasFileDrag({}), false);
});

test('survey formats, which have no MIME type, stay accepted; only certain non-survey files are refused', () => {
  const items = (...types) => ({ items: types.map((type) => ({ kind: 'file', type })) });
  assert.equal(surveyFileDragAccepted(items('')), true, '.gmi, .sos and .kof report an empty type');
  assert.equal(surveyFileDragAccepted(items('text/plain')), true, 'an associated text type must not block a survey file');
  assert.equal(surveyFileDragAccepted(items('image/jpeg')), false);
  assert.equal(surveyFileDragAccepted(items('image/jpeg', 'video/mp4', 'application/pdf')), false);
  assert.equal(surveyFileDragAccepted(items('image/jpeg', '')), false, 'a later survey file cannot make an image-first drag accepted');
  assert.equal(surveyFileDragAccepted(items('', 'image/jpeg')), true, 'a survey-first drag stays accepted');
  assert.equal(surveyFileDragAccepted(items('application/pdf', 'text/plain')), false);
  assert.equal(surveyFileDragAccepted(items('text/plain', 'application/pdf')), true);
  assert.equal(surveyFileDragAccepted({ items: [] }), true, 'unknown contents are not refused');
  assert.equal(surveyFileDragAccepted({ items: [{ kind: 'string', type: 'text/plain' }] }), true);
});

test('drop validation uses only the first filename before any import state can change', () => {
  const files = (...names) => ({ files: names.map((name) => ({ name, type: '' })) });
  for (const name of ['survey.gmi', 'survey.SOS', 'survey.sosi', 'survey.KOF', 'survey.txt']) {
    assert.equal(surveyFileDropAccepted(files(name, 'photo.jpg')), true, name);
    assert.equal(surveyFileDropAccepted(files('photo.jpg', name)), false, name);
  }
  for (const name of ['photo.jpg', 'no-mime.png', 'archive.zip', 'document.pdf', 'unknown', 'survey.gmi.exe']) {
    assert.equal(surveyFileDropAccepted(files(name, 'survey.gmi')), false, name);
  }
  assert.equal(surveyFileDropAccepted({ files: [] }), false);
  assert.equal(surveyFileDropAccepted({}), false);
});

test('nested dragenter/dragleave pairs never flicker; only the final leave ends the drag', () => {
  const { tracker, changes } = trackerFixture();
  tracker.enter(); tracker.enter(); tracker.leave(); tracker.enter(); tracker.leave();
  assert.deepEqual(changes, [true]);
  tracker.leave();
  assert.deepEqual(changes, [true, false]);
  tracker.leave();
  assert.deepEqual(changes, [true, false], 'a stray leave changes nothing');
});

test('drop and cancellation clear the drag; a later drag starts from a clean depth', () => {
  const { tracker, changes } = trackerFixture();
  tracker.enter(); tracker.enter(); tracker.reset();
  assert.deepEqual(changes, [true, false]);
  tracker.enter(); tracker.leave();
  assert.deepEqual(changes, [true, false, true, false]);
});

test('a lost dragleave cannot leave the drag active, while dragover keeps a real drag alive', () => {
  const { tracker, changes, expire } = trackerFixture();
  tracker.enter(); tracker.over(); tracker.over();
  assert.deepEqual(changes, [true]);
  expire();
  assert.deepEqual(changes, [true, false]);
  tracker.over();
  assert.deepEqual(changes, [true, false, true], 'a drag that is still moving recovers');
  tracker.leave();
  assert.deepEqual(changes, [true, false, true, false]);
});
