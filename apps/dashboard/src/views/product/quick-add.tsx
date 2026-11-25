import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ItemCondition, StockTracking, StockUnit } from '@lytronix/validators';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AreaField, Field, PickField, SelectField } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { photosOf, type PhotoChoice } from '@/lib/photo-designs';
import type { ProductForm } from '@/lib/product-form';
import type { ProductSettings } from '@/lib/product-settings';
import {
  CLOTHING_NUMBERS,
  LETTER_SIZES,
  SHOE_NUMBERS,
  cellOptions,
  gridOf,
  rowFor,
  sameForAll,
  sharedWhat,
  splitTotal,
  withRowStock,
  type QuickStockMode,
} from '@/lib/quick-add';
import { keyOf, type SplitAttribute } from '@/lib/variant-matrix';
import type { ProductDefaults } from '@/types/attribute';
import type { StorageUsage } from '@/types/media';
import { AdjustRow } from './stock-delivery-card';
import { PolicyField } from './policy-field';
import type { MediaItem, Uploading } from './product-media';
import { UploadTile } from './upload-tile';

// Quick add (TENANT-DASHBOARD-DESIGN §7.4b, approved by the owner 2026-11-25; the sketch's `pq-*` screens): a new
// product in one card -- photos and video, name, price, স্টক, the sizes for a clothing or shoes-and-bags shop, the
// description and Save -- with everything else in আরও সেটিংস and a combo one link away. Editing a saved product keeps
// the full editor (§7.4).

const TILE = 'relative size-[76px] flex-none overflow-hidden rounded-[10px] bg-neutral-100';
const ADD = `flex size-[76px] flex-none flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-line-strong bg-surface text-[12px] font-medium text-primary`;
const BOX =
  'num h-10 w-[76px] rounded-[8px] border border-line-strong bg-surface text-center text-[15px] font-semibold outline-none focus:outline-2 focus:outline-offset-1 focus:outline-focus';
const BAD = 'border-danger bg-danger-soft';

