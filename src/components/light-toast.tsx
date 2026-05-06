"use client";

type Props = {
  message: string;
};

export function LightToast({ message }: Props) {
  return (
    <div
      className="fixed bottom-4 right-4 z-[70] rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 shadow-lg shadow-black/10"
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}
