"use client";

// @implements v2-05 メニュー一覧の行(編集・公開/非公開バッジ・アーカイブ)

import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { setServiceStatus } from "@/features/services/actions";
import {
  ServiceFormDialog,
  type ServiceRow,
} from "@/features/services/components/service-form-dialog";
import { formatDurationMin, totalDurationMin } from "@/features/services/session-template";

type Option = { id: string; name: string };

export function ServiceListItem({
  slug,
  service,
  categoryName,
  categories,
  templates,
}: {
  slug: string;
  service: ServiceRow & { status: string };
  categoryName?: string;
  categories: Option[];
  templates: Option[];
}) {
  const [pending, startTransition] = useTransition();
  const archived = service.status === "archived";

  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3 ${
        archived ? "opacity-55" : ""
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{service.name}</span>
          {categoryName && (
            <Badge variant="secondary" className="font-normal">
              {categoryName}
            </Badge>
          )}
          {service.is_public && (
            <Badge className="border-transparent bg-[var(--status-confirmed-bg)] font-normal text-[var(--status-confirmed)]">
              公開
            </Badge>
          )}
          {service.allow_nomination && (
            <span className="text-[12.5px] text-muted-foreground">指名可</span>
          )}
        </div>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground tabular-nums">
          {formatDurationMin(totalDurationMin(service.session_template))}
          {service.price_yen != null && (
            <>
              {" · "}
              {service.show_price ? "" : "(非表示)"}¥{service.price_yen.toLocaleString("ja-JP")}
            </>
          )}
          {" · "}
          {service.session_template.length}ステップ
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <ServiceFormDialog
          slug={slug}
          categories={categories}
          templates={templates}
          service={service}
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
              const r = await setServiceStatus(slug, service.id, !archived);
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
