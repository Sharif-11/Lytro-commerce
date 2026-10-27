import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icon';
import type { ProductForm } from '@/lib/product-form';
import type { ProductDetail } from '@/types/product';

/** A 72 px tile (the prototype's `.thumb.lg`). */
const TILE =
  'relative flex size-[72px] flex-none items-center justify-center overflow-hidden rounded-[8px] bg-linear-135 from-neutral-100 to-neutral-200 text-neutral-400';

/**
 * The photos and the video in Basics (the prototype's `pfPhotos`): the photos in order, then the video with its play
 * mark, in a row that scrolls sideways.
 */
export function PhotoStrip({
  form,
  product,
}: {
  form: ProductForm;
  product: ProductDetail | null;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const photos = form.imageIds.flatMap((id) => {
    const image = product?.images.find((each) => each.id === id);
    return image ? [image] : [];
  });
  const video = product?.video && product.video.id === form.videoId ? product.video : null;
  return (
    <div>
      <span className="text-[14px] font-medium text-fg-muted">{t('photosVideo')}</span>
      <div className="-mx-4 mt-1.5 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        {photos.map((image) => (
          <span key={image.id} className={TILE}>
            <img src={image.urls.thumbnail} alt="" className="size-full object-cover" />
          </span>
        ))}
        {video ? (
          <span className={TILE}>
            <img src={video.urls.poster} alt="" className="size-full object-cover" />
            <span className="absolute right-1.5 bottom-1.5 flex size-5 items-center justify-center rounded-full bg-[rgba(16,32,31,0.75)] text-[10px] text-white">
              ▶
            </span>
          </span>
        ) : null}
        {photos.length === 0 && !video ? (
          <span className={TILE}>
            <Icon name="image" />
          </span>
        ) : null}
      </div>
    </div>
  );
}
