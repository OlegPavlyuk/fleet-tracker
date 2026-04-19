import { config } from './config.js';
import { logger } from './logger.js';
import { createApp } from './app.js';
import { queryClient } from './db/index.js';
import { attachIngestWs, makeDbIngestDeps } from './ingest/index.js';
import { attachRealtimeWs } from './realtime/index.js';
import { StateManager } from './state/index.js';
import { PersistQueue, makePersistDeps } from './persist/index.js';

import http from 'node:http';

const app = createApp();

const server = http.createServer(app as Parameters<typeof http.createServer>[0]);
server.listen(config.port, () => {
  logger.info({ port: config.port, nodeEnv: config.nodeEnv }, 'API server started');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutdown signal received');

  server.close((err) => {
    if (err) logger.error({ err }, 'Error closing HTTP server');
  });

  try {
    await persistQueue.stop(); // drain remaining telemetry before closing DB
    logger.info('Persist queue drained');
  } catch (err) {
    logger.error({ err }, 'Error draining persist queue');
  }

  try {
    await queryClient.end({ timeout: 5 });
    logger.info('Database connection pool closed');
  } catch (err) {
    logger.error({ err }, 'Error closing database pool');
  }

  logger.info('Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

const stateManager = new StateManager();
const persistQueue = new PersistQueue(makePersistDeps());

attachIngestWs(server, {
  ...makeDbIngestDeps(),
  onTelemetry: (droneId, msg, meta) => {
    stateManager.update(droneId, msg, {
      msgId: meta.msgId,
      serverRecvTs: meta.serverRecvTs,
      ...(meta.benchmarkId !== undefined && { benchmarkId: meta.benchmarkId }),
    });
    persistQueue.push({ ...msg, droneId }, meta.msgId); // use auth-verified droneId, not client-sent
  },
});

attachRealtimeWs(server, {
  verifyJwt: (token) =>
    import('./auth/jwt.js').then(({ verifyToken }) => verifyToken(token, config.jwtSecret)),
  stateManager,
});
