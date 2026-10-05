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

export function extractHyperlinkFilenames(value) {
  const filenames = [];
  const distinct = new Set();
  const seen = new WeakSet();
  const addReference = (reference) => {
    const filename = referenceBasename(reference);
    if (filename && !distinct.has(filename)) {
      distinct.add(filename);
      filenames.push(filename);
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
    if (typeof current !== 'string') continue;
    const source = current.trim();
    if (!source) continue;
    if (/^h\s*:/i.test(source)) {
      // Validate named, quoted members; metadata is allowed but only links are files.
      const wrappers = [...source.matchAll(/h:\d+\(\s*((?:[a-z_][a-z\d_-]*\s*:\s*"[^"]*"\s*(?:[,;]\s*)?)+)\)/gi)];
      let end = 0;
      const references = [];
      let valid = wrappers.length > 0;
      for (const wrapper of wrappers) {
        if (!/^[\s,;]*$/.test(source.slice(end, wrapper.index))) valid = false;
        for (const member of wrapper[1].matchAll(/([a-z_][a-z\d_-]*)\s*:\s*"([^"]*)"/gi)) {
          if (member[1].toLowerCase() === 'link') references.push(member[2]);
        }
        end = wrapper.index + wrapper[0].length;
      }
      if (!/^[\s,;]*$/.test(source.slice(end))) valid = false;
      if (valid) references.forEach(addReference);
    } else {
      addReference(source);
    }
  }
  return filenames;
}
