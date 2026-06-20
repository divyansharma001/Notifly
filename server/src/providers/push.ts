// STUB provider — Phase 1. Phase 6 swaps for Firebase Cloud Messaging (FCM).
export async function sendPush(deviceToken: string, title: string, body: string) {
  await new Promise((r) => setTimeout(r, 80));
  console.log(`[PUSH] -> ${deviceToken} | ${title} | ${body}`);
}
