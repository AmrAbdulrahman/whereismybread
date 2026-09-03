/** Shown instantly on navigation to /plan while the board is fetched. */
export default function PlanLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-5" aria-hidden>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="h-7 w-52 rounded bg-surface-2" />
          <div className="h-4 w-64 rounded bg-surface-2" />
        </div>
        <div className="h-9 w-32 rounded-md bg-surface-2" />
      </div>

      <div className="h-9 w-40 rounded-md bg-surface-2" />

      <div className="flex flex-col gap-3">
        <div className="h-2 w-full rounded-full bg-surface-2" />
        <div className="mt-1 h-5 w-40 rounded bg-surface-2" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
