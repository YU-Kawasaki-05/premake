"use client";

// @implements v2-09 予約台帳(日ビュー・部屋レーン × 時間グリッド)

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  BOOKING_STATUS_STYLE,
  type BookingStatus,
  jstHhmm,
} from "@/features/bookings/booking-status";
import { parseRange } from "@/features/schedule/week";
import type { SessionStep } from "@/features/services/session-template";
import { formatDate } from "@/lib/datetime";
import { BookingCreateDialog } from "./booking-create-dialog";
import { BookingDetailDrawer } from "./booking-detail-drawer";

type Option = { id: string; name: string };
type MemberOption = Option & { bookable: boolean };
type ServiceOption = { id: string; name: string; session_template: SessionStep[] };

export type LedgerSession = {
  id: string;
  seq: number;
  kind: string;
  label: string | null;
  member_id: string;
  room_id: string;
  time_range: string;
  status: string;
  booking: {
    id: string;
    status: BookingStatus;
    booking_no: string;
    notes: string | null;
    // 名寄せ(v2-16): patient_id が null かつ guest_* があるゲスト予約に紐付け導線を出す
    patient_id: string | null;
    guest_name: string | null;
    guest_kana: string | null;
    guest_phone: string | null;
    guest_email: string | null;
    patient: { name: string } | null;
    service: { name: string } | null;
  } | null;
};

type LedgerBlock = {
  id: string;
  member_id: string;
  room_id: string;
  block_type: string;
  time_range: string;
};

const PX_PER_MIN = 0.9;

