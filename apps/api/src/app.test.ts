import { describe, it, expect } from 'vitest';
import supertest from 'supertest';
import { createApp } from './app.js';

describe('createApp', () => {
  it('GET /health returns 200 with { status: "ok" }', async () => {
    const app = createApp();
    const res = await supertest(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('unknown route returns 404', async () => {
    const app = createApp();
    const res = await supertest(app).get('/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('/health responds with JSON content-type', async () => {
    const app = createApp();
    const res = await supertest(app).get('/health');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('GET /metrics returns 401 without Authorization header', async () => {
    const app = createApp();
    const res = await supertest(app).get('/metrics');
    expect(res.status).toBe(401);
  });

  it('GET /metrics returns 401 with wrong token', async () => {
    const app = createApp();
    const res = await supertest(app).get('/metrics').set('Authorization', 'Bearer wrong');
    expect(res.status).toBe(401);
  });

  it('GET /metrics returns 200 with correct token', async () => {
    const app = createApp();
    // test-setup.ts sets METRICS_TOKEN='test-metrics-token-16ch'
    const res = await supertest(app)
      .get('/metrics')
      .set('Authorization', 'Bearer test-metrics-token-16ch');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
  });
});
