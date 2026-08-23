/**
 * Shared raw-value presence policy for A3 and A4.
 *
 * No trimming, coercion, or case normalization is performed here.
 *
 * @param {*} value
 * @returns {boolean}
 */
export function isMissingValue(value) {
  return value === undefined || value === null || value === '';
}
