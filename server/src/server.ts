import express from "express";
import cors from "cors";
import { notificationsRouter } from "./routes/notifications.js";

const app = express();

app.use(cors());           // dashboard runs on a different origin in dev
app.use(express.json());   // parse JSON request bodies

// Liveness check — handy for "is the server up?" and later for monitoring.
app.get("/health", (_req, res) => res.json({ ok: true }));

// All notification endpoints live under the versioned /v1 prefix.
app.use("/v1/notifications", notificationsRouter);

// Phase 1 reads PORT from the environment but doesn't need dotenv yet; we add
// real env loading in Phase 2 when DATABASE_URL appears.
const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`notify server listening on http://localhost:${PORT}`);
});
