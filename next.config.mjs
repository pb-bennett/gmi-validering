/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,
  // Build identity for the app info dialog (src/lib/buildInfo.mjs). Vercel sets both during every Git deployment;
  // a local build has neither and shows «Lokal utvikling». Only these two public values reach the client.
  env: {
    GMI_BUILD_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA || '',
    GMI_BUILD_ENV: process.env.VERCEL_ENV || '',
  },
};

export default nextConfig;
