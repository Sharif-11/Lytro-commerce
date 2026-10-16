import { Permission } from '@lytronix/validators';
import { describe, expect, it } from 'vitest';
import { navItems, visibleNavItems } from './nav-items';

describe('visibleNavItems', () => {
  it('shows everything to the owner, regardless of permissions', () => {
    expect(visibleNavItems({ isOwner: true, permissions: [] })).toEqual(navItems);
  });

  it('shows a staff member only the dashboard home when /me has not resolved yet', () => {
    expect(visibleNavItems(undefined).map((item) => item.to)).toEqual(['/dashboard']);
  });

  it('shows only what the held permissions unlock, plus anything with no permission requirement', () => {
    const visible = visibleNavItems({
      isOwner: false,
      permissions: [Permission.StaffRead],
    });
    // Staff and Roles both gate on StaffRead (RolesController's own list route requires it too).
    expect(visible.map((item) => item.to)).toEqual([
      '/dashboard',
      '/dashboard/staff',
      '/dashboard/roles',
    ]);
  });

  it('hides Balance from a staff member without balance:read', () => {
    const visible = visibleNavItems({
      isOwner: false,
      permissions: [Permission.StaffRead, Permission.AuditRead],
    });
    expect(visible.map((item) => item.to)).not.toContain('/dashboard/balance');
  });

  it('hides Billing and Invoices from a staff member without payments:read', () => {
    const visible = visibleNavItems({
      isOwner: false,
      permissions: [Permission.StaffRead, Permission.AuditRead, Permission.BalanceRead],
    });
    expect(visible.map((item) => item.to)).not.toContain('/dashboard/billing');
    expect(visible.map((item) => item.to)).not.toContain('/dashboard/invoices');
  });

  it('hides Shop settings from a staff member without settings:manage (TEN-30)', () => {
    const visible = visibleNavItems({
      isOwner: false,
      permissions: [Permission.StaffRead, Permission.AuditRead, Permission.BalanceRead],
    });
    expect(visible.map((item) => item.to)).not.toContain('/dashboard/shop-settings');
  });

  it('shows every item once every permission is held', () => {
    const visible = visibleNavItems({
      isOwner: false,
      permissions: [
        Permission.StaffRead,
        Permission.AuditRead,
        Permission.BalanceRead,
        Permission.PaymentsRead,
        Permission.SettingsManage,
      ],
    });
    expect(visible).toEqual(navItems);
  });
});
