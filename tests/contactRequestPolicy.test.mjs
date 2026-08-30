import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTACT_MAX_BODY_BYTES,
  CONTACT_MAX_EMAIL_LENGTH,
  CONTACT_MAX_MESSAGE_CODE_POINTS,
  parseContactRequest,
  validateContactHeaders,
  validateContactRequest,
} from '../src/lib/contact/contactRequestPolicy.mjs';

const REQUEST_ORIGIN = 'https://app.example.test';
const validRequest = {
  category: 'bug',
  message: 'Det ser ut som en feil.',
  email: 'Bruker@EXAMPLE.NO',
  website: '',
};

const assertInvalid = (body) => {
  assert.throws(
    () => validateContactRequest(body),
    { name: 'ContactRequestPolicyError', status: 400, code: 'invalid_request' },
  );
};

test('accepts all categories and maps them to Norwegian labels', () => {
  for (const [category, categoryLabel] of [
    ['bug', 'Feil'],
    ['suggestion', 'Forslag'],
    ['comment', 'Kommentar'],
    ['other', 'Annet'],
  ]) {
    assert.deepEqual(
      validateContactRequest({ category, message: 'Hei' }),
      { category, categoryLabel, message: 'Hei', name: null, email: null, honeypot: false },
    );
  }
});

test('rejects category variants, free text, and missing or blank messages', () => {
  for (const category of ['Bug', 'BUG', 'feedback', '', null, 1]) {
    assertInvalid({ category, message: 'Hei' });
  }
  for (const message of [undefined, '', '   ', '\n\t']) {
    assertInvalid({ category: 'bug', message });
  }
});

test('normalises message line endings and NFC without over-sanitising Norwegian text', () => {
  const result = validateContactRequest({
    category: 'comment',
    message: '  På kafé\r\nmed kaffe\ruten mellomrom  ',
  });
  assert.equal(result.message, 'På kafé\nmed kaffe\nuten mellomrom');

  assert.equal(
    validateContactRequest({ category: 'bug', message: 'e\u0301' }).message,
    'é',
  );
});

test('enforces message Unicode code-point boundaries', () => {
  for (const length of [1, CONTACT_MAX_MESSAGE_CODE_POINTS]) {
    assert.equal(
      [...validateContactRequest({ category: 'bug', message: 'a'.repeat(length) }).message].length,
      length,
    );
  }
  for (const length of [0, CONTACT_MAX_MESSAGE_CODE_POINTS + 1]) {
    assertInvalid({ category: 'bug', message: 'a'.repeat(length) });
  }
});

test('rejects forbidden controls, bidi controls, and unpaired surrogates', () => {
  for (const character of [
    '\u0000',
    '\u0008',
    '\u000b',
    '\u000c',
    '\u001f',
    '\u007f',
    '\u0080',
    '\u009f',
    '\u202a',
    '\u202e',
    '\u2066',
    '\u2069',
    '\ud800',
    '\udfff',
  ]) {
    assertInvalid({ category: 'bug', message: `Hei${character}` });
  }
  assert.equal(
    validateContactRequest({ category: 'bug', message: 'Linje 1\n\tLinje 2' }).message,
    'Linje 1\n\tLinje 2',
  );
});

test('accepts omitted, empty, and pragmatic ASCII email addresses', () => {
  for (const email of [undefined, '']) {
    assert.equal(
      validateContactRequest({ category: 'bug', message: 'Hei', ...(email === undefined ? {} : { email }) }).email,
      null,
    );
  }
  assert.equal(
    validateContactRequest({ category: 'bug', message: 'Hei', email: '  User+tag@EXAMPLE.No  ' }).email,
    'User+tag@example.no',
  );
});

test('rejects malformed, display-name, list, control, Unicode, and over-length email values', () => {
  for (const email of [
    null,
    'user',
    '@example.no',
    'user@',
    'user..name@example.no',
    'User Name <user@example.no>',
    'user@example.no,other@example.no',
    'user@example.no\r\nBcc: other@example.no',
    'følger@example.no',
    `a@${'b'.repeat(CONTACT_MAX_EMAIL_LENGTH)}.no`,
  ]) {
    assertInvalid({ category: 'bug', message: 'Hei', email });
  }
});

