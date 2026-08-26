export const CONTACT_MAX_BODY_BYTES = 20 * 1024;
export const CONTACT_MAX_MESSAGE_CODE_POINTS = 4_000;
export const CONTACT_MAX_EMAIL_LENGTH = 254;

export const CONTACT_CATEGORY_LABELS = Object.freeze({
  bug: 'Feil',
  suggestion: 'Forslag',
  comment: 'Kommentar',
  other: 'Annet',
});

const CONTACT_REQUEST_KEYS = new Set([
  'category',
  'message',
  'email',
  'website',
]);
const CONTACT_CATEGORIES = new Set(Object.keys(CONTACT_CATEGORY_LABELS));

const invalidRequest = () =>
  new ContactRequestPolicyError(400, 'invalid_request');

export class ContactRequestPolicyError extends Error {
  constructor(status, code) {
    super(code);
    this.name = 'ContactRequestPolicyError';
    this.status = status;
    this.code = code;
  }
}

const isRecord = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const hasOnlyKeys = (value, allowedKeys) =>
  Object.keys(value).every((key) => allowedKeys.has(key));

const hasUnpairedSurrogate = (value) => {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (
        Number.isNaN(next) ||
        next < 0xdc00 ||
        next > 0xdfff
      ) {
        return true;
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return true;
    }
  }
  return false;
};

const hasForbiddenTextCharacters = (value) =>
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u0080-\u009f\u202a-\u202e\u2066-\u2069]/u.test(
    value,
  );

const normalizeMessage = (value) => {
  if (typeof value !== 'string' || hasUnpairedSurrogate(value)) {
    throw invalidRequest();
  }

  const normalized = value.replace(/\r\n?/g, '\n').normalize('NFC');
  if (hasForbiddenTextCharacters(normalized)) throw invalidRequest();

  const trimmed = normalized.trim();
  const codePointLength = [...trimmed].length;
  if (
    codePointLength < 1 ||
    codePointLength > CONTACT_MAX_MESSAGE_CODE_POINTS
  ) {
    throw invalidRequest();
  }

  return trimmed;
};

const EMAIL_LOCAL_PART = /^[A-Za-z0-9!#$%&'*+\/?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+\/?^_`{|}~-]+)*$/u;
const EMAIL_DOMAIN = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u;

const normalizeEmail = (value) => {
  if (value === undefined) return null;
  if (typeof value !== 'string' || hasUnpairedSurrogate(value)) {
    throw invalidRequest();
  }
  if (/\r|\n/u.test(value) || hasForbiddenTextCharacters(value)) {
    throw invalidRequest();
  }

  const trimmed = value.trim();
  if (trimmed === '') return null;
  if ([...trimmed].length > CONTACT_MAX_EMAIL_LENGTH) throw invalidRequest();

  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex < 1 || atIndex === trimmed.length - 1) throw invalidRequest();

  const localPart = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  if (!EMAIL_LOCAL_PART.test(localPart) || !EMAIL_DOMAIN.test(domain)) {
    throw invalidRequest();
  }

  return `${localPart}@${domain.toLowerCase()}`;
};

const contentTypeIsJson = (contentType) => {
  if (typeof contentType !== 'string') return false;
  return contentType.split(';', 1)[0].trim().toLowerCase() === 'application/json';
};

