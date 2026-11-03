import { defineConfig } from 'prisma/config';

// Prisma 7 does not load .env by itself. Dev: load it here. Production: the caller passes --env-file.
try {
  process.loadEnvFile();
} catch {}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // The fallback lets `prisma generate` run in CI without a database. Real commands (migrate) always get the real URL.
    url: process.env.DATABASE_URL ?? 'postgresql://invalid:invalid@localhost:5432/invalid',
  },
});
