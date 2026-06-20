import { Router } from "express";
import { randomUUID } from "node:crypto";
import { notificationRequestSchema, type Channel, type LogEntry } from "../types.js";
import * as logStore from "../log-store.js";
import { sendEmail } from "../providers/email.js";
import { sendSms } from "../providers/sms.js";
import { sendPush } from "../providers/push.js";

export const notificationsRouter = Router();

// Hardcoded "user directory" for Phase 1. Phase 2 replaces this with a real
// `users` table lookup (contact info) + a `notification_settings` opt-in check.
const USERS: Record<string, { email: string; phone: string; pushToken: string }> = {
  u1: { email: "asha@example.com", phone: "+15550000001", pushToken: "device-asha-1" },
  u2: { email: "ben@example.com", phone: "+15550000002", pushToken: "device-ben-1" },
};

// Naive Phase 1 "rendering": just stringify the data. Real Handlebars templates
// arrive in Phase 5; for now we only care that something readable comes out.
function render(templateId: string, data: Record<string, string>) {
  const dataStr = Object.entries(data).map(([k, v]) => `${k}=${v}`).join(", ") || "(no data)";
  return { subject: `Notification: ${templateId}`, body: dataStr };
}

// Dispatch to the right stub provider. Returns the recipient address we sent to,
// so we can record it in the feed. Throws if the user has no contact for the channel.
async function dispatch(
  channel: Channel,
  user: { email: string; phone: string; pushToken: string },
  subject: string,
  body: string,
): Promise<string> {
  switch (channel) {
    case "email":
      await sendEmail(user.email, subject, body);
      return user.email;
    case "sms":
      await sendSms(user.phone, body);
      return user.phone;
    case "push":
      await sendPush(user.pushToken, subject, body);
      return user.pushToken;
  }
}

// POST /v1/notifications — validate, look up user, "send", log, return 202.
notificationsRouter.post("/", async (req, res) => {
  // 1. Validate at the edge. If the body is malformed, fail fast with 400.
  const parsed = notificationRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid request", details: parsed.error.flatten() });
  }
  const { userId, channel, templateId, data } = parsed.data;

  // 2. Look up the user's contact info.
  const user = USERS[userId];
  if (!user) {
    return res.status(404).json({ error: `unknown user: ${userId}` });
  }

  // 3. Every notification carries an eventId — the future dedup key (Phase 4).
  const eventId = randomUUID();
  const { subject, body } = render(templateId, data);

  // 4. Send SYNCHRONOUSLY for now (Phase 3 moves this behind a queue + worker).
  let status: LogEntry["status"] = "sent";
  let to = "";
  try {
    to = await dispatch(channel, user, subject, body);
  } catch (err) {
    status = "failed";
    console.error(`[send failed] ${eventId}`, err);
  }

  // 5. Record it in the feed.
  const entry: LogEntry = {
    eventId,
    userId,
    channel,
    templateId,
    to,
    status,
    createdAt: new Date().toISOString(),
  };
  logStore.add(entry);

  // 6. 202 Accepted — the contract stays valid once a queue is added.
  return res.status(202).json({ eventId, status });
});

// GET /v1/notifications — the live feed the dashboard polls.
notificationsRouter.get("/", (_req, res) => {
  res.json(logStore.list());
});
