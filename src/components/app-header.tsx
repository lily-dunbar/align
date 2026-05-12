"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SignInButton, useAuth, useUser, UserButton } from "@clerk/nextjs";
import {
  PATTERNS_WINDOW_CHANGED_EVENT,
  PATTERNS_WINDOW_STORAGE_KEY,
  parseStoredPatternWindow,
} from "@/lib/patterns/stored-window";
import type { PatternWindow } from "@/lib/patterns/types";

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

function buildInsightsHref(isDemoRoute: boolean) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let w: PatternWindow = "30d";
  try {
    const s = parseStoredPatternWindow(sessionStorage.getItem(PATTERNS_WINDOW_STORAGE_KEY));
    if (s) w = s;
  } catch {
    // sessionStorage may be unavailable (private mode)
  }
  return isDemoRoute
    ? `/demo/patterns?window=${w}&timeZone=${encodeURIComponent(tz)}`
    : `/patterns?window=${w}&timeZone=${encodeURIComponent(tz)}`;
}

function DesktopNavMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [insightsBump, setInsightsBump] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const isDemoRoute = pathname.startsWith("/demo");

  useEffect(() => {
    function onWindowChanged() {
      setInsightsBump((n) => n + 1);
    }
    window.addEventListener(PATTERNS_WINDOW_CHANGED_EVENT, onWindowChanged);
    return () => window.removeEventListener(PATTERNS_WINDOW_CHANGED_EVENT, onWindowChanged);
  }, []);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current) return;
      if (e.target instanceof Node && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  void insightsBump;
  const insightsHref =
    typeof window === "undefined"
      ? isDemoRoute
        ? "/demo/patterns?window=30d"
        : "/patterns?window=30d"
      : buildInsightsHref(isDemoRoute);

  const items = [
    { href: isDemoRoute ? "/demo" : "/", label: "Daily" },
    { href: insightsHref, label: "Insights" },
    { href: isDemoRoute ? "/demo/settings" : "/settings", label: "Settings" },
  ];

  return (
    <div ref={rootRef} className="relative hidden md:block">
      <button
        type="button"
        aria-label="Open navigation menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-align-border bg-white text-align-muted shadow-sm shadow-black/[0.04] transition hover:bg-align-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-align-forest/30"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 min-w-[10.5rem] rounded-xl border border-align-border/80 bg-white/95 p-1.5 shadow-lg shadow-black/[0.08] backdrop-blur"
        >
          {items.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-zinc-700 transition hover:bg-align-subtle/85 hover:text-zinc-900"
            >
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type AppHeaderProps = {
  /** True when Demo Mode is on for this account (Settings). */
  devModeBanner?: boolean;
};

export function AppHeader({ devModeBanner = false }: AppHeaderProps) {
  const pathname = usePathname();
  const showDemoBanner = devModeBanner || pathname.startsWith("/demo");
  const { isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();
  const initial = (user?.firstName?.trim().charAt(0) || user?.username?.trim().charAt(0) || "A")
    .toUpperCase();

  if (pathname.startsWith("/onboarding")) {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 border-b border-align-border/80 bg-white/85 backdrop-saturate-150 backdrop-blur-md supports-[backdrop-filter]:bg-white/70">
      {showDemoBanner ? (
        <div
          role="status"
          className="border-b border-align-border/60 bg-align-subtle/90 px-4 py-1.5 text-center text-xs font-medium text-align-muted md:px-8"
        >
          Demo Mode
        </div>
      ) : null}
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 md:px-8">
        <Link
          href="/"
          className="group flex shrink-0 items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-align-forest/25 focus-visible:ring-offset-2"
          aria-label="Align home"
        >
          <Image
            src="/brand/align-wordmark.png"
            alt="Align"
            width={598}
            height={227}
            className="h-7 w-auto object-contain object-left transition-opacity group-hover:opacity-[0.88] md:h-8"
            priority
            sizes="(max-width: 768px) 180px, 200px"
          />
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          {!pathname.startsWith("/sign-in") &&
          !pathname.startsWith("/sign-up") &&
          !pathname.startsWith("/auth/") ? (
            <DesktopNavMenu />
          ) : null}
          {!isLoaded ? (
            <span
              className="inline-block h-9 w-9 shrink-0 animate-pulse rounded-full bg-zinc-100"
              aria-hidden
            />
          ) : isSignedIn ? (
            <UserButton
              appearance={{
                elements: {
                  avatarBox:
                    "h-11 w-11 rounded-full border border-white/60 bg-[radial-gradient(circle_at_82%_12%,#acb98a_0%,#8baa90_20%,#5f8ea0_52%,#2f7185_100%)] shadow-sm shadow-black/15",
                  avatarFallback:
                    "h-full w-full rounded-full bg-transparent text-base font-semibold text-white",
                },
              }}
              fallback={initial}
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
