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
    '@wib/feature-tags',
    '@wib/feature-insights',
    '@wib/feature-automations',
    '@wib/feature-debts',
  ],
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
    BUILD_TIMESTAMP: new Date().toISOString(),
  },
  experimental: {
    // Payment attachments (images / PDFs / text) are uploaded through a server
    // action; the default 1 MB cap is too small for a scanned PDF.
    serverActions: { bodySizeLimit: '12mb' },
    // Default is 0s for dynamic routes (nearly all of ours), which forces a
    // full refetch + remount every time you navigate back to one — losing
    // scroll position and any client state (collapsed panels, etc.) even
    // when nothing changed. 30s means "click into a debt and go back" reuses
    // the page you left; any real mutation still calls router.refresh()
    // itself, which busts this regardless of the window.
    staleTimes: { dynamic: 30 },
  },
  // Server-only / native packages — keep them out of the client & edge bundles.
  serverExternalPackages: [
    'postgres',
    '@node-rs/argon2',
    '@vercel/blob',
    'web-push',
  ],
};

module.exports = nextConfig;
