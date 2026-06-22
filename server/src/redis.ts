import { Redis } from "ioredis";
import { connection } from "./queues/connection.js";

// A general-purpose Redis client for OUR OWN commands (dedup now, rate limiting
// in Phase 7). BullMQ manages its own internal connections for the queues; this
// is separate, for the plain SET/DEL/GET calls we issue directly.
//
// Built from the same `connection` settings (host/port from env) so it points at
// `redis` inside compose or `localhost` on the host — no hardcoded values.
export const redis = new Redis(connection);
