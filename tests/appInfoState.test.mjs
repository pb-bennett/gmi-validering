import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APP_INFO_SCHEMA,
  APP_INFO_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  decideAutomaticAppInfo,
  parseAppInfoState,
  readAppInfoState,
  writeAppInfoState,
} from '../src/lib/appInfoState.mjs';

const latestRelease = {
  version: '1.1.0',
  announce: true,
};

const laterRelease = {
  version: '1.2.0',
  announce: true,
};

const makeStorage = (entries = {}) => {
  const values = new Map(Object.entries(entries));
  let writes = 0;
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      writes += 1;
      values.set(key, value);
    },
    get writes() {
      return writes;
    },
    value(key) {
      return values.get(key);
    },
  };
};

const stateJson = (introSeen, lastSeenAnnouncement) =>
  JSON.stringify({
    schema: APP_INFO_SCHEMA,
    introSeen,
    lastSeenAnnouncement,
  });

test('brand-new users open Om and claim the introduction and announcement', () => {
  const storage = makeStorage();
  const decision = decideAutomaticAppInfo({
    storage,
    latestAnnouncedRelease: latestRelease,
  });

  assert.deepEqual(
    { open: decision.open, tab: decision.tab, release: decision.release },
    { open: true, tab: 'about', release: null },
  );
  assert.deepEqual(JSON.parse(storage.value(APP_INFO_STORAGE_KEY)), {
    schema: 1,
    introSeen: true,
    lastSeenAnnouncement: '1.1.0',
  });
  assert.equal(
    decideAutomaticAppInfo({
      storage,
      latestAnnouncedRelease: latestRelease,
    }).open,
    false,
  );
});

test('pre-feature users open Nytt once using only legacy-key existence', () => {
  const storage = makeStorage({ [LEGACY_STORAGE_KEY]: '{not parsed}' });
  const decision = decideAutomaticAppInfo({
    storage,
    latestAnnouncedRelease: latestRelease,
  });

  assert.equal(decision.tab, 'news');
  assert.equal(decision.release, latestRelease);
  assert.equal(
    decideAutomaticAppInfo({
      storage,
      latestAnnouncedRelease: latestRelease,
    }).open,
    false,
  );
});

test('v1.1.0 acknowledgement does not repeat for the unannounced v1.0.2 patch', () => {
  const storage = makeStorage({
    [APP_INFO_STORAGE_KEY]: stateJson(true, '1.1.0'),
  });
  const before = storage.value(APP_INFO_STORAGE_KEY);
  const decision = decideAutomaticAppInfo({
    storage,
    latestAnnouncedRelease: latestRelease,
  });

  assert.equal(decision.open, false);
  assert.equal(storage.writes, 0);
  assert.equal(storage.value(APP_INFO_STORAGE_KEY), before);
  writeAppInfoState(storage, {
    schema: 1,
    introSeen: true,
    lastSeenAnnouncement: '1.1.0',
  });
  assert.equal(storage.value(APP_INFO_STORAGE_KEY), before);
});

test('later announced releases open Nytt once, while unannounced patches do not', () => {
  const storage = makeStorage({
    [APP_INFO_STORAGE_KEY]: stateJson(true, '1.1.0'),
  });
  const decision = decideAutomaticAppInfo({
    storage,
    latestAnnouncedRelease: laterRelease,
  });

  assert.equal(decision.tab, 'news');
  assert.equal(decision.release, laterRelease);
  assert.equal(
    decideAutomaticAppInfo({
      storage,
      latestAnnouncedRelease: laterRelease,
    }).open,
    false,
  );

  const patchStorage = makeStorage({
    [APP_INFO_STORAGE_KEY]: stateJson(true, '1.1.0'),
  });
  assert.equal(
    decideAutomaticAppInfo({
      storage: patchStorage,
      latestAnnouncedRelease: latestRelease,
    }).open,
    false,
  );
});

test('introSeen false is claimed as Om and current announcement is acknowledged', () => {
  const storage = makeStorage({
    [APP_INFO_STORAGE_KEY]: stateJson(false, null),
  });
  const decision = decideAutomaticAppInfo({
    storage,
    latestAnnouncedRelease: latestRelease,
  });

  assert.equal(decision.tab, 'about');
  assert.deepEqual(JSON.parse(storage.value(APP_INFO_STORAGE_KEY)), {
    schema: 1,
    introSeen: true,
    lastSeenAnnouncement: '1.1.0',
  });
});

test('malformed state is treated as absent and replaced safely', () => {
  for (const raw of [
    '{',
    '[]',
     JSON.stringify({ schema: 2, introSeen: true, lastSeenAnnouncement: '1.1.0' }),
     JSON.stringify({ schema: 1, introSeen: 'yes', lastSeenAnnouncement: '1.1.0' }),
    JSON.stringify({ schema: 1, introSeen: true, lastSeenAnnouncement: 'latest' }),
  ]) {
    assert.equal(parseAppInfoState(raw), null);
    const storage = makeStorage({ [APP_INFO_STORAGE_KEY]: raw });
    assert.doesNotThrow(() =>
      decideAutomaticAppInfo({
        storage,
        latestAnnouncedRelease: latestRelease,
      }),
    );
    assert.deepEqual(JSON.parse(storage.value(APP_INFO_STORAGE_KEY)), {
      schema: 1,
      introSeen: true,
    lastSeenAnnouncement: '1.1.0',
    });
  }
});

test('storage access and persistence failures never escape the decision helper', () => {
  const throwingStorage = {
    getItem() {
      throw new Error('denied');
    },
    setItem() {
      throw new Error('denied');
    },
  };
  assert.doesNotThrow(() =>
    decideAutomaticAppInfo({
      storage: throwingStorage,
      latestAnnouncedRelease: latestRelease,
    }),
  );
  assert.doesNotThrow(() =>
    decideAutomaticAppInfo({
      storage: null,
      latestAnnouncedRelease: latestRelease,
    }),
  );
  assert.equal(readAppInfoState(null), null);
  assert.equal(writeAppInfoState(null, {}), false);
  assert.doesNotThrow(() =>
    decideAutomaticAppInfo({
      storage: new Proxy({}, { get: () => { throw new Error('denied'); } }),
      latestAnnouncedRelease: latestRelease,
    }),
  );
});
