/**
 * Normalize profile/user objects coming from Supabase or legacy app data.
 *
 * The application uses `isAllowed` internally.  Older/alternate payloads may
 * expose the same access flag as `is_allowed`, `isAllowed`, or `isAdmin`.
 */
export function normalizeProfile(profile, authUser = null) {
  if (!profile && !authUser) return null;

  const source = profile ?? {};

  const isAllowed = Boolean(
    source.is_allowed ??
    source.isAllowed ??
    source.isAdmin ??
    false,
  );

  return {
    ...source,
    id: source.id ?? authUser?.id ?? null,
    username:
      source.username ??
      source.name ??
      authUser?.user_metadata?.username ??
      authUser?.user_metadata?.name ??
      authUser?.email?.split('@')[0] ??
      'User',
    full_name:
      source.full_name ??
      source.fullName ??
      source.name ??
      authUser?.user_metadata?.full_name ??
      authUser?.user_metadata?.name ??
      null,
    avatar_url:
      source.avatar_url ??
      source.avatarUrl ??
      null,
    // Canonical frontend field. Do not rely on database casing in components.
    isAllowed,
  };
}
