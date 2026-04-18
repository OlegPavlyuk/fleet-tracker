import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const API_BASE = process.env['API_BASE_URL'] ?? 'http://localhost:3000';

interface RegisterResponse {
  token: string;
  user: { id: string; email: string };
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

const DRONE_ID = 'e2e-popup-drone';
const DRONE_SNAPSHOT = {
  droneId: DRONE_ID,
  ts: Date.now(),
  lat: 50.45,
  lng: 30.52,
  altitude_m: 100,
  heading_deg: 0,
  speed_mps: 10,
  battery_pct: 90,
  status: 'active' as const,
};

test.describe('Map popup stability', () => {
  let token: string;
  let userId: string;
  let userEmail: string;

  test.beforeAll(async () => {
    userEmail = `e2e-popup-${randomUUID()}@test.com`;
    const { token: t, user } = await registerUser(userEmail, 'password123');
    token = t;
    userId = user.id;
  });

  test('popup stays open after a drone telemetry update', async ({ page }) => {
    // Inject auth into localStorage before navigating
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
    await page.goto('/');

    // Wait for map canvas to be ready
    await expect(page.locator('canvas')).toBeVisible();
    // Give MapLibre time to fire the 'load' event and set isMapReadyRef
    await page.waitForTimeout(2000);

    // Inject a drone snapshot into the store and select it
    await page.evaluate(
      ([snap]) => {
        const store = (window as unknown as Record<string, unknown>)['__droneStore'] as {
          getState: () => {
            setSnapshot: (arr: unknown[]) => void;
            selectDrone: (id: string) => void;
            updateDrone: (snap: unknown) => void;
          };
        };
        store.getState().setSnapshot([snap]);
        store.getState().selectDrone(snap.droneId);
      },
      [DRONE_SNAPSHOT] as [typeof DRONE_SNAPSHOT],
    );

    // Popup should appear in DOM (MapLibre renders popup as real DOM nodes)
    await expect(page.locator('.maplibregl-popup')).toBeVisible({ timeout: 3000 });

    // Simulate a telemetry update for the same drone (battery ticking down, position shift)
    await page.evaluate(
      ([snap]) => {
        const store = (window as unknown as Record<string, unknown>)['__droneStore'] as {
          getState: () => { updateDrone: (snap: unknown) => void };
        };
        store.getState().updateDrone({
          ...snap,
          ts: Date.now(),
          lat: 50.451,
          lng: 30.521,
          battery_pct: 89,
        });
      },
      [DRONE_SNAPSHOT] as [typeof DRONE_SNAPSHOT],
    );

    // Wait for React effects to settle
    await page.waitForTimeout(500);

    // Popup must still be visible — this fails with the bug (cascade closes it)
    await expect(page.locator('.maplibregl-popup')).toBeVisible();

    // And the updated battery value should be shown in the popup
    await expect(page.locator('.maplibregl-popup')).toContainText('89%');
  });
});
