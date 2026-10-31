import { Zip, ZipPassThrough, strToU8 } from 'fflate';
import { assertExportablePlan } from './photoExportPlan.mjs';
import { serializePhotoExport } from './photoExportXml.mjs';
import { digestHex } from './attachmentNames.mjs';

export async function buildPhotoExportPackage(plan) {
  assertExportablePlan(plan);
  const chunks = [];
  let zipError = null, finished = false;
  const zip = new Zip((error, chunk, final) => {
    if (error) zipError = error;
    if (chunk) chunks.push(chunk);
    if (final) finished = true;
  });
  // Fixed local DOS time gives the same archive bytes in a given runtime;
  // no timestamp is inferred from capture, modification or import time.
  const add = (path, bytes) => {
    const member = new ZipPassThrough(path);
    member.mtime = new Date(2000, 0, 1, 0, 0, 0);
    member.os = 0; member.attrs = 0;
    zip.add(member); member.push(bytes, true);
  };
  try {
    add('photos.gml', strToU8(serializePhotoExport(plan)));
    const assets = new Map(plan.assets.map((asset) => [asset.assetId, asset]));
    for (const attachment of plan.attachments) {
      assertExportablePlan(plan);
      const asset = assets.get(attachment.assetId);
      const bytes = new Uint8Array(await asset.file.arrayBuffer());
      if (await digestHex(bytes) !== asset.checksum) throw new Error('Originalfilen er endret etter forhåndsvisning.');
      assertExportablePlan(plan);
      add(attachment.path, bytes);
    }
    zip.end();
    if (zipError) throw zipError;
    if (!finished) throw new Error('ZIP-pakken ble ikke ferdigstilt.');
    assertExportablePlan(plan);
    return new Blob(chunks, { type: 'application/zip' });
  } catch (error) { zip.terminate(); throw error; }
}
