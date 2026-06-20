import type { LogEntry } from "./types.js";

// In-memory feed for Phase 1. Newest-first. Replaced by the Postgres
// `notification_log` table in Phase 2 — callers only use add()/list(),
// so the swap won't touch the routes.
const entries: LogEntry[] = [];
const MAX = 100; // keep the feed small; this is a demo buffer, not storage

export function add(entry: LogEntry): void {
  entries.unshift(entry);
  if (entries.length > MAX) entries.length = MAX;
}

export function list(): LogEntry[] {
  return entries;
}
