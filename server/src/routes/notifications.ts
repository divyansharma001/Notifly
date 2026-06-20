import { Router } from "express";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, devices, notificationSettings, notificationLog } from "../db/schema.js";
import { notificationRequestSchema, type Channel, type NotificationStatus } from "../types.js";
import { sendEmail } from "../providers/email.js";
import { sendSms } from "../providers/sms.js";
import { sendPush } from "../providers/push.js";

export const notificationsRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Naive Phase 1 rendering — real Handlebars templates arrive in Phase 5.
function render(templateId: string, data: Record<string, string>) {
  const dataStr = Object.entries(data).map(([k, v]) => `${k}=${v}`).join(", ") || "(no data)";
  return { subject: `Notification: ${templateId}`, body: dataStr };
}

type User = typeof users.$inferSelect;

// Resolve the address we actually send to for a given channel.
// email/sms come straight off the user; push needs a registered device token.
async function recipientFor(channel: Channel, user: User): Promise<string | null> {
  if (channel === "email") return user.email ?? null;
  if (channel === "sms") return user.phone ?? null;
  const [device] = await db.select().from(devices).where(eq(devices.userId, user.id)).limit(1);
  return device?.token ?? null;
}

async function dispatch(channel: Channel, to: string, subject: string, body: string) {
  if (channel === "email") return sendEmail(to, subject, body);
  if (channel === "sms") return sendSms(to, body);
  return sendPush(to, subject, body);
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

  // 4. Make sure we have somewhere to send.
  const to = await recipientFor(channel, user);
  if (!to) {
    return res.status(422).json({ error: `no ${channel} contact for this user` });
  }

  // 5. Send synchronously (Phase 3 moves this behind a queue), then persist the
  //    outcome to notification_log. eventId is the future dedup/idempotency key.
  const eventId = randomUUID();
  const { subject, body } = render(templateId, data);

  let status: NotificationStatus = "sent";
  try {
    await dispatch(channel, to, subject, body);
  } catch (err) {
    status = "failed";
    console.error(`[send failed] ${eventId}`, err);
  }

  await db.insert(notificationLog).values({ eventId, userId, channel, templateId, to, status });

  return res.status(202).json({ eventId, status });
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
