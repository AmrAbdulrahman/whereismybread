'use client';

import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { cn } from '../lib/cn';
import { COLOR_PALETTE } from '../lib/colors';
import { Pencil, Plus, Search, Trash2, X } from '../icons';
import { Button } from './button';
import { ColorPicker } from './color-picker';
import { Field, Input, Label } from './input';
import { ResponsiveModal } from './responsive-modal';

export interface LabelItem<M = undefined> {
  id: string;
  name: string;
  color: string;
  /** How many things reference this label (e.g. payments). */
  usageCount: number;
  /** Optional extra payload (e.g. a bank's icon / logo). */
  mark?: M;
}

export interface LabelSaveResult<M = undefined> {
  ok: boolean;
  item?: LabelItem<M>;
  fieldErrors?: Record<string, string[]>;
  error?: string;
}

export interface LabelManagerProps<M = undefined> {
  title: string;
  /** Lowercase singular, e.g. "tag" / "account" / "bank". */
  noun: string;
  description: string;
  namePlaceholder: string;
  /** What `usageCount` counts, lowercase singular, e.g. "payment". */
  usageNoun: string;
  /**
   * `unlink` → deleting leaves the referencing rows intact (FK set null).
   * `cascade` → deleting removes the label from everything it's on.
   */
  deleteImpact: 'unlink' | 'cascade';
  items: LabelItem<M>[];
  onSave: (
    id: string | null,
    values: { name: string; color: string; mark?: M },
  ) => Promise<LabelSaveResult<M>>;
  onDelete: (id: string) => Promise<{ ok: boolean; error?: string }>;
  onRefresh: () => Promise<LabelItem<M>[]>;
  /** Render a per-row mark instead of the colour dot (e.g. an icon / logo). */
  renderMark?: (item: LabelItem<M>) => ReactNode;
  /** An extra form section that edits `mark`; brings its own field/label. */
  renderMarkEditor?: (
    mark: M,
    setMark: Dispatch<SetStateAction<M>>,
    setColor: Dispatch<SetStateAction<string>>,
  ) => ReactNode;
  /** The `mark` a new item starts with — required when `renderMarkEditor` is set. */
  newMark?: M;
}

const plural = (n: number, word: string) => `${word}${n === 1 ? '' : 's'}`;

/**
 * List / add / edit / delete a set of colour-coded labels (tags, accounts,
 * banks) with a stats strip, a name filter, and a usage-aware delete confirm.
 * Optionally each label carries a `mark` (bank icon / logo).
 */
