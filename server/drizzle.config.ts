import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Tells drizzle-kit where the schema lives, where to write migration SQL,
// and how to reach the database. `out` is the folder of readable .sql files
// we review before applying.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
