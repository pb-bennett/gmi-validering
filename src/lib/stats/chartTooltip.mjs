export const filterActiveTooltipEntries = (payload = [], chartMode) => {
  if (chartMode !== 'per') return payload;

  return payload.filter(
    (entry) => entry?.payload?.periodCounts?.[entry.dataKey] > 0,
  );
};