/** The photos with what each is (`pq-*`): a design's, another photo of one, or plain; the video, never a design. */
export function QuickPhotos({
  form,
  photos,
  video,
  uploads,
  storage,
  labels,
  mode,
  readOnly,
  emptyCells,
  onOpen,
  onMenu,
  onAddPhotos,
  onAddVideo,
  onDismiss,
  onRows,
}: {
  form: ProductForm;
  photos: MediaItem[];
  video: MediaItem | null;
  uploads: Uploading[];
  storage: StorageUsage | undefined;
  labels: ReadonlyMap<string, string>;
  mode: QuickStockMode;
  readOnly: boolean;
  emptyCells: readonly string[];
  onOpen: () => void;
  onMenu: (photoId: string) => void;
  onAddPhotos: (files: File[]) => void;
  onAddVideo: (file: File) => void;
  onDismiss: (key: string) => void;
  onRows: (rows: ProductForm['variants']) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const designs = form.designs.length;
  const caption = (photoId: string): { text: string; sub: boolean } => {
    const key = form.photoDesigns[photoId] ?? null;
    if (key === null) return { text: t('qaPlain'), sub: true };
    const label = labels.get(key) ?? '';
    if (photosOf(form, key)[0] !== photoId)
      return { text: t('qaPhotoOf', { design: label }), sub: true };
    return { text: designs <= 1 ? t('qaFirst') : label, sub: false };
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[14px] font-medium text-fg-muted">
        {t('photosVideo')}
        {designs > 1 ? (
          <>
            {' · '}
            <span className="font-semibold text-primary">{t('pdDesigns', { count: designs })}</span>
          </>
        ) : null}
      </span>
      <div className="-mx-4 flex items-start gap-2.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
        {photos.map((photo, index) => {
          const { text, sub } = caption(photo.id);
          const key = form.photoDesigns[photo.id] ?? null;
          const own = key !== null && photosOf(form, key)[0] === photo.id;
          const row = own && mode === 'designs' ? rowFor(form.variants, [key]) : undefined;
          return (
            <div key={photo.id} className="flex w-[76px] flex-none flex-col gap-1.5">
              <span className={TILE}>
                <button
                  type="button"
                  aria-label={t('mmPhoto', { n: index + 1 })}
                  className="size-full"
                  onClick={onOpen}
                >
                  <img src={photo.thumbnail} alt="" className="size-full object-cover" />
                </button>
                {readOnly ? null : (
                  <button
                    type="button"
                    aria-label={t('qaThisPhoto', { n: index + 1 })}
                    aria-haspopup="dialog"
                    className="absolute top-1 right-1 flex size-7 items-center justify-center rounded-full bg-[rgba(0,0,0,0.55)] text-white"
                    onClick={() => {
                      onMenu(photo.id);
                    }}
                  >
                    <Icon name="more" size={16} />
                  </button>
                )}
              </span>
              <span
                className={`truncate text-[12px] ${sub ? 'font-medium text-fg-muted' : 'font-semibold text-fg'}`}
              >
                {text}
              </span>
              {row ? (
                <input
                  aria-label={t('qaStockOf', { what: text })}
                  inputMode="numeric"
                  className={`${BOX} ${emptyCells.includes(keyOf(row.optionIds)) ? BAD : ''}`}
                  value={row.openingStock}
                  readOnly={readOnly}
                  onChange={(event) => {
                    onRows(withRowStock(form.variants, row.optionIds, event.target.value));
                  }}
                />
              ) : null}
            </div>
          );
        })}
        {video ? (
          <div className="flex w-[76px] flex-none flex-col gap-1.5">
            <button type="button" aria-label={t('video')} className={TILE} onClick={onOpen}>
              <img src={video.thumbnail} alt="" className="size-full object-cover" />
              <span aria-hidden="true" className="absolute inset-0 grid place-items-center">
                <span className="grid size-[34px] place-items-center rounded-full bg-[rgba(0,0,0,0.6)] text-[14px] text-white">
                  ▶
                </span>
              </span>
            </button>
            <span className="truncate text-[12px] font-medium text-fg-muted">{t('video')}</span>
          </div>
        ) : null}
        {uploads.map((upload) => (
          <UploadTile
            key={upload.key}
            upload={upload}
            storage={storage}
            onDismiss={() => {
              onDismiss(upload.key);
            }}
          />
        ))}
        {readOnly ? null : (
          <>
            <button type="button" className={ADD} onClick={() => photoInput.current?.click()}>
              <Icon name="camera" />
              {t('addPhoto')}
            </button>
            {video ? null : (
              <button type="button" className={ADD} onClick={() => videoInput.current?.click()}>
                <Icon name="image" />
                {t('addVideo')}
              </button>
            )}
          </>
        )}
      </div>
      {mode === 'designs' ? (
        <SameForAll
          onFill={(value) => {
            onRows(sameForAll(form.variants, value));
          }}
        />
      ) : null}
      {designs > 1 ? <p className="text-[14px] text-fg-muted">{t('qaDesignsHint')}</p> : null}
      <input
        ref={photoInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(event) => {
          onAddPhotos([...(event.target.files ?? [])]);
          event.target.value = '';
        }}
      />
      <input
        ref={videoInput}
        type="file"
        accept="video/mp4,video/webm"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onAddVideo(file);
          event.target.value = '';
        }}
      />
    </div>
  );
}

/** "সবগুলোতে একই": one number, then বসান fills every split box with it. */
function SameForAll({ onFill }: { onFill: (value: string) => void }): React.JSX.Element {
  const { t } = useTranslation('shop');
  const [value, setValue] = useState('');
  return (
    <div className="mt-1 flex items-center gap-2 text-[14px] text-fg-muted">
      <span>{t('qaSame')}</span>
      <input
        aria-label={t('qaSame')}
        inputMode="numeric"
        className={`${BOX} w-[72px]`}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
        }}
      />
      <Button
        tone="outline"
        size="sm"
        disabled={value.trim() === ''}
        onClick={() => {
          onFill(value.trim());
        }}
      >
        {t('qaFill')}
      </Button>
    </div>
  );
}

