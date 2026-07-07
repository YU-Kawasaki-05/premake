"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--paper)] px-6 text-center">
      <p className="font-serif text-xl font-semibold">問題が発生しました</p>
      <p className="max-w-sm text-sm leading-6 text-muted-foreground">
        処理中にエラーが発生しました。時間をおいて、もう一度お試しください。
      </p>
      <Button onClick={reset}>再試行</Button>
    </main>
  );
}
