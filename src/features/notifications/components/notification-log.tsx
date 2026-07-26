// @implements v2-23 通知送信状況の可視化(failed をオーナーが気づけるようにする)

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/datetime";

/** notifications.kind の日本語ラベル(templates.ts の NotificationKind と対応) */
const KIND_LABELS: Record<string, string> = {
  booking_confirmed: "確定",
  booking_requested: "受付",
  booking_rescheduled: "変更",
  booking_cancelled: "キャンセル",
  booking_created_internal: "院内新規",
  booking_cancelled_internal: "院内キャンセル",
  reminder: "リマインダー",
};

const STATUS_LABELS: Record<string, string> = {
  queued: "待機中",
  sending: "送信中",
  sent: "送信済み",
  failed: "失敗",
};

export type NotificationLogRow = {
  id: string;
  kind: string;
  recipient_email: string;
  recipient_type: string;
  status: string;
  attempts: number;
  error: string | null;
  created_at: string;
  sent_at: string | null;
};

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status;
  if (status === "failed") {
    return (
      <span className="inline-flex items-center rounded-4xl border border-[var(--status-no-show)] bg-[var(--status-no-show-bg)] px-2 py-0.5 text-xs font-medium text-[var(--status-no-show)]">
        {label}
      </span>
    );
  }
  if (status === "sent") {
    return (
      <span className="inline-flex items-center rounded-4xl bg-[var(--status-confirmed-bg)] px-2 py-0.5 text-xs font-medium text-[var(--status-confirmed)]">
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-4xl bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {label}
    </span>
  );
}

export function NotificationLog({ rows }: { rows: NotificationLogRow[] }) {
  if (rows.length === 0) {
    return <p className="mt-3 text-[12.5px] text-muted-foreground">通知の記録はまだありません。</p>;
  }

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="border-border bg-[var(--paper)] text-[12.5px] text-muted-foreground hover:bg-[var(--paper)]">
            <TableHead className="px-3 font-medium text-muted-foreground">種別</TableHead>
            <TableHead className="px-3 font-medium text-muted-foreground">宛先</TableHead>
            <TableHead className="px-3 font-medium text-muted-foreground">状態</TableHead>
            <TableHead className="px-3 text-right font-medium text-muted-foreground">
              試行
            </TableHead>
            <TableHead className="px-3 font-medium text-muted-foreground">エラー</TableHead>
            <TableHead className="px-3 font-medium text-muted-foreground">日時</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="border-border">
              <TableCell className="px-3 text-[12.5px]">
                {KIND_LABELS[row.kind] ?? row.kind}
                {row.recipient_type === "member" ? (
                  <span className="ml-1 text-[11px] text-muted-foreground">院内</span>
                ) : null}
              </TableCell>
              <TableCell className="px-3 text-[12.5px]">{row.recipient_email}</TableCell>
              <TableCell className="px-3">
                <StatusBadge status={row.status} />
              </TableCell>
              <TableCell className="px-3 text-right text-[12.5px] tabular-nums">
                {row.attempts}
              </TableCell>
              <TableCell
                className="max-w-[16rem] truncate px-3 text-[12.5px] text-muted-foreground"
                title={row.error ?? undefined}
              >
                {row.error ?? "—"}
              </TableCell>
              <TableCell className="px-3 text-[12.5px] text-muted-foreground">
                {formatDateTime(row.created_at)}
                {row.sent_at ? (
                  <span className="ml-1 text-[11px]">→ {formatDateTime(row.sent_at)}</span>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
