import { monogramLetter } from '@lytronix/validators';
import { Icon } from '@/components/icon';

/**
 * TEN-17, Part 27: the installed dashboard's icon as the install offers show it -- the shop's letter, with a small gear
 * in its corner that tells it apart from the shop's storefront app. 44 px in the Menu's card, 40 in the install row.
 */
export function DashboardAppIcon({
  shopName,
  slug,
  size = 44,
}: {
  shopName: string;
  slug: string;
  size?: 40 | 44;
}): React.JSX.Element {
  return (
    <span
      className={[
        'relative flex flex-none items-center justify-center rounded-[11px] bg-ink font-extrabold text-brand-300',
        size === 40 ? 'size-10 text-[16px]' : 'size-11 text-[18px]',
      ].join(' ')}
    >
      {monogramLetter(shopName, slug)}
      <span className="absolute -right-[5px] -bottom-[5px] flex size-5 items-center justify-center rounded-full bg-white text-ink shadow-[0_0_0_2px_var(--color-primary-soft)] [&>svg]:size-[13px]">
        <Icon name="settings" />
      </span>
    </span>
  );
}
