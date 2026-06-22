import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { connection } from "../queues/connection.js";
import { redis } from "../redis.js";
import type { SendJob } from "../queues/index.js";
import { db } from "../db/index.js";
import { notificationLog } from "../db/schema.js";
import { CHANNELS, type Channel, type NotificationStatus } from "../types.js";
import { sendEmail } from "../providers/email.js";
import { sendSms } from "../providers/sms.js";
import { sendPush } from "../providers/push.js";

// Call the right provider for the job's channel. This is the slow, failure-prone
// work we deliberately moved OFF the request path and into the worker.
async function deliver(job: Job<SendJob>) {
  const { channel, to, subject, body } = job.data;
  if (channel === "email") return sendEmail(to, subject, body);
  if (channel === "sms") return sendSms(to, body);
  return sendPush(to, subject, body);
}

async function setStatus(eventId: string, status: NotificationStatus) {
  await db.update(notificationLog).set({ status }).where(eq(notificationLog.eventId, eventId));
}

// One Worker per channel, each consuming its own queue.
function startWorker(channel: Channel) {
  const worker = new Worker<SendJob>(
    channel,
    async (job) => {
      const { eventId } = job.data;

      // DEDUP (effectively-once). Atomically claim this eventId. NX = "set only
      // if absent"; returns "OK" to the one winner, null to anyone who finds it
      // already set. A null here means a delivery for this event already
      // happened (or is happening) — discard this duplicate.
      const claimed = await redis.set(`evt:${eventId}`, "1", "EX", 86400, "NX");
      if (!claimed) {
        console.log(`[${channel}] duplicate ${eventId} — already handled, skipping`);
        // Return a marker so the `completed` listener doesn't mislabel this as a
        // real send. The job still "completes" successfully — we just did nothing.
        return "skipped" as const;
      }

      try {
        await deliver(job);
        // Only the worker promotes the row to `sent` — closing the no-data-loss loop.
        await setStatus(eventId, "sent");
        return "sent" as const;
      } catch (err) {
        // The send failed. RELEASE the claim so the upcoming retry is allowed to
        // re-acquire it and try again — otherwise our own dedup key would block
        // every retry and a single transient blip would kill the notification.
        // Re-throw so BullMQ records the failure and schedules the retry.
        await redis.del(`evt:${eventId}`);
        throw err;
      }
    },
    {
      connection,
      // The throughput dial: how many jobs this worker handles at once. Raise it
      // to push more through one process; or run more worker containers. We'll
      // tune this for real in Phase 8's load test.
      concurrency: 50,
    },
  );

  worker.on("completed", (job, result) => {
    // Don't claim "sent" for a job that was a skipped duplicate (see processor).
    if (result === "skipped") return;
    console.log(`[${channel}] sent ${job.data.eventId}`);
  });
  worker.on("failed", async (job, err) => {
    if (!job) return;

    // Is BullMQ going to try again, or was that the final attempt?
    // attemptsMade = tries so far; opts.attempts = the max we allowed (5).
    // Still below the max => a retry is coming, so the honest status is
    // `retrying`. At the max => the road ends here, mark it truly `failed`.
    const maxAttempts = job.opts.attempts ?? 1;
    const willRetry = job.attemptsMade < maxAttempts;

    console.error(
      `[${channel}] attempt ${job.attemptsMade}/${maxAttempts} failed for ` +
        `${job.data.eventId}: ${err?.message}${willRetry ? " — will retry" : " — giving up"}`,
    );

    await setStatus(job.data.eventId, willRetry ? "retrying" : "failed");
  });

  return worker;
}

const workers = CHANNELS.map((c) => startWorker(c));
console.log(`workers running for channels: ${CHANNELS.join(", ")}`);

// Close cleanly on shutdown so in-flight jobs finish and connections release.
async function shutdown() {
  console.log("shutting down workers...");
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
