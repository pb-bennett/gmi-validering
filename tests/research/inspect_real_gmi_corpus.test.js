const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { inspectCorpus, aggregate, selectCases } = require('../../scripts/research/inspect_real_gmi_corpus');

async function run() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gmi-corpus-inspector-'));
  const fk = path.join(root, 'FK'); const hk = path.join(root, 'HK'); await fs.promises.mkdir(fk); await fs.promises.mkdir(hk);
  const secret = 'PRIVATE_TEXT_7D4E29'; const id = '99887766'; const xy = '123456.7 7654321.0';
  await fs.promises.writeFile(path.join(fk, 'private.gmi'), `[GMIFILE_ASCII]\n[P_]\n_FIELDNAMES Tema;S_FCODE;Merknad\n[+P_]\n:P ${id}\n_FIELDVALUES KUM;KUM;${secret}\n/XYZ\n${xy}\n`, 'latin1');
  await fs.promises.writeFile(path.join(hk, 'bad.gmi'), 'not a GMI', 'latin1');
  try { const rows = await inspectCorpus({fkRoot:fk,hkRoot:hk}); const result = aggregate(rows); assert.deepStrictEqual(result, aggregate(await inspectCorpus({fkRoot:fk,hkRoot:hk}))); assert.equal(result.filesScanned, 2); assert.equal(result.parsed, 1); assert.equal(result.failed, 1); assert.equal(result.scenarioFileCounts.tema_both_agree, 1); assert.equal(result.canonicalHeaderFileCounts.Tema, 1); const serialized = JSON.stringify(result); for (const forbidden of [secret,id,xy,'private.gmi','bad.gmi',root]) assert(!serialized.includes(forbidden)); const local = JSON.stringify(selectCases(rows)); assert(local.includes('private.gmi')); assert(!local.includes(secret)); assert(!local.includes(id)); assert(!local.includes(xy)); } finally { await fs.promises.rm(root,{recursive:true,force:true}); }
}
run().then(() => process.stdout.write('Corpus inspector privacy self-test passed.\n')).catch(() => { process.stderr.write('Corpus inspector privacy self-test failed.\n'); process.exitCode=1; });
