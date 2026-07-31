import "server-only";

import { cache } from "react";
import type { SessionStep } from "@/features/services/session-template";
import { createAdminClient } from "@/lib/supabase/admin";

export type PublicClinic = {
  id: string;
  slug: string;
  name: string;
  director_name: string | null;
  postal_code: string | null;
  address: string | null;
  phone: string | null;
  business_hours: { dow: number; open: string; close: string }[];
  cancel_deadline_hours: number;
};

export type PublicService = {
  id: string;
  name: string;
  description: string | null;
  price_yen: number | null;
  show_price: boolean;
  allow_nomination: boolean;
  session_template: SessionStep[];
  category_id: string | null;
};

/**
 * 公開予約が有効なクリニックを slug で取得。未ログイン導線のため service role を使うが、
 * public_booking_enabled=false のクリニックは返さない(=公開していない)。
 */
export const getPublicClinic = cache(async (slug: string): Promise<PublicClinic | null> => {
  const admin = createAdminClient();
  const { data } = await admin
    .from("clinics")
    .select(
      "id, slug, name, director_name, postal_code, address, phone, business_hours, cancel_deadline_hours, public_booking_enabled",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!data?.public_booking_enabled) return null;
  return data as unknown as PublicClinic;
});

export async function getPublicServices(clinicId: string): Promise<PublicService[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("services")
    .select(
      "id, name, description, price_yen, show_price, allow_nomination, session_template, category_id",
    )
    .eq("clinic_id", clinicId)
    .eq("is_public", true)
    .eq("status", "active")
    .order("sort_order");
  return (data ?? []) as unknown as PublicService[];
}
