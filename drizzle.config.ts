import { defineConfig } from "drizzle-kit";

// Only used to generate SQL migrations from lib/db/schema.ts; no database connection needed.
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
});
