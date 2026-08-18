import assert from 'node:assert/strict';
import test from 'node:test';

import {
  retainKommuneOptions,
} from '../src/lib/stats/kommuneFilterState.mjs';

const options = [
  { kommuneNumber: '0301', areaName: 'Oslo' },
  { kommuneNumber: '4601', areaName: 'Bergen' },
];
const oldStats = {
  summary: { totalUploads: 12 },
  byKommune: [{ kommuneNumber: '0301', count: 12 }],
};

test('preserves the bounded kommune option list independently from filtered stats', () => {
  const allResponse = { ok: true, kommuneOptions: options, ...oldStats };
  const availableKommuner = retainKommuneOptions([], allResponse.kommuneOptions);
  assert.deepEqual(availableKommuner, options);

  const afterFilterChange = { displayedStats: null, availableKommuner };
  assert.equal(afterFilterChange.displayedStats, null);
  assert.deepEqual(afterFilterChange.availableKommuner, options);
  assert.deepEqual(retainKommuneOptions(options, options), options);
  assert.equal(retainKommuneOptions(options, undefined), options);
});
