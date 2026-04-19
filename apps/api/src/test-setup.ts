// Provide minimum valid env vars for tests that import modules
// which transitively load config.ts at module evaluation time.
// Tests that specifically test config.ts use vi.resetModules() + dynamic import
// to override these values for individual test cases.

process.env['DATABASE_URL'] = 'postgres://postgres:password@localhost:5432/fleet_tracker_test';
process.env['JWT_SECRET'] = 'test-secret-that-is-at-least-32-chars-long';
process.env['JWT_EXPIRES_IN'] = '15m';
process.env['PORT'] = '3001';
process.env['NODE_ENV'] = 'test';
process.env['METRICS_TOKEN'] = 'test-metrics-token-16ch';
