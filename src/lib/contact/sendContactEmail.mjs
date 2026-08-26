import { CURRENT_APP_VERSION } from '../../data/appReleases.mjs';
import { validateContactRequest } from './contactRequestPolicy.mjs';

export const CONTACT_PROVIDER_URL = 'https://api.resend.com/emails';
export const CONTACT_SEND_TIMEOUT_MS = 8_000;
const CONTACT_USER_AGENT = 'GMI-Validator-Contact/1.0';

const EMAIL_LOCAL_PART = /^[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+\/=?^_`{|}~-]+)*$/u;
const EMAIL_DOMAIN = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u;
const FORBIDDEN_CONFIG_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;

const isBareMailbox = (value) => {
  if (
    typeof value !== 'string' ||
    value === '' ||
    value !== value.trim() ||
    value.length > 254 ||
    FORBIDDEN_CONFIG_CHARACTERS.test(value)
  ) {
    return false;
  }

  const atIndex = value.lastIndexOf('@');
  if (atIndex < 1 || atIndex === value.length - 1) return false;

  return (
    EMAIL_LOCAL_PART.test(value.slice(0, atIndex)) &&
    EMAIL_DOMAIN.test(value.slice(atIndex + 1))
  );
};

const isValidApiKey = (value) =>
  typeof value === 'string' &&
  value !== '' &&
  value === value.trim() &&
  !FORBIDDEN_CONFIG_CHARACTERS.test(value);

const getConfiguration = (getEnv) => {
  const apiKey = getEnv('RESEND_API_KEY');
  const recipient = getEnv('CONTACT_TO_EMAIL');
  const sender = getEnv('CONTACT_FROM_EMAIL');

  if (
    !isValidApiKey(apiKey) ||
    !isBareMailbox(recipient) ||
    !isBareMailbox(sender)
  ) {
    return null;
  }

  return { apiKey, recipient, sender };
};

const getValidatedFields = (input) => {
  try {
    return validateContactRequest({
      category: input?.category,
      message: input?.message,
      name: input?.name ?? undefined,
      email: input?.email ?? undefined,
      website: '',
    });
  } catch {
    return null;
  }
};

const buildEmail = ({ fields, sender, recipient }) => {
  const email = {
    from: `GMI Validator <${sender}>`,
    to: recipient,
    subject: `GMI Validator: ${fields.categoryLabel}`,
    text: `Kategori: ${fields.categoryLabel}\nAppversjon: ${CURRENT_APP_VERSION}${fields.name ? `\nNavn: ${fields.name}` : ''}\n\nMelding:\n${fields.message}`,
  };

  if (fields.email) email.reply_to = fields.email;
  return email;
};

export const createContactEmailSender = ({
  fetchImpl = (...args) => fetch(...args),
  getEnv = (name) => process.env[name],
  timeoutMs = CONTACT_SEND_TIMEOUT_MS,
} = {}) => async (input) => {
  const configuration = getConfiguration(getEnv);
  if (!configuration) return { outcome: 'unavailable' };

  const fields = getValidatedFields(input);
  if (!fields) return { outcome: 'failed' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(CONTACT_PROVIDER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${configuration.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': CONTACT_USER_AGENT,
      },
      redirect: 'manual',
      signal: controller.signal,
      body: JSON.stringify(buildEmail({
        fields,
        sender: configuration.sender,
        recipient: configuration.recipient,
      })),
    });

    return response?.status >= 200 && response.status < 300
      ? { outcome: 'sent' }
      : { outcome: 'failed' };
  } catch {
    return { outcome: 'failed' };
  } finally {
    clearTimeout(timeout);
  }
};

export const sendContactEmail = createContactEmailSender();
