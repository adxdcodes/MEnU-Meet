export function normalizeProfile(profile) {
  if (!profile) return null;

  return {
    ...profile,
    isAllowed: Boolean(profile.is_allowed ?? profile.isAllowed),
  };
}
