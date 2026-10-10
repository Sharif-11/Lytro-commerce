import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ErrorBanner } from '@/components/error-banner';
import { PhoneIcon, UserIcon, LockIcon } from '@/components/icons';
import type { RoleSummary } from '@/types/role';

export interface StaffFormValues {
  phone?: string;
  name?: string;
  password?: string;
  roleIds: string[];
  active?: boolean;
}

interface StaffFormProps {
  mode: 'create' | 'edit';
  roles: RoleSummary[];
  initialRoleIds?: string[];
  initialActive?: boolean;
  onCancel: () => void;
  onSubmit: (values: StaffFormValues) => void;
  pending: boolean;
  error: string | null;
}

/**
 * One form for both create and edit (Container/Presentational, ENGINEERING-STANDARDS.md §2a): which fields
 * show depends on `mode`, driven by the backend's own asymmetric API — `PATCH /staff/:id` only ever accepts
 * `active`/`roleIds` (apps/server .../dto/staff.dto.ts's updateStaffSchema), so phone and name are create-only
 * and can't be edited later at all; a password field appears in both, but means "set it" on create (required)
 * and "reset it" on edit (optional, a separate POST /staff/:id/password call the container makes alongside
 * the PATCH).
 */
export function StaffForm({
  mode,
  roles,
  initialRoleIds = [],
  initialActive = true,
  onCancel,
  onSubmit,
  pending,
  error,
}: StaffFormProps): React.JSX.Element {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [roleIds, setRoleIds] = useState<string[]>(initialRoleIds);
  const [active, setActive] = useState(initialActive);

  function toggleRole(id: string): void {
    setRoleIds((current) =>
      current.includes(id) ? current.filter((roleId) => roleId !== id) : [...current, id],
    );
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit({
      phone: mode === 'create' ? phone : undefined,
      name: mode === 'create' && name !== '' ? name : undefined,
      password: password !== '' ? password : undefined,
      roleIds,
      active: mode === 'edit' ? active : undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-base font-semibold text-slate-900">
        {mode === 'create' ? t('staff.addAccount') : t('staff.editAccount')}
      </h2>
      {mode === 'create' ? (
        <p className="-mt-2 text-xs text-slate-500">{t('staff.requiredNote')}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {mode === 'create' ? (
          <>
            <TextField
              label={t('staff.phoneRequired')}
              name="phone"
              icon={<PhoneIcon />}
              required
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
              }}
            />
            <TextField
              label={t('staff.nameOptional')}
              name="name"
              icon={<UserIcon />}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </>
        ) : null}
        <TextField
          label={mode === 'create' ? t('staff.password') : t('staff.passwordOptional')}
          name="password"
          type="password"
          icon={<LockIcon />}
          required={mode === 'create'}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
        {mode === 'edit' ? (
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => {
                setActive(event.target.checked);
              }}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            {t('common.active')}
          </label>
        ) : null}
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-slate-700">{t('staff.role')}</span>
        {roles.length === 0 ? (
          <p className="text-sm text-slate-400">{t('staff.noRoles')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {roles.map((role) => (
              <label
                key={role.id}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                  roleIds.includes(role.id)
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={roleIds.includes(role.id)}
                  onChange={() => {
                    toggleRole(role.id);
                  }}
                />
                {role.name}
              </label>
            ))}
          </div>
        )}
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <div className="flex gap-2">
        <Button type="submit" loading={pending} className="w-auto! flex-1 sm:flex-none">
          {mode === 'create' ? t('staff.createAccount') : t('staff.saveChanges')}
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
