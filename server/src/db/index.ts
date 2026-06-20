import "dotenv/config"; // loads server/.env so DATABASE_URL is available
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — copy .env.example to .env");
}

// One shared postgres connection pool for the whole API process.
const client = postgres(process.env.DATABASE_URL);

// Passing the schema gives us the fully-typed query builder (db.query.users...).
export const db = drizzle(client, { schema });
