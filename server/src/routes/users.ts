import { Router } from "express";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

export const usersRouter = Router();

// GET /v1/users — the dashboard uses this to populate its recipient dropdown
// with real user IDs instead of hardcoding them.
usersRouter.get("/", async (_req, res) => {
  const rows = await db.select({ id: users.id, name: users.name }).from(users);
  res.json(rows);
});
