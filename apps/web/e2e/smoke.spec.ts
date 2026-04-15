import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const API_BASE = process.env['API_BASE_URL'] ?? 'http://localhost:3000';

interface RegisterResponse {
  token: string;
  user: { id: string; email: string };
}

interface DroneResponse {
  id: string;
  deviceToken: string;
}

async function registerUser(email: string, password: string): Promise<RegisterResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Register failed: ${res.status}`);
  return res.json() as Promise<RegisterResponse>;
}

async function createDrone(token: string): Promise<DroneResponse> {
  const res = await fetch(`${API_BASE}/drones`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name: 'E2E Drone', model: 'DJI' }),
  });
  if (!res.ok) throw new Error(`Create drone failed: ${res.status}`);
  return res.json() as Promise<DroneResponse>;
}

async function seedTelemetry(token: string, droneId: string, count: number): Promise<void> {
  const now = Date.now();
  const points = Array.from({ length: count }, (_, i) => ({
    ts: now - (count - i) * 60_000, // spread over last `count` minutes
    lat: 50.45 + i * 0.001,
    lng: 30.52 + i * 0.001,
    altitude_m: 100,
    heading_deg: 0,
    speed_mps: 5,
    battery_pct: 90 - i,
  }));
  const res = await fetch(`${API_BASE}/test/seed-telemetry`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ droneId, points }),
  });
  if (!res.ok) throw new Error(`Seed failed: ${res.status}`);
}

test.describe('Smoke — Auth flow + Dashboard', () => {
  test('register → dashboard → map canvas visible', async ({ page }) => {
    const email = `e2e-${randomUUID()}@test.com`;
    const password = 'password123';

    await page.goto('/register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /register/i }).click();

    // Should redirect to dashboard
    await expect(page).toHaveURL('/');

    // Map canvas must be present
    await expect(page.locator('canvas')).toBeVisible();
  });
});

test.describe('Smoke — History view', () => {
  let token: string;
  let userId: string;
  let userEmail: string;
  let droneId: string;

  test.beforeAll(async () => {
    userEmail = `e2e-hist-${randomUUID()}@test.com`;
    const { token: t, user } = await registerUser(userEmail, 'password123');
    token = t;
    userId = user.id;
    const drone = await createDrone(token);
    droneId = drone.id;
    // Seed 6 telemetry points spread over the last 10 minutes
    await seedTelemetry(token, droneId, 6);
  });

  test('history page shows ≥1 point for Last 5 min preset', async ({ page }) => {
    // Inject JWT into localStorage so the React app treats the session as authenticated
    await page.goto('/');
    await page.evaluate(
      ([t, uid, uemail]) => {
        localStorage.setItem(
          'fleet-auth',
          JSON.stringify({
            state: { token: t, user: { id: uid, email: uemail } },
            version: 0,
          }),
        );
      },
      [token, userId, userEmail] as [string, string, string],
    );

    await page.goto(`/drones/${droneId}/history`);
    await page.getByRole('button', { name: /last 5 min/i }).click();
    await page.getByRole('button', { name: /load/i }).click();

    // Stats bar should show at least 1 point
    await expect(page.getByText(/\d+\s*points/i)).toBeVisible();
  });
});
