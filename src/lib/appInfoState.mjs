export const APP_INFO_STORAGE_KEY = 'gmi-validering:app-info:v1';
export const LEGACY_STORAGE_KEY = 'gmi-validator-storage';
export const APP_INFO_SCHEMA = 1;

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export const isValidSemVer = (value) =>
  typeof value === 'string' && SEMVER_PATTERN.test(value);

const isValidAppInfoState = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  value.schema === APP_INFO_SCHEMA &&
  typeof value.introSeen === 'boolean' &&
  (value.lastSeenAnnouncement === null ||
    isValidSemVer(value.lastSeenAnnouncement));

export const parseAppInfoState = (raw) => {
  if (typeof raw !== 'string') return null;

  try {
    const value = JSON.parse(raw);
    return isValidAppInfoState(value) ? value : null;
  } catch {
    return null;
  }
};

const safeGetItem = (storage, key) => {
  try {
    if (!storage || typeof storage.getItem !== 'function') return null;
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const safeSetItem = (storage, key, value) => {
  try {
    if (!storage || typeof storage.setItem !== 'function') return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export const readAppInfoState = (storage) =>
  parseAppInfoState(safeGetItem(storage, APP_INFO_STORAGE_KEY));

export const writeAppInfoState = (storage, state) =>
  safeSetItem(storage, APP_INFO_STORAGE_KEY, JSON.stringify(state));

const hasLegacyStorage = (storage) => {
  const value = safeGetItem(storage, LEGACY_STORAGE_KEY);
  return value !== null && value !== undefined;
};

const getLatestAnnouncementVersion = (release) =>
  release && isValidSemVer(release.version) ? release.version : null;

const claimedState = (introSeen, lastSeenAnnouncement) => ({
  schema: APP_INFO_SCHEMA,
  introSeen,
  lastSeenAnnouncement,
});

export const decideAutomaticAppInfo = ({
  storage,
  latestAnnouncedRelease,
} = {}) => {
  const latestVersion = getLatestAnnouncementVersion(
    latestAnnouncedRelease,
  );
  const storedState = readAppInfoState(storage);

  if (!storedState) {
    const returningUser = hasLegacyStorage(storage);
    const nextState = claimedState(true, latestVersion);
    writeAppInfoState(storage, nextState);
    return {
      open: true,
      tab: returningUser && latestAnnouncedRelease ? 'news' : 'about',
      release: returningUser ? latestAnnouncedRelease : null,
      state: nextState,
    };
  }

  if (!storedState.introSeen) {
    const nextState = claimedState(
      true,
      latestVersion ?? storedState.lastSeenAnnouncement,
    );
    writeAppInfoState(storage, nextState);
    return { open: true, tab: 'about', release: null, state: nextState };
  }

  if (
    latestAnnouncedRelease &&
    latestVersion !== storedState.lastSeenAnnouncement
  ) {
    const nextState = claimedState(true, latestVersion);
    writeAppInfoState(storage, nextState);
    return {
      open: true,
      tab: 'news',
      release: latestAnnouncedRelease,
      state: nextState,
    };
  }

  return { open: false, tab: null, release: null, state: storedState };
};
