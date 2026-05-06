import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const rawUrl = process.env.DATABASE_URL?.trim();
if (!rawUrl) {
  throw new Error("DATABASE_URL is not set");
}

// Guard against accidentally quoted env values in hosts like Vercel.
const url = rawUrl.replace(/^["']|["']$/g, "");

/** Single connection; use `prepare: false` for Neon transaction pooler. */
const client = postgres(url, { max: 1, prepare: false });

export const db = drizzle(client, { schema });
export { schema };

/** Same connection pool as Drizzle — for rare idempotent DDL when migrations lag the deployed code. */
export const pg = client;
