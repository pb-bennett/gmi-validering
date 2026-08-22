const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  collectGmiHeaderEvidence,
} = require('../../scripts/research/collect_gmi_header_evidence');

async function run() {
  const temporaryRoot = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'gmi-header-privacy-')
  );
  const syntheticFilename = 'synthetic_private_delivery.gmi';
  const malformedFilename = 'synthetic_private_malformed.gmi';
  const secretValue = 'DO_NOT_LEAK_7D4E29';
  const fakeObjectId = '987654321';
  const fakeCoordinateX = '123456.789';
  const fakeCoordinateY = '9876543.210';

  const syntheticGmi = `[GMIFILE_ASCII]
_VERSION 2
[L_]
_FIELDNAMES S_FCODE;SDR;Ringstivhet;.L_TEMA;SecretHeader
[P_]
_FIELDNAMES S_FCODE;.P_TEMA;Høydereferanse;Bredde
[+L_]
:L ${fakeObjectId}
_FIELDVALUES SP;11.0;SN8;${secretValue}
/XYZ
${fakeCoordinateX} ${fakeCoordinateY} 42.42
`;

  try {
    await fs.promises.writeFile(
      path.join(temporaryRoot, syntheticFilename),
      syntheticGmi,
      'utf8'
    );
    await fs.promises.writeFile(
      path.join(temporaryRoot, malformedFilename),
      'not a valid GMI file',
      'utf8'
    );

    const first = await collectGmiHeaderEvidence(temporaryRoot, {
      corpusLabel: 'synthetic-privacy-corpus',
      generatedAt: '2026-08-21',
    });
    const second = await collectGmiHeaderEvidence(temporaryRoot, {
      corpusLabel: 'synthetic-privacy-corpus',
      generatedAt: '2026-08-21',
    });

    assert.deepStrictEqual(first, second);
    assert.strictEqual(first.corpus.filesScanned, 2);
    assert.strictEqual(first.corpus.filesParsed, 1);
    assert.strictEqual(first.corpus.filesFailed, 1);
    assert(first.headers.some((header) => header.literal === 'S_FCODE'));
    assert(first.headers.some((header) => header.literal === 'SDR'));
    assert(first.headers.some((header) => header.literal === 'Ringstivhet'));
    assert.deepStrictEqual(
      first.temaEvidence.candidates.find(
        (candidate) => candidate.candidate === '.P_TEMA'
      ).observedContexts,
      ['point']
    );
    assert.deepStrictEqual(
      first.temaEvidence.candidates.find(
        (candidate) => candidate.candidate === '.L_TEMA'
      ).observedContexts,
      ['line']
    );

    const serialized = JSON.stringify(first);
    for (const forbidden of [
      secretValue,
      fakeObjectId,
      fakeCoordinateX,
      fakeCoordinateY,
      syntheticFilename,
      malformedFilename,
      temporaryRoot,
    ]) {
      assert(!serialized.includes(forbidden));
    }

    assert.strictEqual(first.privacyChecks.filenamesRetained, false);
    assert.strictEqual(first.privacyChecks.pathsRetained, false);
    assert.strictEqual(first.privacyChecks.attributeValuesRetained, false);
    assert.strictEqual(first.privacyChecks.coordinatesRetained, false);
    assert.strictEqual(first.privacyChecks.objectIdsRetained, false);
    assert.strictEqual(first.privacyChecks.perFileRecordsRetained, false);
  } finally {
    await fs.promises.rm(temporaryRoot, { recursive: true, force: true });
  }
}

run()
  .then(() => {
    process.stdout.write('Privacy self-test passed.\n');
  })
  .catch(() => {
    process.stderr.write('Privacy self-test failed.\n');
    process.exitCode = 1;
  });
