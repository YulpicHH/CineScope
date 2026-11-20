export function CardSkeleton() {
  return (
    <div className="flex flex-col gap-2.5 animate-pulse" aria-hidden="true">
      <div className="aspect-[2/3] w-full rounded-xl bg-slate-200 dark:bg-[#141923]" />
      <div className="h-4 w-4/5 rounded bg-slate-200 dark:bg-[#141923]" />
      <div className="h-3 w-3/5 rounded bg-slate-200 dark:bg-[#141923]" />
    </div>
  );
}

export function RowSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {Array.from({ length: count }).map((_, idx) => (
        <CardSkeleton key={idx} />
      ))}
    </div>
  );
}

export function HeroSkeleton() {
  return (
    <div
      className="relative h-[460px] w-full animate-pulse overflow-hidden rounded-2xl bg-slate-200 dark:bg-[#11151E] md:h-[520px]"
      aria-hidden="true"
    >
      <div className="absolute bottom-8 left-6 right-6 max-w-xl space-y-4 md:bottom-12 md:left-10">
        <div className="h-4 w-48 rounded bg-slate-300 dark:bg-[#1B2230]" />
        <div className="h-10 w-3/4 rounded bg-slate-300 dark:bg-[#1B2230]" />
        <div className="h-16 w-full rounded bg-slate-300 dark:bg-[#1B2230]" />
        <div className="flex gap-3 pt-2">
          <div className="h-11 w-36 rounded-lg bg-slate-300 dark:bg-[#1B2230]" />
          <div className="h-11 w-40 rounded-lg bg-slate-300 dark:bg-[#1B2230]" />
        </div>
      </div>
    </div>
  );
}

export function DetailsSkeleton() {
  return (
    <div className="space-y-8 animate-pulse" aria-hidden="true">
      <div className="h-72 w-full rounded-2xl bg-slate-200 dark:bg-[#141923] md:h-96" />
      <div className="grid gap-8 md:grid-cols-[240px_1fr]">
        <div className="aspect-[2/3] w-48 rounded-xl bg-slate-200 dark:bg-[#141923] md:w-full" />
        <div className="space-y-4">
          <div className="h-9 w-2/3 rounded bg-slate-200 dark:bg-[#141923]" />
          <div className="h-4 w-1/2 rounded bg-slate-200 dark:bg-[#141923]" />
          <div className="h-24 w-full rounded bg-slate-200 dark:bg-[#141923]" />
          <div className="flex gap-3">
            <div className="h-10 w-40 rounded-lg bg-slate-200 dark:bg-[#141923]" />
            <div className="h-10 w-36 rounded-lg bg-slate-200 dark:bg-[#141923]" />
          </div>
        </div>
      </div>
    </div>
  );
}
