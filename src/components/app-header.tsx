"use client";

import Link from "next/link";
import { SignInButton, useAuth, UserButton } from "@clerk/nextjs";

function UserMenuIcon() {
  return (
    <span
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-500 transition hover:border-zinc-300 hover:bg-zinc-100"
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

export function AppHeader() {
  const { isSignedIn, isLoaded } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 md:px-8">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-zinc-900 transition hover:text-zinc-700"
        >
          Align
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
                className="rounded-full outline-none ring-zinc-400 focus-visible:ring-2 focus-visible:ring-offset-2"
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
