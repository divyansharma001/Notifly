import client from "prom-client";
import type { Request, Response } from "express";
import { queueFor } from "./queues/index.js";
import { redis } from "./redis.js";
import { CHANNELS } from "./types.js";
import { sentKey, failedKey } from "./metricsKeys.js";

// Prometheus metrics (ADR-0004). ONE /metrics endpoint, on the API. Queue depth
// is read live from BullMQ; sent/failed are read from Redis counters that the
// WORKER increments (a worker's in-memory counters would be invisible here — API
// and worker are separate processes). So Redis is the shared meeting point.

const register = new client.Registry();
// Free CPU/memory/event-loop metrics for the API process.
client.collectDefaultMetrics({ register });

// The headline health metric: jobs waiting per channel. If it climbs, workers
// aren't keeping up — add concurrency or more worker containers.
const queueDepth = new client.Gauge({
  name: "queue_depth",
  help: "Jobs waiting in each channel's queue",
  labelNames: ["channel"],
  registers: [register],
});

// Send outcomes. Modelled as gauges set to the Redis counter value on each
// scrape (the counter lives in Redis; the API just mirrors it) — see ADR-0004.
const sentTotal = new client.Gauge({
  name: "notifications_sent_total",
  help: "Notifications successfully sent per channel",
  labelNames: ["channel"],
  registers: [register],
});
const failedTotal = new client.Gauge({
  name: "notifications_failed_total",
  help: "Notifications that exhausted retries (or failed permanently) per channel",
  labelNames: ["channel"],
  registers: [register],
});

export async function metricsHandler(_req: Request, res: Response) {
  // Refresh every gauge from its live source at scrape time.
  for (const ch of CHANNELS) {
    queueDepth.set({ channel: ch }, await queueFor(ch).getWaitingCount());
    sentTotal.set({ channel: ch }, Number(await redis.get(sentKey(ch))) || 0);
    failedTotal.set({ channel: ch }, Number(await redis.get(failedKey(ch))) || 0);
  }

  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
}
