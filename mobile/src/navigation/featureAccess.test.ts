import { describe, expect, it } from "@jest/globals";
import { canOpenMoreFeature } from './featureAccess';

describe('More feature access', () => {
  it('keeps the directory readable and protects privileged deep links', () => {
    const member = { permissions: ['users.read'], features: { admin: false } };
    expect(canOpenMoreFeature(member, 'people')).toBe(true);
    for (const feature of ['admin', 'portfolio-admin', 'impersonation']) expect(canOpenMoreFeature(member, feature)).toBe(false);
  });
  it('requires the matching permissions for administration and impersonation', () => {
    const admin = { permissions: ['admin.manage', 'users.create'], features: { admin: true } };
    expect(canOpenMoreFeature(admin, 'admin')).toBe(true);
    expect(canOpenMoreFeature(admin, 'impersonation')).toBe(false);
    expect(canOpenMoreFeature({ permissions: ['impersonation.manage'] }, 'impersonation')).toBe(true);
    expect(canOpenMoreFeature({ permissions: ['portfolio.manage'], features: { portfolio_admin: true } }, 'portfolio-admin')).toBe(true);
  });
});
