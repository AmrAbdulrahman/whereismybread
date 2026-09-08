'use client';

import { useState } from 'react';
import { Button, Field, Label, ResponsiveModal, cn } from '@wib/ui';
import type { EditScope } from '../lib/actions';

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
 * every later one. The parent does the delete (optimistically), so confirming
 * just hands back the chosen scope.
 */
export function DeleteConfirmModal({
  target,
  onConfirm,
  onCancel,
}: {
  target: DeleteTarget | null;
  onConfirm: (target: DeleteTarget, scope: EditScope | null) => void;
  onCancel: () => void;
}) {
  return (
    <ResponsiveModal
      open={target != null}
      onOpenChange={(o) => !o && onCancel()}
      title={target ? `Delete ${target.name}` : 'Delete'}
    >
      {target ? (
        <DeleteForm
          key={target.kind === 'payment' ? target.paymentId : target.id}
          target={target}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      ) : null}
    </ResponsiveModal>
  );
}

function DeleteForm({
  target,
  onConfirm,
  onCancel,
}: {
  target: DeleteTarget;
  onConfirm: (target: DeleteTarget, scope: EditScope | null) => void;
  onCancel: () => void;
}) {
  const scoped = target.kind === 'payment' && target.recurring;
  const [scope, setScope] = useState<EditScope>('this');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm(target, scoped ? scope : null);
      }}
      className="flex flex-col gap-4"
    >
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
            ? 'This recorded expense will be removed.'
            : 'This payment will be removed.'}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="danger">
          Delete
        </Button>
      </div>
    </form>
  );
}