export function LabelManager<M = undefined>({
  title,
  noun,
  description,
  namePlaceholder,
  usageNoun,
  deleteImpact,
  items: initial,
  onSave,
  onDelete,
  onRefresh,
  renderMark,
  renderMarkEditor,
  newMark,
}: LabelManagerProps<M>) {
  const [items, setItems] = useState(initial);
  const [query, setQuery] = useState('');
  const [unusedOnly, setUnusedOnly] = useState(false);
  const [sheet, setSheet] = useState<
    | { mode: 'closed' }
    | { mode: 'new' }
    | { mode: 'edit'; item: LabelItem<M> }
  >({ mode: 'closed' });
  const [confirmDelete, setConfirmDelete] = useState<LabelItem<M> | null>(null);
  const [inlineConfirm, setInlineConfirm] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string>();

  useEffect(() => setItems(initial), [initial]);

  const refresh = async () => {
    try {
      setItems(await onRefresh());
    } catch {
      /* the server already revalidated — a failed refresh is harmless */
    }
  };

  const stats = useMemo(() => {
    const inUse = items.filter((i) => i.usageCount > 0).length;
    const refs = items.reduce((s, i) => s + i.usageCount, 0);
    return { total: items.length, inUse, unused: items.length - inUse, refs };
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => (unusedOnly ? i.usageCount === 0 : true))
      .filter((i) => (q ? i.name.toLowerCase().includes(q) : true));
  }, [items, query, unusedOnly]);

  const onSaved = (item: LabelItem<M>) => {
    setItems((prev) => {
      const next = prev.some((t) => t.id === item.id)
        ? prev.map((t) =>
            t.id === item.id
              ? { ...t, name: item.name, color: item.color, mark: item.mark }
              : t,
          )
        : [...prev, item];
      return [...next].sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
      );
    });
    setSheet({ mode: 'closed' });
    void refresh();
  };

  const runDelete = async (item: LabelItem<M>) => {
    setBusyId(item.id);
    setDeleteError(undefined);
    setConfirmDelete(null);
    setInlineConfirm(null);
    const res = await onDelete(item.id);
    if (res.ok) {
      setItems((prev) => prev.filter((t) => t.id !== item.id));
    } else {
      setDeleteError(res.error ?? 'Could not delete that.');
    }
    setBusyId(null);
    void refresh();
  };

  const askDelete = (item: LabelItem<M>) => {
    if (item.usageCount > 0) setConfirmDelete(item);
    else setInlineConfirm(item.id);
  };

  const filterActive = query.trim() !== '' || unusedOnly;

  return (
    <div className="flex max-w-lg flex-col gap-5">
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

      {items.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            <Stat label={plural(stats.total, noun)} value={stats.total} />
            <Stat label="in use" value={stats.inUse} />
            <Stat label="unused" value={stats.unused} muted />
            <Stat
              label={`${usageNoun} ${plural(stats.refs, 'link')}`}
              value={stats.refs}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Filter ${plural(2, noun)}…`}
                className="pl-8"
              />
              {query ? (
                <button
                  type="button"
                  aria-label="Clear filter"
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
            {stats.unused > 0 ? (
              <button
                type="button"
                onClick={() => setUnusedOnly((v) => !v)}
                aria-pressed={unusedOnly}
                className={cn(
                  'shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  unusedOnly
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-line-strong text-muted hover:text-ink',
                )}
              >
                Unused only
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {deleteError ? (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {deleteError}
        </p>
      ) : null}

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong py-12 text-center">
          <p className="text-sm text-ink-soft">
            No {plural(2, noun)} yet. Add one here, or create them on the fly
            from a payment.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong py-8 text-center text-sm text-muted">
          No {plural(2, noun)} match{filterActive ? ' your filter' : ''}.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {filtered.map((item) => (
            <li
              key={item.id}
              className={cn(
                'flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 transition-opacity',
                busyId === item.id && 'opacity-50',
              )}
            >
              {renderMark ? (
                <span className="shrink-0">{renderMark(item)}</span>
              ) : (
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: item.color }}
                  aria-hidden
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {item.name}
                </p>
                <p className="text-xs text-muted">
                  {item.usageCount === 0
                    ? 'Not used yet'
                    : `Used in ${item.usageCount} ${plural(
                        item.usageCount,
                        usageNoun,
                      )}`}
                </p>
              </div>

              {inlineConfirm === item.id ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted">Delete?</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setInlineConfirm(null)}
                  >
                    Keep
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => runDelete(item)}
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
                    onClick={() => askDelete(item)}
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
          <LabelFormBody<M>
            key={sheet.mode === 'edit' ? sheet.item.id : 'new'}
            noun={noun}
            placeholder={namePlaceholder}
            initial={sheet.mode === 'edit' ? sheet.item : undefined}
            newMark={newMark}
            onSave={onSave}
            onSaved={onSaved}
            onCancel={() => setSheet({ mode: 'closed' })}
            renderMarkEditor={renderMarkEditor}
          />
        ) : null}
      </ResponsiveModal>

      <ResponsiveModal
        open={confirmDelete != null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={`Delete ${noun}?`}
      >
        {confirmDelete ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-soft">
              <span
                className="mr-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{
                  background: `${confirmDelete.color}22`,
                  color: confirmDelete.color,
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: confirmDelete.color }}
                />
                {confirmDelete.name}
              </span>
              is used by <strong>{confirmDelete.usageCount}</strong>{' '}
              {plural(confirmDelete.usageCount, usageNoun)}.
            </p>
            <p className="text-sm text-muted">
              {deleteImpact === 'unlink'
                ? `Those ${plural(
                    confirmDelete.usageCount,
                    usageNoun,
                  )} stay — they just won't have ${
                    /^[aeiou]/i.test(noun) ? 'an' : 'a'
                  } ${noun} any more.`
                : `It will be removed from all ${confirmDelete.usageCount} of them. The ${plural(
                    confirmDelete.usageCount,
                    usageNoun,
                  )} themselves are kept.`}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => runDelete(confirmDelete)}
              >
                Delete anyway
              </Button>
            </div>
          </div>
        ) : null}
      </ResponsiveModal>
    </div>
  );
}

function Stat({
  label,
  value,
  muted,
}: {
  label: string;
  value: number;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-1 rounded-md border border-line px-2 py-1 text-xs',
        muted ? 'text-muted' : 'text-ink-soft',
      )}
    >
      <span className="font-display text-sm font-semibold tabular-nums text-ink">
        {value}
      </span>
      <span>{label}</span>
    </span>
  );
}

function LabelFormBody<M = undefined>({
  noun,
  placeholder,
  initial,
  newMark,
  onSave,
  onSaved,
  onCancel,
  renderMarkEditor,
}: {
  noun: string;
  placeholder: string;
  initial?: LabelItem<M>;
  newMark?: M;
  onSave: LabelManagerProps<M>['onSave'];
  onSaved: (item: LabelItem<M>) => void;
  onCancel: () => void;
  renderMarkEditor?: LabelManagerProps<M>['renderMarkEditor'];
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.color ?? COLOR_PALETTE[0]);
  const [mark, setMark] = useState<M>(
    (initial?.mark ?? newMark) as M,
  );
  const [nameError, setNameError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Give it a name');
      return;
    }
    setBusy(true);
    setNameError(undefined);
    setFormError(undefined);
    const res = await onSave(initial?.id ?? null, {
      name: trimmed,
      color,
      ...(renderMarkEditor ? { mark } : {}),
    });
    setBusy(false);
    if (res.ok && res.item) {
      onSaved(res.item);
      return;
    }
    setNameError(res.fieldErrors?.['name']?.[0]);
    setFormError(res.error);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {formError ? (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {formError}
        </p>
      ) : null}

      <Field>
        <Label htmlFor="label-name">Name</Label>
        <Input
          id="label-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
        />
        {nameError ? (
          <p className="text-xs text-danger">{nameError}</p>
        ) : null}
      </Field>

      <Field>
        <Label>Colour</Label>
        <span
          className="inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ background: `${color}22`, color }}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: color }}
          />
          {name.trim() || 'Preview'}
        </span>
        <ColorPicker value={color} onChange={setColor} />
      </Field>

      {renderMarkEditor ? renderMarkEditor(mark, setMark, setColor) : null}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : initial ? 'Save changes' : `Add ${noun}`}
        </Button>
      </div>
    </form>
  );
}
