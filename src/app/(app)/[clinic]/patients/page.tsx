import type { Metadata } from "next";
import { requireMember } from "@/lib/auth";

export const metadata: Metadata = { title: "患者" };

// S4 で本実装(v2-15,16,18)。現在はプレースホルダ。
export default async function PatientsPage(props: PageProps<"/[clinic]/patients">) {
  const { clinic: slug } = await props.params;
  await requireMember(slug);
  return (
    <div className="max-w-2xl">
      <h1 className="text-base font-semibold">患者</h1>
      <p className="mt-10 text-center text-sm text-muted-foreground">
        患者マスタは Sprint 4 で追加されます。
      </p>
    </div>
  );
}
