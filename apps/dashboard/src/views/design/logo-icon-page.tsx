import { useMemo, useRef, useState } from 'react';
import { useBlocker } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { BRAND_ICON_MIN_PX, MediaPurpose, brandIconFits } from '@lytronix/validators';
import { useSetIcon, useSetLogoImage } from '@/api/storefront-design';
import { unusedMedia } from '@/api/media';
import { ErrorBanner } from '@/components/error-banner';
import { ActionBar } from '@/components/ui/action-bar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { StatusTag } from '@/components/ui/status-tag';
import { Toast } from '@/components/ui/toast';
import { useErrorText } from '@/hooks/use-error-text';
import { useToast } from '@/hooks/use-toast';
import { isImageFile, MediaUpload, UploadRefused } from '@/lib/media-upload';
import { tenantSession } from '@/session/tenant-session';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { ImageView } from '@/types/me';
import { LogoMark, ShopIcon } from './design-parts';
import { EditorIcon } from './editor-icon';

type Slot = 'logo' | 'icon';

/** What the seller picked this visit: its file's name, its size, and its pixels where the browser could read them. */
interface Picked {
  name: string;
  bytes: number;
  width: number | null;
  height: number | null;
}

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

// The other apps on the home screen the icon is shown among, as the sketch draws them (names, not words to translate).
const APPS = ['Gallery', 'Camera', 'bKash', 'Maps', 'Chrome', 'Phone', 'Messages'] as const;

/**
 * Settings > Storefront > Design > Logo and icon (STOREFRONT-BUILDER-PLAN SB-5, the sketch's `e-brand`; every plan,
 * the owner 2026-11-18): the logo atop the storefront and the one square icon of the browser tab and the installed
 * app, each previewed as soon as it is uploaded. Nothing changes for shoppers until Save; a picture never saved is
 * deleted when it is let go of (MED-09). No icon: made from the logo; no logo: the first letter of the name.
 */
