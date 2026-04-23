import { useState } from 'react';
import { Button } from '../../components/ui';
import { LandingField } from './LandingField';
import { LandingToggle } from './LandingToggle';

export function CreateExpeditionForm({ defaultName = '', onCreate, busy, error }) {
  const [name, setName] = useState(defaultName);
  const [extended, setExtended] = useState(false);
  const [specialBuild, setSpecialBuild] = useState(false);

  const canSubmit = name.trim().length > 0;

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit || busy) return;

    // Special Building only applies in 5-6 player expansion. Force off for base.
    onCreate({
      playerName: name.trim(),
      isExtended: extended,
      enableSpecialBuild: extended ? specialBuild : false,
    });
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

      <div className="flex flex-col gap-3">
        <LandingToggle
          label="5-6 player board"
          hint="Use the extended map. Base game otherwise."
          checked={extended}
          onChange={setExtended}
        />
        <LandingToggle
          label="Special Building phase"
          hint={extended
            ? 'Between turns, others may build with their own resources.'
            : 'Only available in 5-6 player mode.'}
          checked={extended && specialBuild}
          onChange={setSpecialBuild}
          disabled={!extended}
        />
      </div>

      {error ? <p className="text-sm font-semibold text-secondary">{error}</p> : null}

      <Button size="lg" type="submit" disabled={!canSubmit || busy}>
        {busy ? 'Working…' : 'Start Planning'}
      </Button>
    </form>
  );
}
