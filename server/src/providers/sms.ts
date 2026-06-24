import type { NotificationProvider } from "./types.js";

// STUB SMS provider — Phase 6 step 2 swaps for Twilio. Note it IGNORES `subject`:
// SMS has no subject line. The interface still passes one (uniform shape); this
// provider just uses what makes sense for its channel.
export const smsProvider: NotificationProvider = {
  async send(to, { body }) {
    await new Promise((r) => setTimeout(r, 80));
    console.log(`[SMS] -> ${to} | ${body}`);
  },
};
