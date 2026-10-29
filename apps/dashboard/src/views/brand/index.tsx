import { useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import {
  BRAND_IDENTITY_ADDON,
  MediaPurpose,
  TenantState,
  brandContrast,
  brandIconFits,
  type BrandColors,
} from '@lytronix/validators';
import { useAddonOffers, useShopAddons } from '@/api/addons';
import { useBrandEditor, useSaveBrand, useSwitchBrand } from '@/api/brand';
import { unusedMedia } from '@/api/media';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { Dialog } from '@/components/ui/dialog';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Toast } from '@/components/ui/toast';
import { useErrorText } from '@/hooks/use-error-text';
import { useToast } from '@/hooks/use-toast';
import { formatDayMonth } from '@/lib/dates';
import { isImageFile, MediaUpload, UploadRefused } from '@/lib/media-upload';
import { tenantSession } from '@/session/tenant-session';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { BrandEditor, BrandIdentity } from '@/types/brand';
import {
  BrandPreview,
  ColoursCard,
  FontsCard,
  LogosCard,
  PreviewCard,
  ShapeCard,
  SwitchCard,
  type ImageSlot,
  type PreviewTab,
} from './brand-parts';
import { useBrandFonts } from './brand-fonts';
import { ColourSheet, FontSheet, ImageSheet } from './brand-sheets';
import { brandState, isOn, sameIdentity, saveInput, type BrandState } from './brand-words';

