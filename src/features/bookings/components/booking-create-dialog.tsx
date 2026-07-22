"use client";

// @implements v2-10 院内予約作成(患者選択/新規 → メニュー → 担当・部屋・日時)

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormError } from "@/features/auth/components/form-error";
import { type BookingFormState, createBooking } from "@/features/bookings/actions";
import type { SessionStep } from "@/features/services/session-template";
import { formatDurationMin, totalDurationMin } from "@/features/services/session-template";
import { PatientPicker } from "./patient-picker";

type Option = { id: string; name: string };
type MemberOption = Option & { bookable: boolean };
type ServiceOption = { id: string; name: string; session_template: SessionStep[] };

export function BookingCreateDialog({
  slug,
  rooms,
  members,
  services,
  defaultDate,
  currentMemberId,
}: {
  slug: string;
  rooms: Option[];
  members: MemberOption[];
  services: ServiceOption[];
  defaultDate: string;
  currentMemberId: string;
}) {
  const [open, setOpen] = useState(false);
  const [instance, setInstance] = useState(0);
  const disabled = rooms.length === 0 || services.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setInstance((i) => i + 1);
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={disabled}>新規予約</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>新規予約</DialogTitle>
          <DialogDescription>
            患者・メニュー・担当・部屋・開始時刻を指定します。セッションは自動で連続配置されます。
          </DialogDescription>
        </DialogHeader>
        <BookingForm
          key={instance}
          slug={slug}
          rooms={rooms}
          members={members}
          services={services}
          defaultDate={defaultDate}
          currentMemberId={currentMemberId}
          onCreated={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function BookingForm({
  slug,
  rooms,
  members,
  services,
  defaultDate,
  currentMemberId,
  onCreated,
}: {
  slug: string;
  rooms: Option[];
  members: MemberOption[];
  services: ServiceOption[];
  defaultDate: string;
  currentMemberId: string;
  onCreated: () => void;
}) {
  const [state, formAction, pending] = useActionState<BookingFormState, FormData>(
    createBooking.bind(null, slug),
    {},
  );
  const [serviceId, setServiceId] = useState<string>(services[0]?.id ?? "");

  useEffect(() => {
    if (state.bookingId) {
      toast.success("予約を作成しました");
      onCreated();
    }
  }, [state.bookingId, onCreated]);

  const selectedService = services.find((s) => s.id === serviceId);
  // No.36: 院内予約の担当候補は active な全メンバー(is_bookable は公開指名対象の別概念)。
  // F2 電話予約で非公開スタッフ(is_bookable=false)も担当に指定できるようにする。
  const memberChoices = members;

  return (
    <form action={formAction} className="space-y-4">
      <PatientPicker slug={slug} />

      <div className="space-y-1.5">
        <Label htmlFor="bk-service">メニュー</Label>
        <Select name="serviceId" value={serviceId} onValueChange={setServiceId}>
          <SelectTrigger id="bk-service" className="w-full">
            <SelectValue placeholder="選択" />
          </SelectTrigger>
          <SelectContent>
            {services.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedService && (
          <p className="text-[11px] text-muted-foreground">
            所要 {formatDurationMin(totalDurationMin(selectedService.session_template))} ·{" "}
            {selectedService.session_template.length}セッション
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="bk-member">担当</Label>
          <Select name="memberId" defaultValue={currentMemberId}>
            <SelectTrigger id="bk-member" className="w-full">
              <SelectValue placeholder="選択" />
            </SelectTrigger>
            <SelectContent>
              {memberChoices.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bk-room">部屋</Label>
          <Select name="roomId">
            <SelectTrigger id="bk-room" className="w-full">
              <SelectValue placeholder="選択" />
            </SelectTrigger>
            <SelectContent>
              {rooms.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bk-date">日付</Label>
          <Input id="bk-date" name="startDate" type="date" required defaultValue={defaultDate} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bk-time">開始時刻</Label>
          <Input id="bk-time" name="startTime" type="time" required defaultValue="10:00" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bk-notes">メモ(任意)</Label>
        <Input id="bk-notes" name="notes" placeholder="院内メモ" />
      </div>

      <FormError message={state.error} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "作成中…" : "予約を作成"}
      </Button>
    </form>
  );
}
