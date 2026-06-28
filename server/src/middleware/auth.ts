import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { services } from "../db/schema.js";
import { secretMatches } from "../auth/keys.js";

// Make `req.service` known to TypeScript. After auth passes, downstream handlers
// can read who the caller is (useful later for per-service rate limits / audit).
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      service?: { id: string; name: string };
    }
  }
}

// API-key auth (ADR / CONTEXT.md). API keys are STATEFUL: unlike a JWT (verified
// by math on the token), a key is meaningless until we find it in the DB — that
// lookup IS the verification. Revoking a caller is just deleting its row.
//
// Flow: read the two headers -> find the Service by its public appKey ->
// constant-time compare the presented secret against the stored hash -> attach
// the service and continue, or reject 401. We keep the error vague ("invalid
// credentials") on purpose: never tell an attacker WHICH half was wrong.
export async function requireServiceAuth(req: Request, res: Response, next: NextFunction) {
  const appKey = req.header("x-app-key");
  const appSecret = req.header("x-app-secret");

  if (!appKey || !appSecret) {
    return res.status(401).json({ error: "missing x-app-key / x-app-secret" });
  }

  // Wrap the DB lookup: Express 4 does NOT catch errors thrown from an async
  // middleware — they bubble up as an unhandled rejection and crash the whole
  // process. A transient DB blip on the auth path (which runs on EVERY request)
  // must degrade to a 500, never take the API down.
  try {
    const [svc] = await db.select().from(services).where(eq(services.appKey, appKey)).limit(1);

    // No such key, or the secret doesn't match the stored hash -> reject. Same
    // response for both so we don't reveal whether the appKey exists.
    if (!svc || !secretMatches(appSecret, svc.appSecretHash)) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    req.service = { id: svc.id, name: svc.name };
    next();
  } catch (err) {
    console.error("auth lookup failed:", (err as Error).message);
    return res.status(500).json({ error: "auth check failed" });
  }
}
