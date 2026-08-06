/**
 * A brand-new account is created with `displayName` set to the phone number
 * itself (see auth.service.ts's user.create) — a placeholder, not a real
 * name, and until now there was no screen that ever replaced it. A profile
 * counts as complete exactly when that placeholder has been overwritten.
 */
export function isProfileComplete(displayName: string, phone: string): boolean {
  return displayName.trim().length > 0 && displayName !== phone;
}
