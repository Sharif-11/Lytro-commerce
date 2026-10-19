import { useTranslation } from 'react-i18next';
import { Tag } from '@/components/ui/chip';
import { EmptyLine } from '@/components/ui/fields';
import { bangladeshiPhone } from '@/lib/phone';
import type { RoleSummary, StaffMember } from '@/types/staff';

interface StaffListProps {
  staff: StaffMember[];
  roles: RoleSummary[];
  canManage: boolean;
  onEdit: (member: StaffMember) => void;
}

function roleNames(member: StaffMember, roles: RoleSummary[], none: string): string {
  if (member.roleIds.length === 0) return none;
  return member.roleIds
    .map((id) => roles.find((role) => role.id === id)?.name)
    .filter((name): name is string => name !== undefined)
    .join(', ');
}

/** One card per member at every width: name, phone, roles, state, and Edit for members the viewer may
    manage. The owner's row never changes (STF-03). */
export function StaffList({ staff, roles, canManage, onEdit }: StaffListProps): React.JSX.Element {
  const { t } = useTranslation();
  if (staff.length === 0) return <EmptyLine>{t('staff.noneYet')}</EmptyLine>;

  return (
    <ul className="divide-y divide-line rounded-card border border-line bg-white shadow-card">
      {staff.map((member) => (
        <li key={member.id} className="flex items-start gap-3 px-4 py-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[15px] font-bold text-brand-800">
            {(member.name ?? member.phone ?? '?').slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-ink">
              <span className="truncate">
                {member.name ?? bangladeshiPhone.display(member.phone ?? '')}
              </span>
              {member.isOwner ? <Tag tone="brand">{t('staff.owner')}</Tag> : null}
              {!member.active ? <Tag tone="neutral">{t('staff.disabled')}</Tag> : null}
            </p>
            {member.name !== null && member.phone ? (
              <p className="num text-[13px] text-neutral-700">
                {bangladeshiPhone.display(member.phone)}
              </p>
            ) : null}
            <p className="mt-0.5 text-[13px] text-neutral-700">
              {roleNames(member, roles, t('staff.noRoles'))}
            </p>
          </div>
          {member.isOwner || !canManage ? null : (
            <button
              type="button"
              onClick={() => {
                onEdit(member);
              }}
              className="inline-flex min-h-10 items-center text-[14px] font-bold text-brand-800"
            >
              {t('common.edit')}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
