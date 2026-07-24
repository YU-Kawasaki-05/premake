"use client";

// @implements v2-20 ゲスト予約フロー(メニュー→日時→連絡先→完了)

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/features/auth/components/form-error";
import { jstHhmm } from "@/features/bookings/booking-status";
import { createGuestBooking, type GuestBookingState } from "@/features/public-booking/actions";
import type { Slot } from "@/features/public-booking/availability";
import { formatDateShort } from "@/lib/datetime";

type Option = { id: string; name: string };

export function ReserveFlow({
  slug,
  clinicName,
  service,
  services,
  date,
  todayJst,
  slots,
  nominees,
  nominated,
}: {
  slug: string;
  clinicName: string;
  service: Option;
  services: Option[];
  date: string;
  todayJst: string;
  slots: Slot[];
  nominees: Option[];
  nominated: string | null;
}) {
  const [selected, setSelected] = useState<Slot | null>(null);
  const [state, formAction, pending] = useActionState<GuestBookingState, FormData>(
    createGuestBooking,
    {},
  );

  if (state.done) {
    return (
      <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-6 text-center">
        <h1 className="font-serif text-xl font-semibold">
          {state.done.pending ? "予約を受け付けました" : "ご予約が確定しました"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
          予約番号 <span className="font-semibold tabular-nums">{state.done.bookingNo}</span>
          <br />
          {state.done.manageToken
            ? state.done.pending
              ? "クリニックの確認後に確定します。確認・キャンセルは下記リンクから行えます。"
              : "確認・変更・キャンセルは下記リンクから行えます。"
            : state.done.pending
              ? "クリニックの確認後に確定します。確認・キャンセル用のリンクはメールでお送りします。"
              : "確認・変更・キャンセル用のリンクはメールでお送りします。"}
        </p>
        {state.done.manageToken && (
          <>
            <Button asChild className="mt-4">
              <Link href={`/c/${slug}/manage/${state.done.manageToken}`}>予約内容を確認する</Link>
            </Button>
            <p className="mt-3 text-[12px] text-muted-foreground">
              ※このリンクは大切に保管してください
            </p>
          </>
        )}
      </div>
    );
  }

  const buildDateHref = (params: Record<string, string>) => {
    const q = new URLSearchParams({ service: service.id, date, ...params });
    return `/c/${slug}/reserve?${q.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/c/${slug}`}
          className="text-[12.5px] text-muted-foreground underline-offset-4 hover:underline"
        >
          ← {clinicName}
        </Link>
        <h1 className="mt-1 font-serif text-xl font-semibold">{service.name} のご予約</h1>
      </div>

      {/* メニュー切替 */}
      {services.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {services.map((s) => (
            <Link
              key={s.id}
              href={`/c/${slug}/reserve?service=${s.id}&date=${date}`}
              className={`rounded-full border px-3 py-1 text-[13px] ${
                s.id === service.id
                  ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-strong)]"
                  : "border-[var(--line)] text-muted-foreground"
              }`}
            >
              {s.name}
            </Link>
          ))}
        </div>
      )}

      {/* 指名 */}
      {nominees.length > 0 && (
        <div>
          <p className="text-[12.5px] font-medium text-muted-foreground">担当の指名(任意)</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Link
              href={buildDateHref({})}
              className={`rounded-full border px-3 py-1 text-[13px] ${!nominated ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-strong)]" : "border-[var(--line)] text-muted-foreground"}`}
            >
              指定なし
            </Link>
            {nominees.map((n) => (
              <Link
                key={n.id}
                href={buildDateHref({ member: n.id })}
                className={`rounded-full border px-3 py-1 text-[13px] ${nominated === n.id ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-strong)]" : "border-[var(--line)] text-muted-foreground"}`}
              >
                {n.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 日付ナビ */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" asChild>
          <Link
            href={buildDateHref({
              date: shiftDate(date, -1),
              ...(nominated ? { member: nominated } : {}),
            })}
          >
            前日
          </Link>
        </Button>
        <span className="text-sm font-medium tabular-nums">
          {formatDateShort(date)}
          {date === todayJst && "(本日)"}
        </span>
        <Button variant="outline" size="sm" asChild>
          <Link
            href={buildDateHref({
              date: shiftDate(date, 1),
              ...(nominated ? { member: nominated } : {}),
            })}
          >
            翌日
          </Link>
        </Button>
      </div>

      {/* 空き枠 */}
      <div>
        <p className="text-[12.5px] font-medium text-muted-foreground">ご希望の時間を選択</p>
        {slots.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            この日は空きがありません。別の日をお選びください。
          </p>
        ) : (
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {dedupeByStart(slots).map((slot) => {
              const active =
                selected?.startISO === slot.startISO &&
                selected?.memberId === slot.memberId &&
                selected?.roomId === slot.roomId;
              return (
                <button
                  key={`${slot.startISO}-${slot.memberId}-${slot.roomId}`}
                  type="button"
                  onClick={() => setSelected(slot)}
                  className={`rounded-md border py-2 text-sm tabular-nums transition-colors ${
                    active
                      ? "border-[var(--primary)] bg-[var(--primary)] text-primary-foreground"
                      : "border-[var(--line)] hover:border-[var(--primary)]"
                  }`}
                >
                  {jstHhmm(slot.startISO)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 連絡先入力(枠選択後) */}
      {selected && (
        <form
          action={formAction}
          className="space-y-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4"
        >
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="serviceId" value={service.id} />
          <input type="hidden" name="memberId" value={selected.memberId} />
          <input type="hidden" name="roomId" value={selected.roomId} />
          {/* BC-NEW-07: 指名の有無を Server Action へ伝搬(「指定なし」は空) */}
          <input type="hidden" name="nominatedMemberId" value={nominated ?? ""} />
          <input type="hidden" name="startISO" value={selected.startISO} />
          <p className="text-sm font-medium">
            {formatDateShort(date)} {jstHhmm(selected.startISO)} で予約
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="g-name">お名前</Label>
              <Input id="g-name" name="name" required autoComplete="name" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="g-kana">フリガナ</Label>
              <Input id="g-kana" name="kana" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="g-phone">電話番号</Label>
              <Input id="g-phone" name="phone" type="tel" required autoComplete="tel" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="g-email">メールアドレス</Label>
              <Input id="g-email" name="email" type="email" required autoComplete="email" />
            </div>
          </div>
          <FormError message={state.error} />
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "送信中…" : "この内容で予約する"}
          </Button>
          <p className="text-[11px] leading-5 text-muted-foreground">
            ご予約の施術は{clinicName}が提供する自由診療です。医師の診察のうえ実施します。
          </p>
        </form>
      )}
    </div>
  );
}

function dedupeByStart(slots: Slot[]): Slot[] {
  const seen = new Set<string>();
  const out: Slot[] = [];
  for (const s of slots) {
    if (seen.has(s.startISO)) continue;
    seen.add(s.startISO);
    out.push(s);
  }
  return out;
}

function shiftDate(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + delta);
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
