import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONTACT_RATE_LIMIT_GLOBAL,
  CONTACT_RATE_LIMIT_MAX_BUCKETS,
  CONTACT_RATE_LIMIT_PER_REQUESTER,
  CONTACT_RATE_LIMIT_WINDOW_MS,
  createContactRateLimiter,
} from '../src/lib/contact/contactRateLimit.mjs';

const makeClock = () => {
  let currentTime = 0;
  return {
    now: () => currentTime,
    advance: (milliseconds) => {
      currentTime += milliseconds;
    },
  };
};

const deterministicKey = (requester, salt) => `${salt}:${requester}`;

test('limits each opaque requester key and returns a bounded retry interval', () => {
  const clock = makeClock();
  const limiter = createContactRateLimiter({
    now: clock.now,
    salt: 'test-salt',
    keyDeriver: deterministicKey,
  });

  for (let attempt = 0; attempt < CONTACT_RATE_LIMIT_PER_REQUESTER; attempt += 1) {
    assert.deepEqual(limiter.check('requester-a'), {
      allowed: true,
      retryAfterSeconds: 0,
    });
  }
  const limited = limiter.check('requester-a');
  assert.equal(limited.allowed, false);
  assert.equal(limited.retryAfterSeconds, CONTACT_RATE_LIMIT_WINDOW_MS / 1000);
  assert.equal(limiter.check('requester-b').allowed, true);
});

test('enforces the process-wide limit independently of requester limits', () => {
  const clock = makeClock();
  const limiter = createContactRateLimiter({ now: clock.now, salt: 'global-salt' });

  for (let attempt = 0; attempt < CONTACT_RATE_LIMIT_GLOBAL; attempt += 1) {
    assert.equal(limiter.check(`requester-${attempt}`).allowed, true);
  }
  const limited = limiter.check('requester-last');
  assert.deepEqual(limited, {
    allowed: false,
    retryAfterSeconds: CONTACT_RATE_LIMIT_WINDOW_MS / 1000,
  });
});

test('expires requester and global buckets and allows new attempts', () => {
  const clock = makeClock();
  const limiter = createContactRateLimiter({ now: clock.now, salt: 'expiry-salt' });

  for (let attempt = 0; attempt < CONTACT_RATE_LIMIT_PER_REQUESTER; attempt += 1) {
    limiter.check('requester-a');
  }
  assert.equal(limiter.check('requester-a').allowed, false);
  clock.advance(CONTACT_RATE_LIMIT_WINDOW_MS);
  assert.deepEqual(limiter.check('requester-a'), {
    allowed: true,
    retryAfterSeconds: 0,
  });
});

test('prunes expired entries and keeps requester memory bounded', () => {
  const clock = makeClock();
  const limiter = createContactRateLimiter({ now: clock.now, salt: 'prune-salt' });

  limiter.check('old-a');
  limiter.check('old-b');
  limiter.check('old-c');
  assert.equal(limiter.getBucketCount(), 3);
  clock.advance(CONTACT_RATE_LIMIT_WINDOW_MS);
  limiter.check('new');
  assert.equal(limiter.getBucketCount(), 1);

  for (let index = 0; index < CONTACT_RATE_LIMIT_MAX_BUCKETS + 100; index += 1) {
    limiter.check(`unique-${index}`);
  }
  assert.equal(limiter.getBucketCount(), CONTACT_RATE_LIMIT_MAX_BUCKETS);
});

test('stores neither raw requester values nor a raw-IP property', () => {
  const requester = '203.0.113.44';
  const limiter = createContactRateLimiter({
    now: () => 0,
    salt: 'opaque-salt',
  });
  limiter.check(requester);

  assert.equal(JSON.stringify(limiter).includes(requester), false);
  assert.equal(Object.prototype.hasOwnProperty.call(limiter, 'buckets'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(limiter, 'ip'), false);
});

test('uses injected time, salt, and keying deterministically', () => {
  const clock = makeClock();
  const first = createContactRateLimiter({
    now: clock.now,
    salt: 'same-salt',
    keyDeriver: deterministicKey,
  });
  const second = createContactRateLimiter({
    now: clock.now,
    salt: 'same-salt',
    keyDeriver: deterministicKey,
  });

  assert.deepEqual(first.check('same-requester'), second.check('same-requester'));
  assert.equal(first.getBucketCount(), 1);
  assert.equal(second.getBucketCount(), 1);
});
