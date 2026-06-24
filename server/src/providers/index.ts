import type { Channel } from "../types.js";
import type { NotificationProvider } from "./types.js";
import { emailProvider } from "./email.js";
import { smsProvider } from "./sms.js";
import { pushProvider } from "./push.js";

// THE REGISTRY — one place mapping each channel to its provider. The worker looks
// a provider up here by channel instead of hard-coding which function to call.
//
// Why this matters: swapping a vendor is editing ONE line here (or that provider
// file); adding a channel is adding ONE entry. The worker's delivery code never
// changes. This is the "providers are pluggable" property made concrete.
export const providers: Record<Channel, NotificationProvider> = {
  email: emailProvider,
  sms: smsProvider,
  push: pushProvider,
};
