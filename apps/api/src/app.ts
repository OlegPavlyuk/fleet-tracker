import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { logger } from './logger.js';
import { errorMiddleware } from './errors/middleware.js';
import { config } from './config.js';
import { db as globalDb } from './db/index.js';
import type { AppDb } from './db/client.js';
import { createAuthRouter } from './auth/index.js';
import { makeDbAuthDeps } from './auth/db-deps.js';
import { createDroneRouter } from './drones/index.js';
import { makeDbDroneDeps } from './drones/index.js';
import { createTelemetryRouter } from './telemetry/index.js';
import { makeDbTelemetryDeps } from './telemetry/index.js';
import { createTestRouter } from './test-router.js';

export function createApp(db: AppDb = globalDb): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.nodeEnv === 'production' ? false : true, credentials: true }));

  if (config.nodeEnv !== 'test') {
    app.use(pinoHttp({ logger }));
  }

  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/auth', createAuthRouter(makeDbAuthDeps(db)));
  app.use('/drones', createDroneRouter(makeDbDroneDeps(db)));
  app.use('/telemetry', createTelemetryRouter(makeDbTelemetryDeps(db)));

  if (config.nodeEnv === 'test') {
    app.use('/test', createTestRouter(db));
  }

  // 404 catch-all — must be after routes, before error middleware
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  app.use(errorMiddleware);

  return app;
}
