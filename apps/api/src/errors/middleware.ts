import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { AppError } from './index.js';
import { logger } from '../logger.js';

// 4-parameter signature is required for Express to identify error middleware
export const errorMiddleware: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) => {
  if (err instanceof AppError) {
    logger.warn({ code: err.code, statusCode: err.statusCode }, err.message);
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
};
