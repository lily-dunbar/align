import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { stepIngestTokens, user } from "@/db/schema";

function tokenBase64Url(bytes: number) {
  return randomBytes(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function generateOpaqueStepIngestToken() {
  return `st_${tokenBase64Url(24)}`;
}

async function ensureLocalUserRow(userId: string) {
  await db
    .insert(user)
    .values({
      id: userId,
      name: "Clerk User",
      email: null,
      emailVerified: null,
      image: null,
    })
    .onConflictDoNothing({ target: user.id });
}

export async function getOrCreateStepIngestToken(userId: string) {
  await ensureLocalUserRow(userId);

  const existing = await db.query.stepIngestTokens.findFirst({
    where: eq(stepIngestTokens.userId, userId),
  });
  if (existing) return existing.token;

  const token = generateOpaqueStepIngestToken();
  await db.insert(stepIngestTokens).values({
    userId,
    token,
  });
  return token;
}

export async function regenerateStepIngestToken(userId: string) {
  await ensureLocalUserRow(userId);
  const token = generateOpaqueStepIngestToken();

  const existing = await db.query.stepIngestTokens.findFirst({
    where: eq(stepIngestTokens.userId, userId),
    columns: { userId: true },
  });

  if (existing) {
    await db
      .update(stepIngestTokens)
      .set({
        token,
        updatedAt: new Date(),
      })
      .where(eq(stepIngestTokens.userId, userId));
  } else {
    await db.insert(stepIngestTokens).values({ userId, token });
  }

  return token;
}

export async function getUserIdForStepIngestToken(stepIngestToken: string) {
  const row = await db.query.stepIngestTokens.findFirst({
    where: eq(stepIngestTokens.token, stepIngestToken),
    columns: { userId: true },
  });
  return row?.userId ?? null;
}

export async function deleteStepIngestToken(userId: string) {
  await db.delete(stepIngestTokens).where(eq(stepIngestTokens.userId, userId));
}
