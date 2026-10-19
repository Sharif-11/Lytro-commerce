import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { createShopSchema } from '@lytronix/validators';
import { useCreateShop } from '@/api/auth';
import { ApiClientError } from '@/api/client';
import { errorMessage } from '@/api/error-message';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Notice, ErrorBanner } from '@/components/ui/notice';
import { StepFrame } from '@/components/ui/step-frame';
import { TextField } from '@/components/ui/text-field';
import { appConfig } from '@/lib/app-config';
import { shopSlug } from '@/lib/slug';
import { signUpIntent } from '@/session/sign-up-intent';

/**
 * Step 2 (AUTH-10, 11, 28; TEN-26, 31): shop name, the link pre-filled from the claimed address or the
 * name's Latin letters with both addresses previewed, owner name, optional address. A taken link comes
 * back as a field error with the next free suggestion as a one-tap chip; the AUTH-30 refusal is one plain
 * message that keeps everything typed. Availability is checked by the server at submit: the backend has no
 * live-check endpoint yet, so the client checks format and reserved names as the owner types.
 */
export function CreateShop(): React.JSX.Element {
  const { t } = useTranslation();
  const claimed = signUpIntent.read().shop;
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [address, setAddress] = useState(claimed ?? '');
  // Once the owner edits the link, the name's live suggestion stops overwriting it.
  const [addressTouched, setAddressTouched] = useState(claimed !== null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [suggestion, setSuggestion] = useState<string | null>(null);

  const mutation = useCreateShop();
  const verdict = shopSlug.verdict(address);

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const input = {
      ownerName: ownerName.trim(),
      shopName: shopName.trim(),
      address: address === '' ? undefined : address,
    };
    const errors: Record<string, string> = {};
    if (input.shopName.length === 0) errors.shopName = t('createShop.required');
    if (input.ownerName.length === 0) errors.ownerName = t('createShop.required');
    if (verdict === 'invalid') errors.address = t('createShop.linkInvalid');
    if (verdict === 'reserved') errors.address = t('createShop.linkReserved');
    if (Object.keys(errors).length === 0 && !createShopSchema.safeParse(input).success) {
      errors.shopName = t('createShop.tooLong');
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSuggestion(null);
    mutation.mutate(input, {
      onError: (error) => {
        if (error instanceof ApiClientError) {
          const problems = error.fieldProblems();
          if (problems.address) {
            setFieldErrors({ address: problems.address });
            setSuggestion(shopSlug.nextSuggestion(address));
          }
        }
      },
    });
  }

  const refused =
    mutation.isError &&
    mutation.error instanceof ApiClientError &&
    (mutation.error.code === 'rate_limited' || mutation.error.code === 'forbidden');
  const taken =
    mutation.isError &&
    mutation.error instanceof ApiClientError &&
    mutation.error.code === 'conflict';
  const otherError = mutation.isError && !refused && !fieldErrors.address && !taken;

  return (
    <StepFrame step="shop" title={t('createShop.title')} lead={t('createShop.lead')}>
      <form className="space-y-5" onSubmit={handleSubmit}>
        <TextField
          label={t('createShop.shopNameLabel')}
          name="shopName"
          autoComplete="organization"
          maxLength={60}
          value={shopName}
          onChange={(event) => {
            const value = event.target.value;
            setShopName(value);
            if (!addressTouched) setAddress(shopSlug.suggest(value));
          }}
          error={fieldErrors.shopName}
        />

        <div>
          <TextField
            label={t('createShop.linkLabel')}
            name="address"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
            placeholder="your-shop"
            suffix={`.${appConfig.platformDomain}`}
            value={address}
            onChange={(event) => {
              setAddressTouched(true);
              setSuggestion(null);
              setAddress(shopSlug.normaliseTyping(event.target.value));
            }}
            error={fieldErrors.address}
            hint={
              verdict === 'ok' ? (
                <span className="inline-flex items-center gap-1 font-semibold text-success">
                  <Icon name="check" size={14} strokeWidth={3} />
                  {t('createShop.linkLooksGood')}
                </span>
              ) : verdict === 'reserved' ? (
                t('createShop.linkReserved')
              ) : verdict === 'invalid' ? (
                t('createShop.linkRule')
              ) : (
                t('createShop.linkRule')
              )
            }
          />
          {suggestion ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[14px] text-neutral-700">
              {t('createShop.tryInstead')}
              <Chip
                onClick={() => {
                  setAddress(suggestion);
                  setSuggestion(null);
                  setFieldErrors({});
                }}
              >
                {suggestion}
              </Chip>
            </div>
          ) : null}
          {address.length > 0 ? (
            <dl className="num mt-3 space-y-1 rounded-control bg-neutral-50 px-3.5 py-3 text-[14px]">
              <div className="flex flex-wrap justify-between gap-x-3">
                <dt className="text-neutral-700">{t('createShop.customerAddress')}</dt>
                <dd className="font-semibold break-all text-ink">{appConfig.shopHost(address)}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-x-3">
                <dt className="text-neutral-700">{t('createShop.dashboardAddress')}</dt>
                <dd className="font-semibold break-all text-ink">
                  {appConfig.dashboardAddress(address)}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>

        <TextField
          label={t('createShop.ownerNameLabel')}
          name="ownerName"
          autoComplete="name"
          maxLength={60}
          value={ownerName}
          onChange={(event) => {
            setOwnerName(event.target.value);
          }}
          error={fieldErrors.ownerName}
        />

        {refused ? <Notice tone="warning">{t('createShop.refused')}</Notice> : null}
        {taken ? <Notice tone="warning">{t('createShop.alreadyHasShop')}</Notice> : null}
        {otherError ? <ErrorBanner message={errorMessage(mutation.error, t)} /> : null}

        {address.length > 0 && verdict === 'ok' ? (
          <p className="num text-[14px] text-neutral-700">
            {t('createShop.finalAddress')}{' '}
            <strong className="text-ink">{appConfig.shopHost(address)}</strong>{' '}
            {t('createShop.finalAddressNote')}
          </p>
        ) : null}

        <Button type="submit" loading={mutation.isPending}>
          {t('createShop.submit')}
        </Button>
      </form>
    </StepFrame>
  );
}
