// apps/api/src/__tests__/integration/helpers/collect-messages.ts
import WebSocket from 'ws';

export function collectMessages<T>(ws: WebSocket, count: number, maxWaitMs = 5000): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const collected: T[] = [];

    const timer = setTimeout(() => {
      resolve(collected); // resolve with what we have — caller asserts
    }, maxWaitMs);

    ws.on('message', (raw) => {
      try {
        const str = Buffer.isBuffer(raw)
          ? raw.toString('utf8')
          : Array.isArray(raw)
            ? Buffer.concat(raw).toString('utf8')
            : Buffer.from(raw).toString('utf8');
        collected.push(JSON.parse(str) as T);
      } catch {
        // ignore non-JSON frames
      }
      if (collected.length >= count) {
        clearTimeout(timer);
        resolve(collected);
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
