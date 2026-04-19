import { describe, it, expect } from 'vitest';
import supertest from 'supertest';
import express from 'express';
import { createMetricsHandler } from './middleware.js';

describe('createMetricsHandler', () => {
  const app = express();
  app.get('/metrics', createMetricsHandler('correct-token-16ch'));

  it('returns 401 with no Authorization header', async () => {
    const res = await supertest(app).get('/metrics');
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong token', async () => {
    const res = await supertest(app).get('/metrics').set('Authorization', 'Bearer wrong-token');
    expect(res.status).toBe(401);
  });

  it('returns 401 with malformed Authorization header (no Bearer prefix)', async () => {
    const res = await supertest(app).get('/metrics').set('Authorization', 'correct-token-16ch');
    expect(res.status).toBe(401);
  });

  it('returns 200 with correct Bearer token', async () => {
    const res = await supertest(app)
      .get('/metrics')
      .set('Authorization', 'Bearer correct-token-16ch');
    expect(res.status).toBe(200);
  });

  it('returns text/plain content-type with correct token', async () => {
    const res = await supertest(app)
      .get('/metrics')
      .set('Authorization', 'Bearer correct-token-16ch');
    expect(res.headers['content-type']).toMatch(/text\/plain/);
  });
});