export function DayLedger({
  slug,
  date,
  todayJst,
  openMin,
  closeMin,
  rooms,
  members,
  sessions,
  blocks,
  services,
  currentMemberId,
}: {
  slug: string;
  date: string;
  todayJst: string;
  openMin: number;
  closeMin: number;
  rooms: Option[];
  members: MemberOption[];
  sessions: LedgerSession[];
  blocks: LedgerBlock[];
  services: ServiceOption[];
  currentMemberId: string;
}) {
  const [selected, setSelected] = useState<LedgerSession | null>(null);

  // 表示日の JST 00:00 を基準にした「通日分」で位置を計算(日跨ぎでも負値/超過を正しく扱う)
  const dayStartMs = Date.parse(`${date}T00:00:00+09:00`);
  const minFromDayStart = (iso: string) => (Date.parse(iso) - dayStartMs) / 60000;

  // 表示レンジは営業時間 ± 余白。当日内に収まる予約があればレンジを広げる。
  let startMin = openMin;
  let endMin = closeMin;
  for (const s of sessions) {
    const r = parseRange(s.time_range);
    if (!r) continue;
    const sStart = minFromDayStart(r.start);
    const sEnd = minFromDayStart(r.end);
    if (sStart >= 0 && sStart < 1440) startMin = Math.min(startMin, sStart);
    if (sEnd > 0 && sEnd <= 1440) endMin = Math.max(endMin, sEnd);
  }
  startMin = Math.floor(startMin / 60) * 60;
  endMin = Math.ceil(endMin / 60) * 60;
  const height = Math.max((endMin - startMin) * PX_PER_MIN, 240);

  const hourLines: number[] = [];
  for (let m = startMin; m <= endMin; m += 60) hourLines.push(m);

  // 指定レンジ内にクリップした top/height を返す(範囲外は null=非表示)
  const place = (startISO: string, endISO: string): { top: number; height: number } | null => {
    const a = Math.max(minFromDayStart(startISO), startMin);
    const b = Math.min(minFromDayStart(endISO), endMin);
    if (b <= a) return null;
    return { top: (a - startMin) * PX_PER_MIN, height: (b - a) * PX_PER_MIN };
  };

  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? "";
  const shift = (delta: number) => shiftDate(date, delta);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold">予約台帳</h1>
          <span className="text-sm text-muted-foreground tabular-nums">
            {formatDate(date)}
            {date === todayJst && (
              <span className="ml-1 rounded bg-[var(--primary-soft)] px-1.5 py-0.5 text-[11px] text-[var(--primary-strong)]">
                本日
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" asChild aria-label="前日">
            <Link href={`/${slug}?d=${shift(-1)}`}>
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/${slug}`}>本日</Link>
          </Button>
          <Button variant="outline" size="icon" asChild aria-label="翌日">
            <Link href={`/${slug}?d=${shift(1)}`}>
              <ChevronRight className="size-4" />
            </Link>
          </Button>
          <BookingCreateDialog
            slug={slug}
            rooms={rooms}
            members={members}
            services={services}
            defaultDate={date}
            currentMemberId={currentMemberId}
          />
        </div>
      </div>

      {rooms.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          先に「部屋・担当」で部屋を登録してください。
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <div className="flex min-w-max">
            {/* 時間軸 */}
            <div className="w-12 shrink-0" style={{ paddingTop: 28 }}>
              <div style={{ position: "relative", height }}>
                {hourLines.map((m) => (
                  <div
                    key={m}
                    className="absolute right-1 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground"
                    style={{ top: (m - startMin) * PX_PER_MIN }}
                  >
                    {String(Math.floor(m / 60)).padStart(2, "0")}:00
                  </div>
                ))}
              </div>
            </div>

            {/* 部屋レーン */}
            {rooms.map((room) => {
              const roomSessions = sessions.filter((s) => s.room_id === room.id);
              const roomBlocks = blocks.filter((b) => b.room_id === room.id);
              return (
                <div key={room.id} className="w-44 shrink-0 border-l border-border">
                  <div className="flex h-7 items-center justify-center border-b border-border bg-[var(--paper)] text-[12.5px] font-medium">
                    {room.name}
                  </div>
                  <div style={{ position: "relative", height }}>
                    {/* 時間線 */}
                    {hourLines.map((m) => (
                      <div
                        key={m}
                        className="absolute inset-x-0 border-t border-[var(--line-soft)]"
                        style={{ top: (m - startMin) * PX_PER_MIN }}
                      />
                    ))}
                    {/* 施術枠(背景) */}
                    {roomBlocks.map((b) => {
                      const r = parseRange(b.time_range);
                      if (!r) return null;
                      const pos = place(r.start, r.end);
                      if (!pos) return null;
                      return (
                        <div
                          key={b.id}
                          className={`absolute inset-x-0.5 rounded ${
                            b.block_type === "open"
                              ? "bg-[var(--primary-soft)]/50"
                              : "bg-[repeating-linear-gradient(45deg,var(--line-soft),var(--line-soft)_4px,transparent_4px,transparent_8px)]"
                          }`}
                          style={{ top: pos.top, height: Math.max(pos.height, 4) }}
                          title={`${memberName(b.member_id)} ${b.block_type === "open" ? "受付枠" : "占有"}`}
                        />
                      );
                    })}
                    {/* 予約チップ */}
                    {roomSessions.map((s) => {
                      const r = parseRange(s.time_range);
                      if (!r || !s.booking) return null;
                      const pos = place(r.start, r.end);
                      if (!pos) return null;
                      const isCancelled =
                        s.status !== "scheduled" || s.booking.status === "cancelled";
                      const style = BOOKING_STATUS_STYLE[s.booking.status];
                      return (
                        <button
                          type="button"
                          key={s.id}
                          onClick={() => setSelected(s)}
                          className="absolute inset-x-1 overflow-hidden rounded border-l-2 px-1.5 py-0.5 text-left text-[11px] shadow-sm transition-shadow hover:shadow"
                          style={{
                            top: pos.top,
                            height: Math.max(pos.height, 16),
                            borderColor: style.color,
                            backgroundColor: style.bg,
                            textDecoration: isCancelled ? "line-through" : undefined,
                            opacity: isCancelled ? 0.55 : 1,
                          }}
                        >
                          <div className="truncate font-medium" style={{ color: "var(--ink)" }}>
                            {jstHhmm(r.start)} {s.booking.patient?.name ?? "(患者未設定)"}
                          </div>
                          <div className="truncate text-muted-foreground">
                            {s.label || s.booking.service?.name}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <BookingDetailDrawer
        slug={slug}
        session={selected}
        memberName={selected ? memberName(selected.member_id) : ""}
        rooms={rooms}
        members={members}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function shiftDate(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + delta);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}
