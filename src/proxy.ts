import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/** Apple Shortcuts POSTs here without a browser session; never run auth for it. */
const isPublicIngestStepsRoute = createRouteMatcher(["/api/ingest/steps/(.*)"]);

const isProtectedRoute = createRouteMatcher([
  "/",
  "/dashboard(.*)",
  "/settings(.*)",
  "/patterns(.*)",
  "/onboarding(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicIngestStepsRoute(req)) {
    return NextResponse.next();
  }
  if (isProtectedRoute(req)) await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
