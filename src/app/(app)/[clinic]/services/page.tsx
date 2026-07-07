import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { CategoryCreateInline } from "@/features/services/components/category-create-inline";
import {
  ServiceFormDialog,
  type ServiceRow,
} from "@/features/services/components/service-form-dialog";
import { ServiceListItem } from "@/features/services/components/service-list-item";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "メニュー" };

// @implements v2-05
export default async function ServicesPage(props: PageProps<"/[clinic]/services">) {
  const { clinic: slug } = await props.params;
  const { clinic } = await requireMember(slug, "owner");
  const supabase = await createClient();

  const [{ data: services }, { data: categories }, { data: templates }] = await Promise.all([
    supabase
      .from("services")
      .select("*")
      .eq("clinic_id", clinic.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("service_categories")
      .select("id, name")
      .eq("clinic_id", clinic.id)
      .order("sort_order"),
    supabase
      .from("questionnaire_templates")
      .select("id, name")
      .eq("clinic_id", clinic.id)
      .eq("status", "active")
      .order("created_at"),
  ]);

  const cats = categories ?? [];
  const tmpls = templates ?? [];
  const list = (services ?? []) as unknown as (ServiceRow & { status: string })[];

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-base font-semibold">メニュー</h1>
        <div className="flex items-center gap-2">
          <CategoryCreateInline slug={slug} />
          <ServiceFormDialog
            slug={slug}
            categories={cats}
            templates={tmpls}
            trigger={<Button>メニューを追加</Button>}
          />
        </div>
      </div>

      {list.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">
          メニューがまだありません。「メニューを追加」から登録してください。
        </p>
      ) : (
        <ul className="mt-5 space-y-2">
          {list.map((svc) => (
            <ServiceListItem
              key={svc.id}
              slug={slug}
              service={svc}
              categoryName={cats.find((c) => c.id === svc.category_id)?.name}
              categories={cats}
              templates={tmpls}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
