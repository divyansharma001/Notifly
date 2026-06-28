import { Router } from "express";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, devices, notificationSettings, notificationLog } from "../db/schema.js";
import { notificationRequestSchema, type Channel } from "../types.js";
import { queueFor } from "../queues/index.js";
import { renderTemplate } from "../templates/index.js";
import { checkRateLimit } from "../rateLimit.js";

export const notificationsRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type User = typeof users.$inferSelect;

// Resolve the address we actually send to for a given channel.
// email/sms come straight off the user; push needs a registered device token.
async function recipientFor(channel: Channel, user: User): Promise<string | null> {
  if (channel === "email") return user.email ?? null;
  if (channel === "sms") return user.phone ?? null;
  const [device] = await db.select().from(devices).where(eq(devices.userId, user.id)).limit(1);
  return device?.token ?? null;
}

// POST /v1/notifications
notificationsRouter.post("/", async (req, res) => {
  // 1. Validate the request shape.
  const parsed = notificationRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid request", details: parsed.error.flatten() });
  }
  const { userId, channel, templateId, data } = parsed.data;

  // 2. Look up the user. Guard the UUID format first so a bad id is a clean
  //    404 instead of a Postgres "invalid input syntax for uuid" error.
  if (!UUID_RE.test(userId)) {
    return res.status(404).json({ error: `unknown user: ${userId}` });
  }
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    return res.status(404).json({ error: `unknown user: ${userId}` });
  }

  // 3. OPT-IN ENFORCEMENT — the book's "respect user settings". Bail if the
  //    user has explicitly opted out of this channel. (No row => default opt-in.)
  const [setting] = await db
    .select()
    .from(notificationSettings)
    .where(and(eq(notificationSettings.userId, userId), eq(notificationSettings.channel, channel)))
    .limit(1);
  if (setting && !setting.optIn) {
    return res.status(403).json({ error: `${user.name ?? "user"} has opted out of ${channel}` });
  }

  // 3b. RATE LIMIT (Phase 7). Cap sends per user+channel so we don't flood a
  //     user. We check HERE — after opt-in, before writing anything — so an
  //     over-limit request leaves NO trace (no log row, no job). That keeps the
  //     no-data-loss guarantee intact: we never accepted it, so nothing is lost.
  //     Rejecting with 429 + Retry-After is the honest HTTP contract; the caller
  //     backs off and retries. (Sliding-window log — ADR-0003.)
  const rate = await checkRateLimit(userId, channel);
  if (!rate.allowed) {
    res.set("Retry-After", String(rate.retryAfterSec));
    return res.status(429).json({
      error: `rate limit exceeded for ${channel}`,
      retryAfterSec: rate.retryAfterSec,
    });
  }

  // 4. Make sure we have somewhere to send.
  const to = await recipientFor(channel, user);
  if (!to) {
    return res.status(422).json({ error: `no ${channel} contact for this user` });
  }

  // 5. RENDER THE TEMPLATE (Phase 5). Do this BEFORE writing the row so an
  //    unknown templateId is a clean 422 and never leaves an orphaned `queued`
  //    row with no real send behind it. Rendering at enqueue time means a broken
  //    template fails synchronously here — the caller hears about it now, instead
  //    of a worker choking on it later where no one is watching.
  const rendered = renderTemplate(templateId, data);
  if (!rendered) {
    return res.status(422).json({ error: `unknown template: ${templateId}` });
  }
  const { subject, body } = rendered;

  // 6. Write the log row as `queued` BEFORE enqueuing — the book's no-data-loss
  //    ordering. The worker is the only thing that promotes it to sent/failed.
  //    If the process dies between these two lines, the row sits at `queued`
  //    with no job — reconcilable. If it dies after, the job is safe in Redis.
  //    Either way the notification is never silently lost.
  const eventId = randomUUID();

  await db
    .insert(notificationLog)
    .values({ eventId, userId, channel, templateId, to, status: "queued" });

  await queueFor(channel).add("send", { eventId, channel, to, subject, body });

  // 7. Return immediately. We are NOT waiting for the provider anymore — that's
  //    the whole point. 202 = "accepted, will be processed".
  return res.status(202).json({ eventId, status: "queued" });
});

// GET /v1/notifications — the live feed, newest first, straight from the DB.
notificationsRouter.get("/", async (_req, res) => {
  const rows = await db
    .select()
    .from(notificationLog)
    .orderBy(desc(notificationLog.createdAt))
    .limit(100);
  res.json(rows);
});
