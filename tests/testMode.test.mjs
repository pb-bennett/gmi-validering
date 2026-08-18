import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('./esmJsLoader.mjs', import.meta.url);

const { default: ssrStore } = await import(
  '../src/lib/store.js?test-mode-ssr'
);

const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};
globalThis.window = { localStorage: storage };
globalThis.localStorage = storage;

const { default: useStore } = await import(
  '../src/lib/store.js?test-mode-persistence'
);
const {
  completeSuccessfulUpload,
  isTrackingAllowed,
} = await import('../src/lib/telemetry/uploadTelemetry.mjs');
const { isTestModeActivation } = await import(
  '../src/lib/testModeActivation.mjs'
);

test('store initialization is safe without window or localStorage', () => {
  assert.equal(ssrStore.getState().settings.testMode, false);
  assert.equal(typeof ssrStore.getState().hydrated, 'boolean');
});

test('test mode is off by default and its on/off setting is persisted locally', () => {
  assert.equal(useStore.getState().settings.testMode, false);
  assert.equal(useStore.getState().hydrated, true);

  useStore.getState().updateSettings({ testMode: true });
  const enabled = JSON.parse(values.get('gmi-validator-storage'));
  assert.equal(enabled.state.settings.testMode, true);

  useStore.getState().updateSettings({ testMode: false });
  const disabled = JSON.parse(values.get('gmi-validator-storage'));
  assert.equal(disabled.state.settings.testMode, false);
});

test('developer activation accepts only the exact single testmodus=1 value', () => {
  assert.equal(isTestModeActivation(new URLSearchParams('testmodus=1')), true);
  assert.equal(isTestModeActivation(new URLSearchParams('testmodus=01')), false);
  assert.equal(isTestModeActivation(new URLSearchParams('testmodus=true')), false);
  assert.equal(isTestModeActivation(new URLSearchParams('testmodus=1&testmodus=1')), false);
});

test('tracking fails closed around persisted Testmodus hydration', () => {
  const run = ({ testMode, hydrated }) => {
    let trackingCalls = 0;
    let completionCalls = 0;
    completeSuccessfulUpload({
      testMode,
      hydrated,
      deriveTelemetry: () => ({ shouldNotBeSent: true }),
      trackUploadSuccess: () => { trackingCalls += 1; },
      onComplete: () => { completionCalls += 1; },
    });
    return { trackingCalls, completionCalls };
  };

  assert.deepEqual(run({ testMode: true, hydrated: false }), {
    trackingCalls: 0,
    completionCalls: 1,
  });
  assert.deepEqual(run({ testMode: true, hydrated: true }), {
    trackingCalls: 0,
    completionCalls: 1,
  });
  assert.deepEqual(run({ testMode: false, hydrated: true }), {
    trackingCalls: 1,
    completionCalls: 1,
  });
  assert.deepEqual(run({ testMode: false, hydrated: undefined }), {
    trackingCalls: 0,
    completionCalls: 1,
  });
  assert.equal(isTrackingAllowed({ hydrated: false, testMode: false }), false);
  assert.equal(isTrackingAllowed({ hydrated: true, testMode: false }), true);
});
