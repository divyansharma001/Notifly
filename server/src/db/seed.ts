import "dotenv/config";
import { db } from "./index.js";
import { users, notificationSettings, devices, services } from "./schema.js";
import { hashSecret } from "../auth/keys.js";

// Dev convenience: the dashboard and curl need a working key right after seeding.
// So we seed two services with KNOWN dev credentials (overridable via env) and
// store only their hashes. This is a deliberate dev shortcut — real callers get
// RANDOM, shown-once secrets via `npm run service:create` (scripts/createService.ts).
const DASH_APP_KEY = process.env.DASH_APP_KEY || "nfy_key_dashboard";
const DASH_APP_SECRET = process.env.DASH_APP_SECRET || "nfy_secret_dashboard_dev";
const DEMO_APP_KEY = "nfy_key_demo";
const DEMO_APP_SECRET = "nfy_secret_demo_dev";

// Dev seed: wipes the people-related tables and inserts two users with known
// settings. Run with `npm run db:seed`. We intentionally make Ben opt OUT of
// SMS so the opt-in enforcement has something to reject.
async function seed() {
  await db.delete(notificationSettings);
  await db.delete(devices);
  await db.delete(users);
  await db.delete(services);

  // Calling services (Phase 7 auth). Stored as hashes; the plaintext below is
  // dev-only and printed so you can paste it into client/.env or curl headers.
  await db.insert(services).values([
    { name: "dashboard", appKey: DASH_APP_KEY, appSecretHash: hashSecret(DASH_APP_SECRET) },
    { name: "demo", appKey: DEMO_APP_KEY, appSecretHash: hashSecret(DEMO_APP_SECRET) },
  ]);

  const [asha, ben, divyansh] = await db
    .insert(users)
    .values([
      { name: "Asha", email: "asha@example.com", phone: "+15550000001" },
      { name: "Ben", email: "ben@example.com", phone: "+15550000002" },
      // Real inbox used to test live email sends (Phase 6 / Resend sandbox).
      { name: "Divyansh", email: "connectwithdivyansharma@gmail.com", phone: "+15550000003" },
    ])
    .returning();

  await db.insert(notificationSettings).values([
    { userId: asha.id, channel: "email", optIn: true },
    { userId: asha.id, channel: "sms", optIn: true },
    { userId: asha.id, channel: "push", optIn: true },
    { userId: ben.id, channel: "email", optIn: true },
    { userId: ben.id, channel: "sms", optIn: false }, // <- Ben said no to SMS
    { userId: ben.id, channel: "push", optIn: true },
    { userId: divyansh.id, channel: "email", optIn: true },
    { userId: divyansh.id, channel: "sms", optIn: true },
    { userId: divyansh.id, channel: "push", optIn: true },
  ]);

  await db.insert(devices).values([
    { userId: asha.id, token: "device-asha-ios", platform: "ios" },
    { userId: ben.id, token: "device-ben-android", platform: "android" },
  ]);

  console.log("seeded users:");
  console.log(`  Asha     = ${asha.id}`);
  console.log(`  Ben      = ${ben.id} (opted out of SMS)`);
  console.log(`  Divyansh = ${divyansh.id} (real email test recipient)`);
  console.log("\nseeded services (dev credentials — auth headers):");
  console.log(`  dashboard:  x-app-key: ${DASH_APP_KEY}   x-app-secret: ${DASH_APP_SECRET}`);
  console.log(`  demo:       x-app-key: ${DEMO_APP_KEY}   x-app-secret: ${DEMO_APP_SECRET}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
