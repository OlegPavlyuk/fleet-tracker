import { describe, it, expect } from 'vitest';
import express, { type Express } from 'express';
import supertest from 'supertest';
import { NotFoundError, ValidationError, UnauthorizedError } from './index.js';
import { errorMiddleware } from './middleware.js';

function makeApp(thrownError: unknown): Express {
  const app = express();
  app.get('/test', (_req, _res, next) => {
    next(thrownError);
  });
  app.use(errorMiddleware);
  return app;
}

describe('errorMiddleware', () => {
  it('maps NotFoundError to 404 with code NOT_FOUND', async () => {
    const res = await supertest(makeApp(new NotFoundError('drone missing'))).get('/test');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      error: { code: 'NOT_FOUND', message: 'drone missing' },
    });
  });

  it('maps ValidationError to 400', async () => {
    const res = await supertest(makeApp(new ValidationError('bad input'))).get('/test');
    expect(res.status).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });

  it('maps UnauthorizedError to 401', async () => {
    const res = await supertest(makeApp(new UnauthorizedError())).get('/test');
    expect(res.status).toBe(401);
    expect((res.body as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
  });

  it('maps unknown Error to 500 with code INTERNAL_ERROR', async () => {
    const res = await supertest(makeApp(new Error('something unexpected'))).get('/test');
    expect(res.status).toBe(500);
    expect((res.body as { error: { code: string } }).error.code).toBe('INTERNAL_ERROR');
  });

  it('maps non-Error thrown values to 500', async () => {
    const res = await supertest(makeApp('a plain string')).get('/test');
    expect(res.status).toBe(500);
    expect((res.body as { error: { code: string } }).error.code).toBe('INTERNAL_ERROR');
  });

  it('does not expose stack trace in response body', async () => {
    const res = await supertest(makeApp(new Error('boom'))).get('/test');
    expect(JSON.stringify(res.body)).not.toContain('at ');
  });
});
