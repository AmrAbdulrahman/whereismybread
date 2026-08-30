import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs outside Next, so load env files ourselves.
config({ path: ['.env.local', '.env'], quiet: true });

export default defineConfig({
  schema: './libs/db/src/lib/schema/index.ts',
  out: './libs/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // Migrations use the DIRECT (non-pooling) connection — never the pooler.
    url:
      process.env['POSTGRES_URL_NON_POOLING'] ??
      process.env['POSTGRES_URL'] ??
      '',
  },
  strict: true,
  verbose: true,
});
