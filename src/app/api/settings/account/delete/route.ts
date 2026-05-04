import { eq } from "drizzle-orm";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { user } from "@/db/schema";

const CONFIRM_PHRASE = "DELETE MY ACCOUNT";

type Body = { confirmPhrase?: string };

/**
 * Removes all Postgres rows for this user (FK cascade), then deletes the Clerk user.
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.confirmPhrase !== CONFIRM_PHRASE) {
    return NextResponse.json({ error: "Confirmation does not match." }, { status: 400 });
  }

  await db.delete(user).where(eq(user.id, userId));

  try {
    const client = await clerkClient();
    await client.users.deleteUser(userId);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Clerk delete failed";
    return NextResponse.json(
      {
        error: message,
        detail:
          "Local data was removed, but your sign-in could not be deleted automatically. Remove the user in the Clerk dashboard or try again.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
