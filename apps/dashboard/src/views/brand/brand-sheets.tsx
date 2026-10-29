import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_BRAND,
  type BrandColors,
  type BrandContrast,
  type BrandFont,
} from '@lytronix/validators';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chips';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { StatusTag } from '@/components/ui/status-tag';
import type { ImageView } from '@/types/me';
import { FontSample, PairFix, PairLine, type ImageSlot } from './brand-parts';
import {
  BRAND_PALETTES,
  COLOURS,
  colourOf,
  fontChoices,
  PAIR_WORDS,
  pairsOfColour,
} from './brand-words';

/**
 * A colour's sheet (Part 23): what it is for, the colour and its code, colours that work well, Other colour from the
 * browser's picker, and the checks this colour answers for, with Use when one fails. A choice shows at once on the
 * page and its preview; nothing is saved until Save or Apply.
 */
export function ColourSheet({
  colour,
  colours,
  contrast,
  onPick,
  onClose,
}: {
  colour: keyof BrandColors | null;
  colours: BrandColors;
  contrast: BrandContrast;
  onPick: (colour: keyof BrandColors, value: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const picker = useRef<HTMLInputElement>(null);
  const words = COLOURS.find((each) => each.colour === colour) ?? COLOURS[0];
  const value = colour ? colours[colour] : '';
  const [typed, setTyped] = useState(value);
  useEffect(() => {
    setTyped(value);
  }, [value]);
  const pick = (next: string): void => {
    if (colour) onPick(colour, next);
  };
  return (
    <Sheet
      open={colour !== null}
      title={t(words?.title ?? 'brColMain')}
      onClose={onClose}
      footer={
        <Button wide onClick={onClose}>
          {t('done')}
        </Button>
      }
    >
      <p className="text-[14px] text-fg-muted">{t(words?.hint ?? 'brColMainHint')}</p>
      <div className="flex items-end gap-3">
        <span
          className="mb-0.5 size-12 flex-none rounded-[10px] border border-black/8"
          style={{ background: value }}
        />
        <Field
          className="min-w-0 flex-1"
          label={t('brHex')}
          name="colour"
          value={typed}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            setTyped(event.target.value);
            const next = colourOf(event.target.value);
            if (next) pick(next);
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[14px] font-medium text-fg-muted">{t('brSuggested')}</span>
        <div className="flex flex-wrap gap-2">
          {(colour ? BRAND_PALETTES[colour] : []).map((each) => (
            <Chip
              key={each}
              on={each === value}
              aria-label={each}
              className="h-11 px-[11px]"
              onClick={() => {
                pick(each);
              }}
            >
              <span
                className="size-[22px] rounded-full border border-black/12"
                style={{ background: each }}
              />
            </Chip>
          ))}
          <Chip className="h-11 px-[11px]" onClick={() => picker.current?.click()}>
            {t('brOther')}
          </Chip>
        </div>
        <input
          ref={picker}
          type="color"
          hidden
          value={value || '#000000'}
          onChange={(event) => {
            pick(event.target.value.toLowerCase());
          }}
        />
      </div>
      <div className="flex flex-col gap-1.5 text-[13px]">
        {(colour ? pairsOfColour(colour, contrast) : []).map((pair) => (
          <div key={pair.pair} className="contents">
            <PairLine pair={pair} words={t(PAIR_WORDS[pair.pair].sheet)} colours={colours} />
            <PairFix pair={pair} contrast={contrast} onUse={pick} />
          </div>
        ))}
      </div>
    </Sheet>
  );
}

/**
 * A font sheet (Part 17): every pair, each sample in its own faces, with a radio; body text leaves out the pair for
 * headings only and says why.
 */
export function FontSheet({
  kind,
  chosen,
  onPick,
  onClose,
}: {
  kind: 'heading' | 'body' | null;
  chosen: BrandFont;
  onPick: (font: BrandFont) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const list = fontChoices(kind ?? 'heading');
  return (
    <Sheet
      open={kind !== null}
      title={t(kind === 'body' ? 'bfBodyTitle' : 'bfHeadingTitle')}
      onClose={onClose}
      footer={
        <Button wide onClick={onClose}>
          {t('done')}
        </Button>
      }
    >
      <div role="radiogroup" className="flex flex-col gap-2">
        {list.map((pair) => {
          const on = pair.id === chosen;
          return (
            <button
              key={pair.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                onPick(pair.id);
              }}
              className={[
                'grid grid-cols-[22px_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 rounded-[10px] border bg-surface p-3 text-left',
                on ? 'border-primary shadow-[inset_0_0_0_1px_var(--color-primary)]' : 'border-line',
              ].join(' ')}
            >
              <span
                className={`size-[22px] rounded-full ${on ? 'border-[7px] border-primary' : 'border-2 border-neutral-300'}`}
              />
              <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-fg-muted">
                {pair.bangla} + {pair.latin}
                {pair.id === DEFAULT_BRAND.bodyFont ? (
                  <StatusTag tone="neutral" small>
                    {t('bfDefault')}
                  </StatusTag>
                ) : null}
                {pair.headingsOnly ? (
                  <StatusTag tone="info" small>
                    {t('bfHeadOnly')}
                  </StatusTag>
                ) : null}
              </span>
              <span className="col-start-2">
                <FontSample kind={kind ?? 'heading'} font={pair.id} />
              </span>
            </button>
          );
        })}
      </div>
      {kind === 'body' ? <p className="text-[14px] text-fg-muted">{t('bfHeadOnlyNote')}</p> : null}
    </Sheet>
  );
}

/**
 * The dark logo's or the square icon's sheet (Part 23): the picture as it shows, what it is for, and Replace and
 * Remove; a removal takes effect when the page is saved.
 */
export function ImageSheet({
  slot,
  image,
  onReplace,
  onRemove,
  onClose,
}: {
  slot: ImageSlot | null;
  image: ImageView | null;
  onReplace: () => void;
  onRemove: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const icon = slot === 'icon';
  return (
    <Sheet
      open={slot !== null}
      title={t(icon ? 'brIconTitle' : 'brDarkTitle')}
      onClose={onClose}
      footer={
        <>
          <Button tone="outline" onClick={onRemove}>
            {t('remove')}
          </Button>
          <Button onClick={onReplace}>{t('brReplace')}</Button>
        </>
      }
    >
      <div
        className={`flex h-[120px] items-center justify-center rounded-[12px] border border-line ${icon ? 'bg-neutral-50' : 'bg-[#10201f]'}`}
      >
        {image ? (
          <img
            src={image.urls.main}
            alt=""
            className={
              icon
                ? 'size-[72px] rounded-[16px] object-cover'
                : 'max-h-[70%] max-w-[80%] object-contain'
            }
          />
        ) : null}
      </div>
      <p className="text-[14px] text-fg-muted">{t(icon ? 'brIconHint' : 'brDarkHint')}</p>
    </Sheet>
  );
}
