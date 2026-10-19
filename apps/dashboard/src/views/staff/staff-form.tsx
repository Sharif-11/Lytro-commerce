import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@lytronix/validators';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Card, CheckboxRow } from '@/components/ui/fields';
import { ErrorBanner } from '@/components/ui/notice';
import { TextField } from '@/components/ui/text-field';
import { bangladeshiPhone } from '@/lib/phone';
import type { RoleSummary } from '@/types/staff';

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

/** One form for create and edit. PATCH /staff/:id accepts only `active` and `roleIds`, so phone and name are
    create-only; the password field means "set" on create and "reset" on edit (a separate call). */
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
  const [localPhone, setLocalPhone] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [roleIds, setRoleIds] = useState<string[]>(initialRoleIds);
  const [active, setActive] = useState(initialActive);
  const [formError, setFormError] = useState<string | null>(null);

  function toggleRole(id: string): void {
    setRoleIds((current) =>
      current.includes(id) ? current.filter((roleId) => roleId !== id) : [...current, id],
    );
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const phone = bangladeshiPhone.fromLocalPart(localPhone);
    if (mode === 'create' && !bangladeshiPhone.isValid(phone)) {
      setFormError(t('signIn.invalidPhone'));
      return;
    }
    if (
      (mode === 'create' || password !== '') &&
      (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH)
    ) {
      setFormError(
        t('setPassword.ruleLength', { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }),
      );
      return;
    }
    setFormError(null);
    onSubmit({
      phone: mode === 'create' ? phone : undefined,
      name: mode === 'create' && name.trim() !== '' ? name.trim() : undefined,
      password: password !== '' ? password : undefined,
      roleIds,
      active: mode === 'edit' ? active : undefined,
    });
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <h2 className="text-[16px] font-bold text-ink">
          {mode === 'create' ? t('staff.addAccount') : t('staff.editAccount')}
        </h2>
        {mode === 'create' ? (
          <p className="text-[14px] text-neutral-700">{t('staff.requiredNote')}</p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          {mode === 'create' ? (
            <>
              <TextField
                label={t('staff.phoneRequired')}
                name="phone"
                type="tel"
                inputMode="numeric"
                placeholder="1XXXXXXXXX"
                leading="+880"
                value={localPhone}
                onChange={(event) => {
                  setLocalPhone(event.target.value.replace(/[^\d\s-]/g, ''));
                }}
              />
              <TextField
                label={t('staff.nameOptional')}
                name="name"
                autoComplete="off"
                maxLength={60}
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
            autoComplete="new-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
          {mode === 'edit' ? (
            <CheckboxRow label={t('staff.activeAccount')} checked={active} onChange={setActive} />
          ) : null}
        </div>
        <div>
          <p className="mb-2 text-[14px] font-bold text-ink">{t('staff.role')}</p>
          {roles.length === 0 ? (
            <p className="text-[14px] text-neutral-700">{t('staff.noRolesYet')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {roles.map((role) => (
                <Chip
                  key={role.id}
                  selected={roleIds.includes(role.id)}
                  onClick={() => {
                    toggleRole(role.id);
                  }}
                >
                  {role.name}
                </Chip>
              ))}
            </div>
          )}
        </div>
        {formError ? <ErrorBanner message={formError} /> : null}
        {error ? <ErrorBanner message={error} /> : null}
        <div className="grid gap-2 sm:flex">
          <Button type="submit" loading={pending} className="sm:w-auto">
            {mode === 'create' ? t('staff.createAccount') : t('common.save')}
          </Button>
          <Button type="button" tone="outline" onClick={onCancel} className="sm:w-auto">
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
