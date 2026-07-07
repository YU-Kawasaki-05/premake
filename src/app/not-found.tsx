import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--paper)] px-6 text-center">
      <p className="font-serif text-xl font-semibold">ページが見つかりません</p>
      <p className="max-w-sm text-sm leading-6 text-muted-foreground">
        お探しのページは存在しないか、アクセス権限がありません。
      </p>
      <Button asChild>
        <Link href="/login">ログインへ</Link>
      </Button>
    </main>
  );
}
