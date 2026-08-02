const shimmerClass =
  "animate-shimmer rounded-[3px]";

interface PageLoadingSkeletonProps {
  readonly rowCount?: number;
}

export function PageLoadingSkeleton({ rowCount = 6 }: PageLoadingSkeletonProps) {
  const rows = Array.from({ length: rowCount }, (_, index) => index);

  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="space-y-6"
      data-test-id="page-loading-skeleton"
    >
      <header className="border-b border-hairline pb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <div className={`${shimmerClass} h-3 w-28`} />
            <div className={`${shimmerClass} h-7 w-full max-w-[360px]`} />
            <div className={`${shimmerClass} h-4 w-full max-w-[520px]`} />
          </div>
          <div className="flex items-center gap-2">
            <div className={`${shimmerClass} h-9 w-24`} />
            <div className={`${shimmerClass} h-9 w-20`} />
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className={`${shimmerClass} h-10 min-w-[220px] max-w-md flex-1`} />
        <div className={`${shimmerClass} h-8 w-28`} />
        <div className={`${shimmerClass} h-8 w-24`} />
      </div>

      <div className="paper-card overflow-hidden rounded-[3px] p-0">
        <div className="border-b border-ink/15 bg-paper-deep/60 px-3 py-3">
          <div className="grid grid-cols-[1.15fr_0.8fr_0.8fr_0.7fr_0.6fr] gap-4">
            <div className={`${shimmerClass} h-3`} />
            <div className={`${shimmerClass} h-3`} />
            <div className={`${shimmerClass} h-3`} />
            <div className={`${shimmerClass} h-3`} />
            <div className={`${shimmerClass} h-3`} />
          </div>
        </div>
        <div>
          {rows.map((row) => (
            <div
              key={row}
              className="grid grid-cols-[1.15fr_0.8fr_0.8fr_0.7fr_0.6fr] gap-4 border-b border-ink/8 px-3 py-3 last:border-b-0"
              data-skeleton-row
            >
              <div className={`${shimmerClass} h-4`} />
              <div className={`${shimmerClass} h-4`} />
              <div className={`${shimmerClass} h-4`} />
              <div className={`${shimmerClass} h-4`} />
              <div className={`${shimmerClass} h-4`} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
