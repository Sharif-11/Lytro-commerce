import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AddonKind } from '@lytronix/validators';
import { formatTaka } from '@lytronix/ui';
import { useSetAddonRenewal } from '@/api/addons';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { StatusTag } from '@/components/ui/status-tag';
import { Switch } from '@/components/ui/switch';
import { useErrorText } from '@/hooks/use-error-text';
import { formatDayMonth } from '@/lib/dates';
import type { ShopAddon, ShopPack } from '@/types/addons';
import type { UsageFigure } from '@/types/usage';
import {
  limitValue,
  limitWithout,
  nameOf,
  packLeft,
  packMetric,
  renewalLine,
  switchable,
  type AddonLine,
} from './addon-words';

// What turning each kind's renewal off says will happen (LIM-03), by the limit it raises.
const CONSEQUENCE: Record<string, string> = {
  products: 'arCons',
  staff: 'arConsSeat',
  storage_mb: 'arConsStorage',
};

/**
 * PLN-14: an add-on's renewal switch. On, it renews at once; off, the dialog first says when it ends and what happens
 * to what is over the limit then (`sh-addon-renew-off`), with the limit it returns to from the shop's own figures.
 */
export function RenewalSwitch({
  owned,
  figures,
  disabled,
}: {
  owned: ShopAddon;
  figures: readonly UsageFigure[];
  disabled: boolean;
}): React.JSX.Element {
  const { t, i18n } = useTranslation('money');
  const errorText = useErrorText();
  const setRenewal = useSetAddonRenewal();
  const [asking, setAsking] = useState(false);
  const name = nameOf(owned, i18n.language);
  const date = formatDayMonth(owned.expiresAt);
  const move = limitWithout(owned, figures);
  const consequence =
    owned.kind === AddonKind.Feature
      ? t('arConsBrand', { name, date })
      : t(CONSEQUENCE[owned.limitKey ?? ''] ?? 'arCons', {
          name,
          date,
          limit: move ? limitValue(move.limitKey, move.to) : '',
        });
  return (
    <>
      <Switch
        checked={owned.renews}
        label={`${t('aoRenew')} · ${name}`}
        disabled={disabled || setRenewal.isPending}
        onChange={(next) => {
          if (next) setRenewal.mutate({ id: owned.id, renews: true });
          else setAsking(true);
        }}
      />
      <Dialog
        open={asking}
        title={t('arTitle')}
        onClose={() => {
          setAsking(false);
        }}
        actions={
          <>
            <Button
              tone="outline"
              onClick={() => {
                setAsking(false);
              }}
            >
              {t('keep')}
            </Button>
            <Button
              tone="danger"
              busy={setRenewal.isPending}
              onClick={() => {
                setRenewal.mutate(
                  { id: owned.id, renews: false },
                  {
                    onSuccess: () => {
                      setAsking(false);
                    },
                  },
                );
              }}
            >
              {t('arBtn')}
            </Button>
          </>
        }
      >
        {consequence}
        {setRenewal.isError ? (
          <span className="mt-2 block text-danger">{errorText(setRenewal.error)}</span>
        ) : null}
      </Dialog>
    </>
  );
}

/** Where a row stands: a trial buys nothing, grace renews first, read-only staff only look. */
export interface RowContext {
  trial: boolean;
  /** In grace what the shop has keeps working until the grace ends, which the banner says, so a row shows no end. */
  grace: boolean;
  canManage: boolean;
  planName: string;
  packs: readonly ShopPack[];
  figures: readonly UsageFigure[];
  /** The add-on whose wallet payment is being checked. */
  checkingKey: string | null;
}

/**
 * One add-on (the prototype's `.addon`): its name, its facts -- Active, how many, until when, how it renews or why
 * not, a pack's rest -- its price a month or a pack, and its one action: Buy, the renewal switch, or why neither.
 */
export function AddonRow({
  line,
  context,
  onBuy,
}: {
  line: AddonLine;
  context: RowContext;
  onBuy: (line: AddonLine) => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation('money');
  const { addon, offer, owned } = line;
  const pack = addon.kind === AddonKind.Pack;
  const metric = packMetric(addon);
  const rest = pack && metric ? context.packs.find((each) => each.metric === metric) : undefined;
  const packActive = rest !== undefined && rest.left > 0;
  const active = owned !== null || packActive;
  const checking = context.checkingKey === addon.key && !active;
  const inPlan = !active && offer?.blockedBy === 'AddonAlreadyActive';

  // The facts in their fixed order, each named.
  const facts: [string, ReactNode][] = [];
  if (checking)
    facts.push([
      'checking',
      <StatusTag tone="warn" small>
        {t('blChecking')}
      </StatusTag>,
    ]);
  if (active)
    facts.push([
      'active',
      <StatusTag tone="ok" small>
        {t('aoActive')}
      </StatusTag>,
    ]);
  if (owned && owned.quantity > 1) {
    facts.push(['quantity', <span className="num">{t('aoQty', { count: owned.quantity })}</span>]);
  }
  if (owned && !context.grace) {
    facts.push([
      'ends',
      <span className="num">{t('aoEnds', { date: formatDayMonth(owned.expiresAt) })}</span>,
    ]);
  }
  if (packActive) facts.push(['left', <span className="num">{packLeft(rest, t)}</span>]);
  if (owned && !pack) {
    const renewal = renewalLine(owned, t, context.planName);
    facts.push([
      'renewal',
      <span className={renewal.warn ? 'text-warning' : undefined}>{renewal.text}</span>,
    ]);
  }
  if (!active && !checking && pack) facts.push(['carry', t('aoPackCarry')]);
  if (!active && !checking && addon.kind === AddonKind.Feature) {
    facts.push(['feature', inPlan ? t('aoInPlan') : t('aoBrandSub')]);
  }
  if (!active && offer?.blockedBy === 'AddonLimitUnlimited' && addon.limitKey) {
    facts.push([
      'unlimited',
      t('aoUnlimitedNote', { plan: context.planName, limit: t(`lim.${addon.limitKey}`) }),
    ]);
  }

  const action = ((): ReactNode => {
    if (context.trial) return <StatusTag tone="neutral">{t('aoNeedsPlan')}</StatusTag>;
    if (!context.canManage || checking || inPlan) return null;
    if (owned && !pack) {
      return switchable(owned) ? (
        <RenewalSwitch owned={owned} figures={context.figures} disabled={false} />
      ) : null;
    }
    if (offer?.blockedBy === 'AddonNotAvailable') {
      return <StatusTag tone="neutral">{t('aoRenewFirst')}</StatusTag>;
    }
    if (offer?.blockedBy !== null) return null;
    return (
      <Button
        size="xs"
        onClick={() => {
          onBuy(line);
        }}
      >
        {t('aoBuy')}
      </Button>
    );
  })();

  return (
    <div className="flex items-center gap-3 border-line px-4 py-3 [&+&]:border-t">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{nameOf(addon, i18n.language)}</span>
        {facts.length > 0 ? (
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] text-fg-muted">
            {facts.map(([key, fact]) => (
              <span key={key}>{fact}</span>
            ))}
          </span>
        ) : null}
      </span>
      {addon.price ? (
        <span className="num font-bold whitespace-nowrap">
          {formatTaka(addon.price)}
          {pack ? '' : t('aoMonth')}
        </span>
      ) : null}
      {action}
    </div>
  );
}
