import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PaymentPolicy } from '@lytronix/validators';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { ChoiceList, ChoiceRow } from './choice-list';
import { usePolicyWords } from './stock-words';

/** The choices, the shop's default (null) first, as the prototype's `sh-policy` lists them. */
const CHOICES = [
  null,
  PaymentPolicy.None,
  PaymentPolicy.DeliveryChargeOnly,
  PaymentPolicy.PartialAdvance,
  PaymentPolicy.FullPrepayment,
] as const;

/** A whole or two-decimal amount, as a price is typed. */
const AMOUNT = /^\d+(\.\d{1,2})?$/;

/**
 * Payment policy (§7.4's sheet, the prototype's `sh-policy`; PRD-08): the shop's default with what it is now, no
 * advance, the delivery charge in advance, a partial advance with its amount, or the full price first. Applied to each
 * variant's own price. Done keeps the choice; a partial advance needs its amount.
 */
export function PolicySheet({
  open,
  policy,
  advance,
  shopDefault,
  onDone,
  onClose,
}: {
  open: boolean;
  policy: PaymentPolicy | null;
  advance: string;
  /** The shop's default, as the product form's defaults give it. */
  shopDefault: { defaultPaymentPolicy: PaymentPolicy; defaultAdvanceAmount: string | null } | null;
  onDone: (policy: PaymentPolicy | null, advance: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const words = usePolicyWords();
  const [chosen, setChosen] = useState<PaymentPolicy | null>(policy);
  const [amount, setAmount] = useState(advance);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChosen(policy);
    setAmount(advance);
    setTried(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const partial = chosen === PaymentPolicy.PartialAdvance;
  const missing = partial && !AMOUNT.test(amount.trim());
  return (
    <Sheet
      open={open}
      title={t('policyTitle')}
      onClose={onClose}
      footer={
        <Button
          wide
          onClick={() => {
            setTried(true);
            if (!missing) onDone(chosen, partial ? amount.trim() : '');
          }}
        >
          {t('done')}
        </Button>
      }
    >
      {open ? (
        <div className="flex flex-col gap-3">
          <ChoiceList label={t('policyTitle')}>
            {CHOICES.map((each) => (
              <ChoiceRow
                key={each ?? 'shop'}
                on={chosen === each}
                title={each === null ? t('policyShop') : words.name(each)}
                sub={
                  each === null && shopDefault
                    ? t('policyNow', {
                        policy: words.short(
                          shopDefault.defaultPaymentPolicy,
                          shopDefault.defaultAdvanceAmount,
                        ),
                      })
                    : each === PaymentPolicy.DeliveryChargeOnly
                      ? t('policyDeliveryHint')
                      : undefined
                }
                onChoose={() => {
                  setChosen(each);
                }}
                trail={
                  // As drawn, the amount is there before the choice; typing it makes the choice.
                  each === PaymentPolicy.PartialAdvance ? (
                    <span
                      className={[
                        'flex h-10 w-[110px] flex-none items-center gap-1 rounded-control border bg-surface px-2',
                        tried && missing ? 'border-danger' : 'border-line-strong',
                      ].join(' ')}
                    >
                      <span className="font-medium text-fg-muted">৳</span>
                      <input
                        aria-label={t('advanceL')}
                        aria-invalid={tried && missing ? true : undefined}
                        inputMode="decimal"
                        value={amount}
                        placeholder="200"
                        className="num min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-muted"
                        onChange={(event) => {
                          setAmount(event.target.value);
                          setChosen(PaymentPolicy.PartialAdvance);
                        }}
                      />
                    </span>
                  ) : null
                }
              />
            ))}
          </ChoiceList>
          {tried && missing ? (
            <p role="alert" className="text-[13px] font-medium text-danger-text">
              {t('errAdvance')}
            </p>
          ) : null}
          <p className="text-[14px] text-fg-muted">{t('policyHint')}</p>
        </div>
      ) : null}
    </Sheet>
  );
}
