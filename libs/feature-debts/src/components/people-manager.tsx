'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, ResponsiveModal, useToast } from '@wib/ui';
import { Pencil, Plus, Trash2 } from '@wib/ui/icons';
import { deletePersonAction, listPeopleAction } from '../lib/actions';
import type { PersonView } from '../lib/types';
import { PersonForm } from './person-form';
import { PersonAvatar } from './person-avatar';

export function PeopleManager({
  initialPeople,
  onClose,
}: {
  initialPeople: PersonView[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [people, setPeople] = useState(initialPeople);
  const [edit, setEdit] = useState<
    { mode: 'new' } | { mode: 'edit'; person: PersonView } | null
  >(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      setPeople(await listPeopleAction());
    } catch {
      /* keep the current list */
    }
    router.refresh();
  };

  const onSaved = async () => {
    setEdit(null);
    await refresh();
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      const result = await deletePersonAction(id);
      if (!result.ok) {
        toast({ title: result.error ?? 'Could not remove them.', tone: 'danger' });
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
      {people.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-sm text-muted">
          No people yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {people.map((p) => (
            <li
              key={p.id}
              className="flex flex-col gap-2 rounded-lg border border-line bg-surface px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <PersonAvatar person={p} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {p.name}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    {p.email} ·{' '}
                    {p.debtCount === 0
                      ? 'no debts'
                      : `${p.debtCount} debt${p.debtCount === 1 ? '' : 's'}`}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Edit ${p.name}`}
                  onClick={() => setEdit({ mode: 'edit', person: p })}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
                >
                  <Pencil size={13} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${p.name}`}
                  disabled={p.debtCount > 0}
                  title={
                    p.debtCount > 0
                      ? 'Delete or settle their debts first'
                      : undefined
                  }
                  onClick={() => setConfirmId(p.id)}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-danger disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted"
                >
                  <Trash2 size={13} strokeWidth={2} />
                </button>
              </div>
              {confirmId === p.id ? (
                <div className="flex items-center justify-end gap-2 border-t border-line/60 pt-2 text-xs">
                  <span className="mr-auto text-muted">
                    Remove {p.name}?
                  </span>
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
                    onClick={() => void remove(p.id)}
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
          Add a person
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Done
        </Button>
      </div>

      <ResponsiveModal
        open={edit != null}
        onOpenChange={(o) => !o && setEdit(null)}
        title={edit?.mode === 'edit' ? 'Edit person' : 'New person'}
      >
        {edit ? (
          <PersonForm
            initial={edit.mode === 'edit' ? edit.person : undefined}
            onDone={() => void onSaved()}
            onCancel={() => setEdit(null)}
          />
        ) : null}
      </ResponsiveModal>
    </div>
  );
}
