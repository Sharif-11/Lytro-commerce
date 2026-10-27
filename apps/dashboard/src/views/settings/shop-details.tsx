import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { BUSINESS_ADDRESS_MAX_LENGTH, NAME_MAX_LENGTH } from '@lytronix/validators';
import { useSetLogo, useShopSettings, useUpdateShopSettings } from '@/api/shop-settings';
import { useBusinessType, usePresets, useSetBusinessType } from '@/api/shop-setup';
import { ActionBar } from '@/components/ui/action-bar';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { AreaField, Field, SelectField } from '@/components/ui/field';
import { ShopMark } from '@/components/ui/shop-mark';
import { Toast } from '@/components/ui/toast';
import { useErrorText } from '@/hooks/use-error-text';
import { useToast } from '@/hooks/use-toast';
import { appConfig } from '@/lib/app-config';
import { isImageFile, UploadRefused } from '@/lib/image-upload';
import { bangladeshiPhone } from '@/lib/phone';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';

const blankToNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

/**
 * Shop details (TENANT-DASHBOARD-DESIGN §7.16, the prototype's `shopdetails`): the shop's name (TEN-19: the shell, its
 * tab title and new installs follow; the link never changes), its logo (TEN-16, uploaded as the media manager will),
 * what it mainly sells (PST-01: new products' defaults only), and the contact details its storefront shows (TEN-30);
 * beside them the shop's link with Copy. One Save for the page.
 */
export function ShopDetailsView(): React.JSX.Element {
  const { t, i18n } = useTranslation('menu');
  const errorText = useErrorText();
  const { slug, tenant } = useShell();
  const settings = useShopSettings();
  const update = useUpdateShopSettings();
  const businessType = useBusinessType();
  const presets = usePresets();
  const setType = useSetBusinessType();
  const setLogo = useSetLogo();
  const toast = useToast();
  const picker = useRef<HTMLInputElement>(null);
  const [shopName, setShopName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [type, setTypeValue] = useState('');
  const [logoError, setLogoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    setShopName(settings.data.shopName);
    setPhone(
      settings.data.contactPhone ? bangladeshiPhone.localPart(settings.data.contactPhone) : '',
    );
    setEmail(settings.data.contactEmail ?? '');
    setAddress(settings.data.businessAddress ?? '');
  }, [settings.data]);

  useEffect(() => {
    setTypeValue(businessType.data ?? '');
  }, [businessType.data]);

  async function save(): Promise<void> {
    const contactPhone = phone.trim() === '' ? null : bangladeshiPhone.fromLocalPart(phone);
    if (contactPhone !== null && !bangladeshiPhone.isValid(contactPhone)) {
      setPhoneError(t('phoneInvalid'));
      return;
    }
    setPhoneError(null);
    setSaving(true);
    try {
      await update.mutateAsync({
        shopName: shopName.trim(),
        contactPhone,
        contactEmail: blankToNull(email),
        businessAddress: blankToNull(address),
      });
      if (type !== '' && type !== businessType.data) await setType.mutateAsync(type);
      toast.show(t('saved'));
    } catch {
      // The refusal shows under its field or above the page.
    } finally {
      setSaving(false);
    }
  }

  function pickLogo(file: File | undefined): void {
    if (!file) return;
    if (!isImageFile(file)) {
      setLogoError(t('logoBadType'));
      return;
    }
    setLogoError(null);
    setLogo.mutate(file, {
      onSuccess: () => {
        toast.show(t('logoSaved'));
      },
      onError: (error) => {
        setLogoError(error instanceof UploadRefused ? t('logoFailed') : errorText(error));
      },
    });
  }

  const problems = update.error instanceof ApiClientError ? update.error.fieldProblems() : {};
  const failed = update.error ?? setType.error;
  const bn = i18n.language === 'bn';
  return (
    <ShellPage>
      {failed && Object.keys(problems).length === 0 ? (
        <Banner tone="bad">{errorText(failed)}</Banner>
      ) : null}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <h3 className="mb-1 text-[17px] font-semibold">{t('sShop', { ns: 'shell' })}</h3>
            <Field
              label={t('shopName')}
              name="shopName"
              autoComplete="organization"
              maxLength={NAME_MAX_LENGTH}
              value={shopName}
              error={problems['shopName']}
              onChange={(event) => {
                setShopName(event.target.value);
              }}
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-[14px] font-medium text-fg-muted">{t('logo')}</span>
              <div className="flex min-h-16 items-center gap-3">
                <ShopMark shopName={tenant.shopName} slug={slug} logo={tenant.logo} size={40} />
                <span className="min-w-0 flex-1 overflow-hidden text-[14px] text-ellipsis whitespace-nowrap text-fg-muted">
                  {t('logoNote')}
                </span>
                <Button
                  tone="outline"
                  size="xs"
                  busy={setLogo.isPending}
                  onClick={() => {
                    picker.current?.click();
                  }}
                >
                  {t('logoUpload')}
                </Button>
                <input
                  ref={picker}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label={t('logoUpload')}
                  className="hidden"
                  onChange={(event) => {
                    pickLogo(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
              </div>
              {logoError ? (
                <p className="text-[13px] font-medium text-danger">{logoError}</p>
              ) : null}
            </div>
            <SelectField
              label={t('bizType')}
              help={t('bizNote')}
              value={type}
              options={[
                ...(type === '' ? [{ value: '', label: '' }] : []),
                ...(presets.data ?? []).map((preset) => ({
                  value: preset.key,
                  label: bn ? preset.labelBn : preset.labelEn,
                })),
              ]}
              onChange={(event) => {
                setTypeValue(event.target.value);
              }}
            />
          </Card>
          <Card className="flex flex-col gap-3">
            <h3 className="mb-1 text-[17px] font-semibold">{t('contact')}</h3>
            <p className="text-[14px] text-fg-muted">{t('contactNote')}</p>
            <Field
              label={t('supportPhone')}
              name="contactPhone"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              prefix="+880"
              placeholder="1XXXXXXXXX"
              value={phone}
              error={phoneError ?? problems['contactPhone']}
              onChange={(event) => {
                setPhone(event.target.value.replace(/[^\d\s-]/g, ''));
              }}
            />
            <Field
              label={t('email')}
              name="contactEmail"
              type="email"
              autoComplete="email"
              placeholder={`hello@${slug}.com`}
              value={email}
              error={problems['contactEmail']}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
            <AreaField
              label={t('streetAddress')}
              name="businessAddress"
              maxLength={BUSINESS_ADDRESS_MAX_LENGTH}
              value={address}
              error={problems['businessAddress']}
              onChange={(event) => {
                setAddress(event.target.value);
              }}
            />
          </Card>
        </div>
        <Card className="flex flex-col gap-2">
          <h3 className="mb-1 text-[17px] font-semibold">{t('shopLink')}</h3>
          <Field
            label={t('shopLink')}
            className="[&>label]:sr-only"
            name="shopLink"
            readOnly
            value={appConfig.shopHost(slug)}
            help={t('shopLinkNote')}
            suffix={<CopyButton text={appConfig.shopHost(slug)} />}
          />
        </Card>
      </div>
      <ActionBar>
        <Button
          busy={saving}
          onClick={() => {
            void save();
          }}
        >
          {t('save')}
        </Button>
      </ActionBar>
      <Toast message={toast.message} />
    </ShellPage>
  );
}
