'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field, Label, ResponsiveModal, cn } from '@wib/ui';
import { deletePaymentAction } from '../lib/actions';
import { deleteExpenseAction } from '../lib/budget-actions';

export type DeleteTarget =
  | {
      kind: 'payment';
      paymentId: string;
      name: string;
      /** A recurring payment can be scoped to one occurrence or all of them. */
      recurring: boolean;
      occurrenceDate: string;
    }
  | { kind: 'expense'; id: string; name: string };

/**
 * The confirm step for deleting a payment / expense straight from its row's
 * overflow menu — no need to open the full edit form. A recurring payment
 * additionally asks whether to drop just this occurrence or this one and
 * every later one.
 */
export function DeleteConfirmModal({
  target,
  onDone,
}: {
  target: DeleteTarget | null;
  onDone: () => void;
}) {
  return (
    <ResponsiveModal
      open={target != null}
      onOpenChange={(o) => !o && onDone()}
      title={target ? `Delete ${target.name}` : 'Delete'}
    >
      {target ? (
        <DeleteForm
          key={target.kind === 'payment' ? target.paymentId : target.id}
          target={target}
          onDone={onDone}
        />
      ) : null}
    </ResponsiveModal>
  );
}

function DeleteForm({
  target,
  onDone,
}: {
  target: DeleteTarget;
  onDone: () => void;
}) {
  const router = useRouter();
  const scoped = target.kind === 'payment' && target.recurring;
  const [scope, setScope] = useState<'this' | 'future'>('this');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  // Esc / backdrop already close via the modal; nothing to seed.
  useEffect(() => setError(undefined), [target]);

  const run = async () => {
    setBusy(true);
    setError(undefined);
    const result =
      target.kind === 'expense'
        ? await deleteExpenseAction(target.id)
        : await deletePaymentAction(
            target.paymentId,
            scoped
              ? { scope, occurrenceDate: target.occurrenceDate }
              : undefined,
          );
    setBusy(false);
    if (result.ok) {
      router.refresh();
      onDone();
    } else {
      setError(result.error ?? 'Could not delete.');
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run();
      }}
      className="flex flex-col gap-4"
    >
      {error ? (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {scoped ? (
        <Field>
          <Label>Delete</Label>
          <div className="flex flex-col gap-2">
            {(
              [
                ['this', 'This occurrence', 'Only the payment on this date.'],
                [
                  'future',
                  'This and future',
                  'This occurrence and every later one. Earlier months are kept.',
                ],
              ] as const
            ).map(([value, label, hint]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={scope === value}
                onClick={() => setScope(value)}
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
      ) : (
        <p className="text-sm text-ink-soft">
          {target.kind === 'expense'
            ? 'This recorded expense will be removed. This cannot be undone.'
            : 'This payment will be removed. This cannot be undone.'}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" disabled={busy}>
          {busy ? 'Deleting…' : 'Delete'}
        </Button>
      </div>
    </form>
  );
}
