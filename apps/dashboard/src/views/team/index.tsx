import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission } from '@lytronix/validators';
import { errorMessage } from '@/api/error-message';
import { useMe } from '@/api/me';
import { useRoles, useStaffList } from '@/api/staff';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/chip';
import { EmptyLine, Page } from '@/components/ui/fields';
import { Icon } from '@/components/ui/icon';
import { ErrorBanner } from '@/components/ui/notice';
import { Toast } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { bangladeshiPhone } from '@/lib/phone';
import { hasPermission } from '@/lib/permissions';
import type { RoleSummary, StaffMember } from '@/types/staff';
import { StaffSheet, type StaffSheetMode } from './staff-sheet';
import { TeamHeader } from './team-header';

/**
 * Team, People segment (DASHBOARD-SECTIONS-DESIGN §5): the seats first, the owner pinned, one row per
 * person with their roles, a deactivated person faded with the note that the seat is free. Container.
 */
export function Team(): React.JSX.Element {
  const { t } = useTranslation();
  const { shop } = useParams({ from: '/$shop/team' });
  const me = useMe();
  const canManage = hasPermission(me.data, Permission.StaffManage);
  const staff = useStaffList();
  const roles = useRoles();
  const [sheet, setSheet] = useState<StaffSheetMode | null>(null);
  const toast = useToast();

  const seats = staff.data?.seats ?? null;
  const full = seats !== null && seats.total !== null && seats.used >= seats.total;
  const percent =
    seats && seats.total !== null && seats.total > 0
      ? Math.min(100, Math.round((seats.used / seats.total) * 100))
      : 0;
  const people = [...(staff.data?.staff ?? [])].sort(
    (a, b) => Number(b.isOwner) - Number(a.isOwner) || Number(b.active) - Number(a.active),
  );

  return (
    <Page narrow>
      <TeamHeader
        shop={shop}
        segment="people"
        action={
          canManage ? (
            <Button
              type="button"
              fit
              className="min-h-10! text-[14px]!"
              disabled={full}
              onClick={() => {
                setSheet({ kind: 'add' });
              }}
            >
              <Icon name="plus" size={16} />
              {t('team.addStaff')}
            </Button>
          ) : null
        }
      />

      {seats ? (
        <section className="rounded-card border border-line bg-white px-4 py-3 shadow-card">
          <div className="flex items-center justify-between gap-3 text-[15px]">
            <span>
              {seats.total === null
                ? t('team.seatsUnlimited', { used: seats.used })
                : t('team.seatsUsed', { used: seats.used, total: seats.total })}
            </span>
            <b className="num">
              {seats.used}
              {seats.total === null ? '' : `/${String(seats.total)}`}
            </b>
          </div>
          {seats.total !== null ? (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100">
              <i
                className={`block h-full rounded-full ${full ? 'bg-accent-500' : 'bg-brand-700'}`}
                style={{ width: `${String(percent)}%` }}
              />
            </div>
          ) : null}
          {full ? <p className="mt-2 text-[14px] text-neutral-700">{t('team.seatsFull')}</p> : null}
        </section>
      ) : null}

      {staff.isLoading ? <EmptyLine>{t('common.loading')}</EmptyLine> : null}
      {staff.isError ? <ErrorBanner message={errorMessage(staff.error, t)} /> : null}
      {staff.data ? (
        <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
          {people.map((member) => (
            <PersonRow
              key={member.id}
              member={member}
              roles={roles.data ?? []}
              canOpen={canManage && !member.isOwner}
              onOpen={() => {
                setSheet({ kind: 'edit', member });
              }}
            />
          ))}
        </div>
      ) : null}
      <p className="text-[13px] text-neutral-700">{t('team.nobodyDeleted')}</p>

      <StaffSheet
        mode={sheet}
        slug={shop}
        roles={roles.data ?? []}
        onClose={() => {
          setSheet(null);
        }}
        onDone={(message) => {
          setSheet(null);
          toast.show(message);
        }}
      />
      <Toast message={toast.message} />
    </Page>
  );
}

function PersonRow({
  member,
  roles,
  canOpen,
  onOpen,
}: {
  member: StaffMember;
  roles: RoleSummary[];
  canOpen: boolean;
  onOpen: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const label = member.name ?? (member.phone ? bangladeshiPhone.display(member.phone) : '?');
  const initial = label.slice(0, 1).toUpperCase();
  const roleNames = member.roleIds
    .map((id) => roles.find((role) => role.id === id)?.name)
    .filter((name): name is string => name !== undefined);
  const body = (
    <>
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold ${
          member.active ? 'bg-brand-100 text-brand-800' : 'bg-neutral-100 text-neutral-500'
        }`}
      >
        {initial}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-ink">
          <span className="truncate">{label}</span>
          {member.isOwner ? <Tag tone="brand">{t('team.owner')}</Tag> : null}
          {!member.active ? <Tag tone="neutral">{t('team.off')}</Tag> : null}
        </p>
        {member.name !== null && member.phone ? (
          <p className="num text-[13px] text-neutral-700">
            {bangladeshiPhone.display(member.phone)}
            {!member.active ? ` · ${t('team.seatFreed')}` : ''}
          </p>
        ) : null}
        {member.isOwner ? (
          <p className="text-[13px] text-neutral-700">{t('team.everyPermission')}</p>
        ) : roleNames.length > 0 ? (
          <p className="mt-1 flex flex-wrap gap-1">
            {roleNames.map((name) => (
              <Tag key={name} tone="neutral">
                {name}
              </Tag>
            ))}
          </p>
        ) : (
          <p className="text-[13px] text-neutral-700">{t('team.noRole')}</p>
        )}
      </div>
      {canOpen ? (
        <span className="text-neutral-400">
          <Icon name="next" size={18} />
        </span>
      ) : null}
    </>
  );
  const className = `flex w-full items-center gap-3 border-t border-line px-4 py-3 text-left first:border-t-0 ${
    member.active ? '' : 'opacity-60'
  }`;
  return canOpen ? (
    <button type="button" onClick={onOpen} className={`${className} hover:bg-neutral-50`}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}
