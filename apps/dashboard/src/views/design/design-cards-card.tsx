import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { useSetDesignCards, useStorefrontCards } from '@/api/storefront-design';
import { ErrorBanner } from '@/components/error-banner';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { Switch } from '@/components/ui/switch';
import { isShown, modesOf } from './card-order';
import { EditorIcon } from './editor-icon';

/**
 * The design page's "Products in your shop" (STOREFRONT-BUILDER-PLAN DC-2, DC-6; the sketch's `e-cards`): the switch for
 * each design as its own card -- live at once, not part of the draft -- three of the shop's first cards as an example,
 * and the way into the Product list.
 */
export function DesignCardsCard({
  slug,
  onSwitched,
}: {
  slug: string;
  onSwitched: (on: boolean) => void;
}) {
  const { t } = useTranslation('menu');
  const cards = useStorefrontCards();
  const turn = useSetDesignCards();
  const on = cards.data?.designCards ?? true;
  const modes = cards.data ? modesOf(cards.data.cards) : {};
  const first = (cards.data?.cards ?? [])
    .filter((card) => isShown(card, modes) && card.active)
    .slice(0, 3);
  return (
    <Card>
      <h2 className="text-[15.5px] font-bold">{t('plCardsTitle')}</h2>
      {turn.isError ? <ErrorBanner error={turn.error} /> : null}
      <div className="mt-1 flex items-center gap-3 py-1">
        <span className="min-w-0 flex-1">
          <b className="block text-[14.5px] font-bold">{t('plSwitch')}</b>
          <span className="text-[12.5px] text-fg-muted">{t('plSwitchLine')}</span>
        </span>
        <Switch
          checked={on}
          label={t('plSwitch')}
          disabled={!cards.data || turn.isPending}
          onChange={(next) => {
            turn.mutate(next, {
              onSuccess: () => {
                onSwitched(next);
              },
            });
          }}
        />
      </div>
      {first.length > 0 ? (
        <div className="mt-1.5 mb-3 flex gap-2">
          {first.map((card) => (
            <div key={`${card.productId}:${card.designId ?? ''}`} className="min-w-0 flex-1">
              {card.image ? (
                <img
                  src={card.image.urls.thumbnail}
                  alt=""
                  className="block aspect-[4/5] w-full rounded-[8px] object-cover"
                />
              ) : (
                <span className="block aspect-[4/5] w-full rounded-[8px] bg-neutral-100" />
              )}
              <div className="mt-1 truncate text-[11.5px] font-semibold">{card.name}</div>
              <div className="text-[11.5px] text-fg-muted">
                {card.price === null ? '' : formatTaka(card.price)}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <p className="mb-2.5 text-[12.5px] text-fg-muted">{t('plLive')}</p>
      <div className="flex flex-wrap items-center gap-2.5">
        <Link
          to="/$shop/settings/storefront/design/products"
          params={{ shop: slug }}
          className={buttonClass('outline', 'sm')}
        >
          <EditorIcon name="drag" size={18} />
          {t('plOpen')}
        </Link>
        <span className="text-[12.5px] text-fg-muted">{t('plOpenLine')}</span>
      </div>
    </Card>
  );
}
