import { Zip, ZipPassThrough } from 'fflate';

// Shared by standalone FOTO and coordinated delivery. Raw GMI bytes stay raw.
export function createExportZip() {
  const chunks = [];
  let zipError = null, finished = false;
  const zip = new Zip((error, chunk, final) => {
    if (error) zipError = error;
    if (chunk) chunks.push(chunk);
    if (final) finished = true;
  });
  return {
    add(path, bytes) {
      const member = new ZipPassThrough(path);
      member.mtime = new Date(2000, 0, 1, 0, 0, 0);
      member.os = 0; member.attrs = 0;
      zip.add(member); member.push(bytes, true);
    },
    finish() {
      zip.end();
      if (zipError) throw zipError;
      if (!finished) throw new Error('ZIP-pakken ble ikke ferdigstilt.');
      return new Blob(chunks, { type: 'application/zip' });
    },
    terminate() { zip.terminate(); },
  };
}
