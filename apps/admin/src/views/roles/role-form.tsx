import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Permission } from '@lytronix/validators';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ErrorBanner } from '@/components/error-banner';
import { KNOWN_PERMISSION_VALUES, PERMISSION_OPTIONS } from '@/views/roles/permission-options';

export interface RoleFormValues {
  name: string;
  permissions: Permission[];
}

interface RoleFormProps {
  mode: 'create' | 'edit';
  initialName?: string;
  /** string[], not Permission[] — RoleSummary.permissions mirrors the server's RoleRecord as plain strings
      (types/role.ts's own note), widened the same way here so an existing role's permissions (read from the
      API) assign straight into this prop without a cast. */
  initialPermissions?: string[];
  onCancel: () => void;
  onSubmit: (values: RoleFormValues) => void;
  pending: boolean;
  error: string | null;
}

/** Create/edit, one form (mirrors StaffForm's own container/presentational split, ENGINEERING-STANDARDS.md
    §2a) — both calls take the same shape (name + permissions), unlike staff's asymmetric create/update API,
    so there's no field-visibility branching by mode here, just which submit label and initial values apply. */
export function RoleForm({
  mode,
  initialName = '',
  initialPermissions = [],
  onCancel,
  onSubmit,
  pending,
  error,
}: RoleFormProps): React.JSX.Element {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [permissions, setPermissions] = useState<Permission[]>(
    initialPermissions.filter((value): value is Permission => KNOWN_PERMISSION_VALUES.has(value)),
  );

  function togglePermission(value: Permission): void {
    setPermissions((current) =>
      current.includes(value) ? current.filter((p) => p !== value) : [...current, value],
    );
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit({ name, permissions });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-base font-semibold text-slate-900">
        {mode === 'create' ? t('roles.addRoleTitle') : t('roles.editRole', { name: initialName })}
      </h2>

      <TextField
        label={t('roles.roleName')}
        name="name"
        required
        value={name}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />

      <div>
        <span className="mb-1.5 block text-sm font-medium text-slate-700">
          {t('roles.permissions')}
        </span>
        <div className="flex flex-wrap gap-2">
          {PERMISSION_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                permissions.includes(option.value)
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={permissions.includes(option.value)}
                onChange={() => {
                  togglePermission(option.value);
                }}
              />
              {t(option.labelKey)}
            </label>
          ))}
        </div>
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <div className="flex gap-2">
        <Button type="submit" loading={pending} className="w-auto! flex-1 sm:flex-none">
          {mode === 'create' ? t('roles.createRole') : t('common.save')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="w-auto! flex-1 sm:flex-none"
        >
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
