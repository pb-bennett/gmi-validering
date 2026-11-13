import { createExportZip } from '../photos/export/exportZip.mjs';
import { assertDeliveryPlan, getDeliveryGmiBytes, getDeliveryGml, readDeliveryAttachment, verifyDeliverySources } from './deliveryPlan.mjs';

/** Mode A returns a standalone GMI Blob. B/C/D return the reviewed ZIP.
 * No download side effects, source writes or Rettinger history changes.
 */
export async function buildDeliveryPackage(plan) {
  assertDeliveryPlan(plan);
  await verifyDeliverySources(plan);
  const gmi = getDeliveryGmiBytes(plan);
  if (plan.mode === 'gmi-only') return new Blob([gmi], { type: 'application/octet-stream' });
  const zip = createExportZip();
  try {
    if (gmi) zip.add(plan.naming.gmiFilename, gmi);
    const xml = getDeliveryGml(plan);
    if (xml !== null) zip.add(plan.naming.gmlFilename, new TextEncoder().encode(xml));
    for (const attachment of plan.attachments) {
      const bytes = await readDeliveryAttachment(plan, attachment.assetId);
      zip.add(attachment.path, bytes);
    }
    // Recheck after asynchronous attachment reads as well as before writing.
    await verifyDeliverySources(plan);
    const blob = zip.finish();
    assertDeliveryPlan(plan);
    return blob;
  } catch (error) { zip.terminate(); throw error; }
}
