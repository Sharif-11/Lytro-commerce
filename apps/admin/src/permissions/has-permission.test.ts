import { Permission } from '@lytronix/validators';
import { describe, expect, it } from 'vitest';
import { hasPermission } from './has-permission';

describe('hasPermission', () => {
  it('grants everything to the owner, regardless of permissions', () => {
    expect(hasPermission({ isOwner: true, permissions: [] }, Permission.StaffManage)).toBe(true);
  });

  it('grants when the permission is present in the list', () => {
    expect(
      hasPermission(
        { isOwner: false, permissions: [Permission.StaffRead, Permission.StaffManage] },
        Permission.StaffManage,
      ),
    ).toBe(true);
  });

  it('denies when the permission is absent from the list', () => {
    expect(
      hasPermission(
        { isOwner: false, permissions: [Permission.StaffRead] },
        Permission.StaffManage,
      ),
    ).toBe(false);
  });

  it('denies by default while /me has not resolved yet', () => {
    expect(hasPermission(undefined, Permission.StaffManage)).toBe(false);
  });
});
