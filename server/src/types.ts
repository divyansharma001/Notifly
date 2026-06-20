import { z } from "zod";

// The three channels the system will ever support. Declared `as const` so we can
// derive a union type from the array instead of maintaining the list twice.
export const CHANNELS = ["push", "sms", "email"] as const;
export type Channel = (typeof CHANNELS)[number];

// The shape of an incoming send request. zod validates the raw JSON at the edge
// so the rest of the code can trust the data is well-formed.
export const notificationRequestSchema = z.object({
  userId: z.string().min(1),
  channel: z.enum(CHANNELS),
  templateId: z.string().min(1),
  // arbitrary string key/values used to fill the template later (Phase 5).
  data: z.record(z.string()).default({}),
});

export type NotificationRequest = z.infer<typeof notificationRequestSchema>;

// A row in the feed. In Phase 1 this lives in memory; Phase 2 moves it to Postgres
// as the `notification_log` table. `status` will gain real meaning once the queue
// exists (queued -> sent/failed); for now a synchronous send is immediately "sent".
export type NotificationStatus = "queued" | "sent" | "failed" | "retrying";

export interface  LogEntry {
  eventId: string;
  userId: string;
  channel: Channel;
  templateId: string;
  to: string;
  status: NotificationStatus;
  createdAt: string; // ISO timestamp
}