export function LogoIconView(): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const { slug, tenant } = useShell();
  const setLogo = useSetLogoImage();
  const setIcon = useSetIcon();
  const toast = useToast();
  const upload = useMemo(() => new MediaUpload(tenantSession.client), []);
  const files = { logo: useRef<HTMLInputElement>(null), icon: useRef<HTMLInputElement>(null) };
  const saved = { logo: tenant.logo, icon: tenant.icon ?? null };
  const [form, setForm] = useState<Record<Slot, ImageView | null>>(saved);
  const [picked, setPicked] = useState<Partial<Record<Slot, Picked>>>({});
  const [uploading, setUploading] = useState<{ slot: Slot; percent: number } | null>(null);
  const [problem, setProblem] = useState<{ slot: Slot; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  // MED-09: what this visit uploaded, so a picture never saved is deleted when it is let go of.
  const uploaded = useRef(new Set<string>());
  const leaving = useRef(false);

  const changed = {
    logo: (form.logo?.id ?? null) !== (saved.logo?.id ?? null),
    icon: (form.icon?.id ?? null) !== (saved.icon?.id ?? null),
  };
  const dirty = changed.logo || changed.icon || uploading !== null;
  const failure = setLogo.error ?? setIcon.error;

  const blocker = useBlocker({
    shouldBlockFn: () => !leaving.current && dirty,
    enableBeforeUnload: () => !leaving.current && dirty,
    withResolver: true,
  });

  /** Uploads let go of before they were ever saved: deleted, as nothing shows them. */
  function forgetUnsaved(keep: (string | undefined)[]): void {
    const kept = new Set(keep);
    const gone = [...uploaded.current].filter((id) => !kept.has(id));
    for (const id of gone) uploaded.current.delete(id);
    void unusedMedia.forget(gone);
  }

  async function pick(slot: Slot, file: File | undefined): Promise<void> {
    if (!file) return;
    setProblem(null);
    if (!isImageFile(file)) {
      setProblem({ slot, text: t('logoBadType') });
      return;
    }
    const size = await pictureSize(file);
    if (slot === 'icon' && size && !brandIconFits(size.width, size.height)) {
      setProblem({ slot, text: t('sdIconNotSquare', { min: BRAND_ICON_MIN_PX, ...size }) });
      return;
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
      setPicked((current) => ({
        ...current,
        [slot]: {
          name: file.name,
          bytes: file.size,
          width: size?.width ?? null,
          height: size?.height ?? null,
        },
      }));
    } catch (error) {
      setProblem({
        slot,
        text: error instanceof UploadRefused ? t('logoFailed') : errorText(error),
      });
    } finally {
      setUploading(null);
    }
  }

  async function save(): Promise<void> {
    setSaving(true);
    try {
      if (changed.logo) await setLogo.mutateAsync(form.logo?.id ?? null);
      if (changed.icon) await setIcon.mutateAsync(form.icon?.id ?? null);
      forgetUnsaved([form.logo?.id, form.icon?.id]);
      setPicked({});
      toast.show(t('sdBrandSaved'));
    } catch {
      // The refusal shows above the page.
    } finally {
      setSaving(false);
    }
  }

  const caption = (slot: Slot, image: ImageView | null): React.ReactNode => {
    if (uploading?.slot === slot) return t('sdUploading', { percent: uploading.percent });
    const file = picked[slot];
    if (file) {
      const kb = Math.max(1, Math.round(file.bytes / 1024));
      return (
        <>
          <b className="block truncate text-[14px] text-fg">{file.name}</b>
          {file.width && file.height
            ? t('sdFileSize', { width: file.width, height: file.height, kb })
            : t('sdFileKb', { kb })}
        </>
      );
    }
    return (
      <b className="block text-[14px] text-fg">
        {image
          ? t(slot === 'logo' ? 'sdYourLogo' : 'sdYourIcon')
          : t(slot === 'logo' ? 'sdNoLogo' : form.logo ? 'sdIconFromLogo' : 'sdIconFromLetter')}
      </b>
    );
  };

  const changeButton = (slot: Slot) => (
    <Button
      tone="outline"
      size="sm"
      disabled={uploading !== null || saving}
      onClick={() => files[slot].current?.click()}
    >
      <EditorIcon name="upload" size={18} />
      {t(form[slot] ? 'sdChange' : 'logoUpload')}
    </Button>
  );

  const problemLine = (slot: Slot) =>
    problem?.slot === slot ? (
      <p className="mt-2 text-[13px] font-medium text-danger-text">{problem.text}</p>
    ) : null;

  const app = (name: string) => (
    <div key={name} className="flex flex-col items-center gap-1">
      <i className="block size-[52px] rounded-[14px] bg-white/[0.22]" />
      <span className="max-w-16 truncate">{name}</span>
    </div>
  );
  // The shop's own icon sixth, among the phone's other apps.
  const apps = [
    ...APPS.slice(0, 5).map(app),
    <div key="me" className="flex flex-col items-center gap-1">
      <ShopIcon
        icon={form.icon}
        logo={form.logo}
        shopName={tenant.shopName}
        slug={slug}
        size={52}
        radius={14}
        className="shadow-[0_3px_10px_rgba(0,0,0,0.3)]"
      />
      <span className="max-w-16 truncate">{tenant.shopName}</span>
    </div>,
    ...APPS.slice(5).map(app),
  ];
  const icon = (size: number, radius: number) => (
    <ShopIcon
      icon={form.icon}
      logo={form.logo}
      shopName={tenant.shopName}
      slug={slug}
      size={size}
      radius={radius}
    />
  );

  return (
    <ShellPage>
      {failure ? <ErrorBanner error={failure} /> : null}
      <div className="flex max-w-[640px] flex-col gap-3">
        <Card>
          <h2 className="text-[15.5px] font-bold">{t('logo')}</h2>
          <p className="mt-[3px] mb-3 text-[13px] text-fg-muted">{t('sdLogoSub')}</p>
          <div className="overflow-hidden rounded-[12px] border border-line bg-white">
            <div className="flex h-[58px] items-center gap-2.5 border-b border-line px-3 text-fg">
              <EditorIcon name="menu" size={20} />
              <span className="flex min-w-0 flex-1 justify-center">
                <LogoMark logo={form.logo} shopName={tenant.shopName} height={38} />
              </span>
              <EditorIcon name="search" size={20} />
              <EditorIcon name="cart" size={20} />
            </div>
            <div className="bg-neutral-50 px-2.5 py-[5px] text-[11.5px] text-fg-muted">
              {t('sdHeaderCap')}
            </div>
          </div>
          <div className={`mt-3 ${DROP}`}>
            {form.logo ? (
              <span className="flex-none rounded-[8px] border border-line bg-white px-1.5 py-1">
                <LogoMark logo={form.logo} shopName={tenant.shopName} height={30} />
              </span>
            ) : null}
            <span className="min-w-0 flex-1">{caption('logo', form.logo)}</span>
            {changeButton('logo')}
          </div>
          {problemLine('logo')}
          <p className="mt-2 text-[12.5px] text-fg-muted">{t('sdLogoHint')}</p>
        </Card>
        <Card>
          <h2 className="flex flex-wrap items-center gap-2 text-[15.5px] font-bold">
            {t('sdIconTitle')}
            <StatusTag tone="ok">{t('sdEveryPlan')}</StatusTag>
          </h2>
          <p className="mt-[3px] mb-3 text-[13px] text-fg-muted">{t('sdIconSub')}</p>
          <div className="grid grid-cols-4 gap-x-2 gap-y-3.5 rounded-[22px] bg-[linear-gradient(160deg,#2b3a67_0%,#5b4b8a_55%,#b0618a_100%)] px-3.5 pt-[18px] pb-4 text-center text-[10.5px] text-white">
            {apps}
          </div>
          <div className="mt-3 flex items-end gap-4 text-center text-[11.5px] text-fg-muted">
            <div className="flex flex-col items-center gap-1">
              {icon(56, 32)}
              {t('sdRound')}
            </div>
            <div className="flex flex-col items-center gap-1">
              {icon(56, 13)}
              {t('sdIPhone')}
            </div>
            <div className="flex flex-col items-center gap-1">
              {icon(36, 8)}
              {t('sdSmall')}
            </div>
          </div>
          <div className="mt-3 flex w-[230px] max-w-full items-center gap-2 rounded-t-[10px] bg-neutral-100 px-3 py-2 text-[12.5px]">
            {icon(16, 3)}
            <span className="truncate">{t('sdTabTitle', { name: tenant.shopName })}</span>
          </div>
          <p className="mt-1 text-[11.5px] text-fg-muted">{t('sdTabCap')}</p>
          <div className={`mt-3 ${DROP}`}>
            {icon(44, 10)}
            <span className="min-w-0 flex-1">{caption('icon', form.icon)}</span>
            {changeButton('icon')}
          </div>
          {problemLine('icon')}
          <p className="mt-2 text-[12.5px] text-fg-muted">
            {t('sdIconHint', { min: BRAND_ICON_MIN_PX })}
          </p>
        </Card>
      </div>
      <ActionBar>
        <Button
          busy={saving}
          disabled={!dirty || uploading !== null || saving}
          onClick={() => {
            void save();
          }}
        >
          {t('save')}
        </Button>
      </ActionBar>
      {(['logo', 'icon'] as const).map((slot) => (
        <input
          key={slot}
          ref={files[slot]}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label={t(slot === 'logo' ? 'logo' : 'sdIconTitle')}
          className="hidden"
          onChange={(event) => {
            void pick(slot, event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      ))}
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
                forgetUnsaved([saved.logo?.id, saved.icon?.id]);
                if (blocker.status === 'blocked') blocker.proceed();
              }}
            >
              {t('lvLeave', { ns: 'shop' })}
            </Button>
          </>
        }
      >
        {t('sdBrandLeave')}
      </Dialog>
      <Toast message={toast.message} />
    </ShellPage>
  );
}

const DROP =
  'flex items-center gap-3 rounded-[14px] border-2 border-dashed border-neutral-300 bg-neutral-50 p-3.5 text-[13px] text-fg-muted';
