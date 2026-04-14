import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { config } from '../config.js';
import * as schema from './schema.js';

const queryClient = postgres(config.databaseUrl, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(queryClient, {
  schema,
  logger: config.nodeEnv === 'development',
});

// Exported for graceful shutdown in index.ts
export { queryClient };
