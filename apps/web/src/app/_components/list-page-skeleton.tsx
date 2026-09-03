/** Instant placeholder for the label-list management pages (tags / accounts / banks). */
export function ListPageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div
      className="flex max-w-lg animate-pulse flex-col gap-6"
      aria-hidden
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-28 rounded bg-surface-2" />
          <div className="h-4 w-72 rounded bg-surface-2" />
          <div className="h-4 w-56 rounded bg-surface-2" />
        </div>
        <div className="h-8 w-24 shrink-0 rounded-md bg-surface-2" />
      </div>
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
