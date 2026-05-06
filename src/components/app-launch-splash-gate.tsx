"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const SPLASH_MS = 2000;

export function AppLaunchSplashGate({ children }: { children: React.ReactNode }) {
  const [showSplash, setShowSplash] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const startFade = window.setTimeout(() => setFadeOut(true), SPLASH_MS - 350);
    const endSplash = window.setTimeout(() => setShowSplash(false), SPLASH_MS);
    return () => {
      window.clearTimeout(startFade);
      window.clearTimeout(endSplash);
    };
  }, []);

  return (
    <>
      {showSplash ? (
        <div
          aria-hidden
          className={`fixed inset-0 z-[100] overflow-hidden bg-[radial-gradient(circle_at_82%_12%,#acb98a_0%,#8baa90_18%,#6a9aa1_38%,#467f91_66%,#275f6f_100%)] transition-opacity duration-500 ${
            fadeOut ? "opacity-0" : "opacity-100"
          }`}
        >
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0)_38%,rgba(8,32,39,0.1)_100%)]" />
          <div className="relative flex h-full items-center justify-center">
            <div className="relative w-[220px] max-w-[70vw] sm:w-[270px]">
              <Image
                src="/brand/align-wordmark-white.png"
                alt="Align"
                width={608}
                height={258}
                priority
                className="w-full select-none drop-shadow-[0_6px_16px_rgba(7,34,41,0.2)]"
              />
            </div>
          </div>
        </div>
      ) : null}
      {children}
    </>
  );
}

