import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  STOREFRONT_THEMES,
  monogramLetter,
  type StorefrontDesign,
  type StorefrontThemeKey,
} from '@lytronix/validators';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/classes';
import { Dialog } from '@/components/ui/dialog';
import { StatusTag } from '@/components/ui/status-tag';
import { Switch } from '@/components/ui/switch';
import type { ImageView } from '@/types/me';
import type { StorefrontEditor } from '@/types/storefront-design';
import { sectionIcon, sectionName, sectionRows, sectionSummary, wordsText } from './design-words';
import { EditorIcon, type EditorIconName } from './editor-icon';
import type { DraftDesign } from './use-draft';

// STOREFRONT-BUILDER-PLAN SB-5, SB-7, SB-8: the design page's cards, as the sketch draws them
// (docs/brand/lytro-storefront-builder.html, `e-home`), in the dashboard's own cards, buttons and switches.

/** The sketch's note line: an info mark and a sentence on a pale ground. */
export function NoteLine({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-[10px] bg-neutral-50 px-[11px] py-[9px] text-[12.5px] text-fg-muted">
      <Icon name="info" className="mt-px size-[18px] flex-none text-primary" />
      <span>{children}</span>
    </p>
  );
}

/** A theme's picture, the top of its sample shop's phone home page (public/storefront-themes). */
export function ThemePicture({
  theme,
  className,
}: {
  theme: StorefrontThemeKey;
  className?: string;
}) {
  const { i18n } = useTranslation();
  const language = i18n.language === 'en' ? 'en' : 'bn';
  return (
    <img
      src={`/storefront-themes/${theme}-${language}.jpg`}
      alt=""
      className={`w-full rounded-[12px] border border-line bg-surface object-cover object-top ${className ?? ''}`}
    />
  );
}

/** A theme's three colour sets, the chosen one ringed; each a button where it can be chosen. */
export function PaletteDots({
  theme,
  chosen,
  onPick,
}: {
  theme: StorefrontThemeKey;
  chosen: number | null;
  onPick?: (palette: number) => void;
}) {
  const { t } = useTranslation('menu');
  return (
    <div className="my-2 flex gap-2.5">
      {STOREFRONT_THEMES[theme].swatches.map((colour, at) => {
        const ring =
          at === chosen
            ? 'shadow-[0_0_0_2px_#fff,0_0_0_4px_var(--color-primary)]'
            : 'shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]';
        const dot = `block size-[22px] rounded-full ${ring}`;
        return onPick ? (
          <button
            key={colour}
            type="button"
            aria-label={t('sdPaletteN', { n: at + 1 })}
            aria-pressed={at === chosen}
            className={`${dot} cursor-pointer`}
            style={{ background: colour }}
            onClick={() => {
              onPick(at);
            }}
          />
        ) : (
          <i key={colour} className={dot} style={{ background: colour }} />
        );
      })}
    </div>
  );
}

/** The theme card: its picture, its name and who it suits, its colour sets, and Change theme. */
export function ThemeCard({
  design,
  slug,
  onPalette,
}: {
  design: StorefrontDesign;
  slug: string;
  onPalette: (palette: number) => void;
}) {
  const { t, i18n } = useTranslation('menu');
  const language = i18n.language === 'en' ? 'en' : 'bn';
  const theme = STOREFRONT_THEMES[design.theme];
  return (
    <Card className="grid grid-cols-[118px_1fr] items-center gap-3">
      <ThemePicture theme={design.theme} className="h-[178px]" />
      <div>
        <h2 className="flex items-center gap-2 text-[15.5px] font-bold">
          <EditorIcon name="palette" size={22} />
          {t('sdTheme', { name: theme.name[language] })}
        </h2>
        <p className="mt-[3px] mb-3 text-[13px] text-fg-muted">{theme.suits[language]}</p>
        <PaletteDots theme={design.theme} chosen={design.palette} onPick={onPalette} />
        <Link
          to="/$shop/settings/storefront/design/themes"
          params={{ shop: slug }}
          className={buttonClass('outline', 'sm')}
        >
          {t('sdChangeTheme')}
        </Link>
      </div>
    </Card>
  );
}

