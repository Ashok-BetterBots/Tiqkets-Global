import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function waitForDatabase(pool: Pool, retries = 30, delayMs = 2000): Promise<void> {
  for (let i = 1; i <= retries; i++) {
    try {
      const client = await pool.connect();
      client.release();
      console.log("[migrate] Database is ready.");
      return;
    } catch (err: any) {
      console.log(`[migrate] Waiting for database... (${i}/${retries}) ${err.message}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("[migrate] Database did not become ready in time.");
}

async function runMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  console.log("[migrate] Connecting to database...");
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 10000,
    max: 3,
  });

  try {
    await waitForDatabase(pool);

    const db = drizzle(pool);
    const migrationsFolder = path.resolve(__dirname, "../migrations");
    console.log("[migrate] Applying migrations from:", migrationsFolder);
    await migrate(db, { migrationsFolder });
    console.log("[migrate] All migrations applied successfully!");
  } finally {
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error("[migrate] Fatal error:", err);
  process.exit(1);
});
