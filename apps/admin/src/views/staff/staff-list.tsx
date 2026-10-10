import { useTranslation } from 'react-i18next';
import type { StaffMember } from '@/types/staff';
import type { RoleSummary } from '@/types/role';

interface StaffListProps {
  staff: StaffMember[];
  roles: RoleSummary[];
  onEdit: (member: StaffMember) => void;
}

function roleNames(member: StaffMember, roles: RoleSummary[], t: (key: string) => string): string {
  if (member.roleIds.length === 0) return t('staff.noRoles');
  return member.roleIds
    .map((id) => roles.find((role) => role.id === id)?.name)
    .filter((name): name is string => name !== undefined)
    .join(', ');
}

function StatusBadge({ active }: { active: boolean }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${
        active ? 'border-brand-500 text-brand-700' : 'border-slate-200 text-slate-400'
      }`}
    >
      {active ? t('common.active') : t('common.disabled')}
    </span>
  );
}

/** Mobile cards below sm, a table from sm up — matching the reference dashboard's own staff-list layout
    split (UserManagement.jsx), adapted for Lytro's multi-role model instead of a single role dropdown, and
    with no delete action since the backend only supports activate/deactivate, never removal. */
export function StaffList({ staff, roles, onEdit }: StaffListProps): React.JSX.Element {
  const { t } = useTranslation();

  if (staff.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">{t('staff.noneYet')}</p>;
  }

  return (
    <>
      <div className="space-y-3 sm:hidden">
        {staff.map((member) => (
          <div key={member.id} className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">
                  {member.name ?? member.phone}
                  {member.isOwner ? (
                    <span className="ml-1.5 text-xs font-normal text-slate-400">
                      ({t('staff.owner')})
                    </span>
                  ) : null}
                </p>
                {member.name !== null ? (
                  <p className="truncate text-sm text-slate-500">{member.phone}</p>
                ) : null}
              </div>
              <StatusBadge active={member.active} />
            </div>
            <p className="mt-2 text-xs text-slate-400">{roleNames(member, roles, t)}</p>
            {member.isOwner ? null : (
              <div className="mt-3 flex gap-2 border-t border-dashed border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    onEdit(member);
                  }}
                  className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300"
                >
                  {t('common.edit')}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-2xl bg-white shadow-sm sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">{t('staff.name')}</th>
              <th className="px-4 py-3 font-medium">{t('staff.phone')}</th>
              <th className="px-4 py-3 font-medium">{t('staff.role')}</th>
              <th className="px-4 py-3 font-medium">{t('staff.status')}</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => (
              <tr
                key={member.id}
                className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50"
              >
                <td className="px-4 py-3 text-slate-900">
                  {member.name ?? '—'}
                  {member.isOwner ? (
                    <span className="ml-1.5 text-xs text-slate-400">({t('staff.owner')})</span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-slate-500">{member.phone}</td>
                <td className="px-4 py-3 text-slate-600">{roleNames(member, roles, t)}</td>
                <td className="px-4 py-3">
                  <StatusBadge active={member.active} />
                </td>
                <td className="px-4 py-3 text-right">
                  {member.isOwner ? null : (
                    <button
                      type="button"
                      onClick={() => {
                        onEdit(member);
                      }}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {t('common.edit')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
