import "dotenv/config";
import { db } from "../db/index.js";
import { services } from "../db/schema.js";
import { generateKeyPair, hashSecret } from "../auth/keys.js";

// Mint a new calling service with a RANDOM key pair and print the secret ONCE.
// We store only the hash, so the plaintext secret below is the only time you'll
// ever see it — copy it now. This is the real-world pattern (Stripe/GitHub keys).
//
//   npm run service:create -- "shopping-svc"
async function main() {
  const name = process.argv[2];
  if (!name) {
    console.error('usage: npm run service:create -- "<service-name>"');
    process.exit(1);
  }

  const { appKey, appSecret } = generateKeyPair();
  await db.insert(services).values({ name, appKey, appSecretHash: hashSecret(appSecret) });

  console.log(`created service "${name}"`);
  console.log(`  x-app-key:    ${appKey}`);
  console.log(`  x-app-secret: ${appSecret}`);
  console.log("\n^ copy the secret now — it is hashed at rest and cannot be shown again.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
