import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import { connection } from "../queues/connection.js";
import type { SendJob } from "../queues/index.js";
import { db } from "../db/index.js";
import { notificationLog } from "../db/schema.js";
import { CHANNELS, type Channel } from "../types.js";
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

async function setStatus(eventId: string, status: "sent" | "failed") {
  await db.update(notificationLog).set({ status }).where(eq(notificationLog.eventId, eventId));
}

// One Worker per channel, each consuming its own queue.
function startWorker(channel: Channel) {
  const worker = new Worker<SendJob>(
    channel,
    async (job) => {
      await deliver(job);
      // Only the worker promotes the row to `sent` — closing the no-data-loss loop.
      await setStatus(job.data.eventId, "sent");
    },
    {
      connection,
      // The throughput dial: how many jobs this worker handles at once. Raise it
      // to push more through one process; or run more worker containers. We'll
      // tune this for real in Phase 8's load test.
      concurrency: 50,
    },
  );

  worker.on("completed", (job) => console.log(`[${channel}] sent ${job.data.eventId}`));
  worker.on("failed", async (job, err) => {
    console.error(`[${channel}] FAILED ${job?.data.eventId}: ${err?.message}`);
    if (job) await setStatus(job.data.eventId, "failed");
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
