// Which build is running, for the app info dialog. next.config.mjs inlines only Vercel's commit SHA and
// environment name at build time (both public facts), so no request is needed and nothing else is exposed.
const ENVIRONMENTS = Object.freeze({
  production: Object.freeze({ kind: 'production', label: 'Produksjon' }),
  preview: Object.freeze({ kind: 'preview', label: 'Preview' }),
  local: Object.freeze({ kind: 'local', label: 'Lokal utvikling' }),
});

export const BUILD_SHORT_SHA_LENGTH = 7;

// `vercel dev` reports "development"; that and a build without Vercel metadata are both local.
export function describeBuild({ commitSha = '', environment = '' } = {}) {
  const sha = typeof commitSha === 'string' && /^[0-9a-f]{7,40}$/i.test(commitSha.trim()) ? commitSha.trim().toLowerCase() : null;
  const env = environment === 'production' || environment === 'preview' ? ENVIRONMENTS[environment] : ENVIRONMENTS.local;
  return Object.freeze({ commitSha: sha, shortSha: sha ? sha.slice(0, BUILD_SHORT_SHA_LENGTH) : null, environment: env.kind, environmentLabel: env.label });
}

// Literal process.env references, so Next.js can replace them in the client bundle.
export const BUILD_INFO = describeBuild({ commitSha: process.env.GMI_BUILD_COMMIT_SHA, environment: process.env.GMI_BUILD_ENV });
