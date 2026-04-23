export function LandingField({ label, children }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-bold uppercase tracking-wider text-on-surface/60">{label}</span>
      {children}
    </label>
  );
}
