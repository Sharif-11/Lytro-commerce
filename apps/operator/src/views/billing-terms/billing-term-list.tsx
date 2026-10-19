import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/chip';
import { Card, EmptyLine } from '@/components/ui/fields';
import { formatDate } from '@/lib/dates';
import type { BillingTerm } from '@/types/operator';

interface BillingTermListProps {
  terms: BillingTerm[];
  onEdit: (term: BillingTerm) => void;
  onRetire: (term: BillingTerm) => void;
  onDelete: (term: BillingTerm) => void;
}

/** Every term in display order; retired ones stay listed, muted, since invoices still name them. */
export function BillingTermList({
  terms,
  onEdit,
  onRetire,
  onDelete,
}: BillingTermListProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  if (terms.length === 0) return <EmptyLine>{t('billingTerms.empty')}</EmptyLine>;

  const sorted = [...terms].sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <Card className="divide-y divide-line !p-0">
      {sorted.map((term) => {
        const retired = term.retiredAt !== null;
        return (
          <div
            key={term.id}
            className={`flex flex-wrap items-center gap-3 px-4 py-3.5 ${retired ? 'opacity-60' : ''}`}
          >
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-fg">
                {i18n.language === 'bn' ? term.labelBn : term.labelEn}
                <span className="font-normal text-fg-muted">
                  {i18n.language === 'bn' ? term.labelEn : term.labelBn}
                </span>
                {retired ? (
                  <Tag tone="neutral">
                    {t('billingTerms.retiredOn', {
                      date: formatDate(term.retiredAt ?? '', i18n.language),
                    })}
                  </Tag>
                ) : term.visible ? (
                  <Tag tone="brand">{t('billingTerms.visible')}</Tag>
                ) : (
                  <Tag tone="neutral">{t('billingTerms.hidden')}</Tag>
                )}
                {term.tenantId ? <Tag tone="accent">{t('billingTerms.singleTenant')}</Tag> : null}
              </p>
              <p className="num text-[13px] text-fg-muted">
                {t('billingTerms.monthsCount', { count: term.months })}
                {term.defaultDiscountPct
                  ? ` · ${t('billingTerms.discount', { pct: term.defaultDiscountPct })}`
                  : ''}
                {' · '}
                {t('billingTerms.orderLabel', { n: term.displayOrder })}
              </p>
            </div>
            {retired ? null : (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  tone="outline"
                  small
                  fit
                  onClick={() => {
                    onEdit(term);
                  }}
                >
                  {t('common.edit')}
                </Button>
                <Button
                  type="button"
                  tone="ghost"
                  small
                  fit
                  onClick={() => {
                    onRetire(term);
                  }}
                >
                  {t('billingTerms.retire')}
                </Button>
                <Button
                  type="button"
                  tone="danger"
                  small
                  fit
                  onClick={() => {
                    onDelete(term);
                  }}
                >
                  {t('common.delete')}
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}
