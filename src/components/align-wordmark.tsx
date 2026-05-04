type Props = {
  className?: string;
};

/**
 * Vector wordmark — matches app serif (Lora) and keeps wave detail sharp at header size.
 */
export function AlignWordmark({ className }: Props) {
  return (
    <span
      className={`relative inline-block leading-none font-serif text-[1.35rem] font-semibold tracking-[-0.04em] text-align-forest md:text-[1.5rem] ${className ?? ""}`}
    >
      <svg
        className="pointer-events-none absolute left-[0.02em] top-[0.5em] h-[0.52em] w-[0.92em] -translate-y-1/2"
        viewBox="0 0 48 22"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <path
          d="M1 11.5C9 7 15 14 22 10.5c6-3 12 2 17 1.5 5-0.5 8-3 9.5-2"
          stroke="#62a3c9"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M1 14.5C10 9 16 17 24 13c5-3 10 1 14.5 0.5C43 13 45 11 46.5 11.5"
          stroke="#3d9279"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M1 8C10 13 15 5 23 8.5c6 2.5 11-1 16-0.5 5 0.5 8.5 2.5 10 2"
          stroke="#7bb8a6"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M1 17C8 12.5 14 18 21 15c5-2 10 0.5 15 0 5-0.5 9-3 12-2"
          stroke="#cbb255"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      Align
    </span>
  );
}
