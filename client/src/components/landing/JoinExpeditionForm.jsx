import { useState } from 'react';
import { Button } from '../../components/ui';
import { LandingField } from './LandingField';

export function JoinExpeditionForm({ defaultName = '', invitedCode = '', onJoin, busy, error }) {
  const [name, setName] = useState(defaultName);
  const [code, setCode] = useState(invitedCode ?? '');

  const canSubmit = name.trim().length > 0 && code.trim().length >= 4;

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit || busy) return;

    onJoin({ roomCode: code.trim().toUpperCase(), playerName: name.trim() });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <LandingField label="Your name">
        <input
          className="field-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          autoComplete="nickname"
          placeholder="Name or nickname"
          maxLength={24}
        />
      </LandingField>

      <LandingField label="Expedition code">
        <input
          className="field-input font-mono text-2xl tracking-[0.25em] uppercase"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="XXXXXX"
          maxLength={8}
        />
      </LandingField>

      {error ? <p className="text-sm font-semibold text-secondary">{error}</p> : null}

      <Button size="lg" type="submit" disabled={!canSubmit || busy}>
        {busy ? 'Working…' : 'Join'}
      </Button>
    </form>
  );
}