test('requires the exact five top-level fields and scalar string types', () => {
  for (const body of [
    { category: 'bug', message: 'Hei', extra: 'no' },
    { category: 'bug', message: 'Hei', nested: { value: 'no' } },
    { category: 'bug', message: 'Hei', website: [] },
    { category: ['bug'], message: 'Hei' },
    { category: 'bug', message: ['Hei'] },
    { category: 'bug', message: 'Hei', email: false },
    [],
    null,
    'Hei',
  ]) {
    assertInvalid(body);
  }
});

test('normalises optional Unicode names and enforces safe 100-code-point boundary', () => {
  assert.equal(validateContactRequest({ category: 'bug', message: 'Hei', name: '  Åse e\u0301  ' }).name, 'Åse é');
  assert.equal([...validateContactRequest({ category: 'bug', message: 'Hei', name: 'a'.repeat(100) }).name].length, 100);
  for (const name of [
    'a'.repeat(101),
    'Hei\u0000',
    'Hei\u202e',
    '\ud800',
    'Alice\nBob',
    'Alice\rBob',
    'Alice\r\nBob',
  ]) {
    assertInvalid({ category: 'bug', message: 'Hei', name });
  }
});

test('website is only a string honeypot and is omitted from normalised delivery data', () => {
  assert.equal(
    validateContactRequest({ category: 'bug', message: 'Hei' }).honeypot,
    false,
  );
  assert.equal(
    validateContactRequest({ ...validRequest, website: 'filled' }).honeypot,
    true,
  );
});

test('validates JSON content type and exact same-origin headers', () => {
  for (const contentType of ['application/json', 'Application/JSON; charset=utf-8']) {
    assert.doesNotThrow(() =>
      validateContactHeaders({
        contentType,
        origin: REQUEST_ORIGIN,
        requestOrigin: REQUEST_ORIGIN,
        secFetchSite: 'same-origin',
      }),
    );
  }

  for (const headers of [
    { contentType: 'text/plain', origin: REQUEST_ORIGIN },
    { contentType: 'application/json', origin: null },
    { contentType: 'application/json', origin: 'https://other.example.test' },
    { contentType: 'application/json', origin: `${REQUEST_ORIGIN}/path` },
    { contentType: 'application/json', origin: REQUEST_ORIGIN, requestOrigin: null },
    { contentType: 'application/json', origin: REQUEST_ORIGIN, secFetchSite: 'same-site' },
    { contentType: 'application/json', origin: REQUEST_ORIGIN, secFetchSite: 'cross-site' },
  ]) {
    assert.throws(
      () => validateContactHeaders(headers),
      { name: 'ContactRequestPolicyError' },
    );
  }
});

test('parses valid JSON, rejects malformed JSON and duplicate keys, and bounds encoded bytes', () => {
  assert.throws(
    () => parseContactRequest({ rawBody: '{}', contentType: 'text/plain' }),
    { name: 'ContactRequestPolicyError', status: 415, code: 'unsupported_media_type' },
  );

  assert.deepEqual(
    parseContactRequest({
      rawBody: JSON.stringify(validRequest),
      contentType: 'application/json',
    }),
    {
      category: 'bug',
      categoryLabel: 'Feil',
      message: validRequest.message,
      name: null,
       email: 'Bruker@example.no',
      honeypot: false,
    },
  );

  for (const rawBody of [
    '{"category":"bug"',
    '{"category":"bug","message":"Hei","message":"Du"}',
  ]) {
    assert.throws(
      () => parseContactRequest({ rawBody, contentType: 'application/json' }),
      { name: 'ContactRequestPolicyError', status: 400, code: 'invalid_request' },
    );
  }

  assert.throws(
    () => parseContactRequest({ rawBody: 'x'.repeat(CONTACT_MAX_BODY_BYTES + 1), contentType: 'application/json' }),
    { name: 'ContactRequestPolicyError', status: 413, code: 'request_too_large' },
  );
});
