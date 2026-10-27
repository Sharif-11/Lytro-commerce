import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/icon';
import { Card } from '@/components/ui/card';
import { ChipCount, ChipRow } from '@/components/ui/chips';
import { chipClass } from '@/components/ui/classes';
import { rowClass } from '@/components/ui/list-row';
import { StatusTag } from '@/components/ui/status-tag';
import { initialOf } from '@/lib/initial';
import { bangladeshiPhone } from '@/lib/phone';
import type { RoleSummary, SeatUsage, StaffMember } from '@/types/staff';
import { personLabel, seatsFull } from './team-words';

/** People and Roles, the two halves of Team, each with its count. */
export function TeamChips({
  slug,
  current,
  people,
  roles,
}: {
  slug: string;
  current: 'people' | 'roles';
  people: number | undefined;
  roles: number | undefined;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const chip = (on: boolean, label: string, count: number | undefined) => (
    <>
      {t(label)}
      {count === undefined ? null : <ChipCount on={on}>{count}</ChipCount>}
    </>
  );
  return (
    <ChipRow>
      <Link to="/$shop/team" params={{ shop: slug }} className={chipClass(current === 'people')}>
        {chip(current === 'people', 'people', people)}
      </Link>
      <Link
        to="/$shop/team/roles"
        params={{ shop: slug }}
        className={chipClass(current === 'roles')}
      >
        {chip(current === 'roles', 'rolesL', roles)}
      </Link>
    </ChipRow>
  );
}

/** STF-02: the seats in use against the plan's, the owner's among them, and what to do when none is free. */
export function SeatsCard({ seats }: { seats: SeatUsage }): React.JSX.Element {
  const { t } = useTranslation('menu');
  const full = seatsFull(seats);
  return (
    <Card>
      <div className="flex justify-between gap-3 pb-2 text-[15px]">
        <span className="text-fg-muted">
          {seats.total === null
            ? t('seatsUnlimited', { used: seats.used })
            : t('seats', { used: seats.used, total: seats.total })}
        </span>
        {seats.total === null ? null : (
          <span className="num font-medium">
            {seats.used} / {seats.total}
          </span>
        )}
      </div>
      {seats.total === null ? null : (
        <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
          <i
            className={`block h-full rounded-full ${full ? 'bg-accent' : 'bg-primary'}`}
            style={{
              width: `${String(Math.min(100, (seats.used / Math.max(1, seats.total)) * 100))}%`,
            }}
          />
        </div>
      )}
      {full ? <p className="mt-2 text-[14px] text-fg-muted">{t('seatsFull')}</p> : null}
    </Card>
  );
}

/**
 * One person (the prototype's `team` rows): their initial, name and tags; their phone and roles, or every permission
 * for the owner; "Password not set" until they choose their own (STF-13). Someone inactive is marked by the Off tag
 * and a grey initial, not faded as drawn: a 60% fade puts their phone and role under AA. A row opens the person's
 * sheet for whoever may manage staff; the owner's never does.
 */
export function PersonRow({
  member,
  roles,
  onOpen,
}: {
  member: StaffMember;
  roles: readonly RoleSummary[];
  onOpen: (() => void) | null;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const label = personLabel(member);
  const roleNames = member.roleIds
    .map((id) => roles.find((role) => role.id === id)?.name)
    .filter((name): name is string => name !== undefined);
  const sub = member.isOwner
    ? t('everyPermission')
    : [
        member.name !== null && member.phone ? bangladeshiPhone.grouped(member.phone) : null,
        roleNames.length > 0 ? roleNames.join(', ') : t('noRole'),
      ]
        .filter(Boolean)
        .join(' · ');
  const body = (
    <>
      <span
        aria-hidden="true"
        className={`flex size-9 flex-none items-center justify-center rounded-full font-semibold ${member.active ? 'bg-brand-100 text-brand-800' : 'bg-neutral-100 text-fg-muted'}`}
      >
        {initialOf(label)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="min-w-0 overflow-hidden text-[16px] font-medium text-ellipsis whitespace-nowrap">
          {label}
          {member.isOwner ? (
            <>
              {' '}
              <StatusTag tone="info">{t('owner')}</StatusTag>
            </>
          ) : null}
          {member.active ? null : (
            <>
              {' '}
              <StatusTag tone="neutral">{t('off')}</StatusTag>
            </>
          )}
        </span>
        <span className="num overflow-hidden text-[14px] text-ellipsis whitespace-nowrap text-fg-muted">
          {sub}
        </span>
      </span>
      {member.active && member.mustSetPassword && !member.isOwner ? (
        <span className="flex flex-none">
          <StatusTag tone="warn">{t('noPassword')}</StatusTag>
        </span>
      ) : null}
    </>
  );
  return onOpen ? (
    <button type="button" className={rowClass} onClick={onOpen}>
      {body}
    </button>
  ) : (
    <div className={rowClass}>{body}</div>
  );
}

/** A row of a sheet's own list (the edit sheet's Reset password and Deactivate): its icon tile, name, line, chevron. */
export function SheetRow({
  icon,
  title,
  sub,
  danger = false,
  onClick,
}: {
  icon: 'key' | 'minus' | 'check';
  title: string;
  sub: string;
  danger?: boolean;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${rowClass} ${danger ? 'text-danger' : ''}`}
    >
      <span
        className={`flex size-10 flex-none items-center justify-center rounded-[8px] ${danger ? 'bg-danger-soft text-danger' : 'bg-neutral-100 text-fg-muted'}`}
      >
        <Icon name={icon} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[16px] font-medium">{title}</span>
        <span className="text-[14px] text-fg-muted">{sub}</span>
      </span>
      <Icon name="right" />
    </button>
  );
}
