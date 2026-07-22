import { Skeleton } from "@/components/ui/skeleton";

// @implements v2-09 予約台帳のローディング(スケルトン。design system §4)
const ROWS = ["a", "b", "c", "d", "e", "f", "g", "h"];

export default function Loading() {
  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="mt-6 space-y-2">
        {ROWS.map((k) => (
          <Skeleton key={k} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
