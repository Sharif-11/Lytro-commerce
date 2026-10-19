import { useTranslation } from 'react-i18next';
import { EmptyLine } from '@/components/ui/fields';
import type { RoleSummary } from '@/types/staff';
import { PERMISSION_OPTIONS } from './permission-options';

interface RoleListProps {
  roles: RoleSummary[];
  canManage: boolean;
  onEdit: (role: RoleSummary) => void;
  onDelete: (role: RoleSummary) => void;
}

export function RoleList({ roles, canManage, onEdit, onDelete }: RoleListProps): React.JSX.Element {
  const { t } = useTranslation();
  if (roles.length === 0) return <EmptyLine>{t('roles.noneYet')}</EmptyLine>;

  const labels = (role: RoleSummary): string => {
    const known = PERMISSION_OPTIONS.filter((option) => role.permissions.includes(option.value));
    return known.length === 0
      ? t('roles.noPermissions')
      : known.map((o) => t(o.labelKey)).join(', ');
  };

  return (
    <ul className="divide-y divide-line rounded-card border border-line bg-white shadow-card">
      {roles.map((role) => (
        <li key={role.id} className="flex items-start gap-3 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-ink">{role.name}</p>
            <p className="text-[13px] text-neutral-700">{labels(role)}</p>
            <p className="mt-0.5 text-[13px] text-neutral-700">
              {t('roles.userCount', { count: role.holders })}
            </p>
          </div>
          {canManage ? (
            <div className="flex shrink-0 gap-3">
              <button
                type="button"
                onClick={() => {
                  onEdit(role);
                }}
                className="inline-flex min-h-10 items-center text-[14px] font-bold text-brand-800"
              >
                {t('common.edit')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(role);
                }}
                className="inline-flex min-h-10 items-center text-[14px] font-bold text-danger"
              >
                {t('common.delete')}
              </button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
