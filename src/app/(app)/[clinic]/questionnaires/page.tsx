import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import {
  TemplateFormDialog,
  type TemplateRow,
} from "@/features/questionnaires/components/template-form-dialog";
import { TemplateListItem } from "@/features/questionnaires/components/template-list-item";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "問診テンプレ" };

// @implements v2-17
export default async function QuestionnairesPage(props: PageProps<"/[clinic]/questionnaires">) {
  const { clinic: slug } = await props.params;
  const { clinic } = await requireMember(slug, "owner");
  const supabase = await createClient();

  const { data: templates } = await supabase
    .from("questionnaire_templates")
    .select("*")
    .eq("clinic_id", clinic.id)
    .order("created_at", { ascending: true });

  const list = (templates ?? []) as unknown as (TemplateRow & { status: string })[];

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-base font-semibold">問診テンプレ</h1>
        <TemplateFormDialog slug={slug} trigger={<Button>テンプレートを追加</Button>} />
      </div>

      {list.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          問診テンプレートがまだありません。「テンプレートを追加」から登録してください。
        </p>
      ) : (
        <ul className="mt-5 space-y-2">
          {list.map((tmpl) => (
            <TemplateListItem key={tmpl.id} slug={slug} template={tmpl} />
          ))}
        </ul>
      )}
    </div>
  );
}
