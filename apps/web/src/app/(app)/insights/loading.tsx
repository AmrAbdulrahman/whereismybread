/** Shown instantly on navigation to /insights while the data is fetched. */
export default function InsightsLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-8" aria-hidden>
      <div className="flex flex-col gap-2">
        <div className="h-7 w-40 rounded bg-surface-2" />
        <div className="h-4 w-80 max-w-full rounded bg-surface-2" />
      </div>

      {/* Insight cards */}
      <div className="flex flex-col gap-3">
        <div className="h-5 w-28 rounded bg-surface-2" />
        <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-surface-2" />
          ))}
        </div>
      </div>

      {/* Dashboard: stat strip + charts */}
      <div className="flex flex-col gap-4">
        <div className="h-5 w-36 rounded bg-surface-2" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-surface-2" />
          ))}
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-64 rounded-xl bg-surface-2" />
          ))}
        </div>
      </div>
    </div>
  );
}
