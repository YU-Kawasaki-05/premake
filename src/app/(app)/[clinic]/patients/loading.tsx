import { Skeleton } from "@/components/ui/skeleton";

// @implements v2-15 患者一覧のローディング(スケルトン。design system §4)
const ROWS = ["a", "b", "c", "d", "e", "f"];

export default function Loading() {
  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-20" />
      </div>
      <div className="mt-4 space-y-2">
        {ROWS.map((k) => (
          <Skeleton key={k} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
