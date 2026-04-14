import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { logger } from './logger.js';
import { errorMiddleware } from './errors/middleware.js';
import { config } from './config.js';

export function createApp(): Express {
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

  // 404 catch-all — must be after routes, before error middleware
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  app.use(errorMiddleware);

  return app;
}
