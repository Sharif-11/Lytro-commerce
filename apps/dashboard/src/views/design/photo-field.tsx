import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MediaPurpose,
  STOREFRONT_PHOTO_MIN_WIDTH,
  storefrontPhotoFits,
  type StorefrontPhoto,
} from '@lytronix/validators';
import { Button } from '@/components/ui/button';
import { useErrorText } from '@/hooks/use-error-text';
import { isImageFile, MediaUpload, UploadRefused } from '@/lib/media-upload';
import { tenantSession } from '@/session/tenant-session';
import type { ImageView } from '@/types/me';
import { EditorIcon } from './editor-icon';

// STOREFRONT-BUILDER-PLAN SB-15 (PR 3b, the sketch's `e-slide`): a section's photo with its focal point -- dragged, or
// moved with the arrow keys -- and the way to upload another. A slide's or a banner's must be wide enough once stored;
// it is checked before it is sent.

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

const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)));
const STEP = 5;

export function PhotoField({
  label,
  photo,
  image,
  wide,
  hint,
  error,
  onChange,
  onUploaded,
  onRemove,
}: {
  label: string;
  photo: StorefrontPhoto | null;
  /** The photo's picture, by its media ID. */
  image: ImageView | null;
  /** A slide's or a banner's: held to STOREFRONT_PHOTO_MIN_WIDTH once stored. */
  wide: boolean;
  hint: string;
  error?: string | null;
  onChange: (photo: StorefrontPhoto) => void;
  /** Each picture uploaded here, so the page can show it and let go of it if it is never saved (MED-09). */
  onUploaded: (image: ImageView) => void;
  /** Where the photo is optional (About the shop): the way to have none. */
  onRemove?: () => void;
}) {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const upload = useMemo(() => new MediaUpload(tenantSession.client), []);
  const input = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [percent, setPercent] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function pick(file: File | undefined): Promise<void> {
    if (!file) return;
    setProblem(null);
    if (!isImageFile(file)) {
      setProblem(t('logoBadType'));
      return;
    }
    const size = await pictureSize(file);
    if (wide && size && !storefrontPhotoFits(size.width, size.height)) {
      setProblem(t('ssPhotoNarrow', { min: STOREFRONT_PHOTO_MIN_WIDTH, width: size.width }));
      return;
    }
    setPercent(0);
    try {
      const media = await upload.upload(file, MediaPurpose.ShopLogo, {
        onStage: (stage) => {
          setPercent(stage.stage === 'sending' ? Math.round(stage.fraction * 100) : 100);
        },
      });
      const picture = { id: media.id, urls: media.urls ?? { main: '', thumbnail: '' } };
      onUploaded(picture);
      // A new photo keeps the old one's focal point, else its middle.
      onChange({ mediaId: media.id, focusX: photo?.focusX ?? 50, focusY: photo?.focusY ?? 50 });
    } catch (failure) {
      setProblem(failure instanceof UploadRefused ? t('logoFailed') : errorText(failure));
    } finally {
      setPercent(null);
    }
  }

  function focusAt(event: React.PointerEvent): void {
    const box = area.current?.getBoundingClientRect();
    if (!box || !photo) return;
    onChange({
      ...photo,
      focusX: clamp(((event.clientX - box.left) / box.width) * 100),
      focusY: clamp(((event.clientY - box.top) / box.height) * 100),
    });
  }

  function nudge(event: React.KeyboardEvent): void {
    if (!photo) return;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-STEP, 0],
      ArrowRight: [STEP, 0],
      ArrowUp: [0, -STEP],
      ArrowDown: [0, STEP],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    onChange({
      ...photo,
      focusX: clamp(photo.focusX + move[0]),
      focusY: clamp(photo.focusY + move[1]),
    });
  }

  const shown = problem ?? error ?? null;
  const uploadButton = (
    <Button
      tone="ghost"
      size="sm"
      disabled={percent !== null}
      className="bg-neutral-100"
      onClick={() => input.current?.click()}
    >
      <EditorIcon name="upload" size={18} />
      {percent !== null ? t('sdUploading', { percent }) : t(photo ? 'ssChangePhoto' : 'ssAddPhoto')}
    </Button>
  );
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[14px] font-medium text-fg-muted">{label}</span>
      {photo && image ? (
        // The whole photo, so the dot's place on it is the place kept.
        <div
          ref={area}
          className="relative touch-none overflow-hidden rounded-[12px] select-none"
          onPointerDown={(event) => {
            dragging.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            focusAt(event);
          }}
          onPointerMove={(event) => {
            if (dragging.current) focusAt(event);
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
        >
          <img src={image.urls.main} alt="" draggable={false} className="block h-auto w-full" />
          <button
            type="button"
            aria-label={t('ssFocus', { x: photo.focusX, y: photo.focusY })}
            onKeyDown={nudge}
            className="absolute size-[26px] -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-[3px] border-white shadow-[0_0_0_2px_var(--color-primary),0_2px_8px_rgba(0,0,0,0.4)]"
            style={{ left: `${String(photo.focusX)}%`, top: `${String(photo.focusY)}%` }}
          />
          <span
            className="absolute right-2 bottom-2 flex gap-2"
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
          >
            {onRemove ? (
              <Button tone="ghost" size="sm" className="bg-neutral-100" onClick={onRemove}>
                {t('ssRemovePhoto')}
              </Button>
            ) : null}
            {uploadButton}
          </span>
        </div>
      ) : (
        <div
          className={`flex items-center gap-3 rounded-[14px] border-2 border-dashed bg-neutral-50 p-3.5 text-[13px] text-fg-muted ${shown ? 'border-danger' : 'border-neutral-300'}`}
        >
          <span className="min-w-0 flex-1">
            {t(wide ? 'ssNoPhotoWide' : 'ssNoPhoto', { min: STOREFRONT_PHOTO_MIN_WIDTH })}
          </span>
          {uploadButton}
        </div>
      )}
      {shown ? (
        <p className="text-[13px] font-medium text-danger">{shown}</p>
      ) : (
        <p className="text-[13px] text-fg-muted">{hint}</p>
      )}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={label}
        className="hidden"
        onChange={(event) => {
          void pick(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </div>
  );
}
