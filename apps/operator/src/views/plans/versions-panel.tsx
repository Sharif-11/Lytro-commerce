import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { usePlanVersions } from '@/api/plans';
import { LoadFailed } from '@/components/ui/load-failed';
import { Panel } from '@/components/ui/panel';
import { NOTE } from '@/components/ui/sizes';
import { StatusChip } from '@/components/ui/status-chip';
import { formatDay } from '@/lib/format';
import { limitLabelKey } from '@/lib/limit-keys';
import { limitValue } from '@/lib/limit-words';
import type { OperatorPlan } from '@/types/operator';
import { shopsOn, versionLines, type VersionChange, type VersionLine } from './plan-history';

function useChangeWords(): (change: VersionChange) => string {
  const { t } = useTranslation();
  return (change) => {
    switch (change.kind) {
      case 'limit':
        return `${t(limitLabelKey(change.key))} ${limitValue(change.from, t)} → ${limitValue(change.to, t)}`;
      case 'feature':
        return `${change.key} ${t(change.on ? 'common.on' : 'common.off')}`;
      case 'name':
        return `${change.from} → ${change.to}`;
      case 'rank':
        return `${t('plans.rank')} ${String(change.from)} → ${String(change.to)}`;
      case 'sale':
        return t(change.on ? 'plans.forSale' : 'plans.notForSale');
    }
  };
}

function Line({ line }: { line: VersionLine }): React.JSX.Element {
  const { t } = useTranslation();
  const changeWords = useChangeWords();
  const detail = line.changes
    ? line.changes.map(changeWords).join(' · ') || t('plans.noChange')
    : `${t('limits.products')} ${limitValue(line.limits.products, t)} · ${t('limits.orders_handled_monthly')} ${limitValue(line.limits.orders_handled_monthly, t)}`;
  return (
    <div className="flex flex-col gap-0.5 border-t border-line px-4 py-3 first:border-t-0">
      <span className="text-[15px] font-medium">
        {t('plans.versionLine', { v: line.version, name: line.name, d: formatDay(line.at) })}{' '}
        {line.current ? (
          <StatusChip tone="ok" plain>
            {t('plans.current')}
          </StatusChip>
        ) : null}
      </span>
      <span className="text-[13px] text-fg-muted">{detail}</span>
    </div>
  );
}

/** PLN-02: each version, what it changed, and how many shops sit on it. Prices aren't versioned, so aren't here. */
export function VersionsPanel({
  plan,
  onClose,
}: {
  plan: OperatorPlan;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const versions = usePlanVersions(plan.id);
  const lines = versions.data ? versionLines(plan, versions.data) : [];
  const onEach = lines
    .map((line) => {
      const shops = plan.shopsByVersion.find((each) => each.version === line.version)?.shops ?? 0;
      return `v${String(line.version)} ×${String(shops)}`;
    })
    .join(' · ');
  return (
    <Panel
      open
      title={t('plans.versions')}
      sub={plan.name}
      onClose={onClose}
      footerInRow
      footer={
        <Button
          type="button"
          tone="outline"
          small
          fit
          className="flex-1 sm:flex-none"
          onClick={onClose}
        >
          {t('common.close')}
        </Button>
      }
    >
      {versions.isError ? (
        <LoadFailed
          onRetry={() => {
            void versions.refetch();
          }}
        />
      ) : versions.isLoading ? (
        <span className="skel w-3/5" />
      ) : (
        <>
          <div className="flex flex-col rounded-lg border border-line">
            {lines.map((line) => (
              <Line key={line.version} line={line} />
            ))}
          </div>
          <div className={NOTE}>
            {t('plans.shopsCount', { count: shopsOn(plan) })} · {onEach}
          </div>
        </>
      )}
    </Panel>
  );
}
