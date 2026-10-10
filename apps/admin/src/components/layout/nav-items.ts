import { Permission } from '@lytronix/validators';
import { ClockIcon, HomeIcon, ShieldIcon, UsersIcon } from '@/components/icons';
import type { MeResponse } from '@/types/me';

export interface NavItem {
  to: '/dashboard' | '/dashboard/staff' | '/dashboard/roles' | '/dashboard/activity';
  labelKey: string;
  icon: typeof HomeIcon;
  /** The permission this destination needs — matched against `/me`'s `permissions` (D32). No field means
      everyone signed in sees it (currently just the dashboard home). */
  permission?: Permission;
}

/** The one list of dashboard destinations — Sidebar and BottomNav both render from this instead of each
    hardcoding its own set, so adding a section later is one entry here, not an edit to two components
    (open/closed, ENGINEERING-STANDARDS.md §2a). */
export const navItems: NavItem[] = [
  { to: '/dashboard', labelKey: 'nav.dashboard', icon: HomeIcon },
  {
    to: '/dashboard/staff',
    labelKey: 'nav.staff',
    icon: UsersIcon,
    permission: Permission.StaffRead,
  },
  {
    to: '/dashboard/roles',
    labelKey: 'nav.roles',
    icon: ShieldIcon,
    permission: Permission.StaffRead,
  },
  {
    to: '/dashboard/activity',
    labelKey: 'nav.activity',
    icon: ClockIcon,
    permission: Permission.AuditRead,
  },
];

/** The owner implicitly holds every permission (D32); a staff member sees only what their role(s) grant.
    While `/me` is still loading, shows only the permission-free items (today, just the dashboard home) —
    safer than a flash of the full list that then shrinks once the real permissions arrive. */
export function visibleNavItems(
  me: Pick<MeResponse, 'isOwner' | 'permissions'> | undefined,
): NavItem[] {
  if (me?.isOwner) return navItems;
  const granted = me?.permissions ?? [];
  return navItems.filter((item) => !item.permission || granted.includes(item.permission));
}
