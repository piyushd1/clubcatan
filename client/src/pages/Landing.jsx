import { useState } from 'react';
import { Button, Card } from '../components/ui';
import { Icons } from '../components/ui/icons';

/**
 * First-run / pre-room screen. The user enters a name, then either creates a
 * new expedition or joins an existing one by code.
 *
 * Pure presentational — all async work (opening a PartyKit room, RPC-ing the
 * server) happens in App.jsx via `onCreate`/`onJoin` callbacks.
 */
export function Landing({ defaultName = '', onCreate, onJoin, busy, error }) {
  const [mode, setMode] = useState(null); // null | 'create' | 'join'
  const [name, setName] = useState(defaultName);
  const [code, setCode] = useState('');
  const [extended, setExtended] = useState(false);
  const [specialBuild, setSpecialBuild] = useState(false);

  const canSubmit =
    name.trim().length > 0 &&
    (mode === 'create' || (mode === 'join' && code.trim().length >= 4));

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit || busy) return;
    if (mode === 'create') {
      // Special Building only applies in 5-6 player expansion. Force off for base.
      onCreate({
        playerName: name.trim(),
        isExtended: extended,
        enableSpecialBuild: extended ? specialBuild : false,
      });
    } else {
      onJoin({ roomCode: code.trim().toUpperCase(), playerName: name.trim() });
    }
  };

  return (
    <main className="min-h-dvh bg-surface px-6 pt-[max(24px,env(safe-area-inset-top))] pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-md flex-col gap-8 pt-8">
        <header className="text-center">
          <p className="text-xs font-bold tracking-[0.3em] text-on-surface/50">THE TACTILE NATURALIST EDITION</p>
          <h1 className="mt-2 text-5xl font-extrabold tracking-display text-primary">ClubCatan</h1>
          <p className="mt-2 text-sm text-on-surface-variant">Catan for your group, built for phones.</p>
        </header>

        {mode === null ? (
          <div className="flex flex-col gap-3">
            <Button size="lg" icon={<Icons.Home size={18} />} onClick={() => setMode('create')}>
              Plan an Expedition
            </Button>
            <Button size="lg" variant="secondary" icon={<Icons.UserPlus size={18} />} onClick={() => setMode('join')}>
              Join One
            </Button>
          </div>
        ) : (
          <Card tone="low" className="flex flex-col gap-5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMode(null)}
                aria-label="Back"
                className="rounded-full p-2 text-on-surface-variant hover:bg-surface-container"
              >
                <Icons.ArrowLeft size={18} />
              </button>
              <h2 className="text-xl font-bold text-on-surface">
                {mode === 'create' ? 'Plan an Expedition' : 'Join an Expedition'}
              </h2>
            </div>

            <form onSubmit={submit} className="flex flex-col gap-4">
              <Field label="Your name">
                <input
                  className="field-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  autoComplete="nickname"
                  placeholder="Name or nickname"
                  maxLength={24}
                />
              </Field>

              {mode === 'join' ? (
                <Field label="Expedition code">
                  <input
                    className="field-input font-mono text-2xl tracking-[0.25em] uppercase"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    autoCapitalize="characters"
                    autoComplete="off"
                    placeholder="XXXXXX"
                    maxLength={8}
                  />
                </Field>
              ) : (
                <div className="flex flex-col gap-3">
                  <Toggle
                    label="5-6 player board"
                    hint="Use the extended map. Base game otherwise."
                    checked={extended}
                    onChange={setExtended}
                  />
                  <Toggle
                    label="Special Building phase"
                    hint={extended
                      ? 'Between turns, others may build with their own resources.'
                      : 'Only available in 5-6 player mode.'}
                    checked={extended && specialBuild}
                    onChange={setSpecialBuild}
                    disabled={!extended}
                  />
                </div>
              )}

              {error ? <p className="text-sm font-semibold text-secondary">{error}</p> : null}

              <Button size="lg" type="submit" disabled={!canSubmit || busy}>
                {busy ? 'Working…' : mode === 'create' ? 'Start Planning' : 'Join'}
              </Button>
            </form>
          </Card>
        )}
      </div>
    </main>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-bold uppercase tracking-wider text-on-surface/60">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, hint, checked, onChange, disabled = false }) {
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

export default Landing;
