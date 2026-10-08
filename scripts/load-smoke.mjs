const rawBaseUrl = process.env.TARGET_BASE_URL ?? "";
const requestCount = Number(process.env.LOAD_REQUESTS ?? "100");
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? "5");
const maxP95Ms = Number(process.env.MAX_P95_MS ?? "5000");
const maxErrorRate = Number(process.env.MAX_ERROR_RATE ?? "0.01");

let baseUrl;
try {
  baseUrl = new URL(rawBaseUrl);
} catch {
  throw new Error("TARGET_BASE_URL inválida.");
}

if (!["https:", "http:"].includes(baseUrl.protocol)) {
  throw new Error("TARGET_BASE_URL deve usar http ou https.");
}

if (
  !Number.isInteger(requestCount) ||
  requestCount < 1 ||
  requestCount > 1000
) {
  throw new Error("LOAD_REQUESTS deve estar entre 1 e 1000.");
}

if (
  !Number.isInteger(concurrency) ||
  concurrency < 1 ||
  concurrency > 25
) {
  throw new Error("LOAD_CONCURRENCY deve estar entre 1 e 25.");
}

const target = new URL("/api/health", baseUrl).toString();
const latencies = [];
let success = 0;
let failed = 0;
let cursor = 0;

async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= requestCount) return;

    const started = performance.now();
    try {
      const response = await fetch(target, {
        method: "GET",
        redirect: "manual",
        headers: {
          "user-agent": "profissionais-homologation-smoke/1.0",
        },
        signal: AbortSignal.timeout(10_000),
      });
      const elapsed = performance.now() - started;
      latencies.push(elapsed);

      if (response.status === 200) {
        success += 1;
      } else {
        failed += 1;
      }
    } catch {
      latencies.push(performance.now() - started);
      failed += 1;
    }
  }
}

await Promise.all(
  Array.from(
    { length: Math.min(concurrency, requestCount) },
    () => worker()
  )
);

latencies.sort((a, b) => a - b);
const percentile = (p) => {
  if (!latencies.length) return 0;
  const index = Math.min(
    latencies.length - 1,
    Math.ceil((p / 100) * latencies.length) - 1
  );
  return latencies[index];
};

const avg =
  latencies.reduce((total, value) => total + value, 0) /
  Math.max(latencies.length, 1);
const p95 = percentile(95);
const errorRate = failed / requestCount;

const summary = {
  target,
  requests: requestCount,
  concurrency,
  success,
  failed,
  errorRate: Number(errorRate.toFixed(4)),
  averageMs: Number(avg.toFixed(1)),
  p95Ms: Number(p95.toFixed(1)),
};

console.log(JSON.stringify(summary));

if (errorRate > maxErrorRate) {
  throw new Error(
    `Taxa de erro ${errorRate.toFixed(4)} acima de ${maxErrorRate}.`
  );
}

if (p95 > maxP95Ms) {
  throw new Error(
    `p95 ${p95.toFixed(1)}ms acima de ${maxP95Ms}ms.`
  );
}
