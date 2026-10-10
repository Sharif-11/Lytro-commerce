import type { ReactNode } from 'react';
import { PhoneIcon, ShopIcon } from '@/components/icons';

/** The repeated motif behind every hero illustration: two overlapping rotated cards and a floating icon
    tile, so every screen reads as the same brand language rather than one-off art. */
function IllustrationFrame({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="relative flex aspect-square w-full max-w-36 items-center justify-center sm:max-w-65">
      <div className="absolute h-24 w-24 rotate-6 rounded-3xl bg-white/15 sm:h-40 sm:w-40 sm:rounded-4xl" />
      <div className="absolute h-24 w-24 -rotate-6 rounded-3xl bg-white/10 sm:h-40 sm:w-40 sm:rounded-4xl" />
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-xl shadow-black/10 sm:h-28 sm:w-28 sm:rounded-3xl">
        {children}
      </div>
      <span className="absolute top-1 right-5 h-3 w-3 rounded-full bg-accent-300 sm:top-2 sm:right-8 sm:h-5 sm:w-5" />
      <span className="absolute bottom-3 left-2 h-2 w-2 rounded-full bg-white/70 sm:bottom-6 sm:left-4 sm:h-3 sm:w-3" />
      <span className="absolute top-6 left-1 h-1.5 w-1.5 rounded-full bg-white/50 sm:top-10 sm:left-2 sm:h-2 sm:w-2" />
    </div>
  );
}

export function SignInIllustration(): React.JSX.Element {
  return (
    <IllustrationFrame>
      <PhoneIcon className="h-8 w-8 sm:h-14 sm:w-14" />
    </IllustrationFrame>
  );
}

export function VerifyIllustration(): React.JSX.Element {
  return (
    <IllustrationFrame>
      <svg
        className="h-8 w-8 sm:h-14 sm:w-14"
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
      <ShopIcon className="h-8 w-8 sm:h-14 sm:w-14" />
    </IllustrationFrame>
  );
}
