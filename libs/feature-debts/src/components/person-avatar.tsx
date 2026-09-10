import { cn } from '@wib/ui';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function PersonAvatar({
  person,
  size = 36,
  className,
}: {
  person: { name: string; photoUrl: string | null };
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2 text-xs font-semibold text-ink-soft',
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {person.photoUrl ? (
        <img
          src={person.photoUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        initials(person.name) || '?'
      )}
    </span>
  );
}
