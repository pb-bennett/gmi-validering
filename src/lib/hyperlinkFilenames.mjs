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

// Preserve source slices for presentation; only validated links receive actions.
// Filename validation, source order and deduplication are shared with the table.
export function extractHyperlinkSourceParts(value) {
  const parts = [];
  const distinct = new Set();
  const seen = new WeakSet();
  const addReference = (text, reference) => {
    const filename = referenceBasename(reference);
    if (filename && !distinct.has(filename)) {
      distinct.add(filename);
      parts.push({ text, filename });
    } else {
      parts.push({ text });
    }
  };
  const pending = [value];
  while (pending.length) {
    const current = pending.pop();
    if (Array.isArray(current)) {
      if (seen.has(current)) continue;
      seen.add(current);
      for (let i = current.length - 1; i >= 0; i--) pending.push(current[i]);
      continue;
    }
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
      // Validate named, quoted members; metadata is allowed but only links are files.
      const wrappers = [...source.matchAll(/h:\d+\(\s*((?:[a-z_][a-z\d_-]*\s*:\s*"[^"]*"\s*(?:[,;]\s*)?)+)\)/gi)];
      let end = 0;
      const references = [];
      let valid = wrappers.length > 0;
      for (const wrapper of wrappers) {
        if (!/^[\s,;]*$/.test(source.slice(end, wrapper.index))) valid = false;
        for (const member of wrapper[1].matchAll(/([a-z_][a-z\d_-]*)\s*:\s*"([^"]*)"/gi)) {
          references.push({
            reference: member[1].toLowerCase() === 'link' ? member[2] : null,
            end: wrapper.index + wrapper[0].indexOf(wrapper[1]) + member.index + member[0].length,
          });
        }
        end = wrapper.index + wrapper[0].length;
      }
      if (!/^[\s,;]*$/.test(source.slice(end))) valid = false;
      if (valid) {
        let start = 0;
        const leading = current.length - current.trimStart().length;
        for (const { reference, end } of references) {
          const stop = leading + end;
          if (reference !== null) addReference(current.slice(start, stop), reference);
          else parts.push({ text: current.slice(start, stop) });
          start = stop;
        }
        if (start < current.length) {
          if (references.length) parts[parts.length - 1].text += current.slice(start);
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
