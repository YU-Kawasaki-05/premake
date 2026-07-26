"use client";

// @implements v2-16 名寄せ(候補提示 → 受付が確認して紐付け。自動マージしない)

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormError } from "@/features/auth/components/form-error";
import {
  type BookingActionState,
  findPatientLinkCandidates,
  type GuestContact,
  linkGuestBookingToPatient,
  type PatientLinkCandidate,
} from "@/features/bookings/actions";

export function BookingLinkPatientDialog({
  slug,
  bookingId,
  open,
  onOpenChange,
  onLinked,
}: {
  slug: string;
  bookingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: () => void;
}) {
  const [state, formAction, pending] = useActionState<BookingActionState, FormData>(
    linkGuestBookingToPatient.bind(null, slug),
    {},
  );
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [guest, setGuest] = useState<GuestContact | null>(null);
  const [candidates, setCandidates] = useState<PatientLinkCandidate[]>([]);

  // 開いたタイミングで候補を取得(閲覧は Server Action 側で監査記録される)
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setLoadError(undefined);
    findPatientLinkCandidates(slug, bookingId).then((res) => {
      if (!alive) return;
      setLoadError(res.error);
      setGuest(res.guest ?? null);
      setCandidates(res.candidates ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [open, slug, bookingId]);

  useEffect(() => {
    if (state.ok) {
      toast.success("患者に紐付けました");
      onLinked();
    }
  }, [state.ok, onLinked]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>患者に紐付け</DialogTitle>
          <DialogDescription>
            ゲスト予約の連絡先から既存患者の候補を表示します。内容を確認して紐付けてください(自動では統合しません)。
          </DialogDescription>
        </DialogHeader>

        {guest && (
          <div className="rounded-md border border-border bg-muted/50 p-3 text-[12.5px]">
            <p className="mb-1.5 font-medium">予約時の申告内容</p>
            <dl className="space-y-0.5 text-muted-foreground">
              <GuestRow label="氏名" value={guest.name} />
              <GuestRow label="かな" value={guest.kana} />
              <GuestRow label="電話" value={guest.phone} />
              <GuestRow label="メール" value={guest.email} />
            </dl>
          </div>
        )}

        {loading && <p className="text-[12.5px] text-muted-foreground">候補を検索中…</p>}
        <FormError message={loadError} />

        <form action={formAction} className="space-y-3">
          <input type="hidden" name="bookingId" value={bookingId} />

          {!loading && !loadError && (
            <>
              <p className="text-[12.5px] font-medium text-muted-foreground">
                {candidates.length > 0
                  ? `既存患者の候補(${candidates.length}件)`
                  : "一致する既存患者の候補はありません"}
              </p>
              {candidates.map((c) => (
                <div key={c.id} className="rounded-md border border-border bg-card p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">{c.name}</span>
                    {c.kana && <span className="text-[12px] text-muted-foreground">{c.kana}</span>}
                    {c.reasons.map((r) => (
                      <Badge key={r} variant="secondary">
                        {r}
                      </Badge>
                    ))}
                  </div>
                  <dl className="mt-1 space-y-0.5 text-[12px] text-muted-foreground">
                    <GuestRow label="電話" value={c.phone} />
                    <GuestRow label="メール" value={c.email} />
                  </dl>
                  <Button
                    type="submit"
                    name="patientId"
                    value={c.id}
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    disabled={pending}
                    aria-label={`${c.name} に紐付け`}
                  >
                    この患者に紐付け
                  </Button>
                </div>
              ))}
            </>
          )}

          <FormError message={state.error} />

          {guest && !loadError && (
            <div className="border-t border-border pt-3">
              <p className="text-[12.5px] text-muted-foreground">
                候補に該当が無い場合は、申告内容(氏名・かな・電話・メール)で患者を新規登録して紐付けます。
              </p>
              <Button
                type="submit"
                name="mode"
                value="new"
                size="sm"
                className="mt-2"
                disabled={pending}
              >
                新規患者として登録
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GuestRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <dt className="w-10 shrink-0">{label}</dt>
      <dd className="min-w-0 flex-1 break-all">{value}</dd>
    </div>
  );
}
