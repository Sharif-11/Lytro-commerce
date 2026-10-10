import { useState, type SyntheticEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { createShopSchema } from '@lytronix/validators';
import { AuthCard } from '@/components/auth-card';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ErrorBanner } from '@/components/error-banner';
import { errorMessage } from '@/api/error-message';
import { suggestSlug } from '@/api/slug';
import { tenantSession } from '@/session/tenant-session';
import { LinkIcon, ShopIcon, UserIcon } from '@/components/icons';
import { CreateShopIllustration } from '@/components/illustrations';
import type { ShopCreated } from '@/types/auth';

// AUTH-10/11/28: owner name + shop name + an editable, auto-derived subdomain ("address" server-side).
// ShopCreated.next is always 'set-password' (AUTH-28's step 3) — no branching needed here.
export function CreateShop(): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [ownerName, setOwnerName] = useState('');
  const [shopName, setShopName] = useState('');
  const [address, setAddress] = useState('');
  // Once the owner edits the URL themselves, their name's live suggestion stops overwriting it.
  const [addressTouched, setAddressTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      tenantSession.client.post<ShopCreated>(
        '/shops',
        createShopSchema.parse({
          ownerName,
          shopName,
          address: address === '' ? undefined : address,
        }),
      ),
    onSuccess: () => {
      void navigate({ to: '/set-password', search: { required: false } });
    },
  });

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const result = createShopSchema.safeParse({
      ownerName,
      shopName,
      address: address === '' ? undefined : address,
    });
    if (!result.success) {
      setFormError(t('errors.validation'));
      return;
    }
    setFormError(null);
    mutation.mutate();
  }

  return (
    <AuthCard
      title={t('auth.createShop.title')}
      subtitle={t('auth.createShop.subtitle')}
      illustration={<CreateShopIllustration />}
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <TextField
          label={t('auth.createShop.ownerNameLabel')}
          name="ownerName"
          autoComplete="name"
          icon={<UserIcon />}
          value={ownerName}
          onChange={(event) => {
            setOwnerName(event.target.value);
          }}
        />
        <TextField
          label={t('auth.createShop.shopNameLabel')}
          name="shopName"
          icon={<ShopIcon />}
          value={shopName}
          onChange={(event) => {
            const value = event.target.value;
            setShopName(value);
            if (!addressTouched) setAddress(suggestSlug(value));
          }}
        />
        <TextField
          label={t('auth.createShop.addressLabel')}
          name="address"
          icon={<LinkIcon />}
          suffix=".lytro.com"
          placeholder="your-shop"
          value={address}
          onChange={(event) => {
            setAddressTouched(true);
            setAddress(event.target.value.toLowerCase());
          }}
        />
        {formError ? <ErrorBanner message={formError} /> : null}
        {mutation.isError ? <ErrorBanner message={errorMessage(mutation.error, t)} /> : null}
        <Button type="submit" loading={mutation.isPending}>
          {t('auth.createShop.submit')}
        </Button>
      </form>
    </AuthCard>
  );
}
