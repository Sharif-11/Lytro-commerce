import { monogramLetter } from '@lytronix/validators';
import type { ImageView } from '@/types/me';

interface ShopMarkProps {
  shopName: string;
  slug: string;
  logo: ImageView | null;
  /** 32 px in the bars, 40 px beside the shop's name in the side column. */
  size?: 32 | 40;
  className?: string;
}

/** TEN-16: the shop's logo, or its monogram -- the first letter of its name on a tile (the prototype's `.mono`). */
export function ShopMark({
  shopName,
  slug,
  logo,
  size = 32,
  className,
}: ShopMarkProps): React.JSX.Element {
  const box = size === 40 ? 'size-10 text-[18px]' : 'size-8 text-[16px]';
  if (logo) {
    return (
      <img
        src={logo.urls.thumbnail}
        alt=""
        className={['flex-none rounded-[8px] bg-surface object-contain', box, className]
          .filter(Boolean)
          .join(' ')}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={[
        'inline-flex flex-none items-center justify-center rounded-[8px] bg-brand-700 font-bold text-white',
        box,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {monogramLetter(shopName, slug)}
    </span>
  );
}
