import { useTranslation } from 'react-i18next';
import { PACK_AUTO_BUY_CAP, UsageMetric } from '@lytronix/validators';
import { useAddonOffers, useSetAutoBuy } from '@/api/addons';
import { ErrorBanner } from '@/components/error-banner';
import { Card } from '@/components/ui/card';
import { formatDayMonth } from '@/lib/dates';
import type { ShopUsage } from '@/types/usage';
import { SwitchNote, SwitchRow } from './usage-parts';
import { isServing, packOffer, packSize, type PackMetric } from './usage-words';

const WORDS: Record<PackMetric, string> = {
  [UsageMetric.Requests]: 'pkAutoReq',
};

/**
 * PLN-15, RTE-11 (agreed for Slice 11.5c): a switch for each metric with packs, as the server keeps them, each
 * naming its pack, with what auto-buy did this cycle under it, and the line under them (`help`). Shown while the shop
 * can buy packs -- on Usage, on Add-ons, and in the pack sheet (`inSheet`, the sketch's grey card).
 */
export function AutoBuyCard({
  usage,
  canManage,
  help,
  inSheet = false,
}: {
  usage: ShopUsage;
  canManage: boolean;
  help: 'uAutoBuyHelp' | 'pkCap';
  inSheet?: boolean;
}): React.JSX.Element | null {
  const { t, i18n } = useTranslation('money');
  const offers = useAddonOffers();
  const setAutoBuy = useSetAutoBuy();
  const rows = usage.packs.filter((pack) => pack.offer !== null);
  if (rows.length === 0) return null;
  return (
    <Card className={`flex flex-col ${inSheet ? 'gap-0.5 bg-neutral-50' : 'gap-1'}`}>
      <h3 className={`mb-1 font-semibold ${inSheet ? 'text-[14px]' : 'text-[17px]'}`}>
        {t('pkAuto')}
      </h3>
      {rows.map((pack) => {
        if (!isServing(pack.metric)) return null;
        const offer = packOffer(offers.data ?? [], pack.metric);
        const label = t(WORDS[pack.metric], {
          size: offer ? packSize(offer.addon, i18n.language) : '',
        });
        return (
          <div key={pack.metric}>
            <SwitchRow
              label={label}
              checked={pack.autoBuy}
              disabled={!canManage || setAutoBuy.isPending}
              onChange={(next) => {
                setAutoBuy.mutate({ requests: next });
              }}
            />
            {pack.autoBuy && pack.autoBuyFailed ? (
              <SwitchNote bad>{t('uAbFailedShort')}</SwitchNote>
            ) : pack.autoBuy && pack.autoPacks >= PACK_AUTO_BUY_CAP ? (
              <SwitchNote bad={false}>
                {t('uAbCapped', { cap: PACK_AUTO_BUY_CAP, date: formatDayMonth(usage.cycleEnd) })}
              </SwitchNote>
            ) : null}
          </div>
        );
      })}
      {setAutoBuy.isError ? <ErrorBanner error={setAutoBuy.error} /> : null}
      <p className="text-[14px] text-fg-muted">{t(help)}</p>
    </Card>
  );
}
