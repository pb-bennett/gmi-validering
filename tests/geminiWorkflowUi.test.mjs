import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { getGeminiUiError } from '../src/lib/gemini-wfs/geminiWorkflowUi.mjs';

test('authentication and permission are distinct Norwegian messages', () => {
  assert.equal(getGeminiUiError({ code: 'authentication_failed' }),
    'Gemini WFS-tjenesten avviste autentiseringen. Årsaken er ikke avklart.');
  assert.match(getGeminiUiError({ code: 'permission_denied' }), /ikke tilgang/);
  assert.match(getGeminiUiError({ code: 'credentials_unavailable' }), /på nytt/);
});

test('local origin rejection is a fixed app-security message, distinct from provider permission and authentication', () => {
  const detail = randomUUID();
  const message = getGeminiUiError({ code: 'origin_rejected', message: detail, body: detail });
  assert.match(message, /appens sikkerhetskontroll/);
  assert(!message.includes(detail));
  assert.notEqual(message, getGeminiUiError({ code: 'permission_denied' }));
  assert.notEqual(message, getGeminiUiError({ code: 'authentication_failed' }));
});
test('safe source/extent messages and bounded numeric dimension details', () => {
  assert.match(getGeminiUiError({ code: 'no_source_geometry' }), /ingen geometri/);
  assert.match(getGeminiUiError({ code: 'unsupported_crs' }), /Koordinatsystemet/);
  assert.match(getGeminiUiError({ code: 'extent_too_large', dimensions: { width: 3000.1, height: 4000 } }), /3001 × 4000 m/);
  assert.doesNotMatch(getGeminiUiError({ code: 'extent_too_large', dimensions: { width: '3000', height: 4000 } }), /omtrent/);
  assert.doesNotMatch(getGeminiUiError({ code: 'extent_too_large', dimensions: { width: Infinity, height: 4000 } }), /Infinity/);
});
test('transport/encoding/parser/display/cancel error mappings are fixed and never expose supplied detail', () => {
  const secret = randomUUID();
  for (const code of ['timeout', 'proxy_request_failed', 'upstream_failure', 'response_too_large', 'unsupported_response_encoding',
    'gml_parser_error', 'display_projection_error', 'request_aborted', 'provider_rate_limited', 'unsupported_upstream_mime', secret]) {
    const text = getGeminiUiError({ code, message: secret, stack: secret, parserCode: secret, body: secret });
    assert.equal(typeof text, 'string'); assert(!text.includes(secret));
  }
  assert.match(getGeminiUiError({ code: 'gml_parser_error' }), /kunne ikke leses/);
  assert.match(getGeminiUiError({ code: 'display_projection_error' }), /kartet/);
  assert.match(getGeminiUiError({ code: 'request_aborted' }), /avbrutt/);
});
test('Home owns conditional native modal, map connection entry, and callback path from the card', async () => {
  const read = (file) => readFile(new URL(file, import.meta.url), 'utf8');
  const [home, sidebar, manager, card, modal, entry] = await Promise.all([
    read('../src/app/page.js'), read('../src/components/Sidebar.js'), read('../src/components/LayerManager.js'),
    read('../src/components/gemini-wfs/GeminiReferenceCard.js'), read('../src/components/gemini-wfs/GeminiConnectionModal.js'),
    read('../src/components/gemini-wfs/GeminiConnectionButton.js'),
  ]);
  assert.match(home, /geminiDialog && <GeminiConnectionModal/); assert.match(home, /<GeminiConnectionButton onOpen=/);
  assert.match(sidebar, /onOpenGemini=\{onOpenGemini\}/); assert.match(manager, /onOpenConnection=\{onOpenGemini\}/);
  assert.match(modal, /method="post" onSubmit=\{submit\}/); assert.match(modal, /<dialog/);
  assert.match(modal, /dialog.showModal\(\)/); assert.match(modal, /opener.focus\(\)/);
  for (const [id, name, type, autocomplete] of [['gemini-va-username', 'username', 'text', 'username'], ['gemini-va-password', 'password', 'password', 'current-password']]) {
    assert(modal.includes(`id="${id}" name="${name}" type="${type}" autoComplete="${autocomplete}"`));
  }
  assert.match(modal, /new FormData\(event.currentTarget\)/); assert.match(modal, /geminiSession.setCredentials\(/);
  assert.doesNotMatch(modal, /gemini-va-source|selectSource/); assert.match(modal, /geminiSession.fetch\(\)/);
  assert.match(card, /geminiSession.refresh\(\)/);
  for (const source of [modal, card, entry]) {
    assert.doesNotMatch(source, /Gemini VA/);
    assert.match(source, /Gemini WFS/);
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|console\.|Authorization|fetch\(['"]|parseGeminiGml|normalizeFeature|faerder\.geminisuite/);
  }
  assert.doesNotMatch(modal, /useState\(['"](?:username|password)/);
  assert.doesNotMatch(entry, /\.fetch\(|\.refresh\(/);
});
