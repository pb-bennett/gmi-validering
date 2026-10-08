import { immutable } from './photoSpatial.mjs';

// Source headings are evidence only. Unknown is never an implicit north heading.
export const emptyDirection = () => Object.freeze({ current: null });

export function normalizePhotoDirection(degrees) {
  if (!Number.isFinite(degrees)) return null;
  return ((Math.round(degrees % 360) % 360) + 360) % 360;
}

export function acceptManualPhotoDirection(degrees, acceptedAt = Date.now()) {
  const normalized = normalizePhotoDirection(degrees);
  return normalized === null ? null : immutable({ current: {
    degrees: normalized, basis: { kind: 'manual' }, acceptance: 'manual', acceptedAt,
  } });
}

export function photoDirectionLabel(degrees) {
  const normalized = normalizePhotoDirection(degrees);
  if (normalized === null) return 'Ikke angitt';
  const cardinal = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(normalized / 45) % 8];
  return `${normalized}° ${cardinal}`;
}
