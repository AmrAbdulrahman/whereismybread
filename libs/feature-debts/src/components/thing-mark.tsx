import { cn } from '@wib/ui';

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

/** The logo for a user-defined "thing" — its uploaded image, or an initials tile. */
export function ThingMark({
  thing,
  size = 16,
  className,
}: {
  thing: { name: string; logoUrl: string | null };
  size?: number;
  className?: string;
}) {
  if (thing.logoUrl) {
    return (
      <img
        src={thing.logoUrl}
        alt=""
        width={size}
        height={size}
        className={cn('shrink-0 rounded object-cover', className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded bg-surface-2 font-semibold text-ink-soft',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
      aria-hidden
    >
      {initials(thing.name)}
    </span>
  );
}
