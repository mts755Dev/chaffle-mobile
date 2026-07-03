import type { User } from "https://esm.sh/@supabase/supabase-js@2";

/** Matches chaffle/lib/authRoles.ts isWebSuperAdmin */
export function isSuperAdmin(user: User): boolean {
  const role = user.user_metadata?.role as string | undefined;
  if (role === "admin") return true;
  if (role === "org_admin" || role === "worker") return false;

  if (user.user_metadata?.firstName && !user.user_metadata?.organization_id) {
    return true;
  }

  return user.role === "admin";
}

export function isOrgAdmin(user: User): boolean {
  return user.user_metadata?.role === "org_admin";
}

/** Manual draw: super admin and org admin (mobile drawAccess.ts parity). */
export function canManualDraw(user: User): boolean {
  return isSuperAdmin(user) || isOrgAdmin(user);
}
