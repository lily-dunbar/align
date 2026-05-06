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
      className={`relative inline-flex h-8 w-12 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-align-forest disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-align-forest" : "bg-zinc-200"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-6 w-6 translate-x-1 translate-y-1 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}
