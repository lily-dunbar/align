import type { NextRequest } from "next/server";

export function isDemoRequest(request: NextRequest): boolean {
  const v = request.nextUrl.searchParams.get("demo")?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
