"use client";

// @implements v2-05 メニュー作成/編集ダイアログ

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/features/auth/components/form-error";
import { createService, type ServiceFormState, updateService } from "@/features/services/actions";
import type { SessionStep } from "@/features/services/session-template";
import { SessionBuilder } from "./session-builder";

export type ServiceRow = {
  id: string;
  name: string;
  category_id: string | null;
  description: string | null;
  price_yen: number | null;
  show_price: boolean;
  is_public: boolean;
  allow_nomination: boolean;
  questionnaire_template_id: string | null;
  session_template: SessionStep[];
};

type Option = { id: string; name: string };

export function ServiceFormDialog({
  slug,
  categories,
  templates,
  service,
  trigger,
}: {
  slug: string;
  categories: Option[];
  templates: Option[];
  service?: ServiceRow;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [instance, setInstance] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setInstance((i) => i + 1);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{service ? "メニューを編集" : "メニューを追加"}</DialogTitle>
          <DialogDescription>
            セッション構成・料金・公開設定・問診の紐付けを設定します。
          </DialogDescription>
        </DialogHeader>
        <ServiceForm
          key={instance}
          slug={slug}
          categories={categories}
          templates={templates}
          service={service}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ServiceForm({
  slug,
  categories,
  templates,
  service,
  onSaved,
}: {
  slug: string;
  categories: Option[];
  templates: Option[];
  service?: ServiceRow;
  onSaved: () => void;
}) {
  const action = service
    ? updateService.bind(null, slug, service.id)
    : createService.bind(null, slug);
  const [state, formAction, pending] = useActionState<ServiceFormState, FormData>(action, {});

  // 保存成功でダイアログを閉じる(親の instance key で次回はまっさら)
  useEffect(() => {
    if (state.saved) onSaved();
  }, [state.saved, onSaved]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="svc-name">メニュー名</Label>
          <Input id="svc-name" name="name" required defaultValue={service?.name} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="svc-category">カテゴリ</Label>
          <Select name="categoryId" defaultValue={service?.category_id ?? "none"}>
            <SelectTrigger id="svc-category" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">未分類</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Select は未選択を value="none" で送る。action 側の optionalUuid() が undefined へ正規化する */}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="svc-questionnaire">問診テンプレ</Label>
          <Select
            name="questionnaireTemplateId"
            defaultValue={service?.questionnaire_template_id ?? "none"}
          >
            <SelectTrigger id="svc-questionnaire" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">なし</SelectItem>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="svc-desc">説明(施術内容・注意事項・リスク副作用)</Label>
          <Textarea
            id="svc-desc"
            name="description"
            rows={3}
            defaultValue={service?.description ?? ""}
            placeholder="公開ページに掲載する場合、自由診療の旨・主なリスク副作用・費用の記載が必要です"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="svc-price">料金(円)</Label>
          <Input
            id="svc-price"
            name="priceYen"
            type="number"
            min={0}
            defaultValue={service?.price_yen ?? ""}
            className="tabular-nums"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>セッション構成</Label>
        <SessionBuilder initial={service?.session_template ?? []} />
      </div>

      <fieldset className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-3">
        <label htmlFor="svc-showPrice" className="flex items-center gap-2 text-sm">
          <Checkbox
            id="svc-showPrice"
            name="showPrice"
            defaultChecked={service?.show_price ?? false}
          />{" "}
          料金を表示
        </label>
        <label htmlFor="svc-isPublic" className="flex items-center gap-2 text-sm">
          <Checkbox
            id="svc-isPublic"
            name="isPublic"
            defaultChecked={service?.is_public ?? false}
          />{" "}
          公開ページに掲載
        </label>
        <label htmlFor="svc-allowNomination" className="flex items-center gap-2 text-sm">
          <Checkbox
            id="svc-allowNomination"
            name="allowNomination"
            defaultChecked={service?.allow_nomination ?? false}
          />{" "}
          指名を許可
        </label>
      </fieldset>

      <FormError message={state.error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "保存中…" : service ? "保存" : "追加"}
      </Button>
    </form>
  );
}
