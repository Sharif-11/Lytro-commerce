import { useTranslation } from 'react-i18next';
import { MediaKind } from '@lytronix/validators';
import { Icon } from '@/components/icon';
import { fileSize } from '@/lib/limits';
import type { StorageUsage } from '@/types/media';
import type { Uploading } from './product-media';

/** Why the server refused an upload, as its tile says it. */
const REFUSED: Readonly<Record<string, string>> = {
  not_supported: 'upNotSupported',
  unreadable: 'upUnreadable',
  not_uploaded: 'upNotSent',
};

/**
 * An upload's tile (the prototype's `pf-media-states`, §7.23's upload states): sending with how much has gone, then
 * being prepared with how long that takes (a photo about 30 s, a video about 5 min), or refused with why -- too large
 * says the file's size and the limit ("6.3 MB · limit 5 MB") -- and a way to put it away.
 */
export function UploadTile({
  upload,
  storage,
  square = false,
  onDismiss,
}: {
  upload: Uploading;
  storage: StorageUsage | undefined;
  /** The media sheet's grid square; the 72 px strip tile otherwise. */
  square?: boolean;
  onDismiss: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const size = square ? 'aspect-square w-full' : 'size-[72px] flex-none';
  if (upload.stage === 'refused') {
    const limit = upload.kind === MediaKind.Video ? storage?.videoMaxMb : storage?.imageMaxMb;
    const why =
      upload.reason === 'too_large' && limit
        ? t('upTooBig', { size: fileSize(upload.size), limit: `${String(limit)} MB` })
        : t(REFUSED[upload.reason ?? ''] ?? 'upFailed');
    return (
      <span
        role="alert"
        className={`relative flex ${size} flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[8px] border border-danger bg-danger-soft px-1 text-center text-[11px] leading-tight text-danger-text`}
      >
        <Icon name="alert" />
        <span>{why}</span>
        <button
          type="button"
          aria-label={t('upDismiss')}
          onClick={onDismiss}
          className="absolute top-0.5 right-0.5 flex size-6 items-center justify-center"
        >
          <Icon name="x" size={12} />
        </button>
      </span>
    );
  }
  const sending = upload.stage === 'sending';
  const percent = Math.round(upload.fraction * 100);
  return (
    <span
      role="status"
      className={`relative flex ${size} flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[8px] bg-neutral-100 px-1 text-center text-[11px] leading-tight text-neutral-700`}
    >
      <Icon name={sending ? 'image' : 'refresh'} />
      <span>{sending ? t('upSending', { percent }) : t('upPreparing')}</span>
      {sending ? (
        <span className="absolute inset-x-0 bottom-0 h-1 bg-neutral-200">
          <i className="block h-full bg-primary" style={{ width: `${String(percent)}%` }} />
        </span>
      ) : (
        <span className="text-fg-muted">
          {t(upload.kind === MediaKind.Video ? 'upVideoTime' : 'upPhotoTime')}
        </span>
      )}
    </span>
  );
}
