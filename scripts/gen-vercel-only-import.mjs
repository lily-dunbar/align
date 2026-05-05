/**
 * Writes `vercel.env.vercel-only.import` from `.env.local` (gitignored).
 * Excludes local filesystem + local scheduler keys. Do not commit the output.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localPath = resolve(root, ".env.local");
const templatePath = resolve(root, "vercel.env.template");
const outPath = resolve(root, "vercel.env.vercel-only.import");

const EXCLUDE = new Set([
  "ICLOUD_STEPS_JSON_PATH",
  "SHORTCUTS_STEPS_FILE_PATH",
  "SHORTCUTS_AUTO_SYNC_ENABLED",
  "SHORTCUTS_AUTO_SYNC_USER_ID",
  "SHORTCUTS_AUTO_SYNC_RUN_ON_STARTUP",
]);

function parseEnvFile(text) {
  const map = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).replace(/^export\s+/i, "").trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map.set(key, value);
  }
  return map;
}

function keysFromTemplate(text) {
  const keys = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    if (key) keys.push(key);
  }
  return keys;
}

let localText;
try {
  localText = readFileSync(localPath, "utf8");
} catch {
  console.error("Missing .env.local — create it from .env.example first.");
  process.exit(1);
}

const templateText = readFileSync(templatePath, "utf8");
const vals = parseEnvFile(localText);
const keys = keysFromTemplate(templateText).filter((k) => !EXCLUDE.has(k));

const lines = keys.map((k) => `${k}=${vals.get(k) ?? ""}`);
writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");
console.log(`Wrote ${outPath} (${keys.length} keys). File is gitignored — do not commit.`);
