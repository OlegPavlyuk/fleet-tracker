import { program } from 'commander';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { login } from './api.js';
import { runStep } from './runner.js';
import { writeArtifacts } from './aggregator.js';

program
  .name('bench')
  .requiredOption('--scenario <name>', 'baseline | ramp | sustained | highfreq')
  .requiredOption('--tag <label>', 'label for this run, e.g. v2.1-baseline')
  .option('--drones <n>', 'override drone count (baseline/sustained only)', parseInt)
  .option('--hz <n>', 'telemetry frequency in Hz', parseFloat, 1)
  .option('--duration <s>', 'override duration in seconds', parseInt)
  .option('--api-url <url>', 'Fleet Tracker API base URL', 'http://localhost:3000')
  .option('--out <dir>', 'output root directory', 'docs/benchmarks')
  .parse();

const opts = program.opts<{
  scenario: string;
  tag: string;
  drones?: number;
  hz: number;
  duration?: number;
  apiUrl: string;
  out: string;
}>();

const EMAIL = process.env['BENCH_EMAIL'] ?? process.env['EMULATOR_EMAIL'];
const PASSWORD = process.env['BENCH_PASSWORD'] ?? process.env['EMULATOR_PASSWORD'];
const METRICS_TOKEN = process.env['METRICS_TOKEN'] ?? '';

if (!EMAIL || !PASSWORD) {
  console.error('Error: BENCH_EMAIL and BENCH_PASSWORD (or EMULATOR_EMAIL/PASSWORD) must be set.');
  process.exit(1);
}

if (!METRICS_TOKEN) {
  console.warn('Warning: METRICS_TOKEN not set — metrics-snapshot.txt will be empty.');
}

const RAMP_STEPS = [10, 100, 500, 1000];

interface ScenarioDef {
  steps: Array<{ drones: number; durationS: number }>;
  hz: number;
}

function buildScenario(): ScenarioDef {
  const hz = opts.hz;
  switch (opts.scenario) {
    case 'baseline':
      return { steps: [{ drones: opts.drones ?? 10, durationS: opts.duration ?? 60 }], hz };
    case 'ramp':
      return {
        steps: RAMP_STEPS.map((d) => ({ drones: d, durationS: opts.duration ?? 60 })),
        hz,
      };
    case 'sustained':
      return { steps: [{ drones: opts.drones ?? 1000, durationS: opts.duration ?? 300 }], hz };
    case 'highfreq':
      return { steps: [{ drones: opts.drones ?? 1000, durationS: opts.duration ?? 120 }], hz };
    default:
      console.error(
        `Unknown scenario: ${opts.scenario}. Choose baseline | ramp | sustained | highfreq.`,
      );
      process.exit(1);
  }
}

function ingestUrl(apiUrl: string): string {
  return apiUrl.replace(/^http/, 'ws') + '/ws/ingest';
}

function streamUrl(apiUrl: string): string {
  return apiUrl.replace(/^http/, 'ws') + '/ws/stream';
}

function outDir(scenario: string, tag: string, drones?: number): string {
  const date = new Date().toISOString().slice(0, 10);
  const suffix = drones !== undefined ? `-${drones}` : '';
  return resolve(join(opts.out, `${date}-${scenario}${suffix}-${tag}`));
}

function appendIndex(
  dir: string,
  drones: number,
  hz: number,
  e2eP95: number,
  serverP95: number,
): void {
  const indexPath = resolve(join(opts.out, 'INDEX.md'));
  const header = `# Benchmark Index\n\n| Date | Scenario | Tag | Drones | e2e p95 (ms) | server p95 (ms) | Link |\n|---|---|---|---|---|---|---|\n`;
  const date = new Date().toISOString().slice(0, 10);
  const row = `| ${date} | ${opts.scenario} | ${opts.tag} | ${drones} @ ${hz} Hz | ${e2eP95} | ${serverP95} | [summary](${dir}/summary.md) |\n`;
  if (!existsSync(indexPath)) writeFileSync(indexPath, header);
  const existing = readFileSync(indexPath, 'utf8');
  writeFileSync(indexPath, existing + row);
}

async function main(): Promise<void> {
  const scenario = buildScenario();

  console.log(`\nFleet Tracker Benchmark`);
  console.log(`  Scenario: ${opts.scenario}`);
  console.log(`  Tag:      ${opts.tag}`);
  console.log(`  API:      ${opts.apiUrl}`);
  console.log(
    `  Steps:    ${scenario.steps.map((s) => `${s.drones}d/${s.durationS}s`).join(' → ')}\n`,
  );

  console.log(`Logging in…`);
  const jwt = await login(opts.apiUrl, EMAIL!, PASSWORD!);
  console.log('Login OK\n');

  const apiClient = { apiUrl: opts.apiUrl, jwt };

  for (const step of scenario.steps) {
    console.log(`\n── Step: ${step.drones} drones @ ${scenario.hz} Hz for ${step.durationS}s`);

    const result = await runStep({
      drones: step.drones,
      hz: scenario.hz,
      durationS: step.durationS,
      apiClient,
      ingestUrl: ingestUrl(opts.apiUrl),
      streamUrl: streamUrl(opts.apiUrl),
    });

    const dir = outDir(
      opts.scenario,
      opts.tag,
      scenario.steps.length > 1 ? step.drones : undefined,
    );
    await writeArtifacts(
      {
        scenario: opts.scenario,
        tag: opts.tag,
        drones: step.drones,
        hz: scenario.hz,
        durationS: step.durationS,
        apiUrl: opts.apiUrl,
        metricsToken: METRICS_TOKEN,
        outDir: dir,
      },
      result.samples,
    );

    console.log(`  Samples: ${result.samples.length}  →  artifacts at ${dir}`);

    const resultsJson = JSON.parse(readFileSync(`${dir}/results.json`, 'utf8')) as {
      latency_ms: { e2e: { p95: number }; server_recv_to_send: { p95: number } };
    };
    appendIndex(
      dir,
      step.drones,
      scenario.hz,
      resultsJson.latency_ms.e2e.p95,
      resultsJson.latency_ms.server_recv_to_send.p95,
    );
  }

  console.log('\nDone.');
}

main().catch((err: unknown) => {
  console.error('Fatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
