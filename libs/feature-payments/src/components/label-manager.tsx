'use client';

import { useEffect, useState } from 'react';
import type { FormState } from '@wib/auth';
import { Button, ResponsiveModal, cn } from '@wib/ui';
import { Pencil, Plus, Trash2 } from '@wib/ui/icons';
import type { AccountFormValues } from '../lib/account-schema';
import type { LabelRow } from '../lib/actions';
import { LabelForm } from './label-form';

type Sheet =
  | { mode: 'closed' }
  | { mode: 'new' }
  | { mode: 'edit'; item: LabelRow };

/**
 * List / add / edit / delete a set of coloured labels (accounts or banks).
 * Deleting one only unlinks it from its payments — `payment.account_id` /
 * `bank_id` are `on delete set null`.
 */
export function LabelManager({
  title,
  noun,
  description,
  namePlaceholder,
  items: initial,
  onSave,
  onDelete,
  onRefresh,
}: {
  title: string;
  /** Lowercase singular, e.g. "account" / "bank". */
  noun: string;
  description: string;
  namePlaceholder: string;
  items: LabelRow[];
  onSave: (
    id: string | null,
    values: AccountFormValues,
  ) => Promise<FormState & { item?: LabelRow }>;
  onDelete: (id: string) => Promise<FormState>;
  onRefresh: () => Promise<LabelRow[]>;
}) {
  const [items, setItems] = useState(initial);
  const [sheet, setSheet] = useState<Sheet>({ mode: 'closed' });
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => setItems(initial), [initial]);

  const refresh = async () => {
    try {
      setItems(await onRefresh());
    } catch {
      /* server already revalidated; a failed refresh is harmless */
    }
  };

  const onSaved = (item: LabelRow) => {
    setItems((prev) => {
      const next = prev.some((t) => t.id === item.id)
        ? prev.map((t) =>
            t.id === item.id ? { ...t, name: item.name, color: item.color } : t,
          )
        : [...prev, item];
      return [...next].sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
      );
    });
    setSheet({ mode: 'closed' });
    void refresh();
  };

  const remove = async (id: string) => {
    setBusyId(id);
    setItems((prev) => prev.filter((t) => t.id !== id));
    setConfirmingDelete(null);
    await onDelete(id);
    setBusyId(null);
  };

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-ink-soft">{description}</p>
        </div>
        <Button
          size="sm"
          className="shrink-0"
          onClick={() => setSheet({ mode: 'new' })}
        >
          <Plus size={16} strokeWidth={2.75} />
          New {noun}
        </Button>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong py-12 text-center">
          <p className="text-sm text-ink-soft">
            No {noun}s yet. Add one here, or create them on the fly from a
            payment.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li
              key={item.id}
              className={cn(
                'flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 transition-opacity',
                busyId === item.id && 'opacity-50',
              )}
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: item.color }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {item.name}
                </p>
                <p className="text-xs text-muted">
                  {item.paymentCount === 0
                    ? 'Not used yet'
                    : `Used in ${item.paymentCount} payment${
                        item.paymentCount === 1 ? '' : 's'
                      }`}
                </p>
              </div>

              {confirmingDelete === item.id ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted">Delete?</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmingDelete(null)}
                  >
                    Keep
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => remove(item.id)}
                  >
                    Delete
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setSheet({ mode: 'edit', item })}
                    aria-label={`Edit ${item.name}`}
                    className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
                  >
                    <Pencil size={15} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(item.id)}
                    aria-label={`Delete ${item.name}`}
                    className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger"
                  >
                    <Trash2 size={15} strokeWidth={2} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <ResponsiveModal
        open={sheet.mode !== 'closed'}
        onOpenChange={(o) => !o && setSheet({ mode: 'closed' })}
        title={sheet.mode === 'edit' ? `Edit ${noun}` : `New ${noun}`}
      >
        {sheet.mode !== 'closed' ? (
          <LabelForm
            noun={noun}
            placeholder={namePlaceholder}
            initial={sheet.mode === 'edit' ? sheet.item : undefined}
            onSave={onSave}
            onSaved={onSaved}
            onCancel={() => setSheet({ mode: 'closed' })}
          />
        ) : null}
      </ResponsiveModal>
    </div>
  );
}
