import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { DEXCOM_SHARE_UI_HIDDEN_COOKIE } from "@/lib/dexcom/share-ui-cookie";

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: DEXCOM_SHARE_UI_HIDDEN_COOKIE,
    value: userId,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
  });
  return res;
}

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: DEXCOM_SHARE_UI_HIDDEN_COOKIE,
    value: "",
    path: "/",
    maxAge: 0,
  });
  return res;
}
