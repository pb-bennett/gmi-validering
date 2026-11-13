import { deliveryContents } from './deliveryWizard.mjs';

// Presentation only: preserve the reviewed paths, order and attachment identities.
export function deliveryInventory(plan) {
  const root = { name: plan.filename, path: '', children: [], count: 0 };
  const folders = new Map([['', root]]);
  const attachments = new Map(plan.attachments.map((entry) => [entry.path, entry]));
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
    parent.children.push({ name: parts.at(-1), path, attachment: attachments.get(path) });
  }
  return { root, folders: [...folders.keys()].filter(Boolean) };
}
