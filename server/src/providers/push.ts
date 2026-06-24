import type { NotificationProvider } from "./types.js";

// STUB push provider — Phase 6 step 2 swaps for Firebase Cloud Messaging (FCM).
// `to` is the device token; push uses `subject` as the notification title.
export const pushProvider: NotificationProvider = {
  async send(to, { subject, body }) {
    await new Promise((r) => setTimeout(r, 80));
    console.log(`[PUSH] -> ${to} | ${subject} | ${body}`);
  },
};
