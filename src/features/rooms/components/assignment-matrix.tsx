"use client";

// @implements v2-07 スタッフ×メニュー担当マトリクス

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { setAssignment } from "@/features/rooms/actions";

type Option = { id: string; name: string };

function key(memberId: string, serviceId: string) {
  return `${memberId}:${serviceId}`;
}

export function AssignmentMatrix({
  slug,
  members,
  services,
  initialAssigned,
}: {
  slug: string;
  members: Option[];
  services: Option[];
  initialAssigned: string[];
}) {
  const [assigned, setAssigned] = useState(() => new Set(initialAssigned));
  const [, startTransition] = useTransition();

  function toggle(memberId: string, serviceId: string) {
    const k = key(memberId, serviceId);
    const nextEnabled = !assigned.has(k);

    setAssigned((prev) => {
      const next = new Set(prev);
      if (nextEnabled) next.add(k);
      else next.delete(k);
      return next;
    });

    startTransition(async () => {
      const r = await setAssignment(slug, memberId, serviceId, nextEnabled);
      if (r?.error) {
        toast.error(r.error);
        // 失敗時は楽観的更新を取り消す
        setAssigned((prev) => {
          const next = new Set(prev);
          if (nextEnabled) next.delete(k);
          else next.add(k);
          return next;
        });
      }
    });
  }

  if (members.length === 0 || services.length === 0) {
    return (
      <p className="mt-5 text-sm text-muted-foreground">
        担当設定にはスタッフとメニューの両方が登録されている必要があります。
      </p>
    );
  }

  return (
    <div className="mt-5 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-[var(--paper)] text-left text-[12.5px] text-muted-foreground">
            <th className="sticky left-0 bg-[var(--paper)] px-4 py-2.5 font-medium">スタッフ</th>
            {services.map((service) => (
              <th
                key={service.id}
                className="whitespace-nowrap px-4 py-2.5 text-center font-medium"
              >
                {service.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id} className="border-b border-[var(--line-soft)] last:border-0">
              <td className="sticky left-0 bg-card px-4 py-2.5 font-medium whitespace-nowrap">
                {member.name}
              </td>
              {services.map((service) => {
                const checked = assigned.has(key(member.id, service.id));
                return (
                  <td key={service.id} className="px-4 py-2.5 text-center">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(member.id, service.id)}
                      aria-label={`${member.name}が${service.name}を担当`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
