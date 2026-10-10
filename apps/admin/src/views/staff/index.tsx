import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateStaff, useResetStaffPassword, useStaffList, useUpdateStaff } from '@/api/staff';
import { useRoles } from '@/api/roles';
import { errorMessage } from '@/api/error-message';
import { ErrorBanner } from '@/components/error-banner';
import { Button } from '@/components/button';
import { StaffForm, type StaffFormValues } from '@/views/staff/staff-form';
import { StaffList } from '@/views/staff/staff-list';
import type { StaffMember } from '@/types/staff';

type Panel = { mode: 'create' } | { mode: 'edit'; member: StaffMember } | null;

/** Container (ENGINEERING-STANDARDS.md §2a): owns data fetching, mutations and which panel is open.
    StaffForm and StaffList stay presentational — props in, callbacks out. */
export function Staff(): React.JSX.Element {
  const { t } = useTranslation();
  const staffList = useStaffList();
  const roles = useRoles();
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const resetPassword = useResetStaffPassword();
  const [panel, setPanel] = useState<Panel>(null);

  const pending = createStaff.isPending || updateStaff.isPending || resetPassword.isPending;
  const mutationError = createStaff.error ?? updateStaff.error ?? resetPassword.error;

  function closePanel(): void {
    setPanel(null);
    createStaff.reset();
    updateStaff.reset();
    resetPassword.reset();
  }

  function handleSubmit(values: StaffFormValues): void {
    if (panel?.mode === 'create') {
      createStaff.mutate(
        {
          phone: values.phone ?? '',
          password: values.password ?? '',
          name: values.name,
          roleIds: values.roleIds,
        },
        { onSuccess: closePanel },
      );
      return;
    }
    if (panel?.mode === 'edit') {
      const id = panel.member.id;
      updateStaff.mutate(
        { id, active: values.active, roleIds: values.roleIds },
        {
          onSuccess: () => {
            if (values.password) {
              resetPassword.mutate({ id, newPassword: values.password }, { onSuccess: closePanel });
            } else {
              closePanel();
            }
          },
        },
      );
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-5 py-6 sm:px-6 sm:py-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{t('staff.title')}</h1>
          {staffList.data ? (
            <p className="mt-1 text-sm text-slate-500">
              {t('staff.count', { count: staffList.data.staff.length })} ·{' '}
              {t('staff.seats', {
                used: staffList.data.seats.used,
                total: staffList.data.seats.total,
              })}
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
            {t('staff.addStaff')}
          </Button>
        ) : null}
      </div>

      {panel !== null ? (
        <StaffForm
          mode={panel.mode}
          roles={roles.data ?? []}
          initialRoleIds={panel.mode === 'edit' ? panel.member.roleIds : undefined}
          initialActive={panel.mode === 'edit' ? panel.member.active : undefined}
          onCancel={closePanel}
          onSubmit={handleSubmit}
          pending={pending}
          error={mutationError ? errorMessage(mutationError, t) : null}
        />
      ) : null}

      {staffList.isLoading ? (
        <p className="text-center text-sm text-slate-500">{t('common.loading')}</p>
      ) : null}
      {staffList.isError ? <ErrorBanner message={errorMessage(staffList.error, t)} /> : null}
      {staffList.data ? (
        <StaffList
          staff={staffList.data.staff}
          roles={roles.data ?? []}
          onEdit={(member) => {
            setPanel({ mode: 'edit', member });
          }}
        />
      ) : null}
    </div>
  );
}
