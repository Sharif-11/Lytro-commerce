import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import {
  BUSINESS_ADDRESS_MAX_LENGTH,
  FACEBOOK_PAGE_MAX_LENGTH,
  facebookPageUrlOf,
  MESSENGER_USERNAME_MAX_LENGTH,
  messengerUsernameOf,
  NAME_MAX_LENGTH,
} from '@lytronix/validators';
import { useSetLogo, useShopSettings, useUpdateShopSettings } from '@/api/shop-settings';
import { useBusinessType, usePresets, useSetBusinessType } from '@/api/shop-setup';
import { ErrorBanner } from '@/components/error-banner';
import { ActionBar } from '@/components/ui/action-bar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CopyButton } from '@/components/ui/copy-button';
import { AreaField, Field, SelectField } from '@/components/ui/field';
import { ShopMark } from '@/components/ui/shop-mark';
import { Toast } from '@/components/ui/toast';
import { useErrorText } from '@/hooks/use-error-text';
import { useToast } from '@/hooks/use-toast';
import { appConfig } from '@/lib/app-config';
import { isImageFile, UploadRefused } from '@/lib/media-upload';
import { bangladeshiPhone } from '@/lib/phone';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';

const blankToNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

/** The Facebook page as a seller would write it: the stored https://www.facebook.com/<page> without its scheme. */
const shortPageLink = (url: string): string => url.replace(/^https:\/\/(www\.)?/i, '');

type ContactErrors = Partial<Record<'whatsapp' | 'messenger' | 'facebookPage', string>>;

/**
 * Shop details (TENANT-DASHBOARD-DESIGN §7.16, the prototype's `shopdetails`): the shop's name (TEN-19: the shell, its
 * tab title and new installs follow; the link never changes), its logo (TEN-16, uploaded as the media manager will),
 * what it mainly sells (PST-01: new products' defaults only), and the contact details its storefront shows (TEN-30) --
 * with WhatsApp, Messenger and the Facebook page (Fixes · UI/UX batch 2, item 2.1, the prototype's `ux-shop-contact`),
 * each read by the shared rules the server keeps them by; beside them the shop's link with Copy. One Save for the page.
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
  const [whatsapp, setWhatsapp] = useState('');
  const [messenger, setMessenger] = useState('');
  const [facebookPage, setFacebookPage] = useState('');
  const [contactErrors, setContactErrors] = useState<ContactErrors>({});
  const [type, setTypeValue] = useState('');
  const [logoError, setLogoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    setShopName(settings.data.shopName);
    setPhone(
      settings.data.contactPhone ? bangladeshiPhone.forField(settings.data.contactPhone) : '',
    );
    setEmail(settings.data.contactEmail ?? '');
    setAddress(settings.data.businessAddress ?? '');
    setWhatsapp(settings.data.whatsapp ? bangladeshiPhone.forField(settings.data.whatsapp) : '');
    setMessenger(settings.data.messenger ?? '');
    setFacebookPage(settings.data.facebookPage ? shortPageLink(settings.data.facebookPage) : '');
  }, [settings.data]);

  useEffect(() => {
    setTypeValue(businessType.data ?? '');
  }, [businessType.data]);

  async function save(): Promise<void> {
    const contactPhone = phone.trim() === '' ? null : bangladeshiPhone.read(phone);
    const whatsappNumber = whatsapp.trim() === '' ? null : bangladeshiPhone.read(whatsapp);
    const wrong: ContactErrors = {};
    if (whatsapp.trim() !== '' && whatsappNumber === null) {
      wrong.whatsapp = t('ux2.waE');
    }
    if (messenger.trim() !== '' && messengerUsernameOf(messenger) === null) {
      wrong.messenger = t('ux2.msE');
    }
    if (facebookPage.trim() !== '' && facebookPageUrlOf(facebookPage) === null) {
      wrong.facebookPage = t('ux2.fbE');
    }
    const badPhone = phone.trim() !== '' && contactPhone === null;
    setPhoneError(badPhone ? t('phoneInvalid') : null);
    setContactErrors(wrong);
    if (badPhone || Object.keys(wrong).length > 0) return;
    setSaving(true);
    try {
      await update.mutateAsync({
        shopName: shopName.trim(),
        contactPhone,
        contactEmail: blankToNull(email),
        businessAddress: blankToNull(address),
        whatsapp: whatsappNumber,
        messenger: blankToNull(messenger),
        facebookPage: blankToNull(facebookPage),
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
      {failed && Object.keys(problems).length === 0 ? <ErrorBanner error={failed} /> : null}
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
              placeholder="01XXXXXXXXX"
              value={phone}
              error={phoneError ?? problems['contactPhone']}
              onChange={(event) => {
                setPhone(event.target.value.replace(/[^\d\s+-]/g, ''));
              }}
            />
            <Field
              label={t('ux2.waL')}
              name="whatsapp"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              placeholder="01XXXXXXXXX"
              help={t('ux2.waH')}
              value={whatsapp}
              error={contactErrors.whatsapp ?? problems['whatsapp']}
              onChange={(event) => {
                setWhatsapp(event.target.value.replace(/[^\d\s+-]/g, ''));
              }}
            />
            <Field
              label={t('ux2.msL')}
              name="messenger"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              prefix="m.me/"
              maxLength={MESSENGER_USERNAME_MAX_LENGTH + 40}
              help={t('ux2.msH')}
              value={messenger}
              error={contactErrors.messenger ?? problems['messenger']}
              onChange={(event) => {
                setMessenger(event.target.value);
              }}
              // A pasted link turns into the name it holds as the seller leaves the box, so "m.me/" in front of it
              // reads as the very link shoppers will open (the owner, 2026-11-27: keep m.me/, tidy the paste).
              onBlur={() => {
                const name = messengerUsernameOf(messenger);
                if (name !== null && name !== messenger) setMessenger(name);
              }}
            />
            <Field
              label={t('ux2.fbL')}
              name="facebookPage"
              type="url"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={FACEBOOK_PAGE_MAX_LENGTH}
              help={t('ux2.fbH')}
              value={facebookPage}
              error={contactErrors.facebookPage ?? problems['facebookPage']}
              onChange={(event) => {
                setFacebookPage(event.target.value);
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
      <ActionBar atEnd>
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
