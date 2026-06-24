// The final, ready-to-send text the worker hands a provider. Already rendered by
// the template step (Phase 5) — providers never see templates or raw data, just
// finished words. (SMS has no subject; that provider simply ignores it.)
export interface RenderedNotification {
  subject: string;
  body: string;
}

// THE COMMON CONTRACT every provider must honor. The worker depends on THIS,
// not on Twilio/FCM/Resend. Because all providers share one `send` shape,
// swapping a vendor (Twilio -> a competitor) or adding one is local to that
// provider file — the worker never changes. This is the book's "extensibility".
export interface NotificationProvider {
  send(to: string, payload: RenderedNotification): Promise<void>;
}
