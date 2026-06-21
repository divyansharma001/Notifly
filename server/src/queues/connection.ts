// Shared Redis connection settings for every queue and worker.
// Read from env so the same code points at `redis` (compose) or `localhost` (host).
export const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: Number(process.env.REDIS_PORT) || 6379,
  // BullMQ workers issue blocking Redis commands (BRPOPLPUSH). ioredis would
  // otherwise give up after a few retries and throw; null tells it to keep
  // retrying forever, which is what a long-lived worker wants.
  maxRetriesPerRequest: null,
};
