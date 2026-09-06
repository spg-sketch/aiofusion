type InsightsCmsUser = {
  email?: string | null;
  emailVerified?: boolean | null;
  googleId?: string | null;
  microsoftId?: string | null;
};

const AIO_FUSION_EMAIL_SUFFIX = "@aiofusion.ai";

export function canAccessInsightsCms(
  accountRole: string | null | undefined,
  user: InsightsCmsUser | null | undefined,
): boolean {
  if (accountRole === "admin") return true;
  if (!user || user.emailVerified !== true) return false;
  if (!user.googleId && !user.microsoftId) return false;

  return user.email?.trim().toLowerCase().endsWith(AIO_FUSION_EMAIL_SUFFIX) === true;
}