//@ts-check

const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_DEPLOYMENT_ID ||
  'dev';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace libs ship TypeScript source (no build step) — Next must transpile them.
  transpilePackages: [
    '@wmm/ui',
    '@wmm/updates',
    '@wmm/domain',
    '@wmm/config',
    '@wmm/db',
    '@wmm/auth',
  ],
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
    BUILD_TIMESTAMP: new Date().toISOString(),
  },
  // postgres.js is server-only; keep it out of the client/edge bundle.
  serverExternalPackages: ['postgres'],
};

module.exports = nextConfig;
