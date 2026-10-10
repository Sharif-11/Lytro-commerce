import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateRole, useDeleteRole, useRoles, useUpdateRole } from '@/api/roles';
import { errorMessage } from '@/api/error-message';
import { ApiClientError } from '@/api/client';
import { ErrorBanner } from '@/components/error-banner';
import { Button } from '@/components/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { RoleForm, type RoleFormValues } from '@/views/roles/role-form';
import { RoleList } from '@/views/roles/role-list';
import type { RoleSummary } from '@/types/role';

type Panel = { mode: 'create' } | { mode: 'edit'; role: RoleSummary } | null;

/** Container (ENGINEERING-STANDARDS.md §2a): owns data fetching, mutations, which panel is open and the
    delete-confirmation flow. RoleForm and RoleList stay presentational. */
export function Roles(): React.JSX.Element {
  const { t } = useTranslation();
  const roles = useRoles();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const [panel, setPanel] = useState<Panel>(null);
  const [deleteTarget, setDeleteTarget] = useState<RoleSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const formPending = createRole.isPending || updateRole.isPending;
  const formError = createRole.error ?? updateRole.error;

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

  function closeDeleteConfirm(): void {
    setDeleteTarget(null);
    setDeleteError(null);
    deleteRole.reset();
  }

  function confirmDelete(): void {
    if (!deleteTarget) return;
    setDeleteError(null);
    deleteRole.mutate(deleteTarget.id, {
      onSuccess: closeDeleteConfirm,
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

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-5 py-6 sm:px-6 sm:py-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{t('roles.title')}</h1>
          {roles.data ? (
            <p className="mt-1 text-sm text-slate-500">
              {t('roles.count', { count: roles.data.length })}
            </p>
          ) : null}
        </div>
        {panel === null ? (
          <Button
            type="button"
            variant="primary"
            className="w-auto! shrink-0"
            onClick={() => {
              setPanel({ mode: 'create' });
            }}
          >
            {t('roles.addRole')}
          </Button>
        ) : null}
      </div>

      {panel !== null ? (
        <RoleForm
          mode={panel.mode}
          initialName={panel.mode === 'edit' ? panel.role.name : undefined}
          initialPermissions={panel.mode === 'edit' ? panel.role.permissions : undefined}
          onCancel={closePanel}
          onSubmit={handleSubmit}
          pending={formPending}
          error={formError ? errorMessage(formError, t) : null}
        />
      ) : null}

      {roles.isLoading ? (
        <p className="text-center text-sm text-slate-500">{t('common.loading')}</p>
      ) : null}
      {roles.isError ? <ErrorBanner message={errorMessage(roles.error, t)} /> : null}
      {roles.data ? (
        <RoleList
          roles={roles.data}
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
        message={deleteError ?? undefined}
        confirmLabel={t('common.delete')}
        danger
        pending={deleteRole.isPending}
        onConfirm={confirmDelete}
        onCancel={closeDeleteConfirm}
      />
    </div>
  );
}
