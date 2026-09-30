import type { User } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * SECURITY: Platform super-admin is ONLY app_metadata.role.
 * user_metadata.role is client-writable via auth.updateUser — never trust it.
 */
export function isSuperAdmin(user: User): boolean {
  const role = user.app_metadata?.role as string | undefined;
  return role === "admin" || role === "super_admin";
}

export function isOrgAdmin(user: User): boolean {
  if (isSuperAdmin(user)) return false;
  const userRole = user.user_metadata?.role as string | undefined;
  // Ignore forgeable platform-admin marks
  if (userRole === "admin" || userRole === "super_admin") {
    return (user.app_metadata?.role as string | undefined) === "org_admin";
  }
  const role =
    userRole ?? (user.app_metadata?.role as string | undefined);
  return role === "org_admin";
}

/** Manual draw: super admin and org admin (mobile drawAccess.ts parity). */
export function canManualDraw(user: User): boolean {
  return isSuperAdmin(user) || isOrgAdmin(user);
}
