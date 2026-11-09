import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BUILD_SHORT_SHA_LENGTH, describeBuild } from '../src/lib/buildInfo.mjs';

const sha = 'cfa84ca4f18f1ae57b6e8baba3220c02fe66d418';
let importCount = 0;
// A fresh module instance per call, so each sees the process.env it was imported under.
async function importWithEnv(path, env) {
  const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  try { return await import(`${path}?env=${importCount++}`); }
  finally { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}

test('build identity: short SHA and environment from Vercel metadata', () => {
  assert.equal(BUILD_SHORT_SHA_LENGTH, 7);
  assert.deepEqual({ ...describeBuild({ commitSha: sha, environment: 'production' }) },
    { commitSha: sha, shortSha: 'cfa84ca', environment: 'production', environmentLabel: 'Produksjon' });
  assert.deepEqual({ ...describeBuild({ commitSha: sha, environment: 'preview' }) },
    { commitSha: sha, shortSha: 'cfa84ca', environment: 'preview', environmentLabel: 'Preview' });
  assert.equal(describeBuild({ commitSha: ` ${sha.toUpperCase()} `, environment: 'preview' }).shortSha, 'cfa84ca', 'trimmed and lower-cased');
  // Two deployments of different commits show different values.
  assert.notEqual(describeBuild({ commitSha: sha }).shortSha, describeBuild({ commitSha: '3ec86c0aa' }).shortSha);
});

test('build identity: local fallback without metadata, and nothing but a hex SHA is shown', () => {
  for (const input of [undefined, {}, { commitSha: '', environment: '' }, { environment: 'development' }, { environment: 'toString' }, { environment: 'local' }]) {
    const build = describeBuild(input);
    assert.equal(build.environment, 'local', JSON.stringify(input));
    assert.equal(build.environmentLabel, 'Lokal utvikling');
    assert.equal(build.shortSha, null);
  }
  for (const commitSha of ['abc', 'not-a-sha-value', '<script>', 'g'.repeat(40), 'a'.repeat(41), 42, null]) {
    assert.equal(describeBuild({ commitSha, environment: 'preview' }).shortSha, null, String(commitSha));
  }
  assert.equal(describeBuild({ commitSha: sha, environment: 'development' }).shortSha, 'cfa84ca', '`vercel dev` keeps the SHA but is local');
});

test('next.config inlines only Vercel commit SHA and environment, empty when absent', async () => {
  const vercel = (await importWithEnv('../next.config.mjs', { VERCEL_GIT_COMMIT_SHA: sha, VERCEL_ENV: 'preview' })).default;
  assert.deepEqual(vercel.env, { GMI_BUILD_COMMIT_SHA: sha, GMI_BUILD_ENV: 'preview' });
  const local = (await importWithEnv('../next.config.mjs', { VERCEL_GIT_COMMIT_SHA: undefined, VERCEL_ENV: undefined })).default;
  assert.deepEqual(local.env, { GMI_BUILD_COMMIT_SHA: '', GMI_BUILD_ENV: '' });
  assert.equal(local.reactCompiler, true, 'existing config kept');
});

test('BUILD_INFO reads the inlined values; the dialog header shows it without a hardcoded SHA or a request', async () => {
  const { BUILD_INFO: production } = await importWithEnv('../src/lib/buildInfo.mjs', { GMI_BUILD_COMMIT_SHA: sha, GMI_BUILD_ENV: 'production' });
  assert.equal(production.shortSha, 'cfa84ca');
  assert.equal(production.environmentLabel, 'Produksjon');
  const { BUILD_INFO: local } = await importWithEnv('../src/lib/buildInfo.mjs', { GMI_BUILD_COMMIT_SHA: undefined, GMI_BUILD_ENV: undefined });
  assert.equal(local.environmentLabel, 'Lokal utvikling');

  const [moduleSource, modalSource] = await Promise.all(['src/lib/buildInfo.mjs', 'src/components/AppInfoModal.js']
    .map((path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')));
  // Literal references are what Next.js replaces in the client bundle.
  assert.match(moduleSource, /process\.env\.GMI_BUILD_COMMIT_SHA/);
  assert.match(moduleSource, /process\.env\.GMI_BUILD_ENV/);
  assert.doesNotMatch(moduleSource + modalSource, /\bfetch\(|[0-9a-f]{7,40}(?![\w-])/i);
  const header = modalSource.slice(modalSource.indexOf('<header'), modalSource.indexOf('</header>'));
  assert.match(header, /v\{CURRENT_APP_VERSION\}<\/span>\s*<BuildIdentity \/>/);
  assert.match(modalSource, /<dt>Versjon:<\/dt>[\s\S]*?\{build\.shortSha\}/);
  assert.match(modalSource, /<dt>Miljø:<\/dt>[\s\S]*?\{build\.environmentLabel\}/);
});
