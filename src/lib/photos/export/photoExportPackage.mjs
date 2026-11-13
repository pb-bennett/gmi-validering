import { strToU8 } from 'fflate';
import { createExportZip } from './exportZip.mjs';
import { assertExportablePlan } from './photoExportPlan.mjs';
import { serializePhotoExport } from './photoExportXml.mjs';
import { digestHex } from './attachmentNames.mjs';

export async function buildPhotoExportPackage(plan) {
  assertExportablePlan(plan);
  const zip = createExportZip();
  try {
    zip.add(plan.naming.gmlFilename, strToU8(serializePhotoExport(plan)));
    const assets = new Map(plan.assets.map((asset) => [asset.assetId, asset]));
    for (const attachment of plan.attachments) {
      assertExportablePlan(plan);
      const asset = assets.get(attachment.assetId);
      const bytes = new Uint8Array(await asset.file.arrayBuffer());
      if (await digestHex(bytes) !== asset.checksum) throw new Error('Originalfilen er endret etter forhåndsvisning.');
      assertExportablePlan(plan);
      zip.add(attachment.path, bytes);
    }
    const blob = zip.finish();
    assertExportablePlan(plan);
    return blob;
  } catch (error) { zip.terminate(); throw error; }
}