/** The shop's logo as the storefront's header shows it; its name where it has none. */
export function LogoMark({
  logo,
  shopName,
  height,
}: {
  logo: ImageView | null;
  shopName: string;
  height: number;
}) {
  if (logo) {
    return (
      <img
        src={logo.urls.main}
        alt=""
        className="w-auto max-w-[220px] object-contain"
        style={{ height }}
      />
    );
  }
  return <b className="text-[18px] font-bold whitespace-nowrap">{shopName}</b>;
}

/**
 * SB-5: the shop's square icon -- its own, else made from the logo, else the first letter of its name -- with the
 * corners a phone or a browser cuts it to.
 */
export function ShopIcon({
  icon,
  logo,
  shopName,
  slug,
  size,
  radius,
  className,
}: {
  icon: ImageView | null;
  logo: ImageView | null;
  shopName: string;
  slug: string;
  size: number;
  radius: number;
  className?: string;
}) {
  const style = { width: size, height: size, borderRadius: radius };
  if (icon) {
    return (
      <img
        src={icon.urls.main}
        alt=""
        className={`flex-none object-cover ${className ?? ''}`}
        style={style}
      />
    );
  }
  if (logo) {
    return (
      <span
        className={`flex flex-none items-center justify-center bg-white p-[12%] ${className ?? ''}`}
        style={style}
      >
        <img src={logo.urls.main} alt="" className="max-h-full max-w-full object-contain" />
      </span>
    );
  }
  return (
    <span
      className={`flex flex-none items-center justify-center bg-primary font-bold text-on-primary ${className ?? ''}`}
      style={{ ...style, fontSize: size * 0.5 }}
    >
      {monogramLetter(shopName, slug)}
    </span>
  );
}

