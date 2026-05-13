import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  createDexcomState,
  getDexcomAuthorizeUrl,
  getDexcomOAuthAuthorizeScope,
  getDexcomRedirectUri,
} from "@/lib/dexcom/oauth";
import { sanitizeOAuthReturnTo } from "@/lib/oauth-return-to";
import { getPublicAppBaseUrl } from "@/lib/public-app-base-url";

export async function GET(request: Request) {
  const appBase = getPublicAppBaseUrl();
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", appBase));
  }

  const { searchParams } = new URL(request.url);
  const returnTo = sanitizeOAuthReturnTo(searchParams.get("return_to")) ?? "/";

  const clientId = process.env.DEXCOM_CLIENT_ID;
  if (!clientId) {
    const out = new URL(returnTo, appBase);
    out.searchParams.set("dexcom_error", "missing_client_id");
    return NextResponse.redirect(out);
  }

  let state: string;
  try {
    state = createDexcomState(userId, returnTo);
  } catch (error) {
    const out = new URL(returnTo, appBase);
    out.searchParams.set("dexcom_error", "state_setup_failed");
    if (error instanceof Error) {
      out.searchParams.set("dexcom_details", error.message.slice(0, 180));
    }
    return NextResponse.redirect(out);
  }
  const authorizeUrl = new URL(getDexcomAuthorizeUrl());
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", getDexcomRedirectUri());
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", getDexcomOAuthAuthorizeScope());
  authorizeUrl.searchParams.set("state", state);

  return NextResponse.redirect(authorizeUrl);
}
