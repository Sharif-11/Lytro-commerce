import { useTranslation } from 'react-i18next';
import { NoPage } from '@/components/error-banner';
import { Card } from '@/components/ui/card';
import { SectionHead } from '@/components/ui/page';
import { useOnline } from '@/hooks/use-online';
import { useSlow } from '@/hooks/use-slow';

/*
 * Loading (Fixes · UI/UX batch 2, the prototype's `ux-loading-*`): one style everywhere. The page's frame, title, tabs and
 * the headings the app already knows come at once; only what the server sends shimmers, in the shape it will land in,
 * so nothing jumps. A slow, soft sweep (index.css's `.skeleton`), still under reduced motion. After 8 s a kind line;
 * when the connection drops, 1.1's not-loaded card takes the shimmer's place.
 */

type BoneKind = 'l1' | 'l2' | 'h1' | 'fig' | 'pill' | 'thumb' | 'icon' | 'avatar';

const BONES: Record<BoneKind, string> = {
  l1: 'h-4',
  l2: 'h-[13px]',
  h1: 'h-6 rounded-[8px]',
  fig: 'h-[30px] rounded-[8px]',
  pill: 'h-[22px] w-[52px]',
  thumb: 'size-12 rounded-[8px]',
  icon: 'size-10 rounded-[10px]',
  avatar: 'size-9',
};

/** One shimmering bone (the prototype's `.ux-sk`): a line, a figure, a pill, a picture's square or an avatar. */
export function Bone({
  kind = 'l1',
  width,
}: {
  kind?: BoneKind;
  width?: string;
}): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`skeleton ${BONES[kind]}`}
      style={width ? { width } : undefined}
    />
  );
}

/** The rows' line widths, varied so a list reads as a list (the prototype's `UX_SKW`). */
const WIDTHS: readonly (readonly [number, number])[] = [
  [68, 50],
  [56, 40],
  [62, 46],
  [50, 34],
  [64, 44],
  [58, 38],
];

/**
 * The kind line above a list still loading after 8 s (the prototype's `.ux-slow`): three soft dots and "Taking a little
 * longer…". Nothing before then, and nothing offline, where the not-loaded card says it instead.
 */
export function SlowLine(): React.JSX.Element | null {
  const { t } = useTranslation('shell');
  const slow = useSlow();
  const online = useOnline();
  if (!slow || !online) return null;
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-card border border-line bg-surface px-3.5 py-3 text-[15px]"
    >
      <span className="slow-dots inline-flex flex-none gap-1 pt-[9px]" aria-hidden="true">
        <i className="size-1.5 rounded-full bg-primary opacity-35" />
        <i className="size-1.5 rounded-full bg-primary opacity-35" />
        <i className="size-1.5 rounded-full bg-primary opacity-35" />
      </span>
      <span>
        <b className="block font-semibold">{t('ux2.slowT')}</b>
        <span className="mt-0.5 block text-[14px] text-neutral-700">{t('ux2.slowP')}</span>
      </span>
    </div>
  );
}

/**
 * A list loading, as rows in its own shape (TENANT-DASHBOARD-DESIGN §9; the prototype's `uxSkList`): two lines and a
 * figure with its pill, a product's picture square when `thumb`, a day heading when `day`. `from` continues a list
 * already shown (Show more), its rows under the last real one. Offline, a list that never loaded says so instead.
 */
export function SkeletonRows({
  count = 3,
  thumb = false,
  day = false,
  from = 0,
}: {
  count?: number;
  thumb?: boolean;
  day?: boolean;
  from?: number;
}): React.JSX.Element {
  const { t } = useTranslation('shell');
  const online = useOnline();
  if (!online && from === 0) return <NoPage />;
  return (
    <div
      role="status"
      aria-label={t('loading')}
      className={`pointer-events-none ${from > 0 ? 'border-t border-line' : ''}`}
    >
      {day ? (
        <div className="bg-neutral-50 px-4 pt-3 pb-1">
          <Bone kind="l2" width="44px" />
        </div>
      ) : null}
      <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-line">
        {Array.from({ length: count }, (_, index) => {
          const [first, second] = WIDTHS[(index + from) % WIDTHS.length] ?? [60, 40];
          return (
            <div key={index} className="flex min-h-16 items-center gap-3 px-4 py-3">
              {thumb ? <Bone kind="thumb" /> : null}
              <span className="flex min-w-0 flex-1 flex-col justify-center gap-2.5">
                <Bone width={`${String(first)}%`} />
                <Bone kind="l2" width={`${String(second)}%`} />
              </span>
              <span className="flex flex-col items-end gap-2.5">
                <Bone width={thumb ? '64px' : '56px'} />
                <Bone kind="pill" />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Home's "To do today" loading (the prototype's `.ux-skjob`): a job's icon square and its one line. */
export function SkeletonJobs(): React.JSX.Element {
  const { t } = useTranslation('shell');
  const online = useOnline();
  if (!online) return <NoPage />;
  return (
    <div
      role="status"
      aria-label={t('loading')}
      className="pointer-events-none flex flex-col [&>*+*]:border-t [&>*+*]:border-line"
    >
      {['58%', '66%', '50%', '62%'].map((width) => (
        <div key={width} className="flex min-h-[60px] items-center gap-3 px-4 py-3">
          <Bone kind="icon" />
          <Bone width={width} />
        </div>
      ))}
    </div>
  );
}

/**
 * An order loading (the prototype's `uxSkOrder`): the cards every order has, their headings known -- Customer, Items,
 * Pricing -- the rest shimmering; the number, the time and the status pill as bones above them.
 */
export function OrderSkeleton(): React.JSX.Element {
  const { t } = useTranslation('orders');
  const shell = useTranslation('shell');
  const online = useOnline();
  if (!online) {
    return (
      <Card>
        <NoPage />
      </Card>
    );
  }
  return (
    <div role="status" aria-label={shell.t('loading')} className="contents">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2.5">
          <Bone kind="h1" width="180px" />
          <Bone kind="l2" width="150px" />
        </div>
        <Bone kind="pill" />
      </div>
      <Card>
        <SectionHead link={<Bone kind="l2" width="64px" />}>{t('customer')}</SectionHead>
        <div className="flex items-center gap-3 pt-3 pb-1">
          <Bone kind="avatar" />
          <span className="flex min-w-0 flex-1 flex-col gap-2.5">
            <Bone width="46%" />
            <Bone kind="l2" width="34%" />
          </span>
        </div>
        <div className="mt-2 flex flex-col gap-2.5">
          <Bone kind="l2" width="82%" />
          <Bone kind="l2" width="58%" />
        </div>
      </Card>
      <Card flush>
        <div className="px-4 pt-4 pb-1">
          <h3 className="text-[16px] font-semibold">{t('itemsTitle')}</h3>
        </div>
        <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-line">
          {[
            ['54%', '30%'],
            ['62%', '44%'],
          ].map(([first, second]) => (
            <div key={first} className="flex items-start gap-3 px-4 py-3">
              <Bone kind="thumb" />
              <span className="flex min-w-0 flex-1 flex-col gap-2.5">
                <Bone width={first} />
                <Bone kind="l2" width={second} />
                <Bone kind="l2" width="26%" />
              </span>
              <Bone width="56px" />
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <h3 className="text-[16px] font-semibold">{t('pricing')}</h3>
        {['30%', '46%', '22%'].map((width) => (
          <div key={width} className="flex items-center justify-between py-2">
            <Bone kind="l2" width={width} />
            <Bone kind="l2" width="60px" />
          </div>
        ))}
      </Card>
    </div>
  );
}
