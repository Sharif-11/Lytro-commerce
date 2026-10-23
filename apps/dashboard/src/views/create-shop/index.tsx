import { useState, type SyntheticEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { NAME_MAX_LENGTH, SLUG_MAX_LENGTH, SLUG_MIN_LENGTH } from '@lytronix/validators';
import { ApiClientError } from '@lytronix/api-client';
import { useCreateShop } from '@/api/auth';
import { useMe } from '@/api/me';
import { useAddressCheck } from '@/api/shop-setup';
import { Icon } from '@/components/icon';
import { OnboardingFrame } from '@/components/onboarding/frame';
import { Notice } from '@/components/onboarding/notice';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useErrorText } from '@/hooks/use-error-text';
import { appConfig } from '@/lib/app-config';
import { shopSlug } from '@/lib/slug';
import { signUpIntent } from '@/session/sign-up-intent';

// How long typing rests before the address is asked about (AUTH-11's live verdict).
const TYPING_REST_MS = 400;

/**
 * Step 2 (AUTH-10, 11, 23, 28, 30; TEN-26, 31; the prototype's `ob-create`): the shop's name in any script, and its
 * link -- filled from the name's Latin letters as it is typed, until the owner edits it or brought one from the
 * website -- checked with the server as the owner pauses: free, or taken with the server's next free one to tap.
 * Both addresses are previewed. A refusal keeps everything typed (AUTH-30); an owner whose earlier shop was deleted is
 * told its balance comes along (LIF-21).
 */
export function CreateShop(): React.JSX.Element {
  const { t } = useTranslation('onboarding');
  const errorText = useErrorText();
  const me = useMe();
  const claimed = signUpIntent.read().shop;
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [address, setAddress] = useState(claimed ?? '');
  // Once the owner edits the link, or brought one from the website, the name stops filling it.
  const [addressTouched, setAddressTouched] = useState(claimed !== null);
  const [tried, setTried] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const settled = useDebouncedValue(address, TYPING_REST_MS);
  const wellFormed = shopSlug.isWellFormed(settled);
  const check = useAddressCheck(settled, { enabled: wellFormed });
  const create = useCreateShop();

  const resting = settled === address;
  const verdict = check.data && resting ? check.data : null;
  const free = verdict?.available === true;
  const taken = verdict?.available === false && verdict.reason === 'unavailable';
  const suggestion = taken ? verdict.suggestion : null;

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    setTried(true);
    const errors: Record<string, string> = {};
    if (shopName.trim() === '') errors.shopName = t('required');
    if (ownerName.trim() === '') errors.ownerName = t('required');
    if (address === '') errors.address = t('required');
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || !shopSlug.isWellFormed(address) || taken) return;
    create.mutate(
      { ownerName: ownerName.trim(), shopName: shopName.trim(), address },
      {
        onError: (error) => {
          // The address went between the check and the press: the field says so, and the check asks again.
          const problems = error instanceof ApiClientError ? error.fieldProblems() : {};
          if (problems.address) {
            setFieldErrors({ address: problems.address });
            void check.refetch();
          }
        },
      },
    );
  }

  const failure = create.error instanceof ApiClientError ? create.error : null;
  const refused = failure?.code === 'rate_limited' || failure?.code === 'forbidden';
  const otherFailure =
    create.isError && !refused && Object.keys(failure?.fieldProblems() ?? {}).length === 0;

  const rule = t('csRule', { min: SLUG_MIN_LENGTH, max: SLUG_MAX_LENGTH });
  const addressError =
    fieldErrors.address ??
    (taken ? t('csTaken') : null) ??
    (tried && address !== '' && !shopSlug.isWellFormed(address) ? rule : null);
  const addressHelp = free ? (
    <>
      <span className="font-medium text-success">
        <Icon name="check" size={14} className="inline align-baseline" /> {t('csGood')}
      </span>{' '}
      · {rule}
    </>
  ) : wellFormed && (check.isFetching || !resting) ? (
    t('checking')
  ) : (
    rule
  );

  return (
    <OnboardingFrame step={1} title={t('csTitle')} lead={t('csLead')}>
      <form className="flex flex-col gap-3.5" onSubmit={handleSubmit} noValidate>
        {me.data?.hasDeletedShop ? <Notice tone="info">{t('csReturning')}</Notice> : null}
        <Field
          label={t('csName')}
          name="shopName"
          autoComplete="organization"
          maxLength={NAME_MAX_LENGTH}
          value={shopName}
          error={fieldErrors.shopName}
          help={t('csNameHelp', { max: NAME_MAX_LENGTH })}
          onChange={(event) => {
            const value = event.target.value;
            setShopName(value);
            if (!addressTouched) setAddress(shopSlug.suggest(value));
          }}
        />
        <Field
          label={t('csLink')}
          name="address"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="url"
          suffix={`.${appConfig.platformDomain}`}
          value={address}
          error={addressError}
          help={addressHelp}
          onChange={(event) => {
            setAddressTouched(true);
            setFieldErrors((errors) => {
              const rest = { ...errors };
              delete rest.address;
              return rest;
            });
            setAddress(shopSlug.normaliseTyping(event.target.value));
          }}
        />
        {suggestion ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] text-fg-muted">{t('csTry')}</span>
            <Chip
              on
              onClick={() => {
                setAddressTouched(true);
                setFieldErrors({});
                setAddress(suggestion);
              }}
            >
              {suggestion}
            </Chip>
          </div>
        ) : null}
        {address !== '' ? (
          <div className="num flex flex-col gap-1.5 rounded-[8px] border border-line bg-neutral-50 px-3 py-2.5 text-[14px]">
            <span>
              <span className="text-[13px] text-fg-muted">{t('csCust')}</span>
              <br />
              <span className="font-semibold break-all">{appConfig.shopHost(address)}</span>
            </span>
            <span>
              <span className="text-[13px] text-fg-muted">{t('csDash')}</span>
              <br />
              <span className="font-semibold break-all">{appConfig.dashboardAddress(address)}</span>
            </span>
          </div>
        ) : null}
        <Field
          label={t('csOwner')}
          name="ownerName"
          autoComplete="name"
          maxLength={NAME_MAX_LENGTH}
          value={ownerName}
          error={fieldErrors.ownerName}
          onChange={(event) => {
            setOwnerName(event.target.value);
          }}
        />
        {refused ? <Notice tone="warn">{t('csRefused')}</Notice> : null}
        {otherFailure ? <Banner tone="bad">{errorText(create.error)}</Banner> : null}
        {free ? (
          <p className="num text-[14px] text-fg-muted">
            <Trans
              t={t}
              i18nKey="csFinal"
              values={{ host: appConfig.shopHost(address) }}
              components={{ b: <b className="break-all" /> }}
            />
          </p>
        ) : null}
        <Button type="submit" wide busy={create.isPending}>
          {t('csSubmit')}
        </Button>
      </form>
    </OnboardingFrame>
  );
}
