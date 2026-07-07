"use client";

// @implements v2-17 問診テンプレート一覧の行(編集・アーカイブ)

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setTemplateStatus } from "@/features/questionnaires/actions";
import {
  TemplateFormDialog,
  type TemplateRow,
} from "@/features/questionnaires/components/template-form-dialog";

export function TemplateListItem({
  slug,
  template,
}: {
  slug: string;
  template: TemplateRow & { status: string };
}) {
  const [pending, startTransition] = useTransition();
  const archived = template.status === "archived";

  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3 ${
        archived ? "opacity-55" : ""
      }`}
    >
      <div className="min-w-0">
        <span className="font-medium">{template.name}</span>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground tabular-nums">
          質問 {template.questions.length}件
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <TemplateFormDialog
          slug={slug}
          template={template}
          trigger={
            <Button variant="ghost" size="sm">
              編集
            </Button>
          }
        />
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await setTemplateStatus(slug, template.id, !archived);
              if (r?.error) toast.error(r.error);
              else toast.success(archived ? "有効化しました" : "アーカイブしました");
            })
          }
        >
          {archived ? "戻す" : "アーカイブ"}
        </Button>
      </div>
    </li>
  );
}
