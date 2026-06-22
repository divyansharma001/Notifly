import { Queue } from "bullmq";
import { connection } from "./connection.js";
import type { Channel } from "../types.js";

// The payload that travels from the API to a worker. Everything the worker
// needs to actually send — it never re-reads the DB to send (keeps it fast).
// eventId lets the worker find and update the right notification_log row.
export interface SendJob {
  eventId: string;
  channel: Channel;
  to: string;
  subject: string;
  body: string;
}

// Retry policy lives HERE, on the queue, not on each .add() call — so every
// job inherits it and no future call site can forget it. (The guide shows it
// inline on add(); centralizing is the more maintainable version of the same
// idea.) BullMQ applies these to any job that doesn't override them.
const defaultJobOptions = {
  // Try up to 5 times before the job is truly "failed". Real providers fail
  // transiently (timeouts, 503s, rate limits); one hiccup shouldn't lose a send.
  attempts: 5,
  // Exponential backoff: ~2s, 4s, 8s, 16s between tries. A struggling provider
  // gets room to recover instead of being hammered on a tight retry loop.
  backoff: { type: "exponential" as const, delay: 2000 },
  // Redis keeps completed jobs forever by default — a slow memory leak at scale.
  // Keep the last 1000 successes for inspection; the DB log is the durable record.
  removeOnComplete: { count: 1000 },
  // Keep FAILED jobs (this is the default, but we're explicit): a job that
  // exhausted its retries must stay inspectable so we can reconcile/alert on it.
  // Dropping it would defeat the no-data-loss guarantee this phase is about.
  removeOnFail: false,
};

// One queue PER CHANNEL. This is the key isolation property: if the SMS
// provider is down and its queue backs up, the email and push queues — and
// their workers — keep flowing. A single outage can't block other channels.
const queues: Record<Channel, Queue<SendJob>> = {
  email: new Queue<SendJob>("email", { connection, defaultJobOptions }),
  sms: new Queue<SendJob>("sms", { connection, defaultJobOptions }),
  push: new Queue<SendJob>("push", { connection, defaultJobOptions }),
};

export function queueFor(channel: Channel): Queue<SendJob> {
  return queues[channel];
}
