// Shared resource policy. UI limits are deliberately below the unchanged proxy ceiling.
export const GEMINI_COVERAGE_CONCURRENCY = 2; // At most four HTTP requests (two atomic pairs).
export const GEMINI_MAP_SOFT_SIDE_METRES = 750;
export const GEMINI_MAP_SOFT_AREA_SQUARE_METRES = 500_000;
export const GEMINI_MAP_HARD_SIDE_METRES = 1_500;
export const GEMINI_MAP_HARD_AREA_SQUARE_METRES = 2_000_000;
export const GEMINI_ABSOLUTE_SIDE_METRES = 2_000;
export const GEMINI_ABSOLUTE_AREA_SQUARE_METRES = 4_000_000;

export const GEMINI_MAP_WARNING = 'Kartutsnittet dekker et stort område og kan hente svært mange objekter fra Gemini WFS. Zoom inn for en mindre forespørsel, eller fortsett dersom dette er tilsiktet.';
export const GEMINI_MAP_BLOCKED = 'Kartutsnittet er for stort for én Gemini WFS-forespørsel. Zoom inn og prøv igjen.';

export function geminiBboxDimensions(bbox) {
  const width = bbox[2] - bbox[0], height = bbox[3] - bbox[1];
  return Object.freeze({ width, height, area: width * height });
}

export function classifyGeminiMapExtent(bbox) {
  const dimensions = geminiBboxDimensions(bbox);
  const { width, height, area } = dimensions;
  const level = ![width, height, area].every(Number.isFinite) || width <= 0 || height <= 0 ||
    width > GEMINI_MAP_HARD_SIDE_METRES || height > GEMINI_MAP_HARD_SIDE_METRES || area > GEMINI_MAP_HARD_AREA_SQUARE_METRES
    ? 'blocked' : width > GEMINI_MAP_SOFT_SIDE_METRES || height > GEMINI_MAP_SOFT_SIDE_METRES || area > GEMINI_MAP_SOFT_AREA_SQUARE_METRES
      ? 'confirm' : 'ordinary';
  return Object.freeze({ level, dimensions });
}
