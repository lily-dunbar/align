"use client";

type Props = {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
};

export function ToggleSwitch({ id, checked, disabled = false, onChange }: Props) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-8 w-[3.25rem] shrink-0 cursor-pointer rounded-full border border-transparent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-emerald-600" : "bg-zinc-200"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-7 w-7 translate-x-0.5 translate-y-0.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-[1.35rem]" : "translate-x-0"
        }`}
      />
    </button>
  );
}
