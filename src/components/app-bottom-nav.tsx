"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function navActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppBottomNav() {
  const pathname = usePathname();
  if (
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/auth/")
  ) {
    return null;
  }

  const items = [
    {
      href: "/",
      label: "Home",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
          />
        </svg>
      ),
    },
    {
      href: "/patterns",
      label: "Patterns",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
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
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.65.87.174.099.4.148.65.148.187 0 .365-.035.536-.104l1.122-.424a1.125 1.125 0 011.298.48l1.184 2.051c.307.532.17 1.207-.303 1.552l-1.024.84c-.232.19-.365.477-.365.775 0 .298.133.585.365.775l1.024.84c.473.345.61 1.02.303 1.552l-1.184 2.051a1.125 1.125 0 01-1.298.48l-1.122-.424c-.17-.069-.349-.104-.536-.104-.25 0-.476.049-.65.148-.337.184-.587.496-.65.87l-.213 1.281c-.09.542-.56.94-1.11.94h-2.593c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.063-.374-.313-.686-.65-.87a1.265 1.265 0 00-.536-.104c-.187 0-.365.035-.536.104l-1.122.424a1.125 1.125 0 01-1.298-.48l-1.184-2.051a1.125 1.125 0 01.303-1.552l1.024-.84c.232-.19.365-.477.365-.775 0-.298-.133-.585-.365-.775l-1.024-.84a1.125 1.125 0 01-.303-1.552l1.184-2.051c.307-.532 1.047-.688 1.298-.48l1.122.424c.17.069.349.104.536.104.25 0 .476-.049.65-.148.337-.184.587-.496.65-.87l.213-1.281z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ] as const;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-8px_30px_rgba(0,0,0,0.06)] backdrop-blur-md supports-[backdrop-filter]:bg-white/90"
      aria-label="Main navigation"
    >
      <div className="mx-auto grid max-w-lg grid-cols-3 gap-1 px-2 pt-1">
        {items.map(({ href, label, icon }) => {
          const active = navActive(href, pathname);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-[11px] font-medium transition-colors ${
                active
                  ? "text-emerald-700"
                  : "text-zinc-500 hover:text-zinc-800"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <span className={active ? "text-emerald-600" : "text-zinc-400"}>{icon}</span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
