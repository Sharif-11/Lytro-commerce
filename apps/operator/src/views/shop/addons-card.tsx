import { useTranslation } from 'react-i18next';
import { AddonKind, AddonRenewal } from '@lytronix/validators';
import { useShopAddons } from '@/api/shops';
import { ConsoleCard } from '@/components/ui/console-page';
import { CardList, LIST_ROW, RowLines } from '@/components/ui/list-row';
import { StatusChip, type ChipTone } from '@/components/ui/status-chip';
import { formatDay, taka } from '@/lib/format';
import { limitValue } from '@/lib/limit-words';
import type { LimitPart, ShopAddon, ShopPack } from '@/types/operator';

const BYTES_PER_GB = 1024 ** 3;
const MB_PER_GB = 1024;

const KIND_TONES: Record<AddonKind, ChipTone> = {
  [AddonKind.Limit]: 'info',
  [AddonKind.Pack]: 'warn',
  [AddonKind.Feature]: 'ok',
  [AddonKind.Allowance]: 'ok',
};

/** The limits the card names, with how each is written. */
const SHOWN_LIMITS: { key: string; wordKey: string; unit?: (value: number) => string }[] = [
  { key: 'products', wordKey: 'shop.effectiveProducts' },
  { key: 'staff', wordKey: 'shop.effectiveStaff' },
  {
    key: 'storage_mb',
    wordKey: 'shop.effectiveStorage',
    unit: (value) => `${(value / MB_PER_GB).toLocaleString('en-US')} GB`,
  },
  {
    key: 'bandwidth_gb',
    wordKey: 'shop.effectiveBandwidth',
    unit: (value) => `${value.toLocaleString('en-US')} GB`,
  },
];

function AddonRow({ addon }: { addon: ShopAddon }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const renewal =
    addon.renewal === AddonRenewal.WithPlan
      ? t('shop.renewsWithPlan')
      : addon.renewal === AddonRenewal.FromBalance
        ? t('shop.renewsFromBalance')
        : null;
  return (
    <div className={LIST_ROW}>
      <RowLines
        wrap
        title={
          <>
            {i18n.language === 'bn' ? addon.labelBn : addon.labelEn}{' '}
            <span className="font-normal text-fg-muted tabular-nums">×{addon.quantity}</span>{' '}
            <StatusChip tone={KIND_TONES[addon.kind]} plain>
              {t(`addonKinds.${addon.kind}`)}
            </StatusChip>
          </>
        }
        detail={
          <>
            {t('shop.addonsUntil', { d: formatDay(addon.expiresAt) })} ·{' '}
            {renewal ?? <span className="text-warning">{t('shop.renewalOff')}</span>} ·{' '}
            {addon.paidFrom === 'wallet' ? t('shop.paidPage') : t('shop.paidBalance')} ·{' '}
            {taka(addon.monthlyPrice)}/{t('shop.perMonth')}
          </>
        }
      />
    </div>
  );
}

function PackRow({ pack }: { pack: ShopPack }): React.JSX.Element {
  const { t } = useTranslation();
  const isBandwidth = pack.metric === 'bandwidth';
  const left = isBandwidth
    ? `${(pack.left / BYTES_PER_GB).toLocaleString('en-US', { maximumFractionDigits: 1 })} GB`
    : pack.left.toLocaleString('en-US');
  return (
    <div className={LIST_ROW}>
      <RowLines
        wrap
        title={isBandwidth ? t('shop.packBandwidth') : t('shop.packRequests')}
        detail={`${t('shop.packLeft', { v: left })} · ${pack.autoBuy ? t('shop.autoOn') : t('shop.autoOff')}`}
      />
    </div>
  );
}

function EffectiveRow({
  part,
  wordKey,
  unit,
}: {
  part: LimitPart;
  wordKey: string;
  unit?: (value: number) => string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const write = (value: unknown): string =>
    unit && typeof value === 'number' ? unit(value) : limitValue(value, t);
  return (
    <div className={`${LIST_ROW} min-h-10! py-1.5!`}>
      <RowLines
        wrap
        title={
          <>
            {t(wordKey)}: <b className="font-semibold">{write(part.effective)}</b>
          </>
        }
        detail={
          <span className="tabular-nums">
            {part.overridden
              ? t('shop.effectiveOverride', { v: write(part.override) })
              : t('shop.effectivePlan', { v: write(part.plan) })}
            {part.addons ? ` · ${t('shop.effectiveAddons', { v: write(part.addons) })}` : ''}
          </span>
        }
      />
    </div>
  );
}

/** PLN-13: what the shop has bought on top of its plan, and what every check reads as a result. */
export function AddonsCards({ shopId }: { shopId: string }): React.JSX.Element {
  const { t } = useTranslation();
  const answer = useShopAddons(shopId);
  const data = answer.data;
  const held = (data?.addons.length ?? 0) + (data?.packs.length ?? 0);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <ConsoleCard>
        <h2 className="mb-1 text-[16px] font-semibold">{t('shop.addons')}</h2>
        <div className="text-[13px] text-fg-muted">{t('shop.addonsHint')}</div>
        {data && held === 0 ? (
          <div className="mt-2 text-[13px] text-fg-muted">{t('shop.noAddons')}</div>
        ) : (
          <CardList>
            {data?.addons.map((addon) => (
              <AddonRow key={addon.id} addon={addon} />
            ))}
            {data?.packs.map((pack) => (
              <PackRow key={pack.metric} pack={pack} />
            ))}
          </CardList>
        )}
      </ConsoleCard>
      <ConsoleCard>
        <h2 className="mb-1 text-[16px] font-semibold">{t('shop.effective')}</h2>
        <div className="text-[13px] text-fg-muted">{t('shop.effectiveHint')}</div>
        <CardList>
          {SHOWN_LIMITS.map(({ key, wordKey, unit }) => {
            const part = data?.limits.find((each) => each.key === key);
            return part ? (
              <EffectiveRow key={key} part={part} wordKey={wordKey} unit={unit} />
            ) : null;
          })}
        </CardList>
      </ConsoleCard>
    </div>
  );
}
