"use client";

import Image from "next/image";

type Props = {
  className?: string;
};

/** Full horizontal wordmark (type + wave graphic) — raster for Figma fidelity. */
export function AlignWordmark({ className }: Props) {
  return (
    <Image
      src="/brand/align-wordmark.png"
      alt=""
      width={540}
      height={195}
      className={`h-7 w-auto max-w-[min(100%,10rem)] shrink-0 object-contain object-left md:h-8 md:max-w-[11.5rem] ${className ?? ""}`}
      priority
      aria-hidden
    />
  );
}
