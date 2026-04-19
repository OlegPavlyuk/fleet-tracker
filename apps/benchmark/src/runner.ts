import { BenchmarkDroneClient } from './bench-client.js';
import { BenchmarkSubscriber } from './subscriber.js';
import { createDroneState, type BBox } from './drone.js';
import { registerDrone, type ApiClient, type ProvisionedDrone } from './api.js';

const KYIV_BBOX: BBox = { minLng: 30.3, minLat: 50.35, maxLng: 30.7, maxLat: 50.55 };

export interface StepConfig {
  drones: number;
  hz: number;
  durationS: number;
  apiClient: ApiClient;
  ingestUrl: string;
  streamUrl: string;
}

export interface StepResult {
  drones: number;
  samples: import('./subscriber.js').LatencySample[];
}

async function provisionDrones(
  apiClient: ApiClient,
  count: number,
  prefix: string,
): Promise<ProvisionedDrone[]> {
  const concurrency = 10;
  const results: ProvisionedDrone[] = [];
  for (let i = 0; i < count; i += concurrency) {
    const batch = Array.from({ length: Math.min(concurrency, count - i) }, (_, j) =>
      registerDrone(apiClient, `${prefix}-${String(i + j + 1).padStart(4, '0')}`),
    );
    results.push(...(await Promise.all(batch)));
    process.stdout.write(`  Registered ${Math.min(i + concurrency, count)}/${count} drones\r`);
  }
  console.log();
  return results;
}

export async function runStep(cfg: StepConfig): Promise<StepResult> {
  const tickMs = Math.round(1000 / cfg.hz);
  const sentFrames = new Map<string, number>();

  const subscriber = new BenchmarkSubscriber(cfg.streamUrl, cfg.apiClient.jwt, sentFrames);
  await subscriber.connect();

  const prefix = `bench-${Date.now()}`;
  const provisioned = await provisionDrones(cfg.apiClient, cfg.drones, prefix);

  const clients = provisioned.map((drone) => {
    const initialState = createDroneState(drone.id, KYIV_BBOX);
    return new BenchmarkDroneClient({
      ingestUrl: cfg.ingestUrl,
      deviceToken: drone.deviceToken,
      initialState,
      bbox: KYIV_BBOX,
      tickMs,
      sentFrames,
    });
  });

  console.log(`  Running ${cfg.drones} drones @ ${cfg.hz} Hz for ${cfg.durationS}s…`);
  subscriber.clearSamples();

  for (const client of clients) client.start();
  await new Promise((resolve) => setTimeout(resolve, cfg.durationS * 1000));
  for (const client of clients) client.stop();

  // Brief drain window for in-flight frames
  await new Promise((resolve) => setTimeout(resolve, 500));

  subscriber.disconnect();
  return { drones: cfg.drones, samples: subscriber.getSamples() };
}
