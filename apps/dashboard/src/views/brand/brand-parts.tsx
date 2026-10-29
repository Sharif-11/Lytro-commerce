import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BRAND_PAIR_COLOR,
  BrandCorners,
  BrandSpacing,
  derivedBrandColors,
  monogramLetter,
  type BrandColors,
  type BrandContrast,
  type BrandContrastPair,
  type BrandFont,
} from '@lytronix/validators';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip, ChipRow } from '@/components/ui/chips';
import { Switch } from '@/components/ui/switch';
import type { BrandIdentity } from '@/types/brand';
import type { ImageView } from '@/types/me';
import {
  COLOURS,
  FONT_SAMPLES,
  fontName,
  fontStack,
  PAIR_WORDS,
  pairSample,
  pairsShown,
  PREVIEW_RADIUS,
  ratioText,
  suggestionFor,
  type BrandState,
} from './brand-words';

/** A card's heading (the prototype's `.card h3`). */
function CardTitle({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <h3 className="mb-1 text-[17px] font-semibold">{children}</h3>;
}

/**
 * "Use my brand" with what it means now (BRN-02, BRN-05): on with the add-on's end or the plan, off, or why it cannot be
 * turned on. Its line wraps, so the add-on's end is never cut off (Part 23).
 */
export function SwitchCard({
  state,
  addonEnds,
  disabled,
  onChange,
}: {
  state: BrandState;
  addonEnds: string | null;
  disabled: boolean;
  onChange: (on: boolean) => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const on = state === 'on' || state === 'plan';
  const line =
    state === 'on'
      ? t('brUseOn', { date: addonEnds ?? '' })
      : state === 'plan'
        ? t('brUseOnPlan')
        : state === 'trial' || state === 'noaddon'
          ? t('brBuyToOn')
          : t('brUseOff');
  return (
    <Card>
      <div className="flex min-h-11 items-center gap-3 py-2.5">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-medium">{t('brUse')}</span>
          <span className="text-[14px] text-fg-muted">{line}</span>
        </span>
        <Switch checked={on} label={t('brUse')} disabled={disabled} onChange={onChange} />
      </div>
    </Card>
  );
}

export type ImageSlot = 'darkLogo' | 'icon';

/** One logo's tile: the picture on its own background, its name, and its button or its upload's progress. */
function LogoTile({
  label,
  background,
  children,
  action,
}: {
  label: string;
  background: string;
  children: React.ReactNode;
  action: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5">
      <div
        className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-[10px] border border-line text-[20px] font-extrabold"
        style={{ background }}
      >
        {children}
      </div>
      <span className="text-center text-[12px] text-fg-muted">{label}</span>
      {action}
    </div>
  );
}

/**
 * The logos (BRN-02, Part 23): the one on light is the shop's own logo, changed in Shop details; the dark logo and the
 * square icon are uploaded here and, once set, open their sheet. Unset, each shows what is used instead: the monogram.
 */
export function LogosCard({
  shopName,
  slug,
  shopLogo,
  form,
  uploading,
  iconProblem,
  uploadProblem,
  onShopDetails,
  onUpload,
  onOpen,
}: {
  shopName: string;
  slug: string;
  shopLogo: ImageView | null;
  form: BrandIdentity;
  uploading: { slot: ImageSlot; percent: number } | null;
  iconProblem: { width: number; height: number } | null;
  uploadProblem: string | null;
  onShopDetails: () => void;
  onUpload: (slot: ImageSlot) => void;
  onOpen: (slot: ImageSlot) => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const letter = monogramLetter(shopName, slug);
  const slotAction = (slot: ImageSlot): React.ReactNode => {
    if (uploading?.slot === slot) {
      return (
        <span className="num text-[12px] leading-[28px] text-fg-muted">
          {t('brUploading', { percent: uploading.percent })}
        </span>
      );
    }
    const set = form[slot] !== null;
    return (
      <Button
        tone="outline"
        size="xs"
        disabled={uploading !== null}
        onClick={() => {
          if (set) onOpen(slot);
          else onUpload(slot);
        }}
      >
        {set ? t('bfChange') : t('brUpload')}
      </Button>
    );
  };
  const progress = (slot: ImageSlot): React.ReactNode =>
    uploading?.slot === slot ? (
      <span className="absolute right-[12%] bottom-[14%] left-[12%] h-1 rounded-[2px] bg-white/30">
        <span
          className="block h-full rounded-[2px] bg-white"
          style={{ width: `${String(uploading.percent)}%` }}
        />
      </span>
    ) : null;
  return (
    <Card>
      <CardTitle>{t('brLogos')}</CardTitle>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <LogoTile
          label={t('brLogoLight')}
          background="#ffffff"
          action={
            <Button tone="outline" size="xs" onClick={onShopDetails}>
              {t('bfChange')}
            </Button>
          }
        >
          {shopLogo ? (
            <img
              src={shopLogo.urls.thumbnail}
              alt=""
              className="max-h-[70%] max-w-[80%] object-contain"
            />
          ) : (
            <span className="text-brand-700">{letter}</span>
          )}
        </LogoTile>
        <LogoTile label={t('brLogoDark')} background="#10201f" action={slotAction('darkLogo')}>
          {form.darkLogo ? (
            <img
              src={form.darkLogo.urls.thumbnail}
              alt=""
              className={`max-h-[70%] max-w-[80%] object-contain ${uploading?.slot === 'darkLogo' ? 'opacity-35' : ''}`}
            />
          ) : (
            <span className={`text-white ${uploading?.slot === 'darkLogo' ? 'opacity-35' : ''}`}>
              {letter}
            </span>
          )}
          {progress('darkLogo')}
        </LogoTile>
        <LogoTile label={t('brIcon')} background={form.mainColor} action={slotAction('icon')}>
          {form.icon ? (
            <img
              src={form.icon.urls.thumbnail}
              alt=""
              className={`aspect-square w-[72%] rounded-[18%] object-cover ${uploading?.slot === 'icon' ? 'opacity-35' : ''}`}
            />
          ) : (
            <span
              className={uploading?.slot === 'icon' ? 'opacity-35' : ''}
              style={{ color: derivedBrandColors(form).onMain }}
            >
              {letter}
            </span>
          )}
          {progress('icon')}
        </LogoTile>
      </div>
      <p className="mt-2.5 text-[14px] text-fg-muted">{t('brLightNote')}</p>
      {iconProblem || uploadProblem ? (
        <p role="alert" className="mt-2.5 text-[13px] font-medium text-danger">
          {iconProblem ? t('brIconBad', iconProblem) : uploadProblem}
        </p>
      ) : null}
    </Card>
  );
}

/** A pair's line: its "Aa" in its colours, its words, its ratio with ✓ or ✗ (BRN-03). */
export function PairLine({
  pair,
  words,
  colours,
}: {
  pair: BrandContrastPair;
  words: string;
  colours: BrandColors;
}): React.JSX.Element {
  const sample = pairSample(pair.pair, colours);
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2">
        {/* An illustration of the pair, failing ones included; the words beside it and the ratio say it. */}
        <i
          aria-hidden="true"
          data-sample=""
          className="inline-flex h-[22px] w-8 flex-none items-center justify-center rounded-[5px] border border-black/8 text-[11px] font-bold not-italic"
          style={{ background: sample.on, color: sample.text }}
        >
          Aa
        </i>
        {words}
      </span>
      <span className={`num ${pair.passes ? 'text-success' : 'text-danger'}`}>
        {ratioText(pair.ratio)} {pair.passes ? '✓' : '✗'}
      </span>
    </div>
  );
}

/** Under a failing pair: what it needs, and the nearest shade that passes with Use (BRN-03, Part 23). */
export function PairFix({
  pair,
  contrast,
  onUse,
}: {
  pair: BrandContrastPair;
  contrast: BrandContrast;
  onUse: (shade: string) => void;
}): React.JSX.Element | null {
  const { t } = useTranslation('menu');
  if (pair.passes) return null;
  const shade = suggestionFor(pair, contrast);
  return (
    <div className="flex items-center justify-between gap-3 text-[12px] text-fg-muted">
      <span className="num">{t('brNeeds', { needs: pair.needs })}</span>
      {shade ? (
        <Button
          tone="outline"
          size="xs"
          onClick={() => {
            onUse(shade);
          }}
        >
          <span
            className="size-3.5 flex-none rounded-full border border-black/12"
            style={{ background: shade }}
          />
          <span className="num">{t('brUseShade', { colour: shade })}</span>
        </Button>
      ) : null}
    </div>
  );
}

/** The colours (BRN-02, BRN-03): the three, each opening its sheet, and the check as the server makes it. */
export function ColoursCard({
  colours,
  contrast,
  onOpen,
  onUse,
}: {
  colours: BrandColors;
  contrast: BrandContrast;
  onOpen: (colour: keyof BrandColors) => void;
  /** A failing pair's Use: its answering colour takes the nearest shade that passes. */
  onUse: (colour: keyof BrandColors, shade: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  return (
    <Card>
      <CardTitle>{t('brColours')}</CardTitle>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {COLOURS.map((each) => (
          <button
            key={each.colour}
            type="button"
            onClick={() => {
              onOpen(each.colour);
            }}
            className="flex flex-col items-center gap-1.5 text-[12px] text-fg-muted"
          >
            <span
              className="block size-10 rounded-[10px] border border-black/8 outline-[3px] outline-offset-2 outline-primary outline-solid"
              style={{ background: colours[each.colour] }}
            />
            <span>{t(each.label)}</span>
            <span className="num text-[11px]">{colours[each.colour]}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-1.5 text-[13px]">
        {pairsShown(contrast).map((pair) => (
          <div key={pair.pair} className="contents">
            <PairLine pair={pair} words={t(PAIR_WORDS[pair.pair].page)} colours={colours} />
            <PairFix
              pair={pair}
              contrast={contrast}
              onUse={(shade) => {
                onUse(BRAND_PAIR_COLOR[pair.pair], shade);
              }}
            />
          </div>
        ))}
      </div>
      <p className="mt-2 text-[14px] text-fg-muted">{t('brContrast')}</p>
    </Card>
  );
}

/** A pair's sample in its own faces (Part 17): a heading at 700 (a one-weight face stays regular), body text at 400. */
export function FontSample({
  kind,
  font,
}: {
  kind: 'heading' | 'body';
  font: BrandFont;
}): React.JSX.Element {
  const [bangla, latin] = FONT_SAMPLES[kind];
  const heading = kind === 'heading';
  return (
    <div
      className="flex min-w-0 flex-col gap-0.5 text-fg [font-synthesis:none]"
      style={{ fontFamily: fontStack(font) }}
    >
      <span className={`leading-[1.5] ${heading ? 'text-[21px] font-bold' : 'text-[15px]'}`}>
        {bangla}
      </span>
      <span className={`leading-[1.35] ${heading ? 'text-[18px] font-bold' : 'text-[14px]'}`}>
        {latin}
      </span>
    </div>
  );
}

/** The fonts (BRN-02, Part 17): what headings and body text are set in now, each with Change. */
export function FontsCard({
  heading,
  body,
  onChange,
}: {
  heading: BrandFont;
  body: BrandFont;
  onChange: (kind: 'heading' | 'body') => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const slot = (kind: 'heading' | 'body', font: BrandFont): React.JSX.Element => (
    <div className="flex flex-col gap-1.5 rounded-[10px] border border-line p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-fg-muted">
          {t(kind === 'heading' ? 'bfHeading' : 'bfBody')}
        </span>
        <Button
          tone="outline"
          size="xs"
          onClick={() => {
            onChange(kind);
          }}
        >
          {t('bfChange')}
        </Button>
      </div>
      <FontSample kind={kind} font={font} />
      <span className="text-[12px] text-fg-muted">{fontName(font, t('bfDefault'))}</span>
    </div>
  );
  return (
    <Card>
      <CardTitle>{t('brFonts')}</CardTitle>
      <div className="mt-2.5 flex flex-col gap-2.5">
        {slot('heading', heading)}
        {slot('body', body)}
      </div>
      <p className="mt-2.5 text-[14px] text-fg-muted">{t('bfHint')}</p>
    </Card>
  );
}

const CORNERS: readonly { value: BrandCorners; words: string; radius: string }[] = [
  { value: BrandCorners.Square, words: 'brSquare', radius: 'rounded-[2px]' },
  { value: BrandCorners.Soft, words: 'brSoft', radius: 'rounded-[8px]' },
  { value: BrandCorners.Round, words: 'brRound', radius: 'rounded-[16px]' },
];

const SPACINGS: readonly { value: BrandSpacing; words: string }[] = [
  { value: BrandSpacing.Compact, words: 'brCompact' },
  { value: BrandSpacing.Comfortable, words: 'brComfortable' },
  { value: BrandSpacing.Airy, words: 'brAiry' },
];

/** Corners and spacing (BRN-02): three shapes, each drawn in its own corner, and three spacings. */
export function ShapeCard({
  corners,
  spacing,
  onCorners,
  onSpacing,
}: {
  corners: BrandCorners;
  spacing: BrandSpacing;
  onCorners: (corners: BrandCorners) => void;
  onSpacing: (spacing: BrandSpacing) => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  return (
    <Card>
      <CardTitle>{t('brShape')}</CardTitle>
      <div className="mt-2.5 flex gap-2">
        {CORNERS.map((each) => (
          <button
            key={each.value}
            type="button"
            aria-pressed={corners === each.value}
            onClick={() => {
              onCorners(each.value);
            }}
            className={[
              'h-11 flex-1 bg-white text-[13px] font-semibold',
              each.radius,
              corners === each.value
                ? 'border-2 border-primary text-primary'
                : 'border border-line-strong text-fg-muted',
            ].join(' ')}
          >
            {t(each.words)}
          </button>
        ))}
      </div>
      <h3 className="mt-3.5 mb-1 text-[17px] font-semibold">{t('brSpacing')}</h3>
      <ChipRow className="mt-2">
        {SPACINGS.map((each) => (
          <Chip
            key={each.value}
            on={spacing === each.value}
            onClick={() => {
              onSpacing(each.value);
            }}
          >
            {t(each.words)}
          </Chip>
        ))}
      </ChipRow>
    </Card>
  );
}

export type PreviewTab = 'store' | 'landing' | 'dash';

// BRN-06: how much room each spacing gives the preview's hero and tiles, as the prototype draws them.
const ROOM: Readonly<Record<BrandSpacing, { hero: string; tiles: string }>> = {
  [BrandSpacing.Compact]: { hero: 'mx-2 mt-1.5 h-[52px]', tiles: 'gap-[5px] px-2 py-1.5' },
  [BrandSpacing.Comfortable]: { hero: 'mx-3 mt-2.5 h-16', tiles: 'gap-2 px-3 py-2.5' },
  [BrandSpacing.Airy]: { hero: 'mx-4 mt-3.5 h-[76px]', tiles: 'gap-3 px-4 py-3.5' },
};

/**
 * The live preview (BRN-06, prototype `brandPreview`): a storefront, a landing page or the dashboard, drawn from the
 * page's colours (the text on each derived, BRN-03), fonts, corners and spacing; its header shows the dark logo once
 * set, else the monogram. Nothing here is live until Apply or Save.
 */
export function BrandPreview({
  tab,
  form,
  shopName,
  slug,
}: {
  tab: PreviewTab;
  form: BrandIdentity;
  shopName: string;
  slug: string;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const derived = derivedBrandColors(form);
  const room = ROOM[form.spacing];
  const style = {
    '--bm': form.mainColor,
    '--ba': form.accentColor,
    '--bb': form.backgroundColor,
    '--bt': derived.text,
    '--bom': derived.onMain,
    '--boa': derived.onAccent,
    '--br': `${String(PREVIEW_RADIUS[form.corners])}px`,
    '--bfh': fontStack(form.headingFont),
    '--bfb': fontStack(form.bodyFont),
  } as CSSProperties;
  const heading = '[font-family:var(--bfh)] [font-synthesis:none]';
  const header = (
    <div
      className={`flex items-center gap-2 bg-[var(--bm)] px-3 py-2.5 text-[13px] font-bold text-[var(--bom)] ${heading}`}
    >
      {form.darkLogo ? (
        <img
          src={form.darkLogo.urls.thumbnail}
          alt=""
          className="h-[22px] max-w-16 object-contain"
        />
      ) : (
        <span className="inline-flex size-[22px] items-center justify-center rounded-[6px] bg-white text-[12px] font-extrabold text-[var(--bm)]">
          {monogramLetter(shopName, slug)}
        </span>
      )}
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{shopName}</span>
    </div>
  );
  const powered = (
    <span className="inline-flex items-center gap-1">
      <Icon name="mark" size={10} />
      {t('poweredBy', { ns: 'shell' })}
    </span>
  );
  const tile = (name: string, price: string): React.JSX.Element => (
    <div className="rounded-[var(--br)] border border-black/6 bg-white p-2 text-[11px] text-[#10201f]">
      <div className="mb-1.5 h-10 rounded-[calc(var(--br)_-_4px)] bg-[color-mix(in_srgb,var(--bm)_18%,#fff)]" />
      <b className={`block text-[12px] ${heading}`}>{name}</b>
      <span>{price}</span>
      <div className="mt-1.5 flex h-6 items-center justify-center rounded-[calc(var(--br)_-_2px)] bg-[var(--ba)] text-[11px] font-bold text-[var(--boa)]">
        {t('brSmOrder')}
      </div>
    </div>
  );
  return (
    <div
      data-sample=""
      className="overflow-hidden rounded-[12px] border border-line bg-[var(--bb)] text-[var(--bt)] [font-family:var(--bfb)]"
      style={style}
    >
      {header}
      {tab === 'dash' ? (
        <>
          <div className="flex flex-col gap-1.5 px-3 py-2.5">
            <span
              className={`inline-flex h-[22px] items-center self-start rounded-full bg-[var(--bm)] px-2.5 text-[11px] font-bold text-[var(--bom)] ${heading}`}
            >
              {t('brSmOrders')}
            </span>
            {(['brSmConfirm', 'brSmLow', 'brSmBalance'] as const).map((words, index) => (
              <div
                key={words}
                className="flex h-7 items-center gap-1.5 rounded-[8px] border border-black/6 bg-white px-2 text-[11px] text-[#10201f]"
              >
                <i
                  className={`inline-block size-3.5 rounded-[4px] ${index === 2 ? 'bg-[var(--ba)]' : 'bg-[var(--bm)]'}`}
                />
                <span>{t(words)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between px-3 pt-1.5 pb-2.5 text-[10px] text-[#555]">
            {powered}
          </div>
        </>
      ) : (
        <>
          <div
            className={`flex items-end rounded-[var(--br)] bg-[linear-gradient(135deg,var(--bm),color-mix(in_srgb,var(--bm)_60%,#000))] px-3 py-2.5 text-[12px] font-bold text-[var(--bom)] ${room.hero} ${heading}`}
          >
            <span>{t(tab === 'landing' ? 'brSmLanding' : 'brSmHero')}</span>
          </div>
          <div className={`grid grid-cols-2 ${room.tiles}`}>
            {tile(t('brSmPanjabi'), '৳1,290')}
            {tile(t('brSmSaree'), '৳2,450')}
          </div>
          <div className="flex justify-between px-3 pt-1.5 pb-2.5 text-[10px] text-[#555]">
            {powered}
            <span>{t('brSmPaid')} ✓</span>
          </div>
        </>
      )}
    </div>
  );
}

/** The preview's card: its three tabs, the drawing, and when the live pages change (BRN-06). */
export function PreviewCard({
  tab,
  onTab,
  children,
}: {
  tab: PreviewTab;
  onTab: (tab: PreviewTab) => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const tabs: readonly { value: PreviewTab; words: string }[] = [
    { value: 'store', words: 'brPvStore' },
    { value: 'landing', words: 'brPvLanding' },
    { value: 'dash', words: 'brPvDash' },
  ];
  return (
    <Card>
      <CardTitle>{t('brPreview')}</CardTitle>
      {/* 12 px under the title, as the drawing's title (in its flex `.sechead`) keeps its own 4 px beside the row's 8. */}
      <ChipRow className="mt-3 mb-2.5">
        {tabs.map((each) => (
          <Chip
            key={each.value}
            on={tab === each.value}
            onClick={() => {
              onTab(each.value);
            }}
          >
            {t(each.words)}
          </Chip>
        ))}
      </ChipRow>
      {children}
      <p className="mt-2.5 text-[14px] text-fg-muted">{t('brPvNote')}</p>
    </Card>
  );
}
