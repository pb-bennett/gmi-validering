export const MAP_PLAYBACK_TARGET_MS = 12_000;
export const MAP_PLAYBACK_MIN_INTERVAL_MS = 60;
export const MAP_PLAYBACK_MAX_INTERVAL_MS = 1_500;
export const VIEWPORT_MODE_AUTO = 'auto';
export const VIEWPORT_MODE_USER = 'user';

export const getInitialTimelineIndex = (dates = []) =>
  dates.length > 0 ? dates.length - 1 : -1;

export const getPlaybackIntervalMs = (
  dateCount,
  {
    targetDurationMs = MAP_PLAYBACK_TARGET_MS,
    minIntervalMs = MAP_PLAYBACK_MIN_INTERVAL_MS,
    maxIntervalMs = MAP_PLAYBACK_MAX_INTERVAL_MS,
  } = {},
) => {
  if (dateCount <= 1) return maxIntervalMs;
  const interval = targetDurationMs / (dateCount - 1);
  return Math.min(maxIntervalMs, Math.max(minIntervalMs, interval));
};

export const getNextTimelineIndex = (index, lastIndex) =>
  index >= lastIndex ? lastIndex : index + 1;

export const getViewportModeAfterInteraction = (
  currentMode,
  { programmatic = false } = {},
) => (programmatic ? currentMode : VIEWPORT_MODE_USER);

export const shouldAutoFitViewport = ({
  mode = VIEWPORT_MODE_AUTO,
  hasMarkers = false,
  force = false,
} = {}) => hasMarkers && (force || mode === VIEWPORT_MODE_AUTO);

export const invalidateMapSize = (map) => {
  if (typeof map?.invalidateSize === 'function') {
    map.invalidateSize({ animate: false });
  }
};
