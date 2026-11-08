import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { formatTakaExact } from '@lytronix/ui';
import { CourierKey, Permission, RateKey } from '@lytronix/validators';
import { useCurrentRates } from '@/api/balance';
import { useCourierConnections } from '@/api/couriers';
import { useFraudRule, useSaveFraudRule } from '@/api/fraud';
import { Icon } from '@/components/icon';
import { ActionBar } from '@/components/ui/action-bar';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { Field } from '@/components/ui/field';
import { RowLead, RowList } from '@/components/ui/list-row';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatusTag } from '@/components/ui/status-tag';
import { Switch } from '@/components/ui/switch';
import { useErrorText } from '@/hooks/use-error-text';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';

/** A smallest amount as typed: whole taka or up to two decimals, above nothing. */
const AMOUNT = /^\d{1,9}(\.\d{1,2})?$/;

/** The rule's smallest amount as the field shows it: `500` for `500.00`. */
const amountText = (amount: string | null): string =>
  amount === null ? '' : String(Number(amount));

/**
 * Settings › Fake order check (TENANT-DASHBOARD-DESIGN §7.40, Part 37's `p37-fraud-rule`; FRD-05, D7-50): every new COD
 * order's phone checked by itself, from a smallest amount if one is set; where the figures come from; and what a check
 * costs. Staff who may read but not change it see the rule without the switch or Save.
 */
export function FraudRuleView(): React.JSX.Element {
  const { t } = useTranslation('menu');
  const { slug, viewer, showToast } = useShell();
  const errorText = useErrorText();
  const ro = !allows(viewer, [Permission.FraudManage]);
  const rule = useFraudRule();
  const save = useSaveFraudRule();
  const readsCouriers = allows(viewer, [Permission.CouriersManage, Permission.OrdersManage]);
  const couriers = useCourierConnections({ enabled: readsCouriers });
  const rates = useCurrentRates({ enabled: allows(viewer, [Permission.BalanceRead]) });
  const [on, setOn] = useState(true);
  const [min, setMin] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!rule.data) return;
    setOn(rule.data.codOrders);
    setMin(amountText(rule.data.minAmount));
  }, [rule.data]);

  const steadfast = couriers.data?.some((each) => each.courierKey === CourierKey.Steadfast);
  const rate = rates.data?.find((each) => each.key === RateKey.FraudCheck)?.value ?? null;
  const submit = (): void => {
    const typed = min.trim();
    if (typed && (!AMOUNT.test(typed) || Number(typed) <= 0)) {
      setProblem(t('p37FrRuleMinBad'));
      return;
    }
    setProblem(null);
    save.mutate(
      { codOrders: on, minAmount: on && typed ? typed : null },
      {
        onSuccess: () => {
          showToast(t('p37FrRuleSaved'));
        },
        onError: (error) => {
          const fields = error instanceof ApiClientError ? error.fieldProblems() : {};
          setProblem(fields.minAmount ?? null);
          if (!fields.minAmount) showToast(errorText(error));
        },
      },
    );
  };

  return (
    <ShellPage>
      <p className="text-[14px] text-fg-muted">{t('p37FrRuleLead')}</p>
      {ro ? <Banner tone="neutral">{t('p37FrRuleRo')}</Banner> : null}
      {rule.isError ? <Banner tone="bad">{errorText(rule.error)}</Banner> : null}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_340px] lg:items-start [&>*]:min-w-0">
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3">
            {rule.isPending ? (
              <SkeletonRows count={2} />
            ) : (
              <>
                <div className="flex min-h-[52px] items-start gap-3">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[16px] font-medium">{t('p37FrRuleOn')}</span>
                    <span className="text-[14px] text-fg-muted">{t('p37FrRuleOnD')}</span>
                  </span>
                  {ro ? (
                    <StatusTag tone={on ? 'ok' : 'neutral'}>
                      {on ? t('p37On') : t('p37Off')}
                    </StatusTag>
                  ) : (
                    <Switch
                      checked={on}
                      label={t('p37FrRuleOn')}
                      onChange={(next) => {
                        setOn(next);
                        setProblem(null);
                      }}
                    />
                  )}
                </div>
                {on ? (
                  <Field
                    label={t('p37FrRuleMin')}
                    prefix="৳"
                    inputMode="decimal"
                    value={min}
                    readOnly={ro}
                    placeholder={t('p37EveryOrder')}
                    help={t('p37FrRuleMinD')}
                    error={problem}
                    onChange={(event) => {
                      setMin(event.target.value);
                      setProblem(null);
                    }}
                  />
                ) : (
                  <p className="text-[14px] text-fg-muted">{t('p37FrRuleOffD')}</p>
                )}
              </>
            )}
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card flush>
            <div className="px-4 pt-3.5 pb-1">
              <h3 className="text-[16px] font-semibold">{t('p37FrSources')}</h3>
            </div>
            <RowList>
              <div className="flex min-h-14 items-center gap-3 px-4 py-3">
                <RowLead>
                  <Icon name="truck" />
                </RowLead>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[16px] font-medium">{t('p37FrSrcSf')}</span>
                  <span className="text-[14px] text-fg-muted">
                    {steadfast === false ? t('p37FrSrcSfNo') : t('p37FrSrcSfD')}
                  </span>
                </span>
                {steadfast === true ? (
                  <StatusTag tone="ok">{t('p37Connected')}</StatusTag>
                ) : steadfast === false && allows(viewer, [Permission.CouriersManage]) ? (
                  <Link
                    to="/$shop/settings/couriers"
                    params={{ shop: slug }}
                    className={buttonClass('outline', 'xs')}
                  >
                    {t('p37Connect')}
                  </Link>
                ) : null}
              </div>
              <div className="flex min-h-14 items-center gap-3 px-4 py-3">
                <RowLead>
                  <Icon name="orders" />
                </RowLead>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[16px] font-medium">{t('p37FrSrcOwn')}</span>
                  <span className="text-[14px] text-fg-muted">{t('p37FrSrcOwnD')}</span>
                </span>
              </div>
            </RowList>
            <p className="px-4 pt-2 pb-3.5 text-[14px] text-fg-muted">{t('p37FrSrcOthers')}</p>
          </Card>
          {rate !== null ? (
            <Card>
              <h3 className="text-[16px] font-semibold">{t('p37RepCost')}</h3>
              <p className="mt-1 text-[14px] text-fg-muted">
                {Number(rate) === 0
                  ? t('p37FrCostD')
                  : t('p37FrCostRate', { c: formatTakaExact(rate) })}
              </p>
            </Card>
          ) : null}
        </div>
      </div>
      {ro || !rule.isSuccess ? null : (
        <ActionBar>
          <Button busy={save.isPending} onClick={submit}>
            {t('save')}
          </Button>
        </ActionBar>
      )}
    </ShellPage>
  );
}
