// Overflow variants inherit their parent pipe colour and add a dashed stroke.
const LINE_VARIANTS = {
  AFO: { parent: 'AF', dashScale: 2.5 },
  SPO: { parent: 'SP', dashScale: 2.5 },
};

const MIN_OVERFLOW_DASH = 5;
const MAX_OVERFLOW_DASH = 24;

function formatDashLength(length) {
  return Number(length.toFixed(1));
}

export const LINE_LEGEND_ITEMS = [
  { fcode: 'AF', label: 'Avløp Felles (AF)' },
  { fcode: 'AFO', label: 'Avløp overløp (AFO)' },
  { fcode: 'VL', label: 'Vannledning' },
  { fcode: 'SP', label: 'Spillvann' },
  { fcode: 'SPO', label: 'Spillvann overløp (SPO)' },
  { fcode: 'OV', label: 'Overvann' },
  { fcode: 'DR', label: 'Drenering' },
];

export function getOverflowDashArray(fcode, strokeWeight = 2) {
  const variant = LINE_VARIANTS[fcode];
  if (!variant) return null;

  const safeWeight = Number.isFinite(strokeWeight) ? Math.max(0, strokeWeight) : 2;
  const length = Math.min(
    MAX_OVERFLOW_DASH,
    Math.max(MIN_OVERFLOW_DASH, safeWeight * variant.dashScale),
  );
  const dashGap = formatDashLength(length);
  return `${dashGap}, ${dashGap}`;
}

export function getLineStyle(fcode, colorForCode, strokeWeight = 2) {
  const variant = LINE_VARIANTS[fcode];
  return {
    color: colorForCode(variant?.parent ?? fcode),
    dashArray: getOverflowDashArray(fcode, strokeWeight) ??
      (fcode?.includes('DR') ? '5, 5' : null),
  };
}

export function getLineLegendSwatchStyle(fcode, colorForCode) {
  const { color, dashArray } = getLineStyle(fcode, colorForCode);
  const segment = LINE_VARIANTS[fcode] ? 5 : 3;
  return dashArray
    ? {
        height: '2px',
        backgroundImage: `repeating-linear-gradient(90deg, ${color}, ${color} ${segment}px, transparent ${segment}px, transparent ${segment * 2}px)`,
      }
    : { backgroundColor: color };
}
