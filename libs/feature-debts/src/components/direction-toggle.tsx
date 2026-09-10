'use client';

import { Field, Label, cn } from '@wib/ui';

type Direction = 'they_owe' | 'i_owe';

/** "I owe them" leads and is the default; owing reads red, being owed reads green. */
const OPTIONS: readonly [Direction, string, string][] = [
  ['i_owe', 'I owe them', 'border-danger bg-danger/15 text-danger'],
  ['they_owe', 'They owe me', 'border-teal bg-teal/15 text-teal'],
];

export function DirectionToggle({
  value,
  onChange,
}: {
  value: Direction;
  onChange: (v: Direction) => void;
}) {
  return (
    <Field>
      <Label>Direction</Label>
      <div className="flex gap-1">
        {OPTIONS.map(([v, label, activeCls]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              value === v
                ? activeCls
                : 'border-line-strong text-muted hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </Field>
  );
}
