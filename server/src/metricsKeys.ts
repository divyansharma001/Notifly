import type { Channel } from "./types.js";

// Redis keys for the send-outcome counters. Shared by the WORKER (which INCRs
// them) and the API's /metrics (which reads them) — kept in one place so the two
// processes can't drift. Lives apart from metrics.ts so the worker doesn't pull
// in prom-client just to know a key name. (ADR-0004)
export const sentKey = (ch: Channel) => `metric:sent:${ch}`;
export const failedKey = (ch: Channel) => `metric:failed:${ch}`;
