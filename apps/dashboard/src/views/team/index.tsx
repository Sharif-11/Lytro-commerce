import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Permission } from '@lytronix/validators';
import { useRoles, useStaffList } from '@/api/staff';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RowList } from '@/components/ui/list-row';
import { Toast } from '@/components/ui/toast';
import { useErrorText } from '@/hooks/use-error-text';
import { useToast } from '@/hooks/use-toast';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { StaffMember } from '@/types/staff';
import { SeatFullDialog, type SeatAsk } from './seat-full-dialog';
import { AddStaffSheet, EditStaffSheet, PasswordSheet } from './staff-sheets';
import { PersonRow, SeatsCard, TeamChips } from './team-parts';
import { seatsFull, sortPeople } from './team-words';

/**
 * Team, People (TENANT-DASHBOARD-DESIGN §7.14, the prototype's `team` and the states after it): the seats, the owner
 * first, one row a person; Add staff, or the seat-full dialog at once when no seat is free (STF-01 to STF-05, STF-13).
 */
export function TeamView(): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const { slug, viewer } = useShell();
  const canManage = allows(viewer, [Permission.StaffManage]);
  const staff = useStaffList();
  const roles = useRoles();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [seatAsk, setSeatAsk] = useState<SeatAsk | null>(null);
  const [password, setPassword] = useState<{ name: string; password: string } | null>(null);
  const seats = staff.data?.seats;

  return (
    <ShellPage
      actions={
        canManage ? (
          <Button
            size="sm"
            onClick={() => {
              if (seatsFull(seats)) setSeatAsk({ kind: 'add' });
              else setAdding(true);
            }}
          >
            <Icon name="plus" />
            {t('addStaff')}
          </Button>
        ) : undefined
      }
    >
      <TeamChips
        slug={slug}
        current="people"
        people={staff.data?.staff.length}
        roles={roles.data?.length}
      />
      {staff.isError ? <Banner tone="bad">{errorText(staff.error)}</Banner> : null}
      {seats ? <SeatsCard seats={seats} /> : null}
      {staff.data ? (
        <Card flush>
          <RowList>
            {sortPeople(staff.data.staff).map((member) => (
              <PersonRow
                key={member.id}
                member={member}
                roles={roles.data ?? []}
                onOpen={
                  canManage && !member.isOwner
                    ? () => {
                        setEditing(member);
                      }
                    : null
                }
              />
            ))}
          </RowList>
        </Card>
      ) : null}
      <p className="text-[14px] text-fg-muted">{t('nobodyDeleted')}</p>

      <AddStaffSheet
        open={adding}
        roles={roles.data ?? []}
        onClose={() => {
          setAdding(false);
        }}
        onAdded={(name) => {
          setAdding(false);
          toast.show(t('staffAdded', { name }));
        }}
        onSeatFull={() => {
          setAdding(false);
          setSeatAsk({ kind: 'add' });
        }}
      />
      <EditStaffSheet
        member={editing}
        roles={roles.data ?? []}
        seats={seats}
        onClose={() => {
          setEditing(null);
        }}
        onDone={(message) => {
          setEditing(null);
          toast.show(message);
        }}
        onSeatFull={(name) => {
          setEditing(null);
          setSeatAsk({ kind: 'reactivate', name });
        }}
        onPasswordReset={(name, value) => {
          setEditing(null);
          setPassword({ name, password: value });
        }}
      />
      <PasswordSheet
        shown={password}
        onClose={() => {
          setPassword(null);
        }}
      />
      <SeatFullDialog
        ask={seatAsk}
        seats={seats}
        onClose={() => {
          setSeatAsk(null);
        }}
      />
      <Toast message={toast.message} />
    </ShellPage>
  );
}
