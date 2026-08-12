import { readFile } from 'node:fs/promises';

export async function resolve(specifier, context, nextResolve) {
  if (
    specifier.startsWith('.') &&
    context.parentURL?.includes('/src/') &&
    !specifier.endsWith('.js') &&
    !specifier.endsWith('.mjs')
  ) {
    return nextResolve(`${specifier}.js`, context);
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && url.includes('/src/') && url.endsWith('.js')) {
    return {
      format: 'module',
      source: await readFile(new URL(url), 'utf8'),
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
