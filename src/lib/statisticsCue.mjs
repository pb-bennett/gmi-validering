export const STATISTICS_CUE_STORAGE_KEY = 'statisticsCueCount';
export const STATISTICS_CUE_MAX_LOADS = 3;

export function getStatisticsCueCount(rawValue) {
  const count = Number(rawValue);
  return Number.isInteger(count) && count >= 0 ? count : 0;
}

export function claimStatisticsCue(
  storage,
  key = STATISTICS_CUE_STORAGE_KEY,
) {
  if (
    !storage ||
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function'
  ) {
    return false;
  }

  try {
    const count = getStatisticsCueCount(storage.getItem(key));
    if (count >= STATISTICS_CUE_MAX_LOADS) return false;

    storage.setItem(key, String(count + 1));
    return true;
  } catch {
    return false;
  }
}
