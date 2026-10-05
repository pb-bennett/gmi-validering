/** Literal, ephemeral search of table attributes, independent of rendered columns. */
export function normalizeTableSearchQuery(query) {
  return String(query ?? '').trim().toLowerCase();
}

export function tableSearchScalarText(value) {
  if (typeof value === 'string' || typeof value === 'boolean') return String(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (value instanceof Date && Number.isFinite(value.getTime())) return String(value);
  return null;
}

export function valueContainsTableSearch(value, normalizedQuery) {
  if (!normalizedQuery) return true;
  const pending = [value];
  const seen = new WeakSet();
  while (pending.length) {
    const current = pending.pop();
    const text = tableSearchScalarText(current);
    if (text !== null) {
      if (text.toLowerCase().includes(normalizedQuery)) return true;
      if (current instanceof Date && current.toISOString().toLowerCase().includes(normalizedQuery)) return true;
      continue;
    }
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    const prototype = Object.getPrototypeOf(current);
    if (!Array.isArray(current) && prototype !== Object.prototype && prototype !== null) continue;
    seen.add(current);
    // Own enumerable data properties only: skip getters and prototype/internal values.
    for (const key of Object.keys(current)) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor && Object.hasOwn(descriptor, 'value')) pending.push(descriptor.value);
    }
  }
  return false;
}

export function rowMatchesTableSearch(row, normalizedQuery) {
  return valueContainsTableSearch(row.attributes, normalizedQuery);
}

export function filterTableSearchRows(rows, normalizedQuery) {
  return normalizedQuery ? rows.filter((row) => rowMatchesTableSearch(row, normalizedQuery)) : rows;
}

/** Safe React-ready text segments; folded offsets map back to original Unicode text. */
export function segmentTableSearchText(text, normalizedQuery) {
  if (!normalizedQuery) return [{ text, match: false }];
  const folded = text.toLowerCase();
  let offset = 0;
  const starts = [];
  const ends = [];
  for (const character of text) {
    const lower = character.toLowerCase();
    for (let i = 0; i < lower.length; i++) {
      starts.push(offset);
      ends.push(offset + character.length);
    }
    offset += character.length;
  }
  const segments = [];
  let cursor = 0;
  let position = folded.indexOf(normalizedQuery);
  while (position !== -1) {
    const start = starts[position];
    const end = ends[position + normalizedQuery.length - 1];
    if (start >= cursor) {
      if (start > cursor) segments.push({ text: text.slice(cursor, start), match: false });
      segments.push({ text: text.slice(start, end), match: true });
      cursor = end;
    }
    position = folded.indexOf(normalizedQuery, position + normalizedQuery.length);
  }
  if (cursor < text.length || !segments.length) segments.push({ text: text.slice(cursor), match: false });
  return segments;
}
