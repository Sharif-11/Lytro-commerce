import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { Permission } from '@lytronix/validators';
import { useStockChecks } from '@/api/stock-checks';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { EmptyState } from '@/components/ui/empty-state';
import { RowList, rowClass } from '@/components/ui/list-row';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { useErrorText } from '@/hooks/use-error-text';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { StockCheckSummary } from '@/types/stock';
import { useCheckWords } from './check-words';

/** What a check came to: what was gained less what was lost, for someone who may see costs; null otherwise. */
function netOf(check: StockCheckSummary): number | null {
  const { valueGained, valueLost } = check.totals;
  if (valueGained === undefined || valueLost === undefined) return null;
  return Number(valueGained) - Number(valueLost);
}

/**
 * Stock checks (the prototype's `stock-checks`, Part 20's `stock-checks-empty`; INV-07): the shop's counts, newest
 * first -- its own number, when and by whom, its note, how many lines and how many changed, and what it came to (for
 * someone who may see costs) or Matched -- each opening its own page; New check for someone who may change stock.
 */
export function StockChecksView(): React.JSX.Element {
  const { t } = useTranslation('shop');
  const errorText = useErrorText();
  const { slug, viewer } = useShell();
  const mayManage = allows(viewer, [Permission.InventoryManage]);
  const list = useStockChecks();
  const words = useCheckWords();
  const checks = (list.data?.pages ?? []).flatMap((page) => page.checks);

  const newCheck = (withIcon: boolean) =>
    mayManage ? (
      <Link
        to="/$shop/stock/checks/new"
        params={{ shop: slug }}
        className={buttonClass('primary', 'sm')}
      >
        {withIcon ? <Icon name="plus" /> : null}
        {t('newCheck')}
      </Link>
    ) : null;

  return (
    <ShellPage actions={newCheck(true)}>
      {list.isError ? <Banner tone="bad">{errorText(list.error)}</Banner> : null}
      {list.isPending ? (
        <Card flush>
          <SkeletonRows count={3} />
        </Card>
      ) : checks.length === 0 && list.isSuccess ? (
        <Card>
          <EmptyState icon="list" action={newCheck(false) ?? undefined}>
            {t('checksNone')}
          </EmptyState>
        </Card>
      ) : (
        <Card flush>
          <RowList>
            {checks.map((check) => {
              const net = netOf(check);
              const when = [words.when(check.createdAt), check.note].filter(Boolean).join(' · ');
              return (
                <Link
                  key={check.id}
                  to="/$shop/stock/checks/$checkId"
                  params={{ shop: slug, checkId: check.id }}
                  className={rowClass}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[16px] font-medium">
                      <span className="num mr-1.5 font-semibold text-fg-muted">
                        #{String(check.number)}
                      </span>
                      {when}
                    </span>
                    <span className="truncate text-[14px] text-fg-muted">
                      {[
                        check.actor?.name ? t('checkBy', { name: check.actor.name }) : null,
                        t('linesN', { count: check.totals.lines }),
                        t('changedOf', { count: check.totals.changed }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  {check.totals.changed === 0 ? (
                    <StatusTag tone="neutral">{t('checkMatched')}</StatusTag>
                  ) : net !== null ? (
                    <StatusTag tone={net < 0 ? 'bad' : 'ok'}>
                      <span className="num">
                        {net < 0 ? '−' : '+'}
                        {formatTaka(Math.abs(net))}
                      </span>
                    </StatusTag>
                  ) : null}
                </Link>
              );
            })}
          </RowList>
        </Card>
      )}
      {list.hasNextPage ? (
        <Button
          tone="outline"
          wide
          busy={list.isFetchingNextPage}
          onClick={() => {
            void list.fetchNextPage();
          }}
        >
          {t('plMore')}
        </Button>
      ) : null}
    </ShellPage>
  );
}