/** A picture's own size, read in the browser before it is sent; null when the browser cannot read it (the server will). */
async function pictureSize(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

type OpenSheet =
  | { kind: 'colour'; colour: keyof BrandColors }
  | { kind: 'font'; which: 'heading' | 'body' }
  | { kind: 'image'; slot: ImageSlot }
  | null;

/**
 * Brand identity (TENANT-DASHBOARD-DESIGN §7.28, prototype `brand` and Parts 17 and 23; Slice 11.12a): the shop's
 * logos, colours, fonts, corners and spacing beside a live preview (BRN-02, BRN-06). Changes stay on the page until Save
 * or Apply -- the server keeps no draft -- and leaving with any unsaved asks first. The buttons follow the switch: on,
 * one Save; off, Apply and Save without switching on. Turning the switch on is Apply; turning it off is at once.
 */
export function BrandView(): React.JSX.Element {
  const errorText = useErrorText();
  const editor = useBrandEditor();
  useBrandFonts();
  if (!editor.data) {
    return (
      <ShellPage>
        {editor.isError ? (
          <Banner tone="bad">{errorText(editor.error)}</Banner>
        ) : (
          <Card flush>
            <SkeletonRows count={4} />
          </Card>
        )}
      </ShellPage>
    );
  }
  return <BrandPage editor={editor.data} />;
}

function BrandPage({ editor }: { editor: BrandEditor }): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { slug, tenant } = useShell();
  const mine = useShopAddons();
  const offers = useAddonOffers();
  const save = useSaveBrand();
  const switching = useSwitchBrand();
  const toast = useToast();
  const upload = useMemo(() => new MediaUpload(tenantSession.client), []);
  const files = { darkLogo: useRef<HTMLInputElement>(null), icon: useRef<HTMLInputElement>(null) };
  const [form, setForm] = useState<BrandIdentity>(editor.identity);
  const [tab, setTab] = useState<PreviewTab>('store');
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [uploading, setUploading] = useState<{ slot: ImageSlot; percent: number } | null>(null);
  const [iconProblem, setIconProblem] = useState<{ width: number; height: number } | null>(null);
  const [uploadProblem, setUploadProblem] = useState<string | null>(null);
  // MED-09: what this visit uploaded, so a picture never saved is deleted when it is let go of.
  const uploaded = useRef(new Set<string>());
  // Set once the page itself leaves after its own navigation was asked for, so nothing asks twice.
  const leaving = useRef(false);

  const addon = mine.data?.addons.find((each) => each.key === BRAND_IDENTITY_ADDON) ?? null;
  const state: BrandState = brandState(editor, tenant.state === TenantState.Trial, addon !== null);
  const offer = offers.data?.find((each) => each.addon.key === BRAND_IDENTITY_ADDON) ?? null;
  const price = offer ? formatTaka(offer.addon.price) : null;
  const contrast = useMemo(
    () =>
      brandContrast({
        mainColor: form.mainColor,
        accentColor: form.accentColor,
        backgroundColor: form.backgroundColor,
      }),
    [form.mainColor, form.accentColor, form.backgroundColor],
  );
  const dirty = !sameIdentity(editor.identity, form) || uploading !== null;
  // Nothing saves while a picture is still uploading: the save would go without it.
  const busy = save.isPending || switching.isPending || uploading !== null;

  const blocker = useBlocker({
    shouldBlockFn: () => !leaving.current && dirty,
    enableBeforeUnload: () => !leaving.current && dirty,
    withResolver: true,
  });

  /** Uploads let go of before they were ever saved: deleted, as nothing shows them. */
  function forgetUnsaved(keep: BrandIdentity): void {
    const kept = new Set([keep.darkLogo?.id, keep.icon?.id]);
    const gone = [...uploaded.current].filter((id) => !kept.has(id));
    for (const id of gone) uploaded.current.delete(id);
    void unusedMedia.forget(gone);
  }

  function persist(useBrand: boolean | undefined, said: string): void {
    save.mutate(saveInput(form, useBrand), {
      onSuccess: (next) => {
        forgetUnsaved(next.identity);
        setForm(next.identity);
        toast.show(t(said));
      },
    });
  }

  function turn(on: boolean): void {
    if (on) {
      persist(true, 'brApplied');
      return;
    }
    switching.mutate(false, {
      onSuccess: () => {
        toast.show(t('brOff'));
      },
    });
  }

  async function pickFile(slot: ImageSlot, file: File | undefined): Promise<void> {
    if (!file) return;
    setIconProblem(null);
    setUploadProblem(null);
    if (!isImageFile(file)) {
      setUploadProblem(t('logoBadType'));
      return;
    }
    if (slot === 'icon') {
      const size = await pictureSize(file);
      if (size && !brandIconFits(size.width, size.height)) {
        setIconProblem(size);
        return;
      }
    }
    setUploading({ slot, percent: 0 });
    try {
      const media = await upload.upload(file, MediaPurpose.ShopLogo, {
        onStarted: (started) => {
          uploaded.current.add(started.id);
        },
        onStage: (stage) => {
          setUploading({
            slot,
            percent: stage.stage === 'sending' ? Math.round(stage.fraction * 100) : 100,
          });
        },
      });
      const image = { id: media.id, urls: media.urls ?? { main: '', thumbnail: '' } };
      setForm((current) => ({ ...current, [slot]: image }));
    } catch (failure) {
      setUploadProblem(failure instanceof UploadRefused ? t('logoFailed') : errorText(failure));
    } finally {
      setUploading(null);
    }
  }

  const setColour = (colour: keyof BrandColors, value: string): void => {
    setForm((current) => ({ ...current, [colour]: value }));
  };

  const failing = !contrast.passes;
  const banner =
    state === 'lapsed' ? (
      <Banner
        tone="warn"
        action={
          <Link
            to="/$shop/addons"
            params={{ shop: slug }}
            search={{ buy: BRAND_IDENTITY_ADDON }}
            className="text-primary"
          >
            {/* The price is on the page's own Buy again; beside the sentence it squeezed it to a sliver on a phone. */}
            {t('brBuyAgainPlain')}
          </Link>
        }
      >
        {t('brLapsed')}
      </Banner>
    ) : state === 'trial' ? (
      <Banner tone="neutral">{price ? t('brTrialNote', { price }) : t('brTrialNotePlain')}</Banner>
    ) : state === 'noaddon' ? (
      <Banner
        tone="neutral"
        action={
          <Link
            to="/$shop/addons"
            params={{ shop: slug }}
            search={{ buy: BRAND_IDENTITY_ADDON }}
            className="text-primary"
          >
            {t('brBuyAddon')}
          </Link>
        }
      >
        {price ? t('brNoAddon', { price }) : t('brNoAddonPlain')}
      </Banner>
    ) : failing ? (
      <Banner tone="bad">{t('brFailBanner')}</Banner>
    ) : null;

  const failure = save.error ?? switching.error;
  const buttons = isOn(state) ? (
    <Button
      busy={save.isPending}
      disabled={failing || busy}
      onClick={() => {
        persist(undefined, 'brSavedOn');
      }}
    >
      {t('save')}
    </Button>
  ) : state === 'off' ? (
    <>
      <Button
        busy={save.isPending}
        disabled={failing || busy}
        onClick={() => {
          persist(true, 'brApplied');
        }}
      >
        {t('brApply')}
      </Button>
      <Button
        tone="outline"
        disabled={busy}
        onClick={() => {
          persist(undefined, 'brSavedOff');
        }}
      >
        {t('brSaveDraft')}
      </Button>
    </>
  ) : state === 'lapsed' ? (
    <>
      <Link
        to="/$shop/addons"
        params={{ shop: slug }}
        search={{ buy: BRAND_IDENTITY_ADDON }}
        className={buttonClass()}
      >
        {price ? t('brBuyAgain', { price }) : t('brBuyAgainPlain')}
      </Link>
      <Button
        tone="outline"
        busy={save.isPending}
        disabled={failing || busy}
        onClick={() => {
          persist(undefined, 'brSavedLapsed');
        }}
      >
        {t('save')}
      </Button>
    </>
  ) : (
    <Button
      busy={save.isPending}
      disabled={busy}
      onClick={() => {
        persist(undefined, 'brSavedTrial');
      }}
    >
      {t('brSaveDraft')}
    </Button>
  );

  const openSlot = sheet?.kind === 'image' ? sheet.slot : null;
  return (
    <ShellPage>
      {banner}
      {failure ? <Banner tone="bad">{errorText(failure)}</Banner> : null}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          <SwitchCard
            state={state}
            addonEnds={addon ? formatDayMonth(addon.expiresAt) : null}
            disabled={
              busy ||
              state === 'trial' ||
              state === 'noaddon' ||
              state === 'lapsed' ||
              (state === 'off' && failing)
            }
            onChange={turn}
          />
          <LogosCard
            shopName={tenant.shopName}
            slug={slug}
            shopLogo={tenant.logo}
            form={form}
            uploading={uploading}
            iconProblem={iconProblem}
            uploadProblem={uploadProblem}
            onShopDetails={() => {
              void navigate({ to: '/$shop/settings/shop', params: { shop: slug } });
            }}
            onUpload={(slot) => files[slot].current?.click()}
            onOpen={(slot) => {
              setSheet({ kind: 'image', slot });
            }}
          />
          <ColoursCard
            colours={form}
            contrast={contrast}
            onOpen={(colour) => {
              setSheet({ kind: 'colour', colour });
            }}
            onUse={setColour}
          />
          <FontsCard
            heading={form.headingFont}
            body={form.bodyFont}
            onChange={(which) => {
              setSheet({ kind: 'font', which });
            }}
          />
          <ShapeCard
            corners={form.corners}
            spacing={form.spacing}
            onCorners={(corners) => {
              setForm((current) => ({ ...current, corners }));
            }}
            onSpacing={(spacing) => {
              setForm((current) => ({ ...current, spacing }));
            }}
          />
          <p className="text-[14px]">{t('brNever')}</p>
        </div>
        <div className="flex flex-col gap-4">
          <PreviewCard tab={tab} onTab={setTab}>
            <BrandPreview tab={tab} form={form} shopName={tenant.shopName} slug={slug} />
          </PreviewCard>
          <div className="flex flex-wrap gap-2">{buttons}</div>
        </div>
      </div>
      {(['darkLogo', 'icon'] as const).map((slot) => (
        <input
          key={slot}
          ref={files[slot]}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label={t(slot === 'icon' ? 'brIconTitle' : 'brDarkTitle')}
          className="hidden"
          onChange={(event) => {
            void pickFile(slot, event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      ))}
      <ColourSheet
        colour={sheet?.kind === 'colour' ? sheet.colour : null}
        colours={form}
        contrast={contrast}
        onPick={setColour}
        onClose={() => {
          setSheet(null);
        }}
      />
      <FontSheet
        kind={sheet?.kind === 'font' ? sheet.which : null}
        chosen={sheet?.kind === 'font' && sheet.which === 'body' ? form.bodyFont : form.headingFont}
        onPick={(font) => {
          setForm((current) =>
            sheet?.kind === 'font' && sheet.which === 'body'
              ? { ...current, bodyFont: font }
              : { ...current, headingFont: font },
          );
        }}
        onClose={() => {
          setSheet(null);
        }}
      />
      <ImageSheet
        slot={openSlot}
        image={openSlot ? form[openSlot] : null}
        onReplace={() => {
          setSheet(null);
          if (openSlot) files[openSlot].current?.click();
        }}
        onRemove={() => {
          if (openSlot) setForm((current) => ({ ...current, [openSlot]: null }));
          setSheet(null);
        }}
        onClose={() => {
          setSheet(null);
        }}
      />
      <Dialog
        open={blocker.status === 'blocked'}
        title={t('lvTitle', { ns: 'shop' })}
        onClose={() => {
          if (blocker.status === 'blocked') blocker.reset();
        }}
        actions={
          <>
            <Button
              tone="outline"
              onClick={() => {
                if (blocker.status === 'blocked') blocker.reset();
              }}
            >
              {t('lvStay', { ns: 'shop' })}
            </Button>
            <Button
              tone="danger"
              onClick={() => {
                leaving.current = true;
                forgetUnsaved(editor.identity);
                if (blocker.status === 'blocked') blocker.proceed();
              }}
            >
              {t('lvLeave', { ns: 'shop' })}
            </Button>
          </>
        }
      >
        {t('brLeave')}
      </Dialog>
      <Toast message={toast.message} />
    </ShellPage>
  );
}
