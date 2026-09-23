// One-off schema migration for the conversations/messages tables. Run with:
//   node scripts/migrate-supabase.mjs
// Reads SUPABASE_DB_URL from .env (direct Postgres connection, not used by the app at runtime).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Client } from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(here, "..", ".env");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const sql = readFileSync(path.join(here, "supabase-schema.sql"), "utf8");

const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(sql);
  console.log("Schema applied.");
} finally {
  await client.end();
}
