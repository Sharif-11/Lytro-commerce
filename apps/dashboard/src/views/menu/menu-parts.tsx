import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { monogramLetter } from '@lytronix/validators';
import { Icon, type IconName } from '@/components/icon';
import { Button } from '@/components/ui/button';

/** A Menu row's classes (the prototype's `.menu .row`): 56 px at least, its icon on a 36 px tile. */
export const menuRowClass =
  'flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left text-[inherit] no-underline';

/** A Menu row's inside: the icon tile, the name over what it holds, and a chevron where it leads somewhere. */
export function MenuRowInner({
  icon,
  title,
  sub,
  chevron = true,
  danger = false,
}: {
  icon: IconName;
  title: ReactNode;
  sub?: ReactNode;
  chevron?: boolean;
  danger?: boolean;
}): React.JSX.Element {
  return (
    <>
      <span
        className={[
          'flex size-9 flex-none items-center justify-center rounded-[8px]',
          danger ? 'bg-danger-soft text-danger' : 'bg-info-soft text-info',
        ].join(' ')}
      >
        <Icon name={icon} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={[
            'min-w-0 overflow-hidden text-[16px] font-medium text-ellipsis whitespace-nowrap',
            danger ? 'text-danger' : '',
          ].join(' ')}
        >
          {title}
        </span>
        {sub ? (
          <span className="overflow-hidden text-[14px] text-ellipsis whitespace-nowrap text-fg-muted">
            {sub}
          </span>
        ) : null}
      </span>
      {chevron ? <Icon name="right" /> : null}
    </>
  );
}

/**
 * TEN-17 (the prototype's `menu-install`, and Part 11's `menu-install-ios`): installing the shop's dashboard as its
 * own app -- the browser's Install where it offers one; on an iPhone, which offers none, how to add it from Share.
 */
export function InstallCard({
  shopName,
  slug,
  onIphone,
  onInstall,
}: {
  shopName: string;
  slug: string;
  onIphone: boolean;
  onInstall: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  return (
    <div className="flex items-center gap-3 rounded-[12px] border border-brand-200 bg-primary-soft px-3.5 py-3">
      <span className="flex size-11 flex-none items-center justify-center rounded-[11px] bg-ink text-[18px] font-extrabold text-brand-300">
        {monogramLetter(shopName, slug)}
      </span>
      <span className="min-w-0 flex-1 text-[14px]">
        {onIphone ? t('inIosTitle', { shop: shopName }) : t('inTitle', { shop: shopName })}
        <span className="block text-[13px] text-fg-muted">
          {onIphone ? t('inIosSteps') : t('inSub')}
        </span>
      </span>
      {onIphone ? null : (
        <Button size="sm" onClick={onInstall}>
          {t('inBtn')}
        </Button>
      )}
    </div>
  );
}
