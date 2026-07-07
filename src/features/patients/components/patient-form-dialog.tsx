"use client";

// @implements v2-15 患者の作成/編集ダイアログ

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/features/auth/components/form-error";
import { createPatient, type PatientFormState, updatePatient } from "@/features/patients/actions";

export type PatientRow = {
  id: string;
  name: string;
  kana: string | null;
  birthdate: string | null;
  phone: string | null;
  email: string | null;
  external_chart_no: string | null;
  notes: string | null;
};

export function PatientFormDialog({
  slug,
  patient,
  trigger,
}: {
  slug: string;
  patient?: PatientRow;
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{patient ? "患者情報を編集" : "患者を追加"}</DialogTitle>
        </DialogHeader>
        <PatientForm key={instance} slug={slug} patient={patient} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function PatientForm({
  slug,
  patient,
  onSaved,
}: {
  slug: string;
  patient?: PatientRow;
  onSaved: () => void;
}) {
  const action = patient
    ? updatePatient.bind(null, slug, patient.id)
    : createPatient.bind(null, slug);
  const [state, formAction, pending] = useActionState<PatientFormState, FormData>(action, {});

  useEffect(() => {
    if (state.saved) {
      toast.success("保存しました");
      onSaved();
    }
  }, [state.saved, onSaved]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pt-name">氏名</Label>
          <Input id="pt-name" name="name" required defaultValue={patient?.name} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pt-kana">かな</Label>
          <Input id="pt-kana" name="kana" defaultValue={patient?.kana ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pt-birth">生年月日</Label>
          <Input
            id="pt-birth"
            name="birthdate"
            type="date"
            defaultValue={patient?.birthdate ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pt-phone">電話</Label>
          <Input id="pt-phone" name="phone" type="tel" defaultValue={patient?.phone ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pt-email">メール</Label>
          <Input id="pt-email" name="email" type="email" defaultValue={patient?.email ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pt-chart">外部カルテ番号</Label>
          <Input
            id="pt-chart"
            name="externalChartNo"
            defaultValue={patient?.external_chart_no ?? ""}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pt-notes">院内メモ</Label>
        <Textarea id="pt-notes" name="notes" rows={3} defaultValue={patient?.notes ?? ""} />
      </div>
      <FormError message={state.error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "保存中…" : patient ? "保存" : "追加"}
      </Button>
    </form>
  );
}
