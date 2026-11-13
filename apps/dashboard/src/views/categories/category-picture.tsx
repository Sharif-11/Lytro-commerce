import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useStorageUsage } from '@/api/media';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import type { ImageView } from '@/types/me';
import { ADD_TILE } from '../product/photo-strip';
import type { Uploading } from '../product/product-media';
import { UploadTile } from '../product/upload-tile';

/**
 * A category's picture (§7.43, the prototype's `sh-category-image-*`; PRD-03): shown in its circle on the shop's home,
 * its first letter without one. Add picture until there is one; while it uploads, the product photos' tile -- how much
 * has gone, then being prepared, or refused with why and Choose another; once set, the picture with Replace and Remove.
 */
export function CategoryPicture({
  image,
  upload,
  onFile,
  onRemove,
  onDismiss,
}: {
  image: ImageView | null;
  upload: Uploading | null;
  onFile: (file: File) => void;
  onRemove: () => void;
  onDismiss: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const storage = useStorageUsage({ enabled: upload?.stage === 'refused' });
  const input = useRef<HTMLInputElement>(null);
  const choose = () => input.current?.click();

  const tile = upload ? (
    <UploadTile upload={upload} storage={storage.data} onDismiss={onDismiss} />
  ) : image ? (
    <img
      src={image.urls.thumbnail}
      alt=""
      className="size-[72px] flex-none rounded-button border border-line object-cover"
    />
  ) : (
    <button type="button" onClick={choose} className={ADD_TILE}>
      <Icon name="camera" />
      {t('addPhoto')}
    </button>
  );

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[14px] font-medium text-fg-muted">{t('catPicture')}</span>
      <div className="flex items-center gap-3">
        {tile}
        <span className="text-[13px] text-fg-muted">{t('catPictureHint')}</span>
      </div>
      {upload?.stage === 'refused' ? (
        <div className="mt-1 flex flex-wrap gap-2">
          <Button tone="outline" size="sm" onClick={choose}>
            <Icon name="camera" />
            {t('upAnother')}
          </Button>
        </div>
      ) : !upload && image ? (
        <div className="mt-1 flex flex-wrap gap-2">
          <Button tone="outline" size="sm" onClick={choose}>
            <Icon name="camera" />
            {t('replace')}
          </Button>
          <Button tone="outline" size="sm" onClick={onRemove}>
            <span className="text-danger-text">{t('remove')}</span>
          </Button>
        </div>
      ) : null}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = '';
        }}
      />
    </div>
  );
}
