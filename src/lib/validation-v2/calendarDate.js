/** Parse supported date spellings without changing the source lexeme. */
export function parseCalendarDate(raw) {
  if (typeof raw !== 'string') return null;
  const dotted = /^([0-9]{2})\.([0-9]{2})\.([0-9]{4})$/.exec(raw);
  const yearFirst = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(raw)
    || /^([0-9]{4})([0-9]{2})([0-9]{2})$/.exec(raw);
  const match = dotted || yearFirst;
  if (!match) return null;
  const day = Number(dotted ? match[1] : match[3]);
  const month = Number(match[2]);
  const year = Number(dotted ? match[3] : match[1]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? { date, year } : null;
}
