import assert from 'node:assert/strict';
import test from 'node:test';

import { CURRENT_APP_VERSION } from '../src/data/appReleases.mjs';
import {
  CONTACT_PROVIDER_URL,
  CONTACT_SEND_TIMEOUT_MS,
  createContactEmailSender,
} from '../src/lib/contact/sendContactEmail.mjs';

const CONFIG = Object.freeze({
  RESEND_API_KEY: 'test-resend-key',
  CONTACT_TO_EMAIL: 'owner@example.test',
  CONTACT_FROM_EMAIL: 'sender@example.test',
});

const VALID_INPUT = Object.freeze({
  category: 'bug',
  categoryLabel: 'Injected label is ignored',
  message: '  Feil på kartet\r\nved kafé.  ',
  email: 'Bruker@EXAMPLE.NO',
});

const createFetchMock = ({ status = 200, onCall } = {}) => {
  const calls = [];
  const fetchMock = async (...args) => {
    calls.push(args);
    onCall?.(...args);
    return {
      status,
      json() {
        throw new Error('response body must not be read');
      },
      text() {
        throw new Error('response body must not be read');
      },
    };
  };
  return { calls, fetchMock };
};

const makeSender = ({
  config = CONFIG,
  fetchImpl,
  timeoutMs,
  now,
  createUniqueId = () => 'test-id',
} = {}) =>
  createContactEmailSender({
    getEnv: (name) => config[name],
    fetchImpl: fetchImpl || (async () => {
      throw new Error('unexpected network access');
    }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(now === undefined ? {} : { now }),
    createUniqueId,
  });

const getRequest = (calls) => {
  assert.equal(calls.length, 1);
  return calls[0];
};

const TEST_NOW = () => new Date('2026-01-15T12:34:56.000Z');

test('valid configuration sends one fixed, plain-text Resend request', async () => {
  const { calls, fetchMock } = createFetchMock();
  const outcome = await makeSender({ fetchImpl: fetchMock, now: TEST_NOW })(VALID_INPUT);
  const [url, options] = getRequest(calls);
  const body = JSON.parse(options.body);

  assert.deepEqual(outcome, { outcome: 'sent' });
  assert.equal(url, CONTACT_PROVIDER_URL);
  assert.equal(url, 'https://api.resend.com/emails');
  assert.equal(options.method, 'POST');
  assert.equal(options.redirect, 'manual');
  assert.ok(options.signal instanceof AbortSignal);
  assert.equal(options.headers.Authorization, 'Bearer test-resend-key');
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.equal(options.headers['User-Agent'], 'GMI-Validator-Contact/1.0');
  assert.deepEqual(Object.keys(options.headers).sort(), [
    'Authorization',
    'Content-Type',
    'User-Agent',
  ]);
  assert.equal(body.from, 'GMI Validator <sender@example.test>');
  assert.equal(body.to, 'owner@example.test');
  assert.equal(body.subject, 'GMI Validator: Feil — Uten navn — 15.01.2026 13:34:56 — test-id');
  assert.equal(
    body.text,
    `Kategori: Feil\nAppversjon: ${CURRENT_APP_VERSION}\nE-post: Bruker@example.no\n\nMelding:\nFeil på kartet\nved kafé.`,
  );
  assert.equal(body.reply_to, 'Bruker@example.no');
  assert.equal(Object.hasOwn(body, 'html'), false);
  assert.deepEqual(Object.keys(body).sort(), [
    'from',
    'reply_to',
    'subject',
    'text',
    'to',
  ]);
});

test('a supplied name is included in the subject while email stays out of it', async () => {
  const { calls, fetchMock } = createFetchMock();
  await makeSender({ fetchImpl: fetchMock, now: TEST_NOW })({
    category: 'bug',
    name: '  Paul Bennett  ',
    email: 'user@example.com',
    message: 'Melding',
  });
  const [, options] = getRequest(calls);
  const body = JSON.parse(options.body);

  assert.equal(body.subject, 'GMI Validator: Feil — Paul Bennett — 15.01.2026 13:34:56 — test-id');
  assert.equal(body.subject.includes('user@example.com'), false);
});

test('subjects include a distinct injected identifier for deterministic collision coverage', async () => {
  const { calls, fetchMock } = createFetchMock();
  const ids = ['a1b2c3d4', 'e5f60718'];
  let idIndex = 0;
  const sender = makeSender({
    fetchImpl: fetchMock,
    now: TEST_NOW,
    createUniqueId: () => ids[idIndex++],
  });

  await sender({ category: 'bug', name: 'Paul Bennett', message: 'Første melding' });
  await sender({ category: 'bug', name: 'Paul Bennett', message: 'Andre melding' });

  const firstBody = JSON.parse(calls[0][1].body);
  const secondBody = JSON.parse(calls[1][1].body);
  assert.equal(firstBody.subject, 'GMI Validator: Feil — Paul Bennett — 15.01.2026 13:34:56 — a1b2c3d4');
  assert.equal(secondBody.subject, 'GMI Validator: Feil — Paul Bennett — 15.01.2026 13:34:56 — e5f60718');
  assert.notEqual(firstBody.subject, secondBody.subject);
});

test('the configured timeout is approximately eight seconds and is abortable', () => {
  assert.equal(CONTACT_SEND_TIMEOUT_MS, 8_000);
});

test('missing or malformed configuration is unavailable without provider fetch', async () => {
  for (const name of [
    'RESEND_API_KEY',
    'CONTACT_TO_EMAIL',
    'CONTACT_FROM_EMAIL',
  ]) {
    const config = { ...CONFIG };
    delete config[name];
    let fetchCount = 0;
    const outcome = await makeSender({
      config,
      fetchImpl: async () => {
        fetchCount += 1;
        throw new Error('provider fetch must not occur');
      },
    })(VALID_INPUT);

    assert.deepEqual(outcome, { outcome: 'unavailable' });
    assert.equal(fetchCount, 0);
  }

  for (const [name, value] of [
    ['CONTACT_TO_EMAIL', 'Owner <owner@example.test>'],
    ['CONTACT_TO_EMAIL', 'owner@example.test, other@example.test'],
    ['CONTACT_TO_EMAIL', 'owner@example.test\r\nX-Injected: yes'],
    ['CONTACT_FROM_EMAIL', 'Sender <sender@example.test>'],
    ['CONTACT_FROM_EMAIL', 'sender@example.test, other@example.test'],
    ['CONTACT_FROM_EMAIL', 'sender@example.test\nX-Injected: yes'],
  ]) {
    const config = { ...CONFIG, [name]: value };
    let fetchCount = 0;
    const outcome = await makeSender({
      config,
      fetchImpl: async () => {
        fetchCount += 1;
        throw new Error('provider fetch must not occur');
      },
    })(VALID_INPUT);

    assert.deepEqual(outcome, { outcome: 'unavailable' });
    assert.equal(fetchCount, 0);
  }
});

test('a missing configuration outcome does not disclose configuration values', async () => {
  const outcome = await makeSender({
    config: { ...CONFIG, RESEND_API_KEY: '' },
  })(VALID_INPUT);

  assert.deepEqual(outcome, { outcome: 'unavailable' });
  assert.equal(JSON.stringify(outcome).includes('test-resend-key'), false);
  assert.equal(JSON.stringify(outcome).includes('owner@example.test'), false);
  assert.equal(JSON.stringify(outcome).includes('sender@example.test'), false);
});

test('an absent email omits E-post and Reply-To and never changes From', async () => {
  const { calls, fetchMock } = createFetchMock();
  const outcome = await makeSender({ fetchImpl: fetchMock, now: TEST_NOW })({
    category: 'suggestion',
    message: 'Et forslag',
    email: null,
  });
  const [, options] = getRequest(calls);
  const body = JSON.parse(options.body);

  assert.deepEqual(outcome, { outcome: 'sent' });
  assert.equal(Object.hasOwn(body, 'reply_to'), false);
  assert.equal(body.from, 'GMI Validator <sender@example.test>');
  assert.equal(body.to, 'owner@example.test');
  assert.equal(body.subject, 'GMI Validator: Forslag — Anonym — 15.01.2026 13:34:56 — test-id');
  assert.equal(body.text.includes('E-post:'), false);
  assert.equal(body.text, `Kategori: Forslag\nAppversjon: ${CURRENT_APP_VERSION}\n\nMelding:\nEt forslag`);
});

test('all category subjects are fixed and derived from the category', async () => {
  for (const [category, label] of [
    ['bug', 'Feil'],
    ['suggestion', 'Forslag'],
    ['comment', 'Kommentar'],
    ['other', 'Annet'],
  ]) {
    const { calls, fetchMock } = createFetchMock();
    await makeSender({ fetchImpl: fetchMock, now: TEST_NOW })({
      category,
      categoryLabel: 'arbitrary submitted label',
      message: 'Melding',
    });
    const [, options] = getRequest(calls);
    const body = JSON.parse(options.body);
    assert.equal(body.subject, `GMI Validator: ${label} — Anonym — 15.01.2026 13:34:56 — test-id`);
    assert.match(body.text, new RegExp(`^Kategori: ${label}\\n`, 'u'));
  }
});

test('provider 2xx succeeds while non-2xx fails without reading the response', async () => {
  for (const [status, expected] of [
    [200, 'sent'],
    [202, 'sent'],
    [299, 'sent'],
    [400, 'failed'],
    [500, 'failed'],
  ]) {
    const { calls, fetchMock } = createFetchMock({ status });
    const outcome = await makeSender({ fetchImpl: fetchMock })(VALID_INPUT);
    assert.deepEqual(outcome, { outcome: expected });
    assert.equal(calls.length, 1);
  }
});

test('network errors and abort timeouts fail once without retry', async () => {
  let networkCalls = 0;
  const networkOutcome = await makeSender({
    fetchImpl: async () => {
      networkCalls += 1;
      throw new Error('network failure with sensitive details');
    },
  })(VALID_INPUT);
  assert.deepEqual(networkOutcome, { outcome: 'failed' });
  assert.equal(networkCalls, 1);

  let aborted = false;
  let timeoutCalls = 0;
  const timeoutOutcome = await makeSender({
    timeoutMs: 5,
    fetchImpl: (_url, options) => {
      timeoutCalls += 1;
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('timeout with provider details'));
        }, { once: true });
      });
    },
  })(VALID_INPUT);
  assert.deepEqual(timeoutOutcome, { outcome: 'failed' });
  assert.equal(timeoutCalls, 1);
  assert.equal(aborted, true);
});

test('invalid delivery input fails without constructing or sending provider data', async () => {
  let fetchCount = 0;
  const outcome = await makeSender({
    fetchImpl: async () => {
      fetchCount += 1;
      throw new Error('provider fetch must not occur');
    },
  })({
    category: 'bug',
    message: 'valid message',
    email: 'not a mailbox',
    attachments: [{ filename: 'must never be sent' }],
  });

  assert.deepEqual(outcome, { outcome: 'failed' });
  assert.equal(fetchCount, 0);
});
