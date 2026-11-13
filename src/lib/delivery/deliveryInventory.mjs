import { deliveryContents } from './deliveryWizard.mjs';

// M9 marks a retained path only after resolving a surviving GMI reference.
// GML uses its exact planned path, not every alias of the same asset.
export function deliveryAttachmentDestinations(plan) {
  const used = new Set(plan.photoPlan?.occurrences?.map((row) => row.assetId) || []);
  const gmlPaths = new Set((plan.photoPlan?.attachments || []).filter((entry) => used.has(entry.assetId)).map((entry) => entry.path));
  return new Map(plan.attachments.map((entry) => {
    const gmi = plan.mode !== 'photos-only' && entry.retained === true;
    const gml = gmlPaths.has(entry.path);
    return [entry.path, gmi && gml ? 'GMI + GML' : gmi ? 'GMI' : gml ? 'GML' : null];
  }));
}

// Presentation only: preserve the reviewed paths, order and attachment identities.
export function deliveryInventory(plan) {
  const root = { name: plan.filename, path: '', children: [], count: 0 };
  const folders = new Map([['', root]]);
  const attachments = new Map(plan.attachments.map((entry) => [entry.path, entry]));
  const destinations = deliveryAttachmentDestinations(plan);
  for (const path of deliveryContents(plan)) {
    const parts = path.split('/');
    let parent = root, prefix = '';
    parent.count++;
    for (const name of parts.slice(0, -1)) {
      prefix = prefix ? `${prefix}/${name}` : name;
      if (!folders.has(prefix)) {
        const folder = { name, path: prefix, children: [], count: 0 };
        folders.set(prefix, folder); parent.children.push(folder);
      }
      parent = folders.get(prefix); parent.count++;
    }
    parent.children.push({ name: parts.at(-1), path, attachment: attachments.get(path), destination: destinations.get(path) });
  }
  return { root, folders: [...folders.keys()].filter(Boolean) };
}
