import { useTranslation } from 'react-i18next';
import type { RoleSummary } from '@/types/role';
import { PERMISSION_OPTIONS } from '@/views/roles/permission-options';

interface RoleListProps {
  roles: RoleSummary[];
  onEdit: (role: RoleSummary) => void;
  onDelete: (role: RoleSummary) => void;
}

function permissionLabels(role: RoleSummary, t: (key: string) => string): string {
  if (role.permissions.length === 0) return t('roles.noPermissions');
  return PERMISSION_OPTIONS.filter((option) => role.permissions.includes(option.value))
    .map((option) => t(option.labelKey))
    .join(', ');
}

/** Mobile cards below sm, a table from sm up — same split as StaffList, for the same reason (one layout
    language across the dashboard's list screens, ENGINEERING-STANDARDS.md §4). */
export function RoleList({ roles, onEdit, onDelete }: RoleListProps): React.JSX.Element {
  const { t } = useTranslation();

  if (roles.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">{t('roles.noneYet')}</p>;
  }

  return (
    <>
      <div className="space-y-3 sm:hidden">
        {roles.map((role) => (
          <div key={role.id} className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="font-medium text-slate-900">{role.name}</p>
            <p className="mt-1 text-xs text-slate-400">{permissionLabels(role, t)}</p>
            <p className="mt-1 text-xs text-slate-400">
              {t('roles.userCount', { count: role.holders })}
            </p>
            <div className="mt-3 flex gap-2 border-t border-dashed border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => {
                  onEdit(role);
                }}
                className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300"
              >
                {t('common.edit')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(role);
                }}
                className="flex-1 rounded-lg border border-red-200 py-1.5 text-xs font-medium text-red-600 hover:border-red-300"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-2xl bg-white shadow-sm sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-slate-500">
              <th className="px-4 py-3 font-medium">{t('roles.roleName')}</th>
              <th className="px-4 py-3 font-medium">{t('roles.permissions')}</th>
              <th className="px-4 py-3 font-medium"></th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr
                key={role.id}
                className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50"
              >
                <td className="px-4 py-3 text-slate-900">{role.name}</td>
                <td className="px-4 py-3 text-slate-600">{permissionLabels(role, t)}</td>
                <td className="px-4 py-3 text-slate-400">
                  {t('roles.userCount', { count: role.holders })}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => {
                      onEdit(role);
                    }}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDelete(role);
                    }}
                    className="ml-3 font-medium text-red-600 hover:underline"
                  >
                    {t('common.delete')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
