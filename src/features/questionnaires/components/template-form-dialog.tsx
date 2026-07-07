"use client";

// @implements v2-17 問診テンプレート作成/編集ダイアログ

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { FormError } from "@/features/auth/components/form-error";
import {
  createTemplate,
  type TemplateFormState,
  updateTemplate,
} from "@/features/questionnaires/actions";
import type { Question } from "@/features/questionnaires/question-schema";
import { QuestionBuilder } from "./question-builder";

export type TemplateRow = {
  id: string;
  name: string;
  questions: Question[];
};

export function TemplateFormDialog({
  slug,
  template,
  trigger,
}: {
  slug: string;
  template?: TemplateRow;
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
          <DialogTitle>
            {template ? "問診テンプレートを編集" : "問診テンプレートを追加"}
          </DialogTitle>
          <DialogDescription>質問項目を追加し、メニューに紐付けて利用します。</DialogDescription>
        </DialogHeader>
        <TemplateForm
          key={instance}
          slug={slug}
          template={template}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function TemplateForm({
  slug,
  template,
  onSaved,
}: {
  slug: string;
  template?: TemplateRow;
  onSaved: () => void;
}) {
  const action = template
    ? updateTemplate.bind(null, slug, template.id)
    : createTemplate.bind(null, slug);
  const [state, formAction, pending] = useActionState<TemplateFormState, FormData>(action, {});

  // 保存成功でダイアログを閉じる(親の instance key で次回はまっさら)
  useEffect(() => {
    if (state.saved) onSaved();
  }, [state.saved, onSaved]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="qt-name">テンプレート名</Label>
        <Input id="qt-name" name="name" required defaultValue={template?.name} />
      </div>

      <div className="space-y-1.5">
        <Label>質問項目</Label>
        <QuestionBuilder initial={template?.questions ?? []} />
      </div>

      <FormError message={state.error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "保存中…" : template ? "保存" : "追加"}
      </Button>
    </form>
  );
}
