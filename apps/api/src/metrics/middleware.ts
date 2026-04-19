import type { RequestHandler } from 'express';
import { registry } from './registry.js';

export function createMetricsHandler(metricsToken: string): RequestHandler {
  return async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${metricsToken}`) {
      res.status(401).end();
      return;
    }
    const output = await registry.metrics();
    res.setHeader('Content-Type', registry.contentType);
    res.send(output);
  };
}
