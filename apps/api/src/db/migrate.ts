import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const migrationClient = postgres(databaseUrl, {
  max: 1,
  onnotice: () => {}, // suppress PostGIS NOTICE messages
});

const db = drizzle(migrationClient);

console.info('Running migrations…');

try {
  await migrate(db, { migrationsFolder: './migrations' });
  console.info('Migrations complete');
} catch (err) {
  console.error('Migration failed:', err);
  process.exit(1);
} finally {
  await migrationClient.end();
}
