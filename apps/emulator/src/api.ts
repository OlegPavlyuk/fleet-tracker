/**
 * Thin HTTP client for provisioning drones via the Fleet Tracker REST API.
 * Uses Node 20 built-in fetch.
 */

export interface ApiClient {
  apiUrl: string;
  jwt: string;
}

export interface ProvisionedDrone {
  id: string;
  name: string;
  deviceToken: string;
}

/** POST /auth/login → JWT access token */
export async function login(apiUrl: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Login failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { token: string };
  return data.token;
}

/**
 * POST /drones → creates one drone and returns its id + plain-text device token.
 * The token is only returned once by the API.
 */
export async function registerDrone(client: ApiClient, name: string): Promise<ProvisionedDrone> {
  const res = await fetch(`${client.apiUrl}/drones`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${client.jwt}`,
    },
    body: JSON.stringify({ name, model: 'Emulator v1' }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Register drone "${name}" failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { drone: { id: string }; deviceToken: string };
  return { id: data.drone.id, name, deviceToken: data.deviceToken };
}
