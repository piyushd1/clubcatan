export function LandingToggle({ label, hint, checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      aria-pressed={checked}
      aria-disabled={disabled}
      disabled={disabled}
      className={`flex items-center justify-between gap-4 rounded-md bg-surface p-3 text-left transition-colors ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-surface-container cursor-pointer'
      }`}
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-bold text-on-surface">{label}</span>
        <span className="text-xs text-on-surface-variant">{hint}</span>
      </span>
      <span
        aria-hidden="true"
        className={`h-6 w-10 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-surface-high'}`}
      >
        <span
          className={`block h-5 w-5 translate-y-0.5 rounded-full bg-on-primary shadow-ambient transition-transform ${
            checked ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}
