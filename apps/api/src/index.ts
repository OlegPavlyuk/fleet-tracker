import { config } from './config.js';
import { logger } from './logger.js';
import { createApp } from './app.js';
import { queryClient } from './db/index.js';
import { attachIngestWs, makeDbIngestDeps } from './ingest/index.js';
import { StateManager } from './state/index.js';

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, nodeEnv: config.nodeEnv }, 'API server started');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutdown signal received');

  server.close((err) => {
    if (err) logger.error({ err }, 'Error closing HTTP server');
  });

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

attachIngestWs(server, {
  ...makeDbIngestDeps(),
  onTelemetry: (droneId, msg) => {
    stateManager.update(droneId, msg);
    // persist queue wired in Step 9
  },
});

// attachRealtimeWs(server); — wired in Step 10
