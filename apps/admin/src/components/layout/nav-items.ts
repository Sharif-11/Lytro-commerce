import { ClockIcon, HomeIcon, ShieldIcon, UsersIcon } from '@/components/icons';

export interface NavItem {
  to: '/dashboard' | '/dashboard/staff' | '/dashboard/roles' | '/dashboard/activity';
  labelKey: string;
  icon: typeof HomeIcon;
}

/** The one list of dashboard destinations — TopBar and BottomNav both render from this instead of each
    hardcoding its own set, so adding a section later is one entry here, not an edit to two components
    (open/closed, ENGINEERING-STANDARDS.md §2a). Permission-gating, once there's a real permissions field to
    filter on (D32), becomes a filter applied to this same array. */
export const navItems: NavItem[] = [
  { to: '/dashboard', labelKey: 'nav.dashboard', icon: HomeIcon },
  { to: '/dashboard/staff', labelKey: 'nav.staff', icon: UsersIcon },
  { to: '/dashboard/roles', labelKey: 'nav.roles', icon: ShieldIcon },
  { to: '/dashboard/activity', labelKey: 'nav.activity', icon: ClockIcon },
];
