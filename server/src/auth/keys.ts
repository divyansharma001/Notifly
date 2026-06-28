import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

// API-key helpers. An App Key is a PUBLIC id; an App Secret is the secret proof.
// We store only sha256(secret), never the secret itself (ADR / CONTEXT.md).

// SHA-256 is the right hash for API keys: the secret is long and random, so the
// slow-by-design password hashes (bcrypt/argon2) buy us nothing here — they exist
// to fight guessing of LOW-entropy human passwords, which doesn't apply.
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

// Mint a fresh (appKey, appSecret) pair. The prefixes make a leaked string
// instantly recognizable in logs/alerts (how Stripe/GitHub keys work).
export function generateKeyPair(): { appKey: string; appSecret: string } {
  return {
    appKey: "nfy_key_" + randomBytes(9).toString("hex"),     // public id
    appSecret: "nfy_secret_" + randomBytes(24).toString("hex"), // the secret
  };
}

// Constant-time compare of two hex hashes. A plain `===` leaks how many leading
// chars matched via timing; timingSafeEqual always takes the same time. Lengths
// must match first (timingSafeEqual throws on a length mismatch).
export function secretMatches(presentedSecret: string, storedHash: string): boolean {
  const presentedHash = hashSecret(presentedSecret);
  const a = Buffer.from(presentedHash, "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
