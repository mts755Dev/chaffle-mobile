/**
 * ponytail: assert-based self-check for role metadata precedence.
 * Run: npx tsx src/utils/authRoles.selfcheck.ts
 *
 * SECURITY: super-admin must come from app_metadata only.
 */
import type { User } from '@supabase/supabase-js';
import { deriveAdminRole, isSuperAdminUser } from './authRoles';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function fakeUser(partial: {
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
  role?: string;
}): User {
  return {
    id: 'test',
    aud: 'authenticated',
    app_metadata: partial.app_metadata ?? {},
    user_metadata: partial.user_metadata ?? {},
    created_at: '',
    role: partial.role,
  } as User;
}

// Forgeable user_metadata.role=admin must NOT grant super-admin
const forged = fakeUser({
  user_metadata: { role: 'admin' },
  app_metadata: { role: 'org_admin' },
});
assert(!isSuperAdminUser(forged), 'user_metadata admin must NOT grant super-admin');
assert(deriveAdminRole(forged) === 'org_admin', 'forged admin stays scoped org_admin');

assert(
  isSuperAdminUser(fakeUser({ app_metadata: { role: 'super_admin' } })),
  'app_metadata super_admin alone works',
);
assert(
  isSuperAdminUser(fakeUser({ app_metadata: { role: 'admin' } })),
  'app_metadata admin alone works',
);
assert(
  !isSuperAdminUser(fakeUser({ user_metadata: { role: 'admin' } })),
  'user_metadata admin alone must NOT grant super-admin',
);

assert(
  deriveAdminRole(fakeUser({ user_metadata: { role: 'org_admin', organization_id: 'o1' } })) ===
    'org_admin',
  'org_admin stays org_admin',
);

// Forgeable organization_id alone must NOT grant org_admin
assert(
  deriveAdminRole(fakeUser({ user_metadata: { organization_id: 'o1' } })) === null,
  'organization_id alone must not grant org_admin',
);

console.log('authRoles.selfcheck: ok');
