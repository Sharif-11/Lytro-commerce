import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { navItems } from '@/components/layout/nav-items';

/** Mobile tab bar (D32 — a bottom tab bar, not a desktop-style collapsible sidebar, since every tenant is a
    phone user). Fixed to the viewport bottom; DashboardShell reserves matching bottom padding on the content
    area so nothing renders underneath it. Presentational only, reads the same navItems as TopBar. */
export function BottomNav(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex h-16 border-t border-slate-100 bg-white sm:hidden">
      {navItems.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          activeOptions={{ exact: item.to === '/dashboard' }}
          className="flex flex-1 flex-col items-center justify-center gap-1 text-slate-400"
          activeProps={{ className: 'text-brand-700' }}
        >
          <item.icon className="h-5 w-5" />
          <span className="text-[11px] font-medium">{t(item.labelKey)}</span>
        </Link>
      ))}
    </nav>
  );
}
