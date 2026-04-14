import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.nodeEnv === 'test' ? 'silent' : 'info',
  ...(config.nodeEnv === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true },
        },
      }
    : {}),
});
