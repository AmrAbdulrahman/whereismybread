//@ts-check

const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_DEPLOYMENT_ID ||
  'dev';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace libs ship TypeScript source (no build step) — Next must transpile them.
  transpilePackages: [
    '@wib/ui',
    '@wib/updates',
    '@wib/domain',
    '@wib/config',
    '@wib/db',
    '@wib/auth',
    '@wib/feature-payments',
  ],
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
    BUILD_TIMESTAMP: new Date().toISOString(),
  },
  // Server-only / native packages — keep them out of the client & edge bundles.
  serverExternalPackages: ['postgres', '@node-rs/argon2'],
};

module.exports = nextConfig;