const parseOrigin = (value) => {
  if (typeof value !== 'string' || value === '') return null;
  try {
    const parsed = new URL(value);
    if (
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
};

export const validateContactHeaders = ({
  contentType,
  origin,
  requestOrigin,
  secFetchSite,
}) => {
  if (!contentTypeIsJson(contentType)) {
    throw new ContactRequestPolicyError(415, 'unsupported_media_type');
  }

  const suppliedOrigin = parseOrigin(origin);
  if (!suppliedOrigin || suppliedOrigin !== requestOrigin) {
    throw new ContactRequestPolicyError(403, 'request_not_allowed');
  }

  if (
    secFetchSite !== undefined &&
    secFetchSite !== null &&
    (typeof secFetchSite !== 'string' ||
      secFetchSite.trim().toLowerCase() !== 'same-origin')
  ) {
    throw new ContactRequestPolicyError(403, 'request_not_allowed');
  }
};

export const validateContactRequest = (body) => {
  if (!isRecord(body) || !hasOnlyKeys(body, CONTACT_REQUEST_KEYS)) {
    throw invalidRequest();
  }

  if (
    typeof body.category !== 'string' ||
    !CONTACT_CATEGORIES.has(body.category)
  ) {
    throw invalidRequest();
  }

  const website = body.website;
  if (website !== undefined && typeof website !== 'string') {
    throw invalidRequest();
  }

  return {
    category: body.category,
    categoryLabel: CONTACT_CATEGORY_LABELS[body.category],
    message: normalizeMessage(body.message),
    email: normalizeEmail(body.email),
    honeypot: website !== undefined && website !== '',
  };
};

const skipJsonWhitespace = (value, state) => {
  while (/\s/u.test(value[state.index] || '')) state.index += 1;
};

const consumeJsonString = (value, state) => {
  const start = state.index;
  state.index += 1;
  while (state.index < value.length) {
    const character = value[state.index];
    if (character === '\\') {
      state.index += 2;
      continue;
    }
    state.index += 1;
    if (character === '"') {
      return JSON.parse(value.slice(start, state.index));
    }
  }
  return null;
};

const hasDuplicateJsonObjectKeys = (value) => {
  const state = { index: 0 };

  const consumeValue = () => {
    skipJsonWhitespace(value, state);
    const character = value[state.index];

    if (character === '"') {
      consumeJsonString(value, state);
      return false;
    }

    if (character === '{') {
      state.index += 1;
      skipJsonWhitespace(value, state);
      const keys = new Set();
      if (value[state.index] === '}') {
        state.index += 1;
        return false;
      }

      while (state.index < value.length) {
        skipJsonWhitespace(value, state);
        const key = consumeJsonString(value, state);
        if (keys.has(key)) return true;
        keys.add(key);
        skipJsonWhitespace(value, state);
        state.index += 1;
        if (consumeValue()) return true;
        skipJsonWhitespace(value, state);
        if (value[state.index] === '}') {
          state.index += 1;
          return false;
        }
        state.index += 1;
      }
      return false;
    }

    if (character === '[') {
      state.index += 1;
      skipJsonWhitespace(value, state);
      if (value[state.index] === ']') {
        state.index += 1;
        return false;
      }
      while (state.index < value.length) {
        if (consumeValue()) return true;
        skipJsonWhitespace(value, state);
        if (value[state.index] === ']') {
          state.index += 1;
          return false;
        }
        state.index += 1;
      }
    }

    while (
      state.index < value.length &&
      !/[\s,\]}]/u.test(value[state.index])
    ) {
      state.index += 1;
    }
    return false;
  };

  return consumeValue();
};

export const parseContactRequest = ({ rawBody, contentType }) => {
  if (!contentTypeIsJson(contentType)) {
    throw new ContactRequestPolicyError(415, 'unsupported_media_type');
  }
  if (typeof rawBody !== 'string') throw invalidRequest();

  if (new TextEncoder().encode(rawBody).byteLength > CONTACT_MAX_BODY_BYTES) {
    throw new ContactRequestPolicyError(413, 'request_too_large');
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw invalidRequest();
  }

  if (hasDuplicateJsonObjectKeys(rawBody)) throw invalidRequest();
  return validateContactRequest(body);
};

export const getContactErrorResponse = (error) => {
  if (error instanceof ContactRequestPolicyError) {
    return {
      status: error.status,
      body: { ok: false, code: error.code },
    };
  }

  return {
    status: 502,
    body: { ok: false, code: 'send_failed' },
  };
};
