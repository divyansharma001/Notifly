// STUB provider — Phase 1. Phase 6 swaps for Twilio.
export async function sendSms(to: string, body: string) {
  await new Promise((r) => setTimeout(r, 80));
  console.log(`[SMS] -> ${to} | ${body}`);
}
