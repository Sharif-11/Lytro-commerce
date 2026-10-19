import { useEffect, useState, type SyntheticEvent } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Permission } from '@lytronix/validators';
import { errorMessage } from '@/api/error-message';
import { useMe } from '@/api/me';
import { useCreateRole, useDeleteRole, useRoles, useUpdateRole } from '@/api/staff';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/chip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyLine, Page } from '@/components/ui/fields';
import { Icon } from '@/components/ui/icon';
import { ErrorBanner } from '@/components/ui/notice';
import { Sheet } from '@/components/ui/sheet';
import { TextField } from '@/components/ui/text-field';
import { Toast } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { hasPermission } from '@/lib/permissions';
import type { RoleSummary } from '@/types/staff';
import { PERMISSION_OPTIONS, permissionLabelKey } from './permission-options';
import { TeamHeader } from './team-header';

const KNOWN_PERMISSIONS = new Set<string>(Object.values(Permission));
function isPermission(value: string): value is Permission {
  return KNOWN_PERMISSIONS.has(value);
}

type Editing = { kind: 'new' } | { kind: 'edit'; role: RoleSummary } | null;

/** Team, Roles segment (STF-07/09/10): cards with holder counts and permission chips; the editor lists the
    permissions as sentences with a sub-line where the consequence matters. Delete waits for zero holders. */
export function Roles(): React.JSX.Element {
  const { t } = useTranslation();
  const { shop } = useParams({ from: '/$shop/team_/roles' });
  const me = useMe();
  const canManage = hasPermission(me.data, Permission.StaffManage);
  const roles = useRoles();
  const create = useCreateRole();
  const update = useUpdateRole();
  const remove = useDeleteRole();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<RoleSummary | null>(null);
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const toast = useToast();

  useEffect(() => {
    if (!editing) return;
    setName(editing.kind === 'edit' ? editing.role.name : '');
    setPermissions(editing.kind === 'edit' ? editing.role.permissions.filter(isPermission) : []);
    create.reset();
    update.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  function toggle(value: Permission): void {
    setPermissions((current) =>
      current.includes(value) ? current.filter((p) => p !== value) : [...current, value],
    );
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!editing || name.trim() === '') return;
    const input = { name: name.trim(), permissions };
    const done = (): void => {
      setEditing(null);
      toast.show(t('team.roleSaved'));
    };
    if (editing.kind === 'new') create.mutate(input, { onSuccess: done });
    else update.mutate({ id: editing.role.id, ...input }, { onSuccess: done });
  }

  const pending = create.isPending || update.isPending;
  const error = create.error ?? update.error;

  return (
    <Page narrow>
      <TeamHeader
        shop={shop}
        segment="roles"
        action={
          canManage ? (
            <Button
              type="button"
              fit
              className="min-h-10! text-[14px]!"
              onClick={() => {
                setEditing({ kind: 'new' });
              }}
            >
              <Icon name="plus" size={16} />
              {t('team.newRole')}
            </Button>
          ) : null
        }
      />
      {roles.isLoading ? <EmptyLine>{t('common.loading')}</EmptyLine> : null}
      {roles.isError ? <ErrorBanner message={errorMessage(roles.error, t)} /> : null}
      {roles.data && roles.data.length === 0 ? <EmptyLine>{t('team.noRolesYet')}</EmptyLine> : null}
      {roles.data && roles.data.length > 0 ? (
        <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
          {roles.data.map((role) => {
            const body = (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[15px] font-bold text-ink">{role.name}</span>
                  <span className="num text-[13px] text-neutral-700">
                    {t('team.holders', { count: role.holders })}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {role.permissions.length === 0 ? (
                    <Tag tone="neutral">{t('team.noPermissions')}</Tag>
                  ) : (
                    role.permissions.map((value) => {
                      const key = permissionLabelKey(value);
                      return (
                        <Tag key={value} tone="neutral">
                          {key ? t(key) : value}
                        </Tag>
                      );
                    })
                  )}
                </div>
              </>
            );
            return canManage ? (
              <button
                key={role.id}
                type="button"
                onClick={() => {
                  setEditing({ kind: 'edit', role });
                }}
                className="block w-full border-t border-line px-4 py-3 text-left first:border-t-0 hover:bg-neutral-50"
              >
                {body}
              </button>
            ) : (
              <div key={role.id} className="border-t border-line px-4 py-3 first:border-t-0">
                {body}
              </div>
            );
          })}
        </div>
      ) : null}
      <p className="text-[13px] text-neutral-700">{t('team.permissionsApplyNext')}</p>

      <Sheet
        open={editing !== null}
        title={
          editing?.kind === 'edit'
            ? t('team.editRole', { name: editing.role.name })
            : t('team.newRole')
        }
        onClose={() => {
          setEditing(null);
        }}
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <TextField
            label={t('team.roleName')}
            name="roleName"
            required
            maxLength={60}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          <div>
            <p className="mb-2 text-[15px] font-bold text-ink">{t('team.whatTheyCanDo')}</p>
            <div className="space-y-2">
              {PERMISSION_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-[12px] border border-line bg-white px-3 py-2.5"
                >
                  <span>
                    <span className="block text-[15px] font-bold text-ink">
                      {t(option.labelKey)}
                    </span>
                    {option.noteKey ? (
                      <span className="block text-[13px] text-neutral-700">
                        {t(option.noteKey)}
                      </span>
                    ) : null}
                  </span>
                  <input
                    type="checkbox"
                    checked={permissions.includes(option.value)}
                    onChange={() => {
                      toggle(option.value);
                    }}
                    className="h-5 w-5 shrink-0 accent-brand-700"
                  />
                </label>
              ))}
            </div>
            <p className="mt-2 text-[13px] text-neutral-700">{t('team.laterPermissions')}</p>
          </div>
          {error ? <ErrorBanner message={errorMessage(error, t)} /> : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {editing?.kind === 'edit' ? (
              <Button
                type="button"
                tone="ghost"
                fit
                className="text-danger!"
                disabled={editing.role.holders > 0}
                title={
                  editing.role.holders > 0
                    ? t('team.heldBy', { count: editing.role.holders })
                    : undefined
                }
                onClick={() => {
                  setDeleting(editing.role);
                }}
              >
                {editing.role.holders > 0
                  ? t('team.deleteHeld', { count: editing.role.holders })
                  : t('common.delete')}
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" fit loading={pending}>
              {editing?.kind === 'edit' ? t('common.save') : t('team.createRole')}
            </Button>
          </div>
        </form>
      </Sheet>

      <ConfirmDialog
        open={deleting !== null}
        title={t('team.deleteRoleTitle', { name: deleting?.name ?? '' })}
        message={t('team.deleteRoleLead')}
        error={remove.isError ? errorMessage(remove.error, t) : null}
        confirmLabel={t('common.delete')}
        danger
        pending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null);
              setEditing(null);
              toast.show(t('team.roleDeleted'));
            },
          });
        }}
        onCancel={() => {
          setDeleting(null);
          remove.reset();
        }}
      />
      <Toast message={toast.message} />
    </Page>
  );
}
