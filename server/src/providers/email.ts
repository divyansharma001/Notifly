import "dotenv/config"; // ensure server/.env is loaded before we read the key below
import type { NotificationProvider } from "./types.js";
import { PermanentError } from "./errors.js";

// LIVE MODE is selected purely by the presence of an API key. With a key we call
// Resend for real; without one we fall back to the console STUB so the repo still
// boots and demos for anyone who hasn't set up an account. Flipping real<->stub
// is a pure config toggle — no code change. (ADR-0001.)
const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Resend's zero-setup sandbox sender. It only delivers to YOUR account's own
// email until you verify a real domain. Override via EMAIL_FROM once you do.
const EMAIL_FROM = process.env.EMAIL_FROM ?? "onboarding@resend.dev";

// Announce the active mode loudly at startup so a silently-missing key can't be
// mistaken for live sending.
console.log(
  RESEND_API_KEY
    ? `[EMAIL] provider: Resend (live) — from ${EMAIL_FROM}`
    : "[EMAIL] provider: console stub (no RESEND_API_KEY)",
);

export const emailProvider: NotificationProvider = {
  async send(to, { subject, body }) {
    // STUB fallback — no key configured, just log like the old stub.
    if (!RESEND_API_KEY) {
      await new Promise((r) => setTimeout(r, 80));
      console.log(`[EMAIL] -> ${to} | ${subject} | ${body}`);
      return;
    }

    // LIVE — POST straight to Resend's REST API. Built-in fetch (Node 18+), no SDK.
    let res: Response;
    try {
      res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        // Our body is plain text, so we use Resend's `text` field (not `html`).
        body: JSON.stringify({ from: EMAIL_FROM, to, subject, text: body }),
      });
    } catch (err) {
      // Couldn't even reach Resend (DNS, connection reset, timeout). Transient —
      // a plain Error lets BullMQ's Phase 4 retries try again shortly.
      throw new Error(`email network error: ${(err as Error).message}`);
    }

    if (res.ok) return; // 2xx — accepted by Resend, we're done.

    // Non-2xx: read the body for a useful message, then classify. (ADR-0002.)
    const detail = await res.text().catch(() => "");
    const msg = `Resend ${res.status}: ${detail || res.statusText}`;

    // PERMANENT — auth (401/403), validation/bad recipient (422), other non-429
    // 4xx. Retrying is pointless; fail fast so the row reaches `failed` now.
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      throw new PermanentError(msg);
    }

    // TRANSIENT — 429 (rate limit) and 5xx. A plain Error -> BullMQ retries with
    // exponential backoff, giving a struggling provider room to recover.
    throw new Error(msg);
  },
};
