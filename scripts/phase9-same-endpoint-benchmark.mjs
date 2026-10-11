import { spawn } from "node:child_process";
import { once } from "node:events";
import { appendFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const endpoint = "/login";
const sampleCount = 60;
const warmupCount = 10;

function percentile(values, fraction) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.ceil(ordered.length * fraction) - 1];
}

async function startServer(port, enforce) {
  const startedAt = performance.now();
  const child = spawn(
    "npm",
    ["run", "start", "--", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        CI: "true",
        CSP_PHASE9_STAGING_ENFORCE: enforce ? "1" : "0",
        VERCEL: "",
        VERCEL_ENV: "",
      },
    }
  );
  child.unref();
  const url = `http://127.0.0.1:${port}${endpoint}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status === 200) {
        await response.arrayBuffer();
        return { child, url, readyMs: performance.now() - startedAt };
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`server did not become ready on ${port}`);
}

function stopServer(child) {
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
}

async function sample(url) {
  const startedAt = performance.now();
  const response = await fetch(url, {
    headers: { accept: "text/html" },
    redirect: "manual",
  });
  const headersAt = performance.now();
  const body = await response.arrayBuffer();
  const completedAt = performance.now();
  if (response.status !== 200) {
    throw new Error(`unexpected status ${response.status} for ${url}`);
  }
  const headerBytes = [...response.headers].reduce(
    (total, [name, value]) => total + name.length + value.length + 4,
    0
  );
  return {
    ttfbMs: headersAt - startedAt,
    totalMs: completedAt - startedAt,
    headerBytes,
    bodyBytes: body.byteLength,
    cacheControl: response.headers.get("cache-control"),
    nonce: response.headers
      .get("content-security-policy")
      ?.match(/'nonce-([^']+)'/)?.[1],
  };
}

let baseline;
let candidate;
try {
  baseline = await startServer(3101, false);
  candidate = await startServer(3102, true);
  for (let index = 0; index < warmupCount; index += 1) {
    await sample(baseline.url);
    await sample(candidate.url);
  }
  const baselineSamples = [];
  const candidateSamples = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const first = index % 2 === 0 ? baseline : candidate;
    const second = index % 2 === 0 ? candidate : baseline;
    const firstSample = await sample(first.url);
    const secondSample = await sample(second.url);
    (first === baseline ? baselineSamples : candidateSamples).push(firstSample);
    (second === baseline ? baselineSamples : candidateSamples).push(secondSample);
  }
  const summarize = (samples) => ({
    p50TtfbMs: Number(percentile(samples.map((item) => item.ttfbMs), 0.5).toFixed(2)),
    p95TtfbMs: Number(percentile(samples.map((item) => item.ttfbMs), 0.95).toFixed(2)),
    p50TotalMs: Number(percentile(samples.map((item) => item.totalMs), 0.5).toFixed(2)),
    p95TotalMs: Number(percentile(samples.map((item) => item.totalMs), 0.95).toFixed(2)),
    medianHeaderBytes: Math.round(percentile(samples.map((item) => item.headerBytes), 0.5)),
    medianBodyBytes: Math.round(percentile(samples.map((item) => item.bodyBytes), 0.5)),
    cacheControl: samples[0].cacheControl,
    nonceResponses: samples.filter((item) => item.nonce).length,
  });
  const baselineResult = summarize(baselineSamples);
  const candidateResult = summarize(candidateSamples);
  const ciP95GuardMs = Math.max(
    baselineResult.p95TtfbMs * 3,
    baselineResult.p95TtfbMs + 20
  );
  const result = {
    environment: "GitHub-hosted Ubuntu runner; same build and /login endpoint",
    samplesPerVariant: sampleCount,
    warmupPerVariant: warmupCount,
    concurrency: 1,
    baselineReadyMs: Number(baseline.readyMs.toFixed(2)),
    candidateReadyMs: Number(candidate.readyMs.toFixed(2)),
    baseline: baselineResult,
    candidate: candidateResult,
    ciP95GuardMs: Number(ciP95GuardMs.toFixed(2)),
    caveat: "CI component benchmark; not Vercel cold-start, CDN, cost or capacity evidence",
  };
  if (baselineResult.nonceResponses !== 0) {
    throw new Error("baseline unexpectedly received nonce CSP");
  }
  if (candidateResult.nonceResponses !== sampleCount) {
    throw new Error("candidate did not receive nonce on every response");
  }
  if (candidateResult.p95TtfbMs > ciP95GuardMs) {
    throw new Error(`candidate p95 ${candidateResult.p95TtfbMs}ms exceeds CI guard ${ciP95GuardMs}ms`);
  }
  process.stdout.write(`PHASE9_SAME_ENDPOINT_PERF=${JSON.stringify(result)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `## Phase 9 same-endpoint CI benchmark\n\n\`${JSON.stringify(result)}\`\n`
    );
  }
} finally {
  if (baseline) stopServer(baseline.child);
  if (candidate) stopServer(candidate.child);
  await Promise.race([
    Promise.all(
      [baseline?.child, candidate?.child]
        .filter(Boolean)
        .map((child) => once(child, "exit").catch(() => undefined))
    ),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
}