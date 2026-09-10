export default function Loading() {
  return (
    <div className="flex max-w-2xl animate-pulse flex-col gap-4" aria-hidden>
      <div className="flex flex-col gap-2">
        <div className="h-7 w-32 rounded bg-surface-2" />
        <div className="h-4 w-48 rounded bg-surface-2" />
      </div>
      <div className="h-12 rounded-xl bg-surface-2" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
