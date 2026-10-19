import { useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Permission } from '@lytronix/validators';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Card } from '@/components/ui/fields';
import { ErrorBanner } from '@/components/ui/notice';
import { TextField } from '@/components/ui/text-field';
import { KNOWN_PERMISSION_VALUES, PERMISSION_OPTIONS } from './permission-options';

export interface RoleFormValues {
  name: string;
  permissions: Permission[];
}

interface RoleFormProps {
  mode: 'create' | 'edit';
  initialName?: string;
  initialPermissions?: string[];
  onCancel: () => void;
  onSubmit: (values: RoleFormValues) => void;
  pending: boolean;
  error: string | null;
}

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

  function toggle(value: Permission): void {
    setPermissions((current) =>
      current.includes(value) ? current.filter((p) => p !== value) : [...current, value],
    );
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit({ name: name.trim(), permissions });
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <h2 className="text-[16px] font-bold text-ink">
          {mode === 'create' ? t('roles.addRoleTitle') : t('roles.editRole', { name: initialName })}
        </h2>
        <TextField
          label={t('roles.roleName')}
          name="name"
          required
          maxLength={60}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <div>
          <p className="mb-2 text-[14px] font-bold text-ink">{t('roles.permissions')}</p>
          <div className="flex flex-wrap gap-2">
            {PERMISSION_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                selected={permissions.includes(option.value)}
                onClick={() => {
                  toggle(option.value);
                }}
              >
                {t(option.labelKey)}
              </Chip>
            ))}
          </div>
        </div>
        {error ? <ErrorBanner message={error} /> : null}
        <div className="grid gap-2 sm:flex">
          <Button type="submit" loading={pending} className="sm:w-auto">
            {mode === 'create' ? t('roles.createRole') : t('common.save')}
          </Button>
          <Button type="button" tone="outline" onClick={onCancel} className="sm:w-auto">
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
