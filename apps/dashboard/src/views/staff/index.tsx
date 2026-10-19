import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Permission } from '@lytronix/validators';
import { useMe } from '@/api/me';
import {
  useCreateStaff,
  useResetStaffPassword,
  useRoles,
  useStaffList,
  useUpdateStaff,
} from '@/api/staff';
import { errorMessage } from '@/api/error-message';
import { Button } from '@/components/ui/button';
import { Page, PageHeader } from '@/components/ui/fields';
import { ErrorBanner } from '@/components/ui/notice';
import { hasPermission } from '@/lib/permissions';
import type { StaffMember } from '@/types/staff';
import { StaffForm, type StaffFormValues } from './staff-form';
import { StaffList } from './staff-list';

type Panel = { mode: 'create' } | { mode: 'edit'; member: StaffMember } | null;

/** Container: owns the fetches, the mutations and which panel is open (STF-01..07, STF-13). */
export function Staff(): React.JSX.Element {
  const { t } = useTranslation();
  const me = useMe();
  const canManage = hasPermission(me.data, Permission.StaffManage);
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

  const seats = staffList.data?.seats;

  return (
    <Page>
      <PageHeader
        title={t('staff.title')}
        lead={
          seats
            ? seats.total === null
              ? t('staff.seatsUnlimited', { used: seats.used })
              : t('staff.seats', { used: seats.used, total: seats.total })
            : undefined
        }
        action={
          panel === null && canManage ? (
            <Button
              type="button"
              fit
              onClick={() => {
                setPanel({ mode: 'create' });
              }}
            >
              {t('staff.addStaff')}
            </Button>
          ) : null
        }
      />
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
        <p className="text-center text-[15px] text-neutral-700">{t('common.loading')}</p>
      ) : null}
      {staffList.isError ? <ErrorBanner message={errorMessage(staffList.error, t)} /> : null}
      {staffList.data ? (
        <StaffList
          staff={staffList.data.staff}
          roles={roles.data ?? []}
          canManage={canManage}
          onEdit={(member) => {
            setPanel({ mode: 'edit', member });
          }}
        />
      ) : null}
    </Page>
  );
}
