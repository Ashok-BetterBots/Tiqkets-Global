import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  // Keep connections alive so schedulers don't hit "connection terminated"
  // errors when a tick fires after the connection has been idle.
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  // Recycle idle connections more aggressively than the server's own idle
  // timeout to avoid being caught with a dead connection mid-query.
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 15000,
});

pool.on("error", (err) => {
  console.error("Unexpected database pool error:", err);
});

export const db = drizzle(pool, { schema });
export { pool };
