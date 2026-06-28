import express from "express";
import cors from "cors";
import { notificationsRouter } from "./routes/notifications.js";
import { usersRouter } from "./routes/users.js";
import { requireServiceAuth } from "./middleware/auth.js";
import { metricsHandler } from "./metrics.js";

const app = express();

app.use(cors());           // dashboard runs on a different origin in dev
app.use(express.json());   // parse JSON request bodies

// Liveness check — left OPEN (no auth) so Docker/uptime probes work without keys.
app.get("/health", (_req, res) => res.json({ ok: true }));

// Prometheus scrape target (Phase 7 monitoring). Also OPEN: the scraper is infra,
// not a /v1 caller, and locking it down is a network-level concern (ADR-0004).
app.get("/metrics", metricsHandler);

// Everything under /v1 is internal API — require a valid Service key (Phase 7
// auth). The middleware runs BEFORE the routers, so an unverified caller never
// reaches a handler. /health and /metrics above are intentionally outside this.
app.use("/v1", requireServiceAuth);
app.use("/v1/notifications", notificationsRouter);
app.use("/v1/users", usersRouter);

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`notify server listening on http://localhost:${PORT}`);
});
