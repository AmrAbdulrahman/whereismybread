export default function Loading() {
  return (
    <div className="flex max-w-xl animate-pulse flex-col gap-4" aria-hidden>
      <div className="flex flex-col gap-2">
        <div className="h-7 w-52 rounded bg-surface-2" />
        <div className="h-4 w-full rounded bg-surface-2" />
        <div className="h-4 w-2/3 rounded bg-surface-2" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