/** The stock (`pq-stock-one`, `pq-nostock`, `pq-made`, `pq-stock-split-*`): one box by default, the split a tap away. */
export function QuickStock({
  form,
  mode,
  designAttributeId,
  covers,
  readOnly,
  empty,
  emptyCells,
  onBox,
  onRows,
  onSplit,
  onMade,
  onZero,
}: {
  form: ProductForm;
  mode: QuickStockMode;
  designAttributeId: string | null;
  /** A design's cover photo, by its key, for the grid's rows. */
  covers: (key: string) => string | undefined;
  readOnly: boolean;
  /** Save tried with the one box empty. */
  empty: boolean;
  emptyCells: readonly string[];
  onBox: (value: string) => void;
  onRows: (rows: ProductForm['variants']) => void;
  onSplit: (split: boolean) => void;
  onMade: () => void;
  onZero: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const unit = t(`su_${form.settings.stockUnit}`);
  if (mode === 'made') {
    return (
      <div className="flex items-start gap-2 rounded-control bg-neutral-50 px-3 py-2.5 text-[14px] text-fg-muted">
        <span className="mt-0.5 flex-none text-primary">
          <Icon name="info" size={16} />
        </span>
        <span>{t('qaMadeNote')}</span>
      </div>
    );
  }
  const what = sharedWhat(form, designAttributeId);
  const back = (
    <button
      type="button"
      className="self-start text-[14px] font-semibold text-primary"
      onClick={() => {
        onSplit(false);
      }}
    >
      {t('qaBackToOne')}
    </button>
  );
  if (mode === 'designs') {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-[14px] font-medium text-fg-muted">{t('qaStock')}</span>
        <div className="flex items-start gap-2 rounded-control bg-neutral-50 px-3 py-2.5 text-[14px] text-fg-muted">
          <span className="mt-0.5 flex-none text-primary">
            <Icon name="info" size={16} />
          </span>
          <span>{t('qaUnderPhotos')}</span>
        </div>
        {emptyCells.length > 0 ? (
          <p className="text-[13px] font-medium text-danger-text">{t('qaCellsEmpty')}</p>
        ) : null}
        {back}
      </div>
    );
  }
  if (mode === 'grid') {
    const grid = gridOf(form.splits, designAttributeId);
    const empties = grid.rows.filter((row) =>
      grid.columns.some((column) => emptyCells.includes(keyOf(cellOptions(row.id, column.id)))),
    );
    return (
      <div className="flex flex-col gap-2">
        <span className="text-[14px] font-medium text-fg-muted">{t('qaStock')}</span>
        <SameForAll
          onFill={(value) => {
            onRows(sameForAll(form.variants, value));
          }}
        />
        <div className="-mx-1.5 overflow-x-auto">
          <table className="border-separate border-spacing-1.5">
            <thead>
              <tr>
                <th />
                {grid.columns.map((column) => (
                  <th
                    key={column.id ?? 'one'}
                    scope="col"
                    className="text-center text-[13px] font-semibold text-fg-muted"
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((row) => {
                const bad = empties.includes(row);
                const cover = row.id ? covers(row.id) : undefined;
                return (
                  <tr key={row.id ?? 'one'}>
                    <th scope="row" className="min-w-[104px] text-left">
                      <span
                        className={`flex items-center gap-2 text-[13px] font-semibold ${bad ? 'text-danger-text' : 'text-fg'}`}
                      >
                        {cover ? (
                          <img
                            src={cover}
                            alt=""
                            className="size-9 flex-none rounded-[6px] object-cover"
                          />
                        ) : null}
                        {row.label}
                      </span>
                    </th>
                    {grid.columns.map((column) => {
                      const options = cellOptions(row.id, column.id);
                      const found = rowFor(form.variants, options);
                      const missing = emptyCells.includes(keyOf(options));
                      return (
                        <td key={column.id ?? 'one'}>
                          <input
                            aria-label={[row.label, column.label].filter(Boolean).join(' · ')}
                            inputMode="numeric"
                            className={`${BOX} w-14 ${missing ? BAD : ''}`}
                            value={found?.openingStock ?? ''}
                            readOnly={readOnly}
                            onChange={(event) => {
                              onRows(withRowStock(form.variants, options, event.target.value));
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <span className="text-[14px] font-semibold">
          {t('qaTotal', { n: splitTotal(form.variants), unit })}
        </span>
        {empties.length > 0 ? (
          <p className="text-[13px] font-medium text-danger-text">
            {t('qaRowsEmpty', {
              rows: empties
                .map((row) => row.label)
                .filter(Boolean)
                .join(', '),
            })}
          </p>
        ) : null}
        {back}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Field
        label={t('qaStock')}
        inputMode="decimal"
        className="num"
        placeholder={t('qaStockPh')}
        value={form.sharedOpeningStock}
        readOnly={readOnly}
        suffix={unit}
        invalid={empty}
        error={empty ? t('qaNoStock') : undefined}
        help={!empty && what ? t(`qaShared_${what}`) : undefined}
        onChange={(event) => {
          onBox(event.target.value);
        }}
      />
      {empty ? (
        <div className="-mt-1 flex flex-wrap items-center gap-3">
          <Button tone="outline" size="sm" onClick={onMade}>
            {t('qaTurnOnMade')}
          </Button>
          <button type="button" className="text-[14px] text-fg-muted underline" onClick={onZero}>
            {t('qaSaveZero')}
          </button>
        </div>
      ) : null}
      {what ? (
        <button
          type="button"
          className="-mt-1 inline-flex items-center gap-1 self-start text-left text-[14px] font-semibold text-primary"
          onClick={() => {
            onSplit(true);
          }}
        >
          {t(`qaSplit_${what}`)}
          <Icon name="right" size={16} />
        </button>
      ) : null}
    </div>
  );
}

/** A split's picked options as removable chips (`pq-size-added`, `pq-colour`), with "+ আরও" where it adds more. */
export function SplitChips({
  label,
  split,
  readOnly,
  onRemove,
  onMore,
}: {
  label: string;
  split: SplitAttribute;
  readOnly: boolean;
  onRemove: (optionId: string) => void;
  onMore: (() => void) | null;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-control border border-line bg-neutral-50 px-3 py-2.5">
      <span className="min-w-9 text-[14px] font-semibold">{label}</span>
      {split.options.map((option) => (
        <span
          key={option.id}
          className="inline-flex h-8 items-center gap-1 rounded-full border border-line-strong bg-surface px-2.5 text-[14px] font-semibold"
        >
          {option.swatchColor ? (
            <span
              aria-hidden="true"
              className="size-3.5 rounded-full border border-line"
              style={{ background: option.swatchColor }}
            />
          ) : null}
          {option.value}
          {readOnly ? null : (
            <button
              type="button"
              aria-label={t('qaRemoveOption', { value: option.value })}
              className="text-fg-muted"
              onClick={() => {
                onRemove(option.id);
              }}
            >
              <Icon name="x" size={14} />
            </button>
          )}
        </span>
      ))}
      {onMore && !readOnly ? (
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-primary bg-surface px-2.5 text-[14px] font-semibold text-primary"
          onClick={onMore}
        >
          <Icon name="plus" size={14} />
          {t('qaMore')}
        </button>
      ) : null}
    </div>
  );
}

/** "+ সাইজ যোগ করুন" (§7.4b): the button before any size is picked. */
export function AddSizesButton({ onOpen }: { onOpen: () => void }): React.JSX.Element {
  const { t } = useTranslation('shop');
  return (
    <button
      type="button"
      className="flex h-11 items-center justify-center gap-1.5 rounded-button border border-dashed border-primary bg-surface text-[15px] font-semibold text-primary"
      onClick={onOpen}
    >
      <Icon name="plus" size={18} />
      {t('qaAddSizes')}
    </button>
  );
}

/** The size sheet (`pq-size-add`): letter sizes and free size, a number set, or one typed. */
export function SizeSheet({
  open,
  preset,
  picked,
  busy,
  error,
  onDone,
  onClose,
}: {
  open: boolean;
  preset: 'clothing' | 'shoes';
  /** The sizes already on the product, kept chosen. */
  picked: readonly string[];
  busy: boolean;
  error: string | null;
  onDone: (values: string[]) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const [chosen, setChosen] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setChosen([...picked]);
      setTyped('');
    }
  }
  const fresh = chosen.filter((value) => !picked.includes(value));
  const toggle = (value: string) => {
    setChosen((current) =>
      current.includes(value) ? current.filter((each) => each !== value) : [...current, value],
    );
  };
  const chip = (value: string, label = value) => {
    const on = chosen.includes(value);
    return (
      <button
        key={value}
        type="button"
        aria-pressed={on}
        className={`h-11 min-w-[52px] rounded-[10px] border px-3 text-[15px] font-semibold ${on ? 'border-primary bg-primary text-white' : 'border-line-strong bg-surface text-fg'}`}
        onClick={() => {
          toggle(value);
        }}
      >
        {label}
      </button>
    );
  };
  const free = t('qaFreeSize');
  const numbers = preset === 'shoes' ? SHOE_NUMBERS : CLOTHING_NUMBERS;
  const extra = chosen.filter(
    (value) => !LETTER_SIZES.includes(value) && value !== free && !numbers.includes(value),
  );
  return (
    <Sheet
      open={open}
      title={t('qaAddSizes')}
      onClose={onClose}
      footer={
        <Button
          wide
          busy={busy}
          disabled={fresh.length === 0}
          onClick={() => {
            onDone(fresh);
          }}
        >
          {fresh.length > 0 ? t('qaAddN', { count: fresh.length }) : t('qaAddSizes')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[14px] text-fg-muted">{t('qaSizesHint')}</p>
        <div className="flex flex-wrap gap-2">
          {LETTER_SIZES.map((value) => chip(value))}
          {chip(free)}
        </div>
        <span className="text-[14px] font-semibold">
          {preset === 'shoes' ? t('qaShoeNumbers') : t('qaNumbers')}
        </span>
        <div className="flex flex-wrap gap-2">{numbers.map((value) => chip(value))}</div>
        {extra.length > 0 ? (
          <div className="flex flex-wrap gap-2">{extra.map((value) => chip(value))}</div>
        ) : null}
        <Field
          label={t('qaOtherSize')}
          placeholder={t('qaOtherPh')}
          value={typed}
          suffix={
            <Button
              tone="outline"
              size="sm"
              disabled={typed.trim() === ''}
              onClick={() => {
                const value = typed.trim();
                if (value !== '' && !chosen.includes(value)) setChosen([...chosen, value]);
                setTyped('');
              }}
            >
              {t('qaAdd')}
            </Button>
          }
          onChange={(event) => {
            setTyped(event.target.value);
          }}
        />
        {error ? <p className="text-[14px] text-danger-text">{error}</p> : null}
      </div>
    </Sheet>
  );
}

/** A photo's menu (`pq-photo-menu`), worded as the media sheet: its own design, another photo of one, or not a design. */
export function PhotoMenuSheet({
  open,
  photo,
  number,
  current,
  designs,
  mayBePlain,
  onChoose,
  onClose,
}: {
  open: boolean;
  photo: MediaItem | null;
  number: number;
  /** The design it shows now, by key; null for a plain photo. */
  current: string | null;
  designs: { key: string; label: string; cover: string | undefined }[];
  mayBePlain: boolean;
  onChoose: (choice: PhotoChoice) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const [choice, setChoice] = useState<PhotoChoice>({ kind: 'own' });
  const [wasOpen, setWasOpen] = useState(false);
  const others = designs.filter((design) => design.key !== current);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setChoice(current === null ? { kind: 'not' } : { kind: 'own' });
  }
  const row = (
    kind: PhotoChoice['kind'],
    title: string,
    hint: string,
    extra?: React.ReactNode,
    disabled = false,
  ) => {
    const on = choice.kind === kind;
    return (
      <div className="flex gap-3 border-b border-neutral-100 py-3 last:border-b-0">
        <button
          type="button"
          role="radio"
          aria-checked={on}
          disabled={disabled}
          className="flex flex-1 gap-3 text-left disabled:opacity-50"
          onClick={() => {
            setChoice(
              kind === 'same'
                ? { kind: 'same', key: others[0]?.key ?? '' }
                : kind === 'own'
                  ? { kind: 'own' }
                  : { kind: 'not' },
            );
          }}
        >
          <span
            aria-hidden="true"
            className={`mt-0.5 size-5 flex-none rounded-full border-2 ${on ? 'border-[6px] border-primary' : 'border-line-strong'}`}
          />
          <span className="flex flex-col gap-1 text-[14px] text-fg-muted">
            <b className="text-[15px] font-semibold text-fg">{title}</b>
            <span>{hint}</span>
          </span>
        </button>
        {extra}
      </div>
    );
  };
  return (
    <Sheet
      open={open}
      title={t('qaPhotoTitle')}
      onClose={onClose}
      footer={
        <Button
          wide
          disabled={choice.kind === 'same' && choice.key === ''}
          onClick={() => {
            onChoose(choice);
          }}
        >
          {t('qaOk')}
        </Button>
      }
    >
      <div role="radiogroup" aria-label={t('qaPhotoTitle')} className="flex flex-col">
        {photo ? (
          <div className="mb-1 flex items-center gap-2.5">
            <img src={photo.thumbnail} alt="" className="size-14 rounded-[8px] object-cover" />
            <span className="font-semibold">{t('mmPhoto', { n: number })}</span>
          </div>
        ) : null}
        {row('own', t('pdOwn'), t('qaOwnHint'))}
        {row(
          'same',
          t('pdSame'),
          t('qaSameHint'),
          choice.kind === 'same' ? (
            <span className="sr-only" aria-live="polite">
              {others.find((design) => design.key === choice.key)?.label}
            </span>
          ) : null,
          others.length === 0,
        )}
        {choice.kind === 'same' ? (
          <div className="-mt-1 mb-2 ml-8 flex flex-wrap gap-2">
            {others.map((design) => (
              <button
                key={design.key}
                type="button"
                aria-pressed={choice.key === design.key}
                className={`flex items-center gap-1.5 rounded-[8px] border px-2 py-1 text-[13px] font-semibold ${choice.key === design.key ? 'border-primary bg-primary-soft text-fg' : 'border-line-strong text-fg-muted'}`}
                onClick={() => {
                  setChoice({ kind: 'same', key: design.key });
                }}
              >
                {design.cover ? (
                  <img src={design.cover} alt="" className="size-7 rounded-[5px] object-cover" />
                ) : null}
                {design.label}
              </button>
            ))}
          </div>
        ) : null}
        {row('not', t('pdNot'), t('qaNotHint'), undefined, !mayBePlain)}
      </div>
    </Sheet>
  );
}

/** The fee on top, before any typing (`pq-fee`, `pq-fee-ok`): short, or what Save takes and what the balance holds. */
export function QuickFee({
  need,
  have,
  short,
  onTopUp,
}: {
  need: string;
  have: string;
  short: boolean;
  onTopUp: (() => void) | null;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  return short ? (
    <Banner
      tone="warn"
      icon="banknote"
      action={
        onTopUp ? (
          <button type="button" className="font-semibold text-primary" onClick={onTopUp}>
            {t('qaTopUp')}
          </button>
        ) : undefined
      }
    >
      <b>{t('qaFeeShortB', { need })}</b> {t('qaFeeShort', { have })}
    </Banner>
  ) : (
    <Banner tone="info" icon="banknote">
      {t('qaFeeOk', { need, have })}
    </Banner>
  );
}

/** "কম্বো প্যাক বানাতে চান?": today's combo flow, one tap away. */
export function ComboLink({ onOpen }: { onOpen: () => void }): React.JSX.Element {
  const { t } = useTranslation('shop');
  return (
    <Card flush>
      <button
        type="button"
        className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left text-[15px] font-medium"
        onClick={onOpen}
      >
        <span className="text-primary">
          <Icon name="layers" />
        </span>
        <span className="flex-1">{t('qaCombo')}</span>
        <span className="text-fg-muted">
          <Icon name="right" size={16} />
        </span>
      </button>
    </Card>
  );
}

const UNITS = Object.values(StockUnit);

/** A group of আরও সেটিংস: its heading, its controls. */
function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2.5 border-t border-neutral-100 pt-3">
      <h4 className="text-[14px] font-bold">{title}</h4>
      {children}
    </section>
  );
}

/** A row that opens what it names (the options, the variant table, the add-ons). */
function RowLink({ text, onOpen }: { text: string; onOpen: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      className="flex min-h-10 w-full items-center gap-1.5 text-left text-[15px] font-medium text-primary"
      onClick={onOpen}
    >
      <span className="flex-1">{text}</span>
      <span className="text-fg-muted">
        <Icon name="right" size={16} />
      </span>
    </button>
  );
}

/** A switch with its name and a line under it. */
function SwitchRow({
  on,
  name,
  hint,
  readOnly,
  onChange,
}: {
  on: boolean;
  name: string;
  hint?: string;
  readOnly: boolean;
  onChange: (on: boolean) => void;
}): React.JSX.Element {
  return (
    <div className="flex min-h-10 items-center gap-3">
      <Switch checked={on} disabled={readOnly} label={name} onChange={onChange} />
      <span className="flex flex-col">
        <span className="text-[15px] font-medium">{name}</span>
        {hint ? <span className="text-[13px] text-fg-muted">{hint}</span> : null}
      </span>
    </div>
  );
}

/**
 * আরও সেটিংস (`pq-more-open`): every control the card leaves out, with today's defaults, in plain words -- the stock
 * (made to order, the unit, the low-stock alert, batches, serials), the category, delivery, payment, the size chart
 * (a picture, for clothing), prices and options, and the rest.
 */
export function QuickMore({
  form,
  open,
  clothing,
  categoryText,
  deliversTo,
  chartText,
  shopDefault,
  presetName,
  tax,
  readOnly,
  errors,
  colourLink,
  onOpen,
  onTracking,
  onSettings,
  onChange,
  onCategory,
  onZones,
  onChart,
  onOptions,
  onAddOns,
}: {
  form: ProductForm;
  open: boolean;
  clothing: boolean;
  categoryText: string;
  deliversTo: string;
  chartText: string;
  shopDefault: ProductDefaults['shopPaymentPolicy'] | null;
  presetName: string;
  tax: {
    classes: { id: string; name: string }[];
    value: string | null;
    onChange: (id: string | null) => void;
  } | null;
  readOnly: boolean;
  errors: Partial<
    Record<'unit' | 'low' | 'weight' | 'charge' | 'zones' | 'policy' | 'category', string>
  >;
  /** "একই ছবিতে কয়েকটা রঙ?", offered while there is one photo; null otherwise. */
  colourLink: (() => void) | null;
  onOpen: (open: boolean) => void;
  onTracking: (tracking: StockTracking) => void;
  onSettings: (patch: Partial<ProductSettings>) => void;
  onChange: (patch: Partial<ProductForm>) => void;
  onCategory: () => void;
  onZones: () => void;
  onChart: () => void;
  onOptions: () => void;
  onAddOns: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const settings = form.settings;
  const made = settings.stockTracking !== StockTracking.Tracked;
  return (
    <Card className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        className="flex items-start justify-between gap-3 text-left"
        onClick={() => {
          onOpen(!open);
        }}
      >
        <span className="flex flex-col gap-0.5">
          <b className="text-[17px] font-semibold">{t('moreSettings')}</b>
          <span className="text-[13px] text-fg-muted">
            {clothing ? t('qaMoreSumClothing') : t('qaMoreSum')}
          </span>
        </span>
        <span className={`mt-1 text-fg-muted transition-transform ${open ? 'rotate-180' : ''}`}>
          <Icon name="down" />
        </span>
      </button>
      {open ? (
        <div className="mt-3 flex flex-col gap-3.5">
          <Group title={t('qaStock')}>
            <SwitchRow
              on={made}
              name={t('qaMade')}
              hint={t('qaMadeHint')}
              readOnly={readOnly}
              onChange={(on) => {
                onTracking(on ? StockTracking.NotTracked : StockTracking.Tracked);
              }}
            />
            {made ? null : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField
                    label={t('qaCountedIn')}
                    value={settings.stockUnit}
                    disabled={readOnly}
                    error={errors.unit}
                    options={UNITS.map((unit) => ({ value: unit, label: t(`unitName_${unit}`) }))}
                    onChange={(event) => {
                      const stockUnit = new Map<string, StockUnit>(
                        UNITS.map((unit) => [unit, unit]),
                      ).get(event.target.value);
                      if (stockUnit) onSettings({ stockUnit });
                    }}
                  />
                  <Field
                    label={t('qaLowAt')}
                    inputMode="decimal"
                    className="num"
                    value={settings.lowStockThreshold}
                    error={errors.low}
                    readOnly={readOnly}
                    onChange={(event) => {
                      onSettings({ lowStockThreshold: event.target.value });
                    }}
                  />
                </div>
                <SwitchRow
                  on={settings.batchTracked}
                  name={t('qaBatch')}
                  hint={t('qaFullForm')}
                  readOnly={readOnly}
                  onChange={(batchTracked) => {
                    onSettings({ batchTracked });
                  }}
                />
                <SwitchRow
                  on={settings.serialTracked}
                  name={t('qaSerial')}
                  hint={t('qaFullForm')}
                  readOnly={readOnly}
                  onChange={(serialTracked) => {
                    onSettings({ serialTracked });
                  }}
                />
              </>
            )}
          </Group>
          <Group title={t('category')}>
            <PickField
              label={`${t('category')} ${t('qaOptional')}`}
              value={categoryText}
              disabled={readOnly}
              error={errors.category}
              onPick={onCategory}
            />
          </Group>
          <Group title={t('qaDelivery')}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={t('weightKg')}
                inputMode="decimal"
                className="num"
                placeholder="0.00"
                value={settings.weightKg}
                error={errors.weight}
                readOnly={readOnly}
                onChange={(event) => {
                  onSettings({ weightKg: event.target.value });
                }}
              />
              <Field
                label={t('deliveryCharge')}
                prefix="৳"
                inputMode="decimal"
                className="num"
                placeholder={t('followsZone')}
                value={settings.deliveryCharge}
                error={errors.charge}
                readOnly={readOnly}
                onChange={(event) => {
                  onSettings({ deliveryCharge: event.target.value });
                }}
              />
            </div>
            {settings.weightKg.trim() !== '' ? (
              <AdjustRow
                on={settings.adjustByWeight}
                readOnly={readOnly}
                onChange={(adjustByWeight) => {
                  onSettings({ adjustByWeight });
                }}
              />
            ) : null}
            <PickField
              label={t('deliversTo')}
              value={deliversTo}
              error={errors.zones}
              disabled={readOnly}
              onPick={onZones}
            />
          </Group>
          <Group title={t('qaPayment')}>
            <PolicyField
              settings={settings}
              shopDefault={shopDefault}
              readOnly={readOnly}
              error={errors.policy}
              onSettings={onSettings}
            />
          </Group>
          {clothing ? (
            <Group title={t('qaChart')}>
              <PickField
                label={t('chartTitle')}
                value={chartText}
                disabled={readOnly}
                onPick={onChart}
              />
              <p className="text-[13px] text-fg-muted">{t('qaChartNote')}</p>
            </Group>
          ) : null}
          <Group title={t('qaPricesOptions')}>
            {colourLink ? <RowLink text={t('qaColourLink')} onOpen={colourLink} /> : null}
            <RowLink
              text={clothing ? t('qaOptionsClothing') : t('qaOptionsOther')}
              onOpen={onOptions}
            />
            <RowLink text={t('qaPricesSku')} onOpen={onOptions} />
            <RowLink text={t('qaAddOns')} onOpen={onAddOns} />
          </Group>
          <Group title={t('qaOther')}>
            <SelectField
              label={t('condition')}
              value={settings.condition}
              disabled={readOnly}
              options={[
                { value: ItemCondition.New, label: t('condNew') },
                { value: ItemCondition.Used, label: t('condUsed') },
                { value: ItemCondition.Refurbished, label: t('condRefurb') },
              ]}
              onChange={(event) => {
                const condition = new Map<string, ItemCondition>(
                  Object.values(ItemCondition).map((each) => [each, each]),
                ).get(event.target.value);
                if (condition) onSettings({ condition });
              }}
            />
            {tax ? (
              <SelectField
                label={t('taxClass')}
                value={tax.value ?? ''}
                disabled={readOnly}
                options={[
                  ...tax.classes.map((each) => ({ value: each.id, label: each.name })),
                  { value: '', label: t('taxClassNone') },
                ]}
                onChange={(event) => {
                  tax.onChange(event.target.value || null);
                }}
              />
            ) : null}
            <PickField
              label={t('qaStartRules')}
              value={presetName}
              help={t('qaStartRulesHint')}
              disabled={readOnly}
              onPick={onCategory}
            />
            <SwitchRow
              on={form.active}
              name={t('qaShown')}
              readOnly={readOnly}
              onChange={(active) => {
                onChange({ active });
              }}
            />
          </Group>
        </div>
      ) : null}
    </Card>
  );
}

/** The card itself (`pq-empty`, `pq-filled`): its parts in the owner's order, given by the page. */
export function QuickCard({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <Card className="flex flex-col gap-3.5">{children}</Card>;
}

/** The name and price fields, as the card asks them. */
export function NamePrice({
  form,
  problems,
  readOnly,
  onChange,
}: {
  form: ProductForm;
  problems: Partial<Record<'name' | 'price', string | undefined>>;
  readOnly: boolean;
  onChange: (patch: Partial<ProductForm>) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  return (
    <>
      <Field
        label={t('name')}
        value={form.name}
        placeholder={t('qaNamePh')}
        readOnly={readOnly}
        error={problems.name}
        onChange={(event) => {
          onChange({ name: event.target.value });
        }}
      />
      <Field
        label={t('price')}
        prefix="৳"
        inputMode="decimal"
        className="num"
        placeholder="0"
        value={form.price}
        readOnly={readOnly}
        error={problems.price}
        onChange={(event) => {
          onChange({ price: event.target.value });
        }}
      />
    </>
  );
}

/** বিবরণ, an open box in the card (the owner: "a description box as quick option"). */
export function Description({
  value,
  error,
  readOnly,
  onChange,
}: {
  value: string;
  error: string | undefined;
  readOnly: boolean;
  onChange: (description: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  return (
    <AreaField
      label={`${t('description')} ${t('qaOptional')}`}
      value={value}
      placeholder={t('qaDescPh')}
      readOnly={readOnly}
      error={error}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  );
}
