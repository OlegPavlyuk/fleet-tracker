import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set — required for drizzle-kit commands');
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl },
  verbose: true,
  strict: true,
});
