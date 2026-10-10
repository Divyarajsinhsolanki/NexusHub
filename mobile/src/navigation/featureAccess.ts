type AccessUser = { permissions?: string[]; features?: Record<string, boolean>; demo_account?: boolean } | null | undefined;

export function canOpenMoreFeature(user: AccessUser, feature: string) {
  if (!user) return false;
  if (feature === 'admin') return Boolean(user.features?.admin && user.permissions?.includes('admin.manage'));
  if (feature === 'portfolio-admin') return Boolean(user.features?.portfolio_admin && user.permissions?.includes('portfolio.manage'));
  if (feature === 'impersonation') return Boolean(user.permissions?.includes('impersonation.manage'));
  if (feature === 'demo') return Boolean(user.demo_account);
  return true;
}
