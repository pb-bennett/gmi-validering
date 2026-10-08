/** Derived filenames only; never rewrites source attributes or resolves files. */
function referenceBasename(reference) {
  let path = reference.trim();
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      path = decodeURIComponent(url.pathname.split('/').pop());
    } catch {
      return null;
    }
  } else {
    // Reject structural expressions and unknown URI schemes, but allow drive paths.
    if (/^[a-z][a-z\d+.-]*:/i.test(path) && !/^[a-z]:[\\/]/i.test(path)) return null;
    if (!/[\\/]/.test(path) && !/\.[^ .]+$/.test(path)) return null;
    path = path.split(/[\\/]/).pop();
  }
  const filename = path.trim();
  if (!filename || filename === '.' || filename === '..' || /[\\/:"<>|?*\x00-\x1f]/.test(filename)) return null;
  return filename;
}

// Canonical member evidence. Offsets are UTF-16 character offsets in each raw
// source string, never byte offsets. The production grammar stays whole-value
// validated; malformed wrappers cannot yield partially accepted links.
export function extractHyperlinkOccurrences(value) {
  const sources = [], occurrences = [], diagnostics = [], seen = new WeakSet();
  const pending = [value];
  while (pending.length) {
    const raw = pending.pop();
    if (Array.isArray(raw)) {
      if (seen.has(raw)) continue;
      seen.add(raw);
      for (let i = raw.length - 1; i >= 0; i--) pending.push(raw[i]);
      continue;
    }
    const sourceIndex = sources.length;
    const record = { raw, sourceIndex, members: [], diagnostics: [], validGrammar: true };
    sources.push(record);
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const source = raw.trim(), leading = raw.length - raw.trimStart().length;
    const wrapped = /^h\s*:/i.test(source);
    const wrappers = wrapped ? [...source.matchAll(/h:(\d+)\(\s*((?:[a-z_][a-z\d_-]*\s*:\s*"[^"]*"\s*(?:[,;]\s*)?)+)\)/gi)] : [];
    let end = 0;
    if (wrapped) {
      record.validGrammar = wrappers.length > 0;
      for (const wrapper of wrappers) {
        if (!/^[\s,;]*$/.test(source.slice(end, wrapper.index))) record.validGrammar = false;
        end = wrapper.index + wrapper[0].length;
      }
      if (!/^[\s,;]*$/.test(source.slice(end))) record.validGrammar = false;
      if (!record.validGrammar) {
        record.diagnostics.push('invalid-wrapper-grammar');
        diagnostics.push({ sourceIndex, code: 'invalid-wrapper-grammar' });
        continue;
      }
    }
    const add = (member) => {
      record.members.push(member);
      if (member.key !== 'link') return;
      const filename = referenceBasename(member.referenceRaw);
      const issues = filename ? [] : [/[\\/]\s*$/.test(member.referenceRaw) ? 'directory-target' : 'missing-filename'];
      const occurrence = { ...member, sourceIndex, sourceOrder: occurrences.length,
        filename, normalizedKey: filename?.normalize('NFC').toLowerCase() || null,
        targetValid: Boolean(filename), diagnostics: issues };
      occurrences.push(occurrence);
      for (const code of issues) diagnostics.push({ sourceIndex, sourceOrder: occurrence.sourceOrder, code });
    };
    if (!wrapped) {
      add({ key: 'link', referenceRaw: source, rawMember: raw, rawWrapper: null,
        wrapperOrdinal: null, wrapperNumber: null, memberOrdinal: 0,
        rawStart: 0, rawEnd: raw.length, wrapperStart: null, wrapperEnd: null, metadata: [] });
      continue;
    }
    wrappers.forEach((wrapper, wrapperOrdinal) => {
      const wrapperStart = leading + wrapper.index, wrapperEnd = wrapperStart + wrapper[0].length;
      const memberOffset = wrapperStart + wrapper[0].indexOf(wrapper[2]);
      const members = [...wrapper[2].matchAll(/([a-z_][a-z\d_-]*)\s*:\s*"([^"]*)"/gi)];
      const metadata = members.filter((member) => member[1].toLowerCase() !== 'link')
        .map((member) => ({ key: member[1], value: member[2], raw: member[0] }));
      members.forEach((member, memberOrdinal) => add({
        key: member[1].toLowerCase(), referenceRaw: member[2], rawMember: member[0], rawWrapper: wrapper[0],
        wrapperOrdinal, wrapperNumber: Number(wrapper[1]), memberOrdinal,
        rawStart: memberOffset + member.index, rawEnd: memberOffset + member.index + member[0].length,
        wrapperStart, wrapperEnd, metadata,
      }));
    });
  }
  return { sources, occurrences, diagnostics };
}

// Preserve source slices for presentation; only validated links receive actions.
// Filename validation, source order and deduplication are shared with the table.
export function extractHyperlinkSourceParts(value) {
  const parts = [];
  const distinct = new Set();
  const addReference = (text, reference) => {
    const filename = referenceBasename(reference);
    if (filename && !distinct.has(filename)) {
      distinct.add(filename);
      parts.push({ text, filename });
    } else {
      parts.push({ text });
    }
  };
  for (const record of extractHyperlinkOccurrences(value).sources) {
    const current = record.raw;
    if (typeof current !== 'string') {
      parts.push({ text: current });
      continue;
    }
    const source = current.trim();
    if (!source) {
      parts.push({ text: current });
      continue;
    }
    if (/^h\s*:/i.test(source)) {
      if (record.validGrammar) {
        let start = 0;
        for (const member of record.members) {
          const reference = member.key === 'link' ? member.referenceRaw : null;
          const stop = member.rawEnd;
          if (reference !== null) addReference(current.slice(start, stop), reference);
          else parts.push({ text: current.slice(start, stop) });
          start = stop;
        }
        if (start < current.length) {
          if (record.members.length) parts[parts.length - 1].text += current.slice(start);
          else parts.push({ text: current.slice(start) });
        }
      } else {
        parts.push({ text: current });
      }
    } else {
      addReference(current, source);
    }
  }
  return parts;
}

export function extractHyperlinkFilenames(value) {
  return extractHyperlinkSourceParts(value)
    .filter((part) => part.filename)
    .map((part) => part.filename);
}
