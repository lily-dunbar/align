"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import {
  PATTERNS_WINDOW_CHANGED_EVENT,
  PATTERNS_WINDOW_STORAGE_KEY,
  parseStoredPatternWindow,
} from "@/lib/patterns/stored-window";
import type { PatternWindow } from "@/lib/patterns/types";

function navActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  if (href.startsWith("/patterns?") || href === "/patterns") {
    return pathname === "/patterns" || pathname.startsWith("/patterns/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function buildInsightsHref() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let w: PatternWindow = "30d";
  try {
    const s = parseStoredPatternWindow(sessionStorage.getItem(PATTERNS_WINDOW_STORAGE_KEY));
    if (s) w = s;
  } catch {
    /* private mode */
  }
  return `/patterns?window=${w}&timeZone=${encodeURIComponent(tz)}`;
}

export function AppBottomNav() {
  const pathname = usePathname();
  const [insightsBump, setInsightsBump] = useState(0);

  useEffect(() => {
    function onWindowChanged() {
      setInsightsBump((n) => n + 1);
    }
    window.addEventListener(PATTERNS_WINDOW_CHANGED_EVENT, onWindowChanged);
    return () => window.removeEventListener(PATTERNS_WINDOW_CHANGED_EVENT, onWindowChanged);
  }, []);

  void insightsBump;

  const insightsHref =
    typeof window === "undefined" ? "/patterns?window=30d" : buildInsightsHref();

  if (
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/onboarding")
  ) {
    return null;
  }

  const items: { href: string; label: string; icon: ReactNode; linkKey: string }[] = [
    {
      href: "/",
      label: "Daily",
      linkKey: "daily",
      icon: (
        <svg className="h-[19px] w-[19px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.35}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5a2.25 2.25 0 002.25-2.25m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5a2.25 2.25 0 012.25 2.25v7.5"
          />
        </svg>
      ),
    },
    {
      href: insightsHref,
      label: "Insights",
      linkKey: "insights",
      icon: (
        <svg className="h-[19px] w-[19px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.35}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6"
          />
        </svg>
      ),
    },
    {
      href: "/settings",
      label: "Settings",
      linkKey: "settings",
      icon: (
        <svg className="h-[19px] w-[19px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.35}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.65.87.174.099.4.148.65.148.187 0 .365-.035.536-.104l1.122-.424a1.125 1.125 0 011.298.48l1.184 2.051c.307.532.17 1.207-.303 1.552l-1.024.84c-.232.19-.365.477-.365.775 0 .298.133.585.365.775l1.024.84c.473.345.61 1.02.303 1.552l-1.184 2.051a1.125 1.125 0 01-1.298.48l-1.122-.424c-.17-.069-.349-.104-.536-.104-.25 0-.476.049-.65.148-.337.184-.587.496-.65.87l-.213 1.281c-.09.542-.56.94-1.11.94h-2.593c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.063-.374-.313-.686-.65-.87a1.265 1.265 0 00-.536-.104c-.187 0-.365.035-.536.104l-1.122.424a1.125 1.125 0 01-1.298-.48l-1.184-2.051a1.125 1.125 0 01.303-1.552l1.024-.84c.232-.19.365-.477.365-.775 0-.298-.133-.585-.365-.775l-1.024-.84a1.125 1.125 0 01-.303-1.552l1.184-2.051c.307-.532 1.047-.688 1.298-.48l1.122.424c.17.069.349.104.536.104.25 0 .476-.049.65-.148.337-.184.587-.496.65-.87l.213-1.281z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-5 pb-[calc(0.45rem+env(safe-area-inset-bottom,0px))]">
      <nav
        className="pointer-events-auto w-full max-w-2xl rounded-full border border-align-border/90 bg-white/90 py-1.5 pl-2 pr-2 shadow-[0_8px_32px_-10px_rgba(27,77,67,0.16)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/85"
        aria-label="Main navigation"
      >
        <div className="grid grid-cols-3 gap-1">
          {items.map(({ href, label, icon, linkKey }) => {
            const active = navActive(href, pathname);
            return (
              <Link
                key={linkKey}
                href={href}
                suppressHydrationWarning={linkKey === "insights"}
                className={`flex flex-col items-center justify-center gap-1 rounded-full px-1 py-2 text-[11px] font-medium leading-none tracking-tight transition-colors duration-200 ${
                  active
                    ? "bg-align-nav-active text-align-forest shadow-[0_1px_2px_rgba(27,77,67,0.1)]"
                    : "text-zinc-500 hover:text-zinc-800"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <span className={active ? "text-align-forest" : "text-zinc-400"}>{icon}</span>
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
