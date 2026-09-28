const MARGIN = 8;

const clamp = (value, maximum) =>
  Math.min(Math.max(MARGIN, value), Math.max(MARGIN, maximum - MARGIN));

export function positionProfileTooltip({
  anchorX,
  anchorY,
  width,
  height,
  tooltipWidth,
  tooltipHeight,
  preferSide = false,
}) {
  const gap = preferSide ? 10 : 15;
  const fitsRight = anchorX + gap + tooltipWidth <= width - MARGIN;
  const left = preferSide && !fitsRight
    ? anchorX - gap - tooltipWidth
    : anchorX + gap;
  const preferredTop = preferSide
    ? anchorY - tooltipHeight / 2
    : anchorY + gap + tooltipHeight <= height - MARGIN
      ? anchorY + gap
      : anchorY - gap - tooltipHeight;

  return {
    left: clamp(left, width - tooltipWidth),
    top: clamp(preferredTop, height - tooltipHeight),
  };
}
