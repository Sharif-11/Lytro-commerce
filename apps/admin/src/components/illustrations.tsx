import type { ReactNode } from 'react';
import { PhoneIcon, ShopIcon } from '@/components/icons';

/** The repeated motif behind every hero illustration: two overlapping rotated cards and a floating icon
    tile, so every screen reads as the same brand language rather than one-off art. */
function IllustrationFrame({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="relative flex aspect-square w-full max-w-65 items-center justify-center">
      <div className="absolute h-40 w-40 rotate-6 rounded-4xl bg-white/15" />
      <div className="absolute h-40 w-40 -rotate-6 rounded-4xl bg-white/10" />
      <div className="relative flex h-28 w-28 items-center justify-center rounded-3xl bg-white text-brand-600 shadow-xl shadow-black/10">
        {children}
      </div>
      <span className="absolute top-2 right-8 h-5 w-5 rounded-full bg-accent-300" />
      <span className="absolute bottom-6 left-4 h-3 w-3 rounded-full bg-white/70" />
      <span className="absolute top-10 left-2 h-2 w-2 rounded-full bg-white/50" />
    </div>
  );
}

export function SignInIllustration(): React.JSX.Element {
  return (
    <IllustrationFrame>
      <PhoneIcon className="h-14 w-14" />
    </IllustrationFrame>
  );
}

export function VerifyIllustration(): React.JSX.Element {
  return (
    <IllustrationFrame>
      <svg
        className="h-14 w-14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="m4 7 7 5.5a1.5 1.5 0 0 0 2 0L20 7" />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m9 15 1.8 1.8L15 13"
          stroke="#f97316"
        />
      </svg>
    </IllustrationFrame>
  );
}

export function CreateShopIllustration(): React.JSX.Element {
  return (
    <IllustrationFrame>
      <ShopIcon className="h-14 w-14" />
    </IllustrationFrame>
  );
}

export function DashboardIllustration(): React.JSX.Element {
  return (
    <IllustrationFrame>
      <svg
        className="h-14 w-14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" strokeLinejoin="round" d="m8 12.5 2.8 2.8L16 9.5" />
      </svg>
    </IllustrationFrame>
  );
}
