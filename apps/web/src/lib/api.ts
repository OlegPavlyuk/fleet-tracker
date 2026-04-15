import type { DroneStatus } from '@fleet-tracker/shared';
import { request } from './http.js';

// ── Response types ────────────────────────────────────────────────────────────

export interface DroneResponse {
  id: string;
  ownerId: string;
  name: string;
  model: string;
  status: DroneStatus;
  createdAt: string;
}

export interface HistoryPoint {
  ts: number;
  lat: number;
  lng: number;
  altitude_m: number;
  heading_deg: number;
  speed_mps: number;
  battery_pct: number;
}

export interface HistoryParams {
  drone_id: string;
  from: number;
  to: number;
  bbox?: string;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

interface AuthResult {
  token: string;
  user: { id: string; email: string };
}

async function register(email: string, password: string): Promise<AuthResult> {
  return request<AuthResult>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

async function login(email: string, password: string): Promise<AuthResult> {
  return request<AuthResult>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

async function me(): Promise<{ id: string; email: string }> {
  const res = await request<{ user: { id: string; email: string } }>('/auth/me');
  return res.user;
}

// ── Drones ────────────────────────────────────────────────────────────────────

async function listDrones(): Promise<DroneResponse[]> {
  const res = await request<{ drones: DroneResponse[] }>('/drones');
  return res.drones;
}

async function createDrone(
  name: string,
  model: string,
): Promise<{ drone: DroneResponse; deviceToken: string }> {
  return request<{ drone: DroneResponse; deviceToken: string }>('/drones', {
    method: 'POST',
    body: JSON.stringify({ name, model }),
  });
}

async function updateDrone(
  id: string,
  patch: { name?: string; model?: string; status?: DroneStatus },
): Promise<DroneResponse> {
  const res = await request<{ drone: DroneResponse }>(`/drones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return res.drone;
}

async function deleteDrone(id: string): Promise<void> {
  await request<void>(`/drones/${id}`, { method: 'DELETE' });
}

// ── Telemetry ─────────────────────────────────────────────────────────────────

async function history(params: HistoryParams): Promise<HistoryPoint[]> {
  const qs = new URLSearchParams({
    drone_id: params.drone_id,
    from: String(params.from),
    to: String(params.to),
  });
  if (params.bbox !== undefined) qs.set('bbox', params.bbox);
  const res = await request<{
    droneId: string;
    from: number;
    to: number;
    points: HistoryPoint[];
  }>(`/telemetry/history?${qs.toString()}`);
  return res.points;
}

// ── Exports ───────────────────────────────────────────────────────────────────

export const api = {
  auth: { register, login, me },
  drones: { list: listDrones, create: createDrone, update: updateDrone, delete: deleteDrone },
  telemetry: { history },
};
