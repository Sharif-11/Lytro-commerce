import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { formatTaka } from '@lytronix/ui';
import { Icon } from '@/components/icon';
import { Card } from '@/components/ui/card';
import { PhasePill } from '@/components/ui/page';
import { useShell } from '@/shell/shell-context';
import { doneOf, FIRST_GROUP, type Checklist } from './checklist';

/** The prototype's `.checkbox`: 22 px, ticked in the primary colour. */
function Tick({ done }: { done: boolean }): React.JSX.Element {
  return (
    <span
      className={[
        'inline-flex size-[22px] flex-none items-center justify-center rounded-[6px] border-2 text-white [&_svg]:stroke-3',
        done ? 'border-primary bg-primary' : 'border-neutral-300',
      ].join(' ')}
    >
      {done ? <Icon name="check" size={14} /> : null}
    </span>
  );
}

const ROW = 'flex min-h-[52px] w-full items-center gap-3 px-4 py-3 text-left no-underline';
// The prototype's `.row .l1` and `.l2`: one line each, cut with an ellipsis.
const LINE = 'overflow-hidden text-ellipsis whitespace-nowrap';

interface ItemProps {
  done: boolean;
  label: string;
  detail?: string;
  /** Where the item is done, while it is not; none for an item whose screen is not built yet. */
  to?: '/$shop/products' | '/$shop/settings/shop';
  /** A place on this page instead (the link card). */
  href?: string;
}

/** One item (the prototype's `ck`): its tick, its name (muted once done) and what it says; a way there while open. */
function Item({ done, label, detail, to, href }: ItemProps): React.JSX.Element {
  const { slug } = useShell();
  const open = !done && (to !== undefined || href !== undefined);
  const content: ReactNode = (
    <>
      <Tick done={done} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={[LINE, 'text-[15px] font-medium', done ? 'text-fg-muted' : ''].join(' ')}>
          {label}
        </span>
        {detail ? <span className={`${LINE} text-[14px] text-fg-muted`}>{detail}</span> : null}
      </span>
      {open ? <Icon name="right" /> : null}
    </>
  );
  if (open && to) {
    return (
      <Link to={to} params={{ shop: slug }} className={`${ROW} hover:bg-neutral-50`}>
        {content}
      </Link>
    );
  }
  if (open && href) {
    return (
      <a href={href} className={`${ROW} hover:bg-neutral-50`}>
        {content}
      </a>
    );
  }
  return <div className={ROW}>{content}</div>;
}

/** An item that comes with a later phase: greyed, with the phase it arrives in (the prototype's `.later`). */
function Later({ label, phase }: { label: string; phase: number }): React.JSX.Element {
  const { t } = useTranslation('home');
  return (
    <div
      aria-disabled="true"
      className="flex min-h-12 w-full items-center gap-3 px-4 py-3 opacity-55"
    >
      <Tick done={false} />
      <span className={`${LINE} min-w-0 flex-1 text-[15px] font-medium`}>{label}</span>
      <PhasePill>{t('laterPhase', { p: t('phase', { n: phase }) })}</PhasePill>
    </div>
  );
}

/**
 * SUP-01's set-up checklist (TENANT-DASHBOARD-DESIGN §7.1), the owner's alone, each item ticked by the server: the
 * shop and its delivery done from the start, a first product, the link shared, the logo, and a wallet number greyed
 * until Phase 5; then "later, when you need them": a courier, SMS events and a listener phone greyed with their
 * phases, and an API key. The logo opens Shop details, where it is uploaded (Slice 11.6); the API key opens nothing
 * until its screen is rebuilt.
 */
export function SetupChecklist({
  checklist,
  shareTarget,
}: {
  checklist: Checklist;
  /** The link card's id, which "share your shop link" scrolls to. */
  shareTarget: string;
}): React.JSX.Element {
  const { t, i18n } = useTranslation('home');
  const done = doneOf(checklist);
  const charges = checklist.deliveryCharges;
  const area = i18n.language === 'bn' ? charges.area.bn : charges.area.en;

  return (
    <Card flush>
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[17px] font-semibold">{t('setupTitle')}</h2>
          <span className="num text-[14px] text-fg-muted">
            {t('setupDone', { done, total: FIRST_GROUP })}
          </span>
        </div>
        <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-neutral-100">
          <i
            className="block h-full rounded-full bg-primary"
            style={{ width: `${String((done / FIRST_GROUP) * 100)}%` }}
          />
        </div>
      </div>
      <div className="flex flex-col [&>*+*]:border-t [&>*+*]:border-line">
        <Item done label={t('ckShop')} />
        <Item
          done
          label={t('ckDelivery')}
          detail={t('ckDeliveryD', {
            area,
            inside: formatTaka(charges.inside),
            outside: formatTaka(charges.outside),
          })}
        />
        <Item done={checklist.firstProduct} label={t('ckProduct')} to="/$shop/products" />
        <Item done={checklist.linkShared} label={t('ckShare')} href={`#${shareTarget}`} />
        <Item done={checklist.logo} label={t('ckLogo')} to="/$shop/settings/shop" />
        <Later label={t('ckWallet')} phase={5} />
        <div className="bg-neutral-50 px-4 pt-3 pb-1 text-[13px] font-semibold text-fg-muted">
          {t('setupLater')}
        </div>
        <Later label={t('ckCourier')} phase={6} />
        <Later label={t('ckSms')} phase={7} />
        <Later label={t('ckListener')} phase={5} />
        <Item done={checklist.apiKey} label={t('ckApi')} />
      </div>
    </Card>
  );
}

/**
 * The checklist once its first group is done (the prototype's folded card): one row saying so and naming what is
 * left for later; tapping it opens the list again for this visit (decided 2026-10-23).
 */
export function SetupDone({ onOpen }: { onOpen: () => void }): React.JSX.Element {
  const { t } = useTranslation('home');
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-14 w-full items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 text-left"
    >
      <span className="flex size-10 flex-none items-center justify-center rounded-[8px] bg-success-soft text-success">
        <Icon name="check" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="overflow-hidden text-[16px] font-medium text-ellipsis whitespace-nowrap">
          {t('setupTitle')} · {t('setupDone', { done: FIRST_GROUP, total: FIRST_GROUP })}
        </span>
        <span className="overflow-hidden text-[14px] text-ellipsis whitespace-nowrap text-fg-muted">
          {t('setupLater')}: {t('ckCourier')}, {t('ckSms')}, {t('ckListener')}
        </span>
      </span>
      <Icon name="right" />
    </button>
  );
}
