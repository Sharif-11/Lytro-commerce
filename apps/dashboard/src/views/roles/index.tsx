import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Permission } from '@lytronix/validators';
import { ApiClientError } from '@/api/client';
import { errorMessage } from '@/api/error-message';
import { useMe } from '@/api/me';
import { useCreateRole, useDeleteRole, useRoles, useUpdateRole } from '@/api/staff';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Page, PageHeader } from '@/components/ui/fields';
import { ErrorBanner } from '@/components/ui/notice';
import { hasPermission } from '@/lib/permissions';
import type { RoleSummary } from '@/types/staff';
import { RoleForm, type RoleFormValues } from './role-form';
import { RoleList } from './role-list';

type Panel = { mode: 'create' } | { mode: 'edit'; role: RoleSummary } | null;

/** Container (STF-07..09): the fetch, the mutations, which panel is open and the delete confirmation. */
export function Roles(): React.JSX.Element {
  const { t } = useTranslation();
  const me = useMe();
  const canManage = hasPermission(me.data, Permission.StaffManage);
  const roles = useRoles();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const [panel, setPanel] = useState<Panel>(null);
  const [deleteTarget, setDeleteTarget] = useState<RoleSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function closePanel(): void {
    setPanel(null);
    createRole.reset();
    updateRole.reset();
  }

  function handleSubmit(values: RoleFormValues): void {
    if (panel?.mode === 'create') {
      createRole.mutate(values, { onSuccess: closePanel });
      return;
    }
    if (panel?.mode === 'edit') {
      updateRole.mutate({ id: panel.role.id, ...values }, { onSuccess: closePanel });
    }
  }

  function closeDelete(): void {
    setDeleteTarget(null);
    setDeleteError(null);
    deleteRole.reset();
  }

  function confirmDelete(): void {
    if (!deleteTarget) return;
    deleteRole.mutate(deleteTarget.id, {
      onSuccess: closeDelete,
      onError: (error) => {
        if (error instanceof ApiClientError && error.code === 'conflict') {
          const holders = typeof error.details.holders === 'number' ? error.details.holders : 0;
          setDeleteError(t('roles.deleteHeldBy', { count: holders }));
        } else {
          setDeleteError(errorMessage(error, t));
        }
      },
    });
  }

  const formError = createRole.error ?? updateRole.error;

  return (
    <Page>
      <PageHeader
        title={t('roles.title')}
        lead={roles.data ? t('roles.count', { count: roles.data.length }) : undefined}
        action={
          panel === null && canManage ? (
            <Button
              type="button"
              fit
              onClick={() => {
                setPanel({ mode: 'create' });
              }}
            >
              {t('roles.addRole')}
            </Button>
          ) : null
        }
      />
      {panel !== null ? (
        <RoleForm
          mode={panel.mode}
          initialName={panel.mode === 'edit' ? panel.role.name : undefined}
          initialPermissions={panel.mode === 'edit' ? panel.role.permissions : undefined}
          onCancel={closePanel}
          onSubmit={handleSubmit}
          pending={createRole.isPending || updateRole.isPending}
          error={formError ? errorMessage(formError, t) : null}
        />
      ) : null}
      {roles.isLoading ? (
        <p className="text-center text-[15px] text-neutral-700">{t('common.loading')}</p>
      ) : null}
      {roles.isError ? <ErrorBanner message={errorMessage(roles.error, t)} /> : null}
      {roles.data ? (
        <RoleList
          roles={roles.data}
          canManage={canManage}
          onEdit={(role) => {
            setPanel({ mode: 'edit', role });
          }}
          onDelete={(role) => {
            setDeleteTarget(role);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('roles.deleteTitle')}
        message={deleteTarget?.name}
        error={deleteError}
        confirmLabel={t('common.delete')}
        danger
        pending={deleteRole.isPending}
        onConfirm={confirmDelete}
        onCancel={closeDelete}
      />
    </Page>
  );
}
