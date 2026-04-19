export interface HistogramStats {
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

interface Bucket {
  le: number;
  count: number;
}

function parseHistogram(text: string, metricName: string): HistogramStats {
  const buckets: Bucket[] = [];
  let totalCount = 0;

  for (const line of text.split('\n')) {
    const bucketMatch = line.match(new RegExp(`^${metricName}_bucket\\{le="([^"]+)"\\} (\\d+)`));
    if (bucketMatch) {
      const le = bucketMatch[1] === '+Inf' ? Infinity : parseFloat(bucketMatch[1] ?? '0');
      const count = parseInt(bucketMatch[2] ?? '0', 10);
      buckets.push({ le, count });
      continue;
    }
    const countMatch = line.match(new RegExp(`^${metricName}_count (\\d+)`));
    if (countMatch) {
      totalCount = parseInt(countMatch[1] ?? '0', 10);
    }
  }

  if (buckets.length === 0 || totalCount === 0) return { p50: 0, p95: 0, p99: 0, max: 0 };

  function interpolate(p: number): number {
    const target = (p / 100) * totalCount;
    let prev = { le: 0, count: 0 };
    for (const b of buckets) {
      if (b.count >= target) {
        if (b.le === Infinity) return prev.le;
        const countInBucket = b.count - prev.count;
        if (countInBucket === 0) return prev.le;
        const fraction = (target - prev.count) / countInBucket;
        return prev.le + fraction * (b.le - prev.le);
      }
      prev = b;
    }
    return prev.le;
  }

  const finiteMax = [...buckets].reverse().find((b) => b.le !== Infinity);
  return {
    p50: Math.round(interpolate(50) * 100) / 100,
    p95: Math.round(interpolate(95) * 100) / 100,
    p99: Math.round(interpolate(99) * 100) / 100,
    max: finiteMax?.le ?? 0,
  };
}

export function parseGauge(text: string, metricName: string): number {
  for (const line of text.split('\n')) {
    const m = line.match(new RegExp(`^${metricName}(?:\\{[^}]*\\})? ([\\d.e+\\-]+)`));
    if (m) return parseFloat(m[1] ?? '0');
  }
  return 0;
}

export function parseCounter(text: string, metricName: string, labels?: string): number {
  const labelFilter = labels ? `\\{[^}]*${labels}[^}]*\\}` : '(?:\\{[^}]*\\})?';
  let total = 0;
  for (const line of text.split('\n')) {
    const m = line.match(new RegExp(`^${metricName}${labelFilter} ([\\d.e+\\-]+)`));
    if (m) total += parseFloat(m[1] ?? '0');
  }
  return total;
}

export { parseHistogram };