/** The logo and icon card: both as they are now, what each is for, and the way to change them. */
export function BrandCard({
  slug,
  shopName,
  logo,
  icon,
}: {
  slug: string;
  shopName: string;
  logo: ImageView | null;
  icon: ImageView | null;
}) {
  const { t } = useTranslation('menu');
  return (
    <Card>
      <div className="flex items-center gap-2.5">
        <span className="flex-none">
          <LogoMark logo={logo} shopName={shopName} height={40} />
        </span>
        <span className="flex-1" />
        <ShopIcon icon={icon} logo={logo} shopName={shopName} slug={slug} size={44} radius={11} />
      </div>
      <p className="mt-2 mb-2.5 text-[13px] text-fg-muted">{t('sdBrandNote')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/$shop/settings/storefront/design/brand"
          params={{ shop: slug }}
          className={buttonClass('outline', 'sm')}
        >
          {t('sdLogoIcon')}
        </Link>
        <StatusTag tone="ok">{t('sdEveryPlan')}</StatusTag>
      </div>
    </Card>
  );
}

const FIXED: Readonly<
  Record<'header' | 'footer', { icon: EditorIconName; name: string; line: string }>
> = {
  header: { icon: 'header', name: 'sdHeader', line: 'sdHeaderSum' },
  footer: { icon: 'cols', name: 'sdFooter', line: 'sdFooterSum' },
};

/**
 * SB-8: the home page's sections top to bottom, as shoppers see them -- the fixed header and footer among them --
 * each with its arrows up and down, its switch and the way into it; then Add a section.
 */
export function SectionsCard({
  editor,
  design,
  disabled,
  onMove,
  onToggle,
  onOpen,
  onFixed,
  addButton,
}: {
  editor: Pick<StorefrontEditor, 'categories' | 'broken'>;
  design: StorefrontDesign;
  disabled: boolean;
  onMove: (id: string, by: -1 | 1) => void;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onFixed: (key: 'header' | 'footer') => void;
  addButton: ReactNode;
}) {
  const { t } = useTranslation('menu');
  const rows = sectionRows(design);
  const last = design.sections.length - 1;
  return (
    <Card>
      <h2 className="text-[15.5px] font-bold">{t('sdSections')}</h2>
      <p className="mt-[3px] mb-3 text-[13px] text-fg-muted">{t('sdSectionsSub')}</p>
      <ul>
        {rows.map((row) => {
          if (row.kind === 'fixed') {
            const fixed = FIXED[row.key];
            return (
              <li key={row.key} className={ROW}>
                <span className="w-6 flex-none" />
                <RowIcon name={fixed.icon} dim={false} />
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  onClick={() => {
                    onFixed(row.key);
                  }}
                >
                  <RowWords name={t(fixed.name)} line={t(fixed.line)} dim={false} />
                  <Chevron />
                </button>
              </li>
            );
          }
          const { section, index } = row;
          const name = wordsText(t, sectionName(section));
          const broken = editor.broken.includes(section.id);
          const line = broken
            ? t('sdBroken')
            : wordsText(t, sectionSummary(section, { design, categories: editor.categories }));
          return (
            <li key={section.id} className={ROW}>
              <span className="flex w-6 flex-none flex-col items-center text-neutral-500">
                <ArrowButton
                  icon="up"
                  label={t('sdMoveUp', { name })}
                  disabled={disabled || index === 0}
                  onClick={() => {
                    onMove(section.id, -1);
                  }}
                />
                <ArrowButton
                  icon="down"
                  label={t('sdMoveDown', { name })}
                  disabled={disabled || index === last}
                  onClick={() => {
                    onMove(section.id, 1);
                  }}
                />
              </span>
              <RowIcon name={sectionIcon(section)} dim={!section.visible} />
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                aria-label={t('sdOpen', { name })}
                onClick={() => {
                  onOpen(section.id);
                }}
              >
                <RowWords name={name} line={line} dim={!section.visible} warn={broken} />
              </button>
              <Switch
                checked={section.visible}
                label={t('sdShow', { name })}
                disabled={disabled}
                onChange={() => {
                  onToggle(section.id);
                }}
              />
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                className="flex-none"
                onClick={() => {
                  onOpen(section.id);
                }}
              >
                <Chevron />
              </button>
            </li>
          );
        })}
      </ul>
      {addButton}
    </Card>
  );
}

const ROW =
  'flex min-h-[60px] items-center gap-2.5 border-t border-neutral-100 px-0.5 py-2 first:border-t-0';

function RowIcon({ name, dim }: { name: EditorIconName; dim: boolean }) {
  return (
    <span
      className={`grid size-[38px] flex-none place-items-center rounded-[10px] bg-primary-soft text-primary ${dim ? 'opacity-45' : ''}`}
    >
      <EditorIcon name={name} size={20} />
    </span>
  );
}

function RowWords({
  name,
  line,
  dim,
  warn = false,
}: {
  name: string;
  line: string;
  dim: boolean;
  warn?: boolean;
}) {
  return (
    <span className={`min-w-0 flex-1 ${dim ? 'opacity-45' : ''}`}>
      <b className="block text-[14.5px] font-bold">{name}</b>
      <span
        className={`block truncate text-[12.5px] ${warn ? 'font-medium text-danger-text' : 'text-fg-muted'}`}
      >
        {line}
      </span>
    </span>
  );
}

function Chevron() {
  return <Icon name="right" className="size-[22px] flex-none text-neutral-500" />;
}

function ArrowButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: 'up' | 'down';
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-[22px] w-6 place-items-center rounded-[6px] disabled:opacity-35"
    >
      <EditorIcon name={icon} size={16} />
    </button>
  );
}

/** Asked when leaving while a change is still on its way to the draft. */
export function LeaveWhileSaving({ leaving }: { leaving: DraftDesign['leaving'] }) {
  const { t } = useTranslation('menu');
  return (
    <Dialog
      open={leaving !== null}
      title={t('lvTitle', { ns: 'shop' })}
      onClose={() => leaving?.stay()}
      actions={
        <>
          <Button tone="outline" onClick={() => leaving?.stay()}>
            {t('lvStay', { ns: 'shop' })}
          </Button>
          <Button tone="danger" onClick={() => leaving?.leave()}>
            {t('lvLeave', { ns: 'shop' })}
          </Button>
        </>
      }
    >
      {t('sdLeaveSaving')}
    </Dialog>
  );
}

/**
 * A drag handle (the sketch's six dots, DC-6): held and moved to drag its row or card, or moved with the arrow keys.
 * Shared by the Product list and any list of the editor that drags.
 */
export function Handle({
  label,
  disabled,
  onPointerDown,
  onKeyDown,
}: {
  label: string;
  disabled: boolean;
  onPointerDown: (event: React.PointerEvent) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className="grid size-7 flex-none cursor-grab touch-none place-items-center rounded-[8px] text-neutral-500 active:cursor-grabbing disabled:cursor-default disabled:opacity-35"
    >
      <EditorIcon name="drag" size={18} />
    </button>
  );
}
