import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  createDexcomState,
  getDexcomAuthorizeUrl,
  getDexcomRedirectUri,
} from "@/lib/dexcom/oauth";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(
      new URL("/sign-in", process.env.AUTH_URL ?? "http://localhost:4000"),
    );
  }

  const clientId = process.env.DEXCOM_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "DEXCOM_CLIENT_ID is not configured" },
      { status: 500 },
    );
  }

  const state = createDexcomState(userId);
  const authorizeUrl = new URL(getDexcomAuthorizeUrl());
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", getDexcomRedirectUri());
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set(
    "scope",
    process.env.DEXCOM_SCOPE ?? "offline_access",
  );
  authorizeUrl.searchParams.set("state", state);

  return NextResponse.redirect(authorizeUrl);
}
