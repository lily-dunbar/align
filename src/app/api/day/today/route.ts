import { NextRequest } from "next/server";

import { GET as getDay } from "@/app/api/day/route";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  if (!url.searchParams.has("date")) {
    const todayYmd = new Date().toISOString().slice(0, 10);
    url.searchParams.set("date", todayYmd);
  }
  const forwarded = new Request(url.toString(), {
    method: "GET",
    headers: request.headers,
  });
  return getDay(forwarded as NextRequest);
}
