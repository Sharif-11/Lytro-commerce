import { useTranslation } from 'react-i18next';
import { useListenerApp } from '@/api/listener';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { rowClass, RowChevron, RowLead, RowList } from '@/components/ui/list-row';
import { QrCode } from '@/components/ui/qr-code';
import { Sheet } from '@/components/ui/sheet';
import { fileSize } from '@/lib/limits';

// TENANT-DASHBOARD-DESIGN §7.44 (small fixes, 2026-11-13; the prototype's `lp35-first`, `lp35`, `sh-lp35-app` and
// `lp35-app-noinfo`): the Listener app's download and how to install it, in the dashboard rather than only on the
// website. The release -- its file, version and size -- is the server's (GET /listener/app); the QR is the file's own
// link, for an owner setting up from a computer while the app goes on the phone.

const QR_SIZE = 104;

/** The button with the version and size under it, or, with no release to offer, why there's no button. */
function DownloadButton(): React.JSX.Element | null {
  const { t } = useTranslation('menu');
  const app = useListenerApp();
  if (app.isPending) return null;
  const release = app.data?.release ?? null;
  if (!release) return <Banner tone="neutral">{t('lpAppNoInfo')}</Banner>;
  return (
    <div className="flex flex-col items-start gap-1.5">
      <a href={release.url} rel="noreferrer" className={buttonClass('primary', 'md')}>
        <Icon name="download" />
        {t('lpAppDownload')}
      </a>
      <span className="num text-[14px] text-fg-muted">
        {t('lpAppMeta', { version: release.version, size: fileSize(release.bytes) })}
      </span>
    </div>
  );
}

/** On a computer only: the download's link as a QR, for the phone's camera. */
function DownloadQr(): React.JSX.Element | null {
  const { t } = useTranslation('menu');
  const release = useListenerApp().data?.release ?? null;
  if (!release) return null;
  return (
    <div className="mt-3.5 hidden items-center gap-3.5 lg:flex">
      <div className="flex-none rounded-[10px] border border-line bg-white p-1">
        <QrCode text={release.url} label={t('lpAppQrLabel')} size={QR_SIZE} />
      </div>
      <p className="m-0 text-[14px] text-fg-muted">{t('lpAppQr')}</p>
    </div>
  );
}

/**
 * The app's lead, its download, the QR on a computer, and the four steps -- the two that stop people included (a phone
 * that blocks unknown sources, Play Protect's warning). Parts side by side, so a card and a sheet space them as theirs.
 */
function AppBody(): React.JSX.Element {
  const { t } = useTranslation('menu');
  return (
    <>
      <p className="m-0 mb-3 text-[14px] text-fg-muted">{t('lpAppLead')}</p>
      <DownloadButton />
      <DownloadQr />
      <h3 className="mt-4 mb-2 text-[15px] font-semibold">{t('lpAppStepsTitle')}</h3>
      <ol className="m-0 flex list-decimal flex-col gap-1.5 ps-5 text-[15px]">
        <li>{t('lpAppS1')}</li>
        <li>{t('lpAppS2')}</li>
        <li>{t('lpAppS3')}</li>
        <li>{t('lpAppS4')}</li>
      </ol>
    </>
  );
}

/** No phone paired yet (`lp35-first`): the app's card, which carries the steps, pairing the last. */
export function AppCard(): React.JSX.Element {
  const { t } = useTranslation('menu');
  return (
    <Card>
      <h2 className="mt-0 mb-1 text-[16px] font-semibold">{t('lpAppTitle')}</h2>
      <AppBody />
    </Card>
  );
}

/** Phones paired (`lp35`): the app as one row, its version and size, opening the app's sheet. */
export function AppRow({ onOpen }: { onOpen: () => void }): React.JSX.Element {
  const { t } = useTranslation('menu');
  const release = useListenerApp().data?.release ?? null;
  return (
    <Card flush>
      <RowList>
        <button type="button" className={`${rowClass} hover:bg-neutral-50`} onClick={onOpen}>
          <RowLead>
            <Icon name="download" />
          </RowLead>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[16px] font-medium">{t('lpAppTitle')}</span>
            <span className="num text-[14px] text-fg-muted">
              {release
                ? `${t('lpAppMeta', { version: release.version, size: fileSize(release.bytes) })} · ${t('lpAppHow')}`
                : t('lpAppHow')}
            </span>
          </span>
          <RowChevron />
        </button>
      </RowList>
    </Card>
  );
}

/** The app's sheet (`sh-lp35-app`): the same download, QR and steps, from the row or the pair sheet. */
export function AppSheet({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation('menu');
  return (
    <Sheet open title={t('lpAppTitle')} onClose={onClose}>
      <AppBody />
    </Sheet>
  );
}
