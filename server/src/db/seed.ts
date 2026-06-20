import "dotenv/config";
import { db } from "./index.js";
import { users, notificationSettings, devices } from "./schema.js";

// Dev seed: wipes the people-related tables and inserts two users with known
// settings. Run with `npm run db:seed`. We intentionally make Ben opt OUT of
// SMS so the opt-in enforcement has something to reject.
async function seed() {
  await db.delete(notificationSettings);
  await db.delete(devices);
  await db.delete(users);

  const [asha, ben] = await db
    .insert(users)
    .values([
      { name: "Asha", email: "asha@example.com", phone: "+15550000001" },
      { name: "Ben", email: "ben@example.com", phone: "+15550000002" },
    ])
    .returning();

  await db.insert(notificationSettings).values([
    { userId: asha.id, channel: "email", optIn: true },
    { userId: asha.id, channel: "sms", optIn: true },
    { userId: asha.id, channel: "push", optIn: true },
    { userId: ben.id, channel: "email", optIn: true },
    { userId: ben.id, channel: "sms", optIn: false }, // <- Ben said no to SMS
    { userId: ben.id, channel: "push", optIn: true },
  ]);

  await db.insert(devices).values([
    { userId: asha.id, token: "device-asha-ios", platform: "ios" },
    { userId: ben.id, token: "device-ben-android", platform: "android" },
  ]);

  console.log("seeded users:");
  console.log(`  Asha = ${asha.id}`);
  console.log(`  Ben  = ${ben.id} (opted out of SMS)`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
