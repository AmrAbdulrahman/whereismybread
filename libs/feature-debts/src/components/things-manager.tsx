'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatMoney, money } from '@wib/domain';
import { Button, ResponsiveModal, useToast } from '@wib/ui';
import { Pencil, Plus, Trash2 } from '@wib/ui/icons';
import { deleteThingAction, listThingsAction } from '../lib/actions';
import type { ThingView } from '../lib/types';
import { ThingForm } from './thing-form';
import { ThingMark } from './thing-mark';

export function ThingsManager({
  initialThings,
  defaultCurrency,
  usedCurrencies = [],
  onClose,
}: {
  initialThings: ThingView[];
  defaultCurrency: string;
  usedCurrencies?: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [things, setThings] = useState(initialThings);
  const [edit, setEdit] = useState<
    { mode: 'new' } | { mode: 'edit'; thing: ThingView } | null
  >(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      setThings(await listThingsAction());
    } catch {
      /* keep the current list */
    }
    router.refresh();
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      const result = await deleteThingAction(id);
      if (!result.ok) {
        toast({ title: result.error ?? 'Could not delete it.', tone: 'danger' });
        return;
      }
      setConfirmId(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-soft">
        Define anything you track debts in — a watch, a non-standard gold type.
        A per-unit value is optional and only powers the approximate totals.
      </p>

      {things.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-sm text-muted">
          No things yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {things.map((t) => (
            <li
              key={t.id}
              className="flex flex-col gap-2 rounded-lg border border-line bg-surface px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <ThingMark thing={t} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {t.name}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    {t.unit === 'g' ? 'grams' : 'pieces'}
                    {t.valueMinor > 0
                      ? ` · ${formatMoney(money(t.valueMinor, t.valueCurrency))} each`
                      : ''}
                    {' · '}
                    {t.useCount === 0
                      ? 'unused'
                      : `used ${t.useCount}×`}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Edit ${t.name}`}
                  onClick={() => setEdit({ mode: 'edit', thing: t })}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
                >
                  <Pencil size={13} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${t.name}`}
                  disabled={t.useCount > 0}
                  title={t.useCount > 0 ? 'In use by a debt' : undefined}
                  onClick={() => setConfirmId(t.id)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted"
                >
                  <Trash2 size={13} strokeWidth={2} />
                </button>
              </div>
              {confirmId === t.id ? (
                <div className="flex items-center justify-end gap-2 border-t border-line/60 pt-2 text-xs">
                  <span className="mr-auto text-muted">Delete {t.name}?</span>
                  <button
                    type="button"
                    onClick={() => setConfirmId(null)}
                    className="font-medium text-muted hover:text-ink"
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove(t.id)}
                    className="font-semibold text-danger hover:underline disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setEdit({ mode: 'new' })}
        >
          <Plus size={14} strokeWidth={2.5} />
          Add a thing
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Done
        </Button>
      </div>

      <ResponsiveModal
        open={edit != null}
        onOpenChange={(o) => !o && setEdit(null)}
        title={edit?.mode === 'edit' ? 'Edit thing' : 'New thing'}
      >
        {edit ? (
          <ThingForm
            initial={edit.mode === 'edit' ? edit.thing : undefined}
            defaultCurrency={defaultCurrency}
            usedCurrencies={usedCurrencies}
            onDone={() => {
              setEdit(null);
              void refresh();
            }}
            onCancel={() => setEdit(null)}
          />
        ) : null}
      </ResponsiveModal>
    </div>
  );
}
