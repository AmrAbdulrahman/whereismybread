'use client';

import { COLOR_PALETTE } from '../lib/colors';
import { cn } from '../lib/cn';

export interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  id?: string;
  className?: string;
}

/** A grid of swatches. Selected swatch gets a ring. */
export function ColorPicker({
  value,
  onChange,
  id,
  className,
}: ColorPickerProps) {
  const current = value.toLowerCase();
  const custom =
    /^#[0-9a-f]{6}$/.test(current) &&
    !COLOR_PALETTE.some((c) => c === current)
      ? current
      : null;
  return (
    <div
      id={id}
      role="radiogroup"
      aria-label="Colour"
      className={cn('flex flex-wrap gap-1.5', className)}
    >
      {COLOR_PALETTE.map((c) => {
        const selected = current === c;
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={c}
            onClick={() => onChange(c)}
            className={cn(
              'h-7 w-7 rounded-full ring-offset-2 ring-offset-surface transition-[box-shadow]',
              selected
                ? 'ring-2 ring-ink'
                : 'ring-0 hover:ring-2 hover:ring-line-strong',
            )}
            style={{ background: c }}
          />
        );
      })}
      {custom ? (
        <button
          type="button"
          role="radio"
          aria-checked
          aria-label={`${custom} (custom)`}
          className="h-7 w-7 rounded-full ring-2 ring-ink ring-offset-2 ring-offset-surface"
          style={{ background: custom }}
        />
      ) : null}
    </div>
  );
}
