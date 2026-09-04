export default function Loading() {
  return (
    <div className="flex max-w-xl animate-pulse flex-col gap-4" aria-hidden>
      <div className="flex flex-col gap-2">
        <div className="h-7 w-40 rounded bg-surface-2" />
        <div className="h-4 w-24 rounded bg-surface-2" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
