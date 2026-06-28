import { randomUUID } from "node:crypto";
import { redis } from "./redis.js";
import type { Channel } from "./types.js";

// Sliding-window-log rate limit (ADR-0003). Per user+channel we keep a Redis
// SORTED SET of timestamps, one per accepted send. "Usage" = how many entries
// fall inside the trailing window. Unlike a fixed-window counter, this enforces
// "<= LIMIT in ANY rolling window" — no boundary-burst (2x at the hour edge).

const LIMIT = Number(process.env.RATE_LIMIT_MAX) || 20;
const WINDOW_SEC = Number(process.env.RATE_LIMIT_WINDOW_SEC) || 3600;

// One atomic script so the check-then-add can't race: two requests arriving at
// once can't both read "count < limit" and both add. We use Redis's own TIME as
// the clock (not Node's) so it's correct regardless of app/redis clock skew.
const SCRIPT = `
local key      = KEYS[1]
local windowMs = tonumber(ARGV[1])
local limit    = tonumber(ARGV[2])
local member   = ARGV[3]

local t      = redis.call('TIME')
local nowMs  = (tonumber(t[1]) * 1000) + math.floor(tonumber(t[2]) / 1000)
local cutoff = nowMs - windowMs

-- 1. drop everything older than the window
redis.call('ZREMRANGEBYSCORE', key, 0, cutoff)
-- 2. how many sends remain inside the window?
local count = redis.call('ZCARD', key)

if count < limit then
  -- 3. under the cap: record this send and allow
  redis.call('ZADD', key, nowMs, member)
  redis.call('PEXPIRE', key, windowMs)
  return {1, limit - count - 1, 0}
else
  -- over the cap: tell the caller when the oldest send will age out
  local oldest  = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retryMs = windowMs
  if oldest[2] then
    retryMs = (tonumber(oldest[2]) + windowMs) - nowMs
    if retryMs < 0 then retryMs = 0 end
  end
  redis.call('PEXPIRE', key, windowMs)
  return {0, 0, retryMs}
end
`;

export interface RateResult {
  allowed: boolean;
  remaining: number;    // sends left in the current window
  retryAfterSec: number; // when allowed=false, seconds until there's room
}

export async function checkRateLimit(userId: string, channel: Channel): Promise<RateResult> {
  const key = `rate:${userId}:${channel}`;
  const res = (await redis.eval(
    SCRIPT,
    1,
    key,
    String(WINDOW_SEC * 1000),
    String(LIMIT),
    randomUUID(), // unique member so same-millisecond sends don't collide
  )) as [number, number, number];

  const [allowed, remaining, retryMs] = res;
  return {
    allowed: allowed === 1,
    remaining,
    retryAfterSec: Math.ceil(retryMs / 1000),
  };
}
