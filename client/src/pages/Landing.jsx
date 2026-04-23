import { useState } from 'react';
import { Button, Card } from '../components/ui';
import { Icons } from '../components/ui/icons';
import { CreateExpeditionForm } from '../components/landing/CreateExpeditionForm';
import { JoinExpeditionForm } from '../components/landing/JoinExpeditionForm';

/**
 * First-run / pre-room screen. The user enters a name, then either creates a
 * new expedition or joins an existing one by code.
 *
 * Pure presentational — all async work (opening a PartyKit room, RPC-ing the
 * server) happens in App.jsx via `onCreate`/`onJoin` callbacks.
 */
export function Landing({ defaultName = '', invitedCode = null, onCreate, onJoin, busy, error }) {
  // A shared `?room=XXXXXX` link drops straight into Join mode with the code
  // pre-filled. User only has to type their name.
  const [mode, setMode] = useState(invitedCode ? 'join' : null);

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

            {mode === 'create' ? (
              <CreateExpeditionForm
                defaultName={defaultName}
                onCreate={onCreate}
                busy={busy}
                error={error}
              />
            ) : (
              <JoinExpeditionForm
                defaultName={defaultName}
                invitedCode={invitedCode}
                onJoin={onJoin}
                busy={busy}
                error={error}
              />
            )}
          </Card>
        )}
      </div>
    </main>
  );
}

export default Landing;
