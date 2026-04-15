// apps/api/src/__tests__/integration/helpers/test-server.ts
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import * as schema from '../../../db/schema.js';
import type { AppDb } from '../../../db/client.js';
import { createApp } from '../../../app.js';
import { attachIngestWs } from '../../../ingest/index.js';
import { attachRealtimeWs } from '../../../realtime/index.js';
import { StateManager } from '../../../state/index.js';
import { PersistQueue, makePersistDeps } from '../../../persist/index.js';
import { makeDbIngestDeps } from '../../../ingest/index.js';
import { config } from '../../../config.js';
import { verifyToken } from '../../../auth/jwt.js';

const MIGRATIONS_PATH = fileURLToPath(new URL('../../../../migrations', import.meta.url));

export interface TestDb {
  db: AppDb;
  pgClient: ReturnType<typeof postgres>;
  container: StartedPostgreSqlContainer;
}

export interface TestServerHandle {
  baseUrl: string;
  server: http.Server;
  stateManager: StateManager;
  persistQueue: PersistQueue;
  close: () => Promise<void>;
}

export async function startContainer(): Promise<TestDb> {
  const container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
  const pgClient = postgres(container.getConnectionUri(), { max: 5 });
  const db = drizzle(pgClient, { schema }) as AppDb;
  await migrate(db, { migrationsFolder: MIGRATIONS_PATH });
  return { db, pgClient, container };
}

export async function stopContainer({ pgClient, container }: TestDb): Promise<void> {
  await pgClient.end();
  await container.stop();
}

export async function startTestServer(db: AppDb): Promise<TestServerHandle> {
  const app = createApp(db);
  const server = http.createServer(app as Parameters<typeof http.createServer>[0]);

  const stateManager = new StateManager();
  const persistQueue = new PersistQueue(makePersistDeps(db));

  attachIngestWs(server, {
    ...makeDbIngestDeps(db),
    onTelemetry: (droneId, msg) => {
      stateManager.update(droneId, msg);
      persistQueue.push({ ...msg, droneId });
    },
  });

  attachRealtimeWs(server, {
    verifyJwt: (token) => verifyToken(token, config.jwtSecret),
    stateManager,
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));

  const addr = server.address() as { port: number };
  const baseUrl = `http://localhost:${addr.port}`;

  const close = async (): Promise<void> => {
    await persistQueue.stop();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  };

  return { baseUrl, server, stateManager, persistQueue, close };
}
