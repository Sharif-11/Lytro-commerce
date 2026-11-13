import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MediaPurpose } from '@lytronix/validators';
import { useStorageUsage } from '@/api/media';
import { Icon } from '@/components/icon';
import { Chip } from '@/components/ui/chips';
import { Eyebrow } from '@/components/ui/page';
import type { OptionSwatch } from '@/types/product';
import { refusalText } from './upload-tile';
import { usePictureUpload } from './use-picture-upload';

/** The six colours the palette draws; any other comes from the browser's colour picker (11.7b read). */
const PALETTE = ['#10201F', '#1D4ED8', '#C8323B', '#1B7A43', '#F2A516', '#FFFFFF'];

const sameColour = (a: string | null, b: string): boolean => a?.toUpperCase() === b;

/** A swatch as chosen: a colour or none, or a picture of the shop's, uploaded as it was chosen. */
export type SwatchChoice =
  { swatchColor: string | null } | ({ swatchImageId: string } & OptionSwatch);

/** An option's swatch beside its name: dashed when it has none, a colour, or a small picture. */
export function SwatchDot({
  swatch,
  on,
}: {
  swatch: OptionSwatch;
  on?: boolean;
}): React.JSX.Element {
  return (
    <span
      className={[
        'flex size-8 flex-none items-center justify-center overflow-hidden rounded-full',
        on ? 'shadow-[0_0_0_2px_var(--color-surface),0_0_0_4px_var(--color-primary)]' : '',
        swatch.swatchImage || swatch.swatchColor
          ? 'border border-black/12'
          : 'border-[1.5px] border-dashed border-line-strong bg-surface',
      ].join(' ')}
      style={swatch.swatchColor ? { background: swatch.swatchColor } : undefined}
    >
      {swatch.swatchImage ? (
        <img src={swatch.swatchImage.urls.thumbnail} alt="" className="size-full object-cover" />
      ) : null}
    </span>
  );
}

/**
 * An option's swatch (Part 14's `palette14`, ATR-18): six colours, Other colour from the browser's picker, From a photo,
 * None. A photo is uploaded as it is chosen; what the choice does -- saved at once, or kept for a step's Save -- is the
 * caller's.
 */
export function SwatchPalette({
  name,
  swatch,
  busy,
  error,
  onPaint,
}: {
  name: string;
  swatch: OptionSwatch;
  busy: boolean;
  error: string | null;
  onPaint: (choice: SwatchChoice) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const photoInput = useRef<HTMLInputElement>(null);
  const colourInput = useRef<HTMLInputElement>(null);
  // §7.43: From a photo says how far its upload is, and the other choices wait for it.
  const pictureUpload = usePictureUpload(MediaPurpose.SwatchImage);
  const upload = pictureUpload.upload;
  const uploading = pictureUpload.busy;
  const storage = useStorageUsage({ enabled: upload?.stage === 'refused' });
  const other =
    swatch.swatchColor !== null &&
    !PALETTE.some((colour) => sameColour(swatch.swatchColor, colour));

  async function paintPhoto(file: File): Promise<void> {
    const media = await pictureUpload.start(file);
    if (!media) return;
    onPaint({
      swatchImageId: media.id,
      swatchColor: null,
      swatchImage: { id: media.id, urls: media.urls ?? { main: '', thumbnail: '' } },
    });
  }

  const percent = upload?.stage === 'sending' ? Math.round(upload.fraction * 100) : 0;
  const problem = upload?.stage === 'refused' ? refusalText(upload, storage.data, t) : error;
  return (
    <div className="flex flex-col gap-2">
      <Eyebrow>{t('swatchFor', { name })}</Eyebrow>
      <div className="flex flex-wrap gap-2">
        {PALETTE.map((colour) => (
          <Chip
            key={colour}
            size="lg"
            aria-label={colour}
            on={sameColour(swatch.swatchColor, colour)}
            disabled={busy || uploading}
            onClick={() => {
              onPaint({ swatchColor: colour });
            }}
          >
            <span
              className="size-5 rounded-full border border-black/12"
              style={{ background: colour }}
            />
          </Chip>
        ))}
        <Chip
          size="lg"
          on={other}
          disabled={busy || uploading}
          onClick={() => colourInput.current?.click()}
        >
          {other && swatch.swatchColor ? (
            <span
              className="size-5 rounded-full border border-black/12"
              style={{ background: swatch.swatchColor }}
            />
          ) : null}
          {t('otherColour')}
        </Chip>
        <Chip
          size="lg"
          on={swatch.swatchImage !== null || uploading}
          disabled={uploading || busy}
          className={uploading ? 'relative overflow-hidden' : undefined}
          onClick={() => photoInput.current?.click()}
        >
          {upload && uploading ? (
            <>
              <Icon name={upload.stage === 'sending' ? 'image' : 'refresh'} size={16} />
              {upload.stage === 'sending' ? t('upSending', { percent }) : t('upPreparing')}
              {upload.stage === 'sending' ? (
                <span className="absolute inset-x-0 bottom-0 h-[3px]">
                  <i
                    className="block h-full bg-white/75"
                    style={{ width: `${String(percent)}%` }}
                  />
                </span>
              ) : null}
            </>
          ) : (
            <>
              <Icon name="camera" size={16} />
              {t('fromPhoto')}
            </>
          )}
        </Chip>
        <Chip
          size="lg"
          on={swatch.swatchColor === null && swatch.swatchImage === null}
          disabled={busy || uploading}
          onClick={() => {
            onPaint({ swatchColor: null });
          }}
        >
          {t('noSwatch')}
        </Chip>
      </div>
      {problem ? (
        <p role="alert" className="text-[13px] font-medium text-danger-text">
          {problem}
        </p>
      ) : null}
      <input
        ref={photoInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void paintPhoto(file);
          event.target.value = '';
        }}
      />
      <input
        ref={colourInput}
        type="color"
        hidden
        onChange={(event) => {
          onPaint({ swatchColor: event.target.value.toUpperCase() });
        }}
      />
    </div>
  );
}
