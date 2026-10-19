import { useEffect, useState, type SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@lytronix/validators';
import { errorMessage } from '@lytronix/api-client';
import { Button, ErrorBanner, Tag, TextField } from '@lytronix/ui';
import { useCreateStaff, useResetStaffPassword, useUpdateStaff } from '@/api/staff';
import { Sheet } from '@/components/ui/sheet';
import { firstPassword } from '@/lib/first-password';
import { bangladeshiPhone } from '@/lib/phone';
import type { RoleSummary, StaffMember } from '@/types/staff';

export type StaffSheetMode = { kind: 'add' } | { kind: 'edit'; member: StaffMember };

interface StaffSheetProps {
  mode: StaffSheetMode | null;
  slug: string;
  roles: RoleSummary[];
  onClose: () => void;
  onDone: (message: string) => void;
}

/**
 * Add or edit one person (STF-01/03/13): adding takes the phone, an optional name and a generated first
 * password the owner reads out; editing has the active switch with its consequence and Reset password.
 * Both end with the roles as a checklist that says what each allows.
 */
export function StaffSheet({
  mode,
  slug,
  roles,
  onClose,
  onDone,
}: StaffSheetProps): React.JSX.Element {
  const { t } = useTranslation();
  const create = useCreateStaff();
  const update = useUpdateStaff();
  const reset = useResetStaffPassword();
  const [localPhone, setLocalPhone] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!mode) return;
    setFormError(null);
    setResetting(false);
    create.reset();
    update.reset();
    reset.reset();
    if (mode.kind === 'add') {
      setLocalPhone('');
      setName('');
      setPassword(firstPassword.suggest(slug));
      setRoleIds([]);
      setActive(true);
    } else {
      setRoleIds(mode.member.roleIds);
      setActive(mode.member.active);
      setPassword('');
    }
    // The mutations are stable; only the mode decides what the sheet starts with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, slug]);

  const editing = mode?.kind === 'edit' ? mode.member : null;
  const pending = create.isPending || update.isPending || reset.isPending;
  const error = create.error ?? update.error ?? reset.error;

  function toggleRole(id: string): void {
    setRoleIds((current) =>
      current.includes(id) ? current.filter((roleId) => roleId !== id) : [...current, id],
    );
  }

  function validPassword(value: string): boolean {
    return value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH;
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!mode) return;
    if (mode.kind === 'add') {
      const phone = bangladeshiPhone.fromLocalPart(localPhone);
      if (!bangladeshiPhone.isValid(phone)) {
        setFormError(t('signIn.invalidPhone'));
        return;
      }
      if (!validPassword(password)) {
        setFormError(
          t('setPassword.ruleLength', { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }),
        );
        return;
      }
      setFormError(null);
      create.mutate(
        { phone, password, name: name.trim() === '' ? undefined : name.trim(), roleIds },
        {
          onSuccess: () => {
            onDone(t('team.added'));
          },
        },
      );
      return;
    }
    if (resetting && !validPassword(password)) {
      setFormError(
        t('setPassword.ruleLength', { min: PASSWORD_MIN_LENGTH, max: PASSWORD_MAX_LENGTH }),
      );
      return;
    }
    setFormError(null);
    const id = mode.member.id;
    update.mutate(
      { id, active, roleIds },
      {
        onSuccess: () => {
          if (resetting) {
            reset.mutate(
              { id, newPassword: password },
              {
                onSuccess: () => {
                  onDone(t('team.saved'));
                },
              },
            );
          } else {
            onDone(t('team.saved'));
          }
        },
      },
    );
  }

  const title = editing
    ? (editing.name ?? (editing.phone ? bangladeshiPhone.display(editing.phone) : ''))
    : t('team.addStaff');

  return (
    <Sheet open={mode !== null} title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-5">
        {!editing ? (
          <>
            <TextField
              label={t('team.phone')}
              name="phone"
              type="tel"
              inputMode="numeric"
              placeholder="1XXXXXXXXX"
              leading="+880"
              hint={t('team.phoneHint')}
              value={localPhone}
              onChange={(event) => {
                setLocalPhone(event.target.value.replace(/[^\d\s-]/g, ''));
              }}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label={t('team.nameOptional')}
                name="name"
                autoComplete="off"
                maxLength={60}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
              <TextField
                label={t('team.firstPassword')}
                name="password"
                type="text"
                autoComplete="off"
                hint={t('team.firstPasswordHint')}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
              />
            </div>
          </>
        ) : (
          <>
            {editing.phone ? (
              <p className="num text-[14px] text-neutral-700">
                {bangladeshiPhone.display(editing.phone)}
              </p>
            ) : null}
            <div className="flex items-center justify-between gap-3 rounded-[12px] border border-line px-3 py-2.5">
              <div>
                <p className="text-[15px] font-bold text-ink">{t('team.accountActive')}</p>
                <p className="text-[13px] text-neutral-700">{t('team.activeNote')}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={active}
                aria-label={t('team.accountActive')}
                onClick={() => {
                  setActive((value) => !value);
                }}
                className={`relative h-[26px] w-11 shrink-0 rounded-full transition-colors ${active ? 'bg-brand-700' : 'bg-neutral-200'}`}
              >
                <span
                  className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-[left] ${active ? 'left-[21px]' : 'left-[3px]'}`}
                />
              </button>
            </div>
            {resetting ? (
              <TextField
                label={t('team.newPassword')}
                name="password"
                type="text"
                autoComplete="off"
                hint={t('team.firstPasswordHint')}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
              />
            ) : (
              <Button
                type="button"
                tone="outline"
                onClick={() => {
                  setPassword(firstPassword.suggest(slug));
                  setResetting(true);
                }}
              >
                {t('team.resetPassword')}
              </Button>
            )}
          </>
        )}

        <div>
          <p className="mb-2 text-[15px] font-bold text-ink">{t('team.roles')}</p>
          {roles.length === 0 ? (
            <p className="text-[14px] text-neutral-700">{t('team.noRolesYet')}</p>
          ) : (
            <div className="space-y-2">
              {roles.map((role) => (
                <label
                  key={role.id}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-[12px] border border-line bg-white px-3 py-2.5"
                >
                  <span>
                    <span className="block text-[15px] font-bold text-ink">{role.name}</span>
                    <span className="flex flex-wrap gap-1 pt-1">
                      {role.permissions.length === 0 ? (
                        <Tag tone="neutral">{t('team.noPermissions')}</Tag>
                      ) : (
                        <span className="text-[13px] text-neutral-700">
                          {t('team.permissionCount', { count: role.permissions.length })}
                        </span>
                      )}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={roleIds.includes(role.id)}
                    onChange={() => {
                      toggleRole(role.id);
                    }}
                    className="h-5 w-5 shrink-0 accent-brand-700"
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        {formError ? <ErrorBanner message={formError} /> : null}
        {error ? <ErrorBanner message={errorMessage(error, t)} /> : null}
        <Button type="submit" loading={pending}>
          {editing ? t('common.save') : t('team.createAccount')}
        </Button>
      </form>
    </Sheet>
  );
}
