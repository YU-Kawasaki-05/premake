"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** メール未接続の間、招待 URL をコピーして手渡しするためのパネル */
export function InviteUrlPanel({
  inviteUrl,
  description,
  onClose,
}: {
  inviteUrl: string;
  description: string;
  onClose?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      <div className="flex gap-2">
        <Input readOnly value={inviteUrl} className="font-mono text-xs" />
        <Button type="button" variant="outline" size="icon" onClick={copy} aria-label="コピー">
          {copied ? (
            <Check className="size-4 text-[var(--status-confirmed)]" />
          ) : (
            <Copy className="size-4" />
          )}
        </Button>
      </div>
      {onClose && (
        <Button type="button" variant="outline" className="w-full" onClick={onClose}>
          閉じる
        </Button>
      )}
    </div>
  );
}
