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

  it('shows every item once every permission is held', () => {
    const visible = visibleNavItems({
      isOwner: false,
      permissions: [Permission.StaffRead, Permission.AuditRead],
    });
    expect(visible).toEqual(navItems);
  });
});
