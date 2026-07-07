import "server-only";

// @implements v2-02 招待の検証(受諾側)

import { createAdminClient } from "@/lib/supabase/admin";
import { hashInviteToken } from "./token";

export type VerifiedInvitation = {
  id: string;
  email: string;
  roles: string[];
  employment_type: "employed" | "contracted" | null;
  clinic: { id: string; slug: string; name: string };
};

export async function verifyInvitation(token: string): Promise<VerifiedInvitation | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("invitations")
    .select("id, email, roles, employment_type, expires_at, accepted_at, clinics(id, slug, name)")
    .eq("token_hash", hashInviteToken(token))
    .maybeSingle();

  if (!data?.clinics) return null;
  if (data.accepted_at) return null;
  if (new Date(data.expires_at) < new Date()) return null;

  return {
    id: data.id,
    email: data.email,
    roles: data.roles,
    employment_type: data.employment_type as VerifiedInvitation["employment_type"],
    clinic: data.clinics,
  };
}
