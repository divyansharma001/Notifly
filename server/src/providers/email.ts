// STUB provider — Phase 1. Pretends to send an email by logging it.
// Phase 6 swaps this for a real SDK (Resend/SendGrid) behind a common interface.
export async function sendEmail(to: string, subject: string, body: string) {
  await new Promise((r) => setTimeout(r, 80)); // fake network latency
  console.log(`[EMAIL] -> ${to} | ${subject} | ${body}`);
}
