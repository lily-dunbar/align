"use client";

import Link from "next/link";
import { SignInButton, useAuth, UserButton } from "@clerk/nextjs";

import { AlignWordmark } from "@/components/align-wordmark";

function UserMenuIcon() {
  return (
    <span
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-align-border bg-align-subtle text-align-muted transition hover:border-align-border hover:bg-white"
      aria-hidden
    >
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
        />
      </svg>
    </span>
  );
}

type AppHeaderProps = {
  /** Server-driven: set `DEMO_MODE=true` in env for class demos (see `npm run seed:demo`). */
  demoMode?: boolean;
};

export function AppHeader({ demoMode = false }: AppHeaderProps) {
  const { isSignedIn, isLoaded } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-align-border/80 bg-white/85 backdrop-saturate-150 backdrop-blur-md supports-[backdrop-filter]:bg-white/70">
      {demoMode ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-center text-[11px] font-medium text-amber-950 md:px-8">
          Demo mode — seeded CGM, steps, and workouts for your signed-in account. Run{" "}
          <code className="rounded bg-amber-100/80 px-1 font-mono text-[10px]">npm run seed:demo</code>{" "}
          with <code className="rounded bg-amber-100/80 px-1 font-mono text-[10px]">DEMO_USER_ID</code>.
        </div>
      ) : null}
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 md:px-8">
        <Link
          href="/"
          className="group flex items-center transition-opacity hover:opacity-[0.92] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-align-forest/25 focus-visible:ring-offset-2"
          aria-label="Align home"
        >
          <AlignWordmark className="shrink-0" />
        </Link>

        <div className="flex shrink-0 items-center">
          {!isLoaded ? (
            <span
              className="inline-block h-9 w-9 shrink-0 animate-pulse rounded-full bg-zinc-100"
              aria-hidden
            />
          ) : isSignedIn ? (
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "h-9 w-9",
                },
              }}
            />
          ) : (
            <SignInButton mode="modal">
              <button
                type="button"
                className="rounded-full outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-align-forest/30"
                aria-label="Sign in"
              >
                <UserMenuIcon />
              </button>
            </SignInButton>
          )}
        </div>
      </div>
    </header>
  );
}
