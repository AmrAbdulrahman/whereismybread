'use client';

import { useEffect, useState } from 'react';
import type { Tag, TagWithUsage } from '@wib/db';
import { Button, ResponsiveModal, cn } from '@wib/ui';
import { Pencil, Plus, Tag as TagIcon, Trash2 } from '@wib/ui/icons';
import { deleteTagAction, listTagsAction } from '../lib/actions';
import { TagForm } from './tag-form';

type Sheet =
  | { mode: 'closed' }
  | { mode: 'new' }
  | { mode: 'edit'; tag: TagWithUsage };

export function TagsManager({ tags: initial }: { tags: TagWithUsage[] }) {
  const [tags, setTags] = useState(initial);
  const [sheet, setSheet] = useState<Sheet>({ mode: 'closed' });
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Keep in sync when the server revalidates (e.g. after editing elsewhere).
  useEffect(() => setTags(initial), [initial]);

  const refresh = async () => {
    try {
      setTags(await listTagsAction());
    } catch {
      /* the server action already revalidated; a failed refresh is harmless */
    }
  };

  const onSaved = (tag: Tag) => {
    setTags((prev) => {
      const next = prev.some((t) => t.id === tag.id)
        ? prev.map((t) => (t.id === tag.id ? { ...t, ...tag } : t))
        : [...prev, { ...tag, paymentCount: 0 }];
      return [...next].sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
      );
    });
    setSheet({ mode: 'closed' });
    void refresh();
  };

  const remove = async (id: string) => {
    setBusyId(id);
    setTags((prev) => prev.filter((t) => t.id !== id));
    setConfirmingDelete(null);
    await deleteTagAction(id);
    setBusyId(null);
  };

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Tags</h1>
          <p className="text-ink-soft">
            Labels you attach to payments. Renaming or recolouring one updates it
            everywhere it&rsquo;s used.
          </p>
        </div>
        <Button
          size="sm"
          className="shrink-0"
          onClick={() => setSheet({ mode: 'new' })}
        >
          <Plus size={16} strokeWidth={2.75} />
          New tag
        </Button>
      </header>

      {tags.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong py-12 text-center">
          <TagIcon size={22} className="text-muted" />
          <p className="text-sm text-ink-soft">
            No tags yet. Add one here, or create tags on the fly from a payment.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {tags.map((tag) => (
            <li
              key={tag.id}
              className={cn(
                'flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 transition-opacity',
                busyId === tag.id && 'opacity-50',
              )}
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ background: tag.color }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {tag.name}
                </p>
                <p className="text-xs text-muted">
                  {tag.paymentCount === 0
                    ? 'Not used yet'
                    : `Used in ${tag.paymentCount} payment${
                        tag.paymentCount === 1 ? '' : 's'
                      }`}
                </p>
              </div>

              {confirmingDelete === tag.id ? (
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
                    onClick={() => remove(tag.id)}
                  >
                    Delete
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setSheet({ mode: 'edit', tag })}
                    aria-label={`Edit ${tag.name}`}
                    className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
                  >
                    <Pencil size={15} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(tag.id)}
                    aria-label={`Delete ${tag.name}`}
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
        title={sheet.mode === 'edit' ? 'Edit tag' : 'New tag'}
      >
        {sheet.mode !== 'closed' ? (
          <TagForm
            initial={sheet.mode === 'edit' ? sheet.tag : undefined}
            onSaved={onSaved}
            onCancel={() => setSheet({ mode: 'closed' })}
          />
        ) : null}
      </ResponsiveModal>
    </div>
  );
}
