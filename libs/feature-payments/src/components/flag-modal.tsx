'use client';

import { useState } from 'react';
import { Button, Field, Label, ResponsiveModal, cn } from '@wib/ui';
import { flagPaymentAction } from '../lib/actions';

type Scope = 'series' | 'instance';

export interface FlagTarget {
  paymentId: string;
  name: string;
  occurrenceDate: string;
  recurring: boolean;
  seriesNote: string | null;
  instanceNote: string | null;
}

/** Add / edit / remove a flag on a payment — the whole series or one occurrence. */
export function FlagModal({
  target,
  onDone,
}: {
  target: FlagTarget | null;
  onDone: () => void;
}) {
  return (
    <ResponsiveModal
      open={target != null}
      onOpenChange={(o) => !o && onDone()}
      title={target ? `Flag ${target.name}` : 'Flag payment'}
    >
      {target ? (
        <FlagForm key={target.paymentId + target.occurrenceDate} {...target} onDone={onDone} />
      ) : null}
    </ResponsiveModal>
  );
}

function FlagForm({
  paymentId,
  occurrenceDate,
  recurring,
  seriesNote,
  instanceNote,
  onDone,
}: FlagTarget & { onDone: () => void }) {
  const noteFor = (s: Scope) =>
    (s === 'instance' ? instanceNote : seriesNote) ?? '';

  const initialScope: Scope = recurring
    ? instanceNote != null || seriesNote == null
      ? 'instance'
      : 'series'
    : 'series';

  const [scope, setScope] = useState<Scope>(initialScope);
  const [note, setNote] = useState(noteFor(initialScope));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const pickScope = (s: Scope) => {
    setScope(s);
    setNote(noteFor(s));
  };

  const flaggedNow = scope === 'instance' ? instanceNote != null : seriesNote != null;

  const submit = async (value: string) => {
    setBusy(true);
    setError(undefined);
    const result = await flagPaymentAction({
      paymentId,
      scope,
      occurrenceDate,
      note: value,
    });
    setBusy(false);
    if (result.ok) onDone();
    else setError(result.error ?? 'Could not save the flag.');
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(note);
      }}
      className="flex flex-col gap-4"
    >
      {error ? (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {recurring ? (
        <Field>
          <Label>Flag</Label>
          <div className="flex flex-col gap-2">
            {(
              [
                [
                  'instance',
                  'This occurrence',
                  'Only the payment on this date.',
                ],
                [
                  'series',
                  'The whole series',
                  'Every occurrence of this payment.',
                ],
              ] as const
            ).map(([value, label, hint]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={scope === value}
                onClick={() => pickScope(value)}
                className={cn(
                  'flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left',
                  scope === value
                    ? 'border-accent bg-accent/10'
                    : 'border-line-strong hover:border-line',
                )}
              >
                <span className="text-sm font-medium text-ink">{label}</span>
                <span className="text-xs text-muted">{hint}</span>
              </button>
            ))}
          </div>
        </Field>
      ) : null}

      <Field>
        <Label htmlFor="flag-note">Note</Label>
        <textarea
          id="flag-note"
          rows={3}
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why does this need attention? e.g. confirm the new amount with the landlord"
          className="rounded-md border border-line-strong bg-ground px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </Field>

      {flaggedNow ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit('')}
          className="self-start text-xs font-medium text-danger hover:underline disabled:opacity-50"
        >
          Remove flag
        </button>
      ) : null}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || (!note.trim() && !flaggedNow)}>
          {busy ? 'Saving…' : flaggedNow ? 'Update flag' : 'Flag'}
        </Button>
      </div>
    </form>
  );
}
