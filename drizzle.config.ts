import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit + dotenv sometimes log "injected env (0)" while variables exist
 * (unsaved editor buffer, smart quotes, or load order). Parse .env.local / .env
 * manually using only the first "=" on each line so values may contain "=".
 */
function loadDatabaseUrl(): string {
  const tryPaths = [resolve(".env.local"), resolve(".env")];

  for (const p of tryPaths) {
    if (!existsSync(p)) continue;
    let raw = readFileSync(p, "utf8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;

      const lhs = trimmed
        .slice(0, idx)
        .replace(/^export\s+/i, "")
        .trim();
      if (lhs.toUpperCase() !== "DATABASE_URL") continue;

      let value = trimmed.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      value = value.trim();
      if (value) return value;
    }
  }

  config({ path: resolve(".env.local") });
  config({ path: resolve(".env") });
  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv) return fromEnv;

  throw new Error(
    'DATABASE_URL is missing or empty on disk. Save .env.local in your editor, then run npm run db:migrate again. Use straight ASCII quotes: DATABASE_URL="postgresql://…"',
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: loadDatabaseUrl(),
  },
});
