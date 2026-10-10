import { BrandMark } from '@/components/layout/brand-mark';

interface MobileHeaderProps {
  shopName: string | null;
}

/** Mobile-only (sm:hidden) — a slim top strip that's branding only, matching the reference dashboard's own
    mobile header role: account actions (language, sign-out) live in BottomNav's account sheet instead, not
    here. */
export function MobileHeader({ shopName }: MobileHeaderProps): React.JSX.Element {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-100 bg-white px-4 sm:hidden">
      <BrandMark compact />
      {shopName ? (
        <p className="max-w-40 truncate text-sm font-medium text-slate-500">{shopName}</p>
      ) : null}
    </header>
  );
}
