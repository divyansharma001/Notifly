import { pgTable, uuid, text, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

// WHO we notify. Holds the contact info each channel needs.
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email"),
  phone: text("phone"),
});

// A user's registered devices — the push tokens FCM/APNS need. One user, many devices.
export const devices = pgTable("devices", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  token: text("token").notNull(),       // FCM / APNS device token
  platform: text("platform").notNull(), // "ios" | "android"
});

// Opt-in per user per channel. Checked before EVERY send — the book's
// "respect user settings" requirement. We add a unique (user, channel)
// constraint so a user can't end up with two conflicting rows for one channel.
export const notificationSettings = pgTable(
  "notification_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
    channel: text("channel").notNull(), // push | sms | email
    optIn: boolean("opt_in").notNull().default(true),
  },
  (t) => [uniqueIndex("settings_user_channel_unq").on(t.userId, t.channel)],
);

// The backbone of the no-data-loss guarantee AND dedup.
//   - eventId is UNIQUE: it's the idempotency key (Phase 4 dedup) and proves
//     a notification was accepted exactly once.
//   - status moves queued -> sent/failed. A row stuck below "sent" after a
//     crash is how we detect and reconcile lost work.
export const notificationLog = pgTable(
  "notification_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: text("event_id").notNull().unique(),
    userId: uuid("user_id").notNull(),
    channel: text("channel").notNull(),
    templateId: text("template_id").notNull(),
    to: text("to").notNull().default(""),
    status: text("status").notNull(), // queued | sent | failed | retrying
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  // The feed is "newest first" — index createdAt so that ORDER BY stays fast
  // as the log grows into millions of rows.
  (t) => [index("log_created_at_idx").on(t.createdAt)],
);
