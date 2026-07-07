import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PatientFormDialog } from "@/features/patients/components/patient-form-dialog";
import { requireMember } from "@/lib/auth";
import { formatDate } from "@/lib/datetime";
import { sanitizeSearchTerm } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "患者" };

// @implements v2-15 患者一覧・検索
export default async function PatientsPage(props: PageProps<"/[clinic]/patients">) {
  const { clinic: slug } = await props.params;
  const sp = await props.searchParams;
  const { clinic } = await requireMember(slug);
  const supabase = await createClient();

  const rawQ = typeof sp.q === "string" ? sp.q.trim() : "";
  const q = sanitizeSearchTerm(rawQ);
  let query = supabase
    .from("patients")
    .select("id, name, kana, phone, email, updated_at")
    .eq("clinic_id", clinic.id)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (q) query = query.or(`name.ilike.%${q}%,kana.ilike.%${q}%,phone.ilike.%${q}%`);
  const { data: patients } = await query;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-base font-semibold">患者</h1>
        <PatientFormDialog slug={slug} trigger={<Button>患者を追加</Button>} />
      </div>

      <form className="mt-4 flex gap-2" action={`/${slug}/patients`}>
        <Input
          name="q"
          defaultValue={q}
          placeholder="名前・かな・電話で検索"
          aria-label="患者検索"
        />
        <Button type="submit" variant="outline">
          検索
        </Button>
      </form>

      <div className="mt-4 overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-[var(--paper)] text-left text-[12.5px] text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">氏名</th>
              <th className="px-4 py-2.5 font-medium">かな</th>
              <th className="px-4 py-2.5 font-medium">連絡先</th>
              <th className="px-4 py-2.5 font-medium">最終更新</th>
            </tr>
          </thead>
          <tbody>
            {(patients ?? []).map((p) => (
              <tr
                key={p.id}
                className="border-b border-[var(--line-soft)] last:border-0 hover:bg-[var(--paper)]"
              >
                <td className="px-4 py-3 font-medium">
                  <Link
                    href={`/${slug}/patients/${p.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {p.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{p.kana || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.phone || p.email || "—"}</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">
                  {formatDate(p.updated_at)}
                </td>
              </tr>
            ))}
            {(patients ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                  {q ? "該当する患者がいません。" : "患者がまだ登録されていません。"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
