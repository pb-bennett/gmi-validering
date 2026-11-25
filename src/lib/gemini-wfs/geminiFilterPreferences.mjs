import { AUTHORITATIVE_VALUE_TABLES } from '../../data/validation-v2/authoritative-value-tables.js';
import { normalizeGeminiWfsUrl } from './geminiConnection.mjs';
import { DEFAULT_GEMINI_FILTERS, GEMINI_FILTER_BASES, GEMINI_MISSING_VALUE,
  geminiTitleKey, isDefaultGeminiFilters, mapGeminiFilterGroups } from './geminiFilters.mjs';

// Filter choices only: never credentials, account data, coordinates, IDs, counts or features.
// The key name is fixed and the schema field is the version, so migration replaces the old content in one write.
export const GEMINI_FILTER_STORAGE_KEY = 'gmi-gemini-wfs-filters-v1';
export const GEMINI_FILTER_STORAGE_LIMITS = Object.freeze({ feeds: 20, overrides: 200, valueLength: 100 });
const SCHEMA = 2;
// Schema 1 shared Status and Eierskap between lines and points: both sides start from that choice.
const MIGRATIONS = new Map([[SCHEMA, (feed) => feed],
  [1, (feed) => ({ ...feed, groups: { lines: feed.groups, points: feed.groups } })]]);
// An owner value may name a person or organisation. Only known categories leave the session.
const OWNER_CATEGORIES = new Set([GEMINI_MISSING_VALUE,
  ...AUTHORITATIVE_VALUE_TABLES.owner.rows.map(({ meaning }) => geminiTitleKey(meaning))]);

function storableKey(groupId, key) {
  if (key !== GEMINI_MISSING_VALUE && (!/^[tcn]:./u.test(key) ||
    key.length > GEMINI_FILTER_STORAGE_LIMITS.valueLength + 2 || /\p{Cc}/u.test(key))) return false;
  return groupId !== 'owner' || OWNER_CATEGORIES.has(key);
}

function cleanFilters(input) {
  const groups = mapGeminiFilterGroups((side, { id }) => {
    const group = input?.groups?.[side]?.[id];
    const overrides = group?.overrides && typeof group.overrides === 'object' ? Object.entries(group.overrides) : [];
    return Object.freeze({
      base: GEMINI_FILTER_BASES.includes(group?.base) ? group.base : 'default',
      overrides: Object.freeze(Object.fromEntries(overrides
        .filter(([key, value]) => typeof value === 'boolean' && storableKey(id, key))
        .slice(-GEMINI_FILTER_STORAGE_LIMITS.overrides))),
    });
  });
  return Object.freeze({ groups, statusRecognised: input?.statusRecognised === true });
}

// null means malformed or written by an unknown schema.
function readFeeds(storage) {
  const text = storage.getItem(GEMINI_FILTER_STORAGE_KEY);
  if (text === null) return [];
  try {
    const value = JSON.parse(text);
    const migrate = MIGRATIONS.get(value?.schema);
    if (!migrate || !Array.isArray(value.feeds)) return null;
    return value.feeds.filter((feed) => {
      try { return normalizeGeminiWfsUrl(feed?.url) === feed.url; } catch { return false; }
    }).map(migrate);
  } catch { return null; }
}

export function readGeminiFilters(url, storage) {
  try {
    const normalized = normalizeGeminiWfsUrl(url);
    const feed = readFeeds(storage ?? globalThis.localStorage)?.find((item) => item.url === normalized);
    return feed ? cleanFilters(feed) : DEFAULT_GEMINI_FILTERS;
  } catch { return DEFAULT_GEMINI_FILTERS; }
}

// Automatic saves (keepUnreadable) never replace content the user did not choose to overwrite.
export function saveGeminiFilters(url, filters, { keepUnreadable = false } = {}, storage) {
  try {
    const target = storage ?? globalThis.localStorage, normalized = normalizeGeminiWfsUrl(url);
    const stored = readFeeds(target);
    if (!stored && keepUnreadable) return true;
    const feeds = (stored ?? []).filter((feed) => feed.url !== normalized)
      .map((feed) => ({ url: feed.url, ...cleanFilters(feed) }));
    const clean = cleanFilters(filters);
    if (clean.statusRecognised || !isDefaultGeminiFilters(clean)) feeds.unshift({ url: normalized, ...clean });
    if (feeds.length) {
      target.setItem(GEMINI_FILTER_STORAGE_KEY,
        JSON.stringify({ schema: SCHEMA, feeds: feeds.slice(0, GEMINI_FILTER_STORAGE_LIMITS.feeds) }));
    } else target.removeItem(GEMINI_FILTER_STORAGE_KEY);
    return true;
  } catch { return false; }
}

export const geminiFilterPreferences = Object.freeze({ read: readGeminiFilters, save: saveGeminiFilters });
