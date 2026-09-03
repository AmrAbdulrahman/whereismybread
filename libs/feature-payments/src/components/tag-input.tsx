'use client';

import { useRef, useState } from 'react';
import { cn } from '@wib/ui';

export interface TagOption {
  name: string;
  color: string;
}

export function TagInput({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  options: TagOption[];
}) {
  const [draft, setDraft] = useState('');
  // Set while a suggestion is being pressed, so the input's blur handler knows
  // not to commit the half-typed draft first (it would add "eg", not "egypt").
  const pickingSuggestion = useRef(false);
  const colorFor = (name: string) =>
    options.find((o) => o.name.toLowerCase() === name.toLowerCase())?.color ??
    '#6321d6';

  const add = (raw: string) => {
    pickingSuggestion.current = false;
    const name = raw.trim();
    if (!name) return;
    if (!value.some((v) => v.toLowerCase() === name.toLowerCase())) {
      onChange([...value, name]);
    }
    setDraft('');
  };

  const suggestions = options
    .filter(
      (o) =>
        !value.some((v) => v.toLowerCase() === o.name.toLowerCase()) &&
        (draft ? o.name.toLowerCase().includes(draft.toLowerCase()) : true),
    )
    .slice(0, 6);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-line-strong bg-ground p-2">
        {value.map((name) => (
          <span
            key={name}
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ background: `${colorFor(name)}22`, color: colorFor(name) }}
          >
            {name}
            <button
              type="button"
              aria-label={`Remove ${name}`}
              onClick={() => onChange(value.filter((v) => v !== name))}
              className="opacity-70 hover:opacity-100"
            >
              &times;
            </button>
          </span>
        ))}
        <input
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          data-form-type="other"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add(draft);
            } else if (e.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => {
            if (pickingSuggestion.current) {
              pickingSuggestion.current = false;
              return;
            }
            add(draft);
          }}
          placeholder={value.length ? '' : 'Add tags…'}
          className="min-w-[6rem] flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
        />
      </div>
      {suggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((o) => (
            <button
              key={o.name}
              type="button"
              // Flag before the input's blur fires so it skips the draft commit;
              // `preventDefault` also keeps focus so the tap still lands here.
              onPointerDown={() => {
                pickingSuggestion.current = true;
              }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(o.name)}
              className={cn(
                'rounded-full border border-line px-2 py-0.5 text-[11px] text-muted hover:border-line-strong hover:text-ink',
              )}
            >
              {o.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
