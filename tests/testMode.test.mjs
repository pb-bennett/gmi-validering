import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
const {
  isTestModeActivation,
  isTestModeActivatedFromLocation,
} = await import(
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

test('exact URL activation skips the first upload before the React effect can run', () => {
  const run = (search) => {
    let trackingCalls = 0;
    completeSuccessfulUpload({
      testMode: false,
      urlTestMode: isTestModeActivatedFromLocation({ search }),
      hydrated: true,
      deriveTelemetry: () => ({ shouldNotBeSent: true }),
      trackUploadSuccess: () => { trackingCalls += 1; },
    });
    return trackingCalls;
  };

  assert.equal(run('?testmodus=1'), 0);
  assert.equal(run(''), 1);
  for (const search of [
    '?testmodus=0',
    '?testmodus=01',
    '?testmodus=1&testmodus=1',
    '?testmodus=true',
    '?testmodus=%31%31',
    '?testmodus=1=1',
    '?other=value',
  ]) {
    assert.equal(run(search), 1, search);
  }
});

test('Testmodus exposes one developer control only while active', async () => {
  const control = await readFile(new URL('../src/components/TestModeControl.js', import.meta.url), 'utf8');
  const toolbar = await readFile(new URL('../src/components/TabSwitcher.js', import.meta.url), 'utf8');
  const fileUpload = await readFile(new URL('../src/components/FileUpload.js', import.meta.url), 'utf8');
  const page = await readFile(new URL('../src/app/page.js', import.meta.url), 'utf8');
  assert.match(control, /aria-label="Slå av testmodus"/);
  assert.match(control, /Utviklerverkt/);
  assert.match(control, /DevDiagnosticsPanel isOpen=\{developerToolsOpen\}/);
  const diagnostics = await readFile(new URL('../src/components/DevDiagnosticsPanel.js', import.meta.url), 'utf8');
  assert.match(diagnostics, /if \(!isOpen \|\| !stats\) return null/);
  assert.match(diagnostics, /top-full[\s\S]*bg-gray-900/);
  assert.doesNotMatch(diagnostics, /fixed bottom-2 right-2/);
  assert.doesNotMatch(control, />DEV</);
  assert.doesNotMatch(control, /fixed left-4 bottom-4/);
  assert.match(toolbar, /<TestModeControl \/>/);
  assert.match(toolbar, /viewer3DOpen && data/);
  assert.match(control, /export function TestModeActivation\(\)/);
  assert.match(fileUpload, /testMode: isTestModeEnabled\(useStore\.getState\(\)\.settings\)/);
  assert.match(fileUpload, /urlTestMode: isTestModeActivatedFromLocation\(\)/);
  assert.match(page, /<TestModeActivation \/>/);
  assert.doesNotMatch(page, /<TestModeControl \/>/);
  assert.doesNotMatch(page, /DevDiagnosticsPanel/);
});
