'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Field,
  Input,
  Label,
  ResponsiveModal,
  Spinner,
  type TagOption,
} from '@wib/ui';
import { Plus, Store, X } from '@wib/ui/icons';
import { ProviderForm } from './provider-form';
import { providerPickerDataAction, type ProviderRow } from '../lib/actions';

function ProviderIcon({ row }: { row: ProviderRow }) {
  if (row.mark?.logoUrl) {
    return (
      <span className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded border border-line bg-surface">
        <img
          src={row.mark.logoUrl}
          alt=""
          className="h-full w-full object-contain"
        />
      </span>
    );
  }
  return (
    <span
      className="grid h-5 w-5 shrink-0 place-items-center rounded border border-line bg-surface"
      style={{ color: row.color }}
    >
      <Store size={12} />
    </span>
  );
}

/**
 * Pick a reusable provider — or create one on the fly. Replaces the old
 * free-text "Provider website" field on the payment / expense / triage forms.
 * Self-contained: loads the user's providers + tag palette itself. Emits the
 * chosen `providerId` (or `null`) plus the provider's default tag names, so the
 * parent can merge them into its own tag field.
 */
export function ProviderPicker({
  value,
  onChange,
  label = 'Provider',
}: {
  value: string | null;
  onChange: (providerId: string | null, defaultTagNames: string[]) => void;
  label?: string;
}) {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let alive = true;
    providerPickerDataAction()
      .then((d) => {
        if (!alive) return;
        setProviders(d.providers);
        setTags(d.tags);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const selected = useMemo(
    () => providers.find((p) => p.id === value) ?? null,
    [providers, value],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? providers.filter((p) => p.name.toLowerCase().includes(q))
      : providers;
    return [...list].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 8);
  }, [providers, query]);

  const exactExists = providers.some(
    (p) => p.name.toLowerCase() === query.trim().toLowerCase(),
  );

  const pick = (row: ProviderRow) => {
    onChange(row.id, row.mark?.defaultTags ?? []);
    setQuery('');
    setOpen(false);
  };

  // A provider is set but its row hasn't loaded yet (edit mode, mid-fetch).
  if (value && !selected && loading) {
    return (
      <Field>
        <Label>{label}</Label>
        <div className="flex items-center gap-2 rounded-md border border-line-strong bg-ground px-2 py-2 text-sm text-muted">
          <Spinner /> Loading provider…
        </div>
      </Field>
    );
  }

  if (selected) {
    return (
      <Field>
        <Label>{label}</Label>
        <div className="flex items-center gap-2 rounded-md border border-line-strong bg-ground px-2 py-1.5">
          <ProviderIcon row={selected} />
          <span className="flex-1 truncate text-sm text-ink">
            {selected.name}
          </span>
          <button
            type="button"
            onClick={() => onChange(null, [])}
            aria-label="Clear provider"
            className="text-muted hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>
      </Field>
    );
  }

  return (
    <Field>
      <Label htmlFor="provider-picker">{label}</Label>
      <div className="relative">
        <Input
          id="provider-picker"
          autoComplete="off"
          placeholder="Search or add a provider…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 120);
          }}
        />
        {open && (matches.length > 0 || query.trim()) ? (
          <ul
            className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border border-line-strong bg-ground py-1 shadow-lg"
            onMouseDown={() => clearTimeout(blurTimer.current)}
          >
            {matches.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => pick(row)}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-ink hover:bg-surface"
                >
                  <ProviderIcon row={row} />
                  <span className="flex-1 truncate">{row.name}</span>
                  {row.mark?.defaultTags?.length ? (
                    <span className="text-[11px] text-muted">
                      {row.mark.defaultTags.length} tag
                      {row.mark.defaultTags.length === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
            {query.trim() && !exactExists ? (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setCreating(true);
                  }}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm font-medium text-accent hover:bg-surface"
                >
                  <Plus size={14} strokeWidth={3} />
                  Create “{query.trim()}”
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      <ResponsiveModal
        open={creating}
        onOpenChange={setCreating}
        title="New provider"
        description="It’s added to your providers and selected here."
      >
        <ProviderForm
          initial={{ name: query.trim() }}
          tags={tags}
          onCancel={() => setCreating(false)}
          onSaved={(row) => {
            setProviders((prev) => [
              ...prev.filter((p) => p.id !== row.id),
              row,
            ]);
            setCreating(false);
            pick(row);
          }}
        />
      </ResponsiveModal>
    </Field>
  );
}
