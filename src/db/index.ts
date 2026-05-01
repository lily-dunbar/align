import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set");
}

/** Single connection; use `prepare: false` for Neon transaction pooler. */
const client = postgres(url, { max: 1, prepare: false });

export const db = drizzle(client, { schema });
export { schema };
