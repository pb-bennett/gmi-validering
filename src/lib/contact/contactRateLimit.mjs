import { createHash, randomBytes } from 'node:crypto';

export const CONTACT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
export const CONTACT_RATE_LIMIT_PER_REQUESTER = 5;
export const CONTACT_RATE_LIMIT_GLOBAL = 100;
export const CONTACT_RATE_LIMIT_MAX_BUCKETS = 2_000;

const deriveOpaqueKey = (requester, salt) =>
  createHash('sha256')
    .update(`${salt}\u0000${String(requester ?? 'unknown')}`)
    .digest('hex');

const retryAfterSeconds = (resetAt, now) =>
  Math.max(1, Math.ceil((resetAt - now) / 1000));

export const createContactRateLimiter = ({
  now = () => Date.now(),
  salt = randomBytes(16).toString('hex'),
  keyDeriver = deriveOpaqueKey,
} = {}) => {
  const requesterBuckets = new Map();
  let globalBucket = null;

  const getNow = () => {
    const value = Number(now());
    return Number.isFinite(value) ? value : Date.now();
  };

  const pruneExpired = (currentTime) => {
    if (globalBucket && globalBucket.resetAt <= currentTime) {
      globalBucket = null;
    }

    for (const [key, bucket] of requesterBuckets) {
      if (bucket.resetAt <= currentTime) requesterBuckets.delete(key);
    }
  };

  const makeRequesterBucket = (key, currentTime) => {
    if (requesterBuckets.size >= CONTACT_RATE_LIMIT_MAX_BUCKETS) {
      const oldestKey = requesterBuckets.keys().next().value;
      if (oldestKey !== undefined) requesterBuckets.delete(oldestKey);
    }

    const bucket = {
      count: 0,
      resetAt: currentTime + CONTACT_RATE_LIMIT_WINDOW_MS,
    };
    requesterBuckets.set(key, bucket);
    return bucket;
  };

  const check = (requester) => {
    const currentTime = getNow();
    pruneExpired(currentTime);

    const opaqueKey = keyDeriver(requester, salt);
    let requesterBucket = requesterBuckets.get(opaqueKey);
    if (!requesterBucket) {
      requesterBucket = makeRequesterBucket(opaqueKey, currentTime);
    } else {
      requesterBuckets.delete(opaqueKey);
      requesterBuckets.set(opaqueKey, requesterBucket);
    }

    if (requesterBucket.count >= CONTACT_RATE_LIMIT_PER_REQUESTER) {
      return {
        allowed: false,
        retryAfterSeconds: retryAfterSeconds(
          requesterBucket.resetAt,
          currentTime,
        ),
      };
    }

    if (!globalBucket) {
      globalBucket = {
        count: 0,
        resetAt: currentTime + CONTACT_RATE_LIMIT_WINDOW_MS,
      };
    }

    if (globalBucket.count >= CONTACT_RATE_LIMIT_GLOBAL) {
      return {
        allowed: false,
        retryAfterSeconds: retryAfterSeconds(globalBucket.resetAt, currentTime),
      };
    }

    requesterBucket.count += 1;
    globalBucket.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  };

  return Object.freeze({
    check,
    getBucketCount: () => requesterBuckets.size,
  });
};
