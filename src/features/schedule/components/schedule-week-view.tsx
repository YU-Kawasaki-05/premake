"use client";

// @implements v2-08 施術枠の週ビュー(スタッフが部屋×時間の枠を確保)

import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteScheduleBlock } from "@/features/schedule/actions";
import type { WeekDay } from "@/features/schedule/week";
import { jstTime, parseRange, shiftWeek } from "@/features/schedule/week";
import { ScheduleBlockDialog } from "./schedule-block-dialog";

type Option = { id: string; name: string };
type Block = {
  id: string;
  member_id: string;
  room_id: string;
  block_type: string;
  note: string | null;
  time_range: string;
};

export function ScheduleWeekView({
  slug,
  anchor,
  days,
  blocks,
  members,
  rooms,
  currentMemberId,
}: {
  slug: string;
  anchor: string;
  days: WeekDay[];
  blocks: Block[];
  members: Option[];
  rooms: Option[];
  currentMemberId: string;
}) {
  const [pending, startTransition] = useTransition();
  const memberName = (id: string) => members.find((m) => m.id === id)?.name ?? "?";
  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? "?";

  // 日付ごとに枠をまとめる(JST 日付でグルーピング)
  const byDate = new Map<string, (Block & { start: string; end: string })[]>();
  for (const b of blocks) {
    const r = parseRange(b.time_range);
    if (!r) continue;
    const dateJst = jstDateOf(r.start);
    const arr = byDate.get(dateJst) ?? [];
    arr.push({ ...b, start: r.start, end: r.end });
    byDate.set(dateJst, arr);
  }
  for (const arr of byDate.values()) arr.sort((a, b) => a.start.localeCompare(b.start));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-base font-semibold">施術枠</h1>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" asChild aria-label="前の週">
            <Link href={`/${slug}/schedule?w=${shiftWeek(anchor, -1)}`}>
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/${slug}/schedule`}>今週</Link>
          </Button>
          <Button variant="outline" size="icon" asChild aria-label="次の週">
            <Link href={`/${slug}/schedule?w=${shiftWeek(anchor, 1)}`}>
              <ChevronRight className="size-4" />
            </Link>
          </Button>
          <ScheduleBlockDialog
            slug={slug}
            members={members}
            rooms={rooms}
            currentMemberId={currentMemberId}
            defaultDate={days[0].date}
          />
        </div>
      </div>

      {rooms.length === 0 && (
        <p className="mt-4 rounded-md border border-[var(--status-requested)] bg-[var(--status-requested-bg)] px-3 py-2 text-[12.5px] text-[var(--status-requested)]">
          先に「部屋・担当」で部屋を登録すると施術枠を作成できます。
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {days.map((day) => {
          const items = byDate.get(day.date) ?? [];
          return (
            <div
              key={day.date}
              className={`rounded-md border p-2 ${
                day.isToday
                  ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                  : "border-border bg-card"
              }`}
            >
              <div className="mb-1.5 text-[12.5px] font-medium text-muted-foreground">
                {day.label}
              </div>
              {items.length === 0 ? (
                <p className="py-2 text-center text-[11px] text-[var(--ink-faint)]">—</p>
              ) : (
                <ul className="space-y-1">
                  {items.map((b) => (
                    <li
                      key={b.id}
                      className={`group rounded border-l-2 px-1.5 py-1 text-[11.5px] ${
                        b.block_type === "open"
                          ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                          : "border-[var(--ink-faint)] bg-[var(--paper)]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="tabular-nums font-medium">
                          {jstTime(b.start)}–{jstTime(b.end)}
                        </span>
                        {/* No.35: メンバー全員が任意スタッフの枠を削除できる */}
                        <button
                          type="button"
                          aria-label="枠を削除"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              const res = await deleteScheduleBlock(slug, b.id);
                              if (res?.error) toast.error(res.error);
                              else toast.success("施術枠を削除しました");
                            })
                          }
                          className="opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <Trash2 className="size-3 text-muted-foreground hover:text-[var(--destructive)]" />
                        </button>
                      </div>
                      <div className="truncate text-muted-foreground">
                        {roomName(b.room_id)} · {memberName(b.member_id)}
                        {b.block_type === "blocked" && " · 占有"}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// UTC ISO → JST の yyyy-mm-dd
function jstDateOf(iso: string): string {
  const jst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}
