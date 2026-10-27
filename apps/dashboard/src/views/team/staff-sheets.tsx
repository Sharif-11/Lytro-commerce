import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NAME_MAX_LENGTH } from '@lytronix/validators';
import { useCreateRole, useCreateStaff, useResetStaffPassword, useUpdateStaff } from '@/api/staff';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckRow } from '@/components/ui/check-row';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { RowList } from '@/components/ui/list-row';
import { Sheet } from '@/components/ui/sheet';
import { Icon } from '@/components/icon';
import { useErrorText } from '@/hooks/use-error-text';
import { firstPassword } from '@/lib/first-password';
import { bangladeshiPhone } from '@/lib/phone';
import type { RoleSummary, SeatUsage, StaffMember } from '@/types/staff';
import { RoleFields } from './role-fields';
import { SheetRow } from './team-parts';
import {
  EMPTY_ROLE,
  personLabel,
  refusedForSeat,
  roleLine,
  seatsFull,
  type RoleDraft,
} from './team-words';

/** A password to read out, with Copy (the prototype's first-password field). */
function PasswordField({ password, help }: { password: string; help?: string }): React.JSX.Element {
  const { t } = useTranslation('menu');
  const [copied, setCopied] = useState(false);
  return (
    <Field
      label={t('firstPw')}
      name="firstPassword"
      readOnly
      value={password}
      help={help}
      suffix={
        <Button
          type="button"
          tone="outline"
          size="xs"
          onClick={() => {
            void navigator.clipboard.writeText(password).then(() => {
              setCopied(true);
            });
          }}
        >
          {copied ? t('copied') : t('copy')}
        </Button>
      }
    />
  );
}

/** The roles to tick, each saying what it lets someone do. */
function RoleChoices({
  roles,
  roleIds,
  onToggle,
}: {
  roles: readonly RoleSummary[];
  roleIds: readonly string[];
  onToggle: (id: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  return (
    <>
      {roles.map((role) => (
        <CheckRow
          key={role.id}
          card
          checked={roleIds.includes(role.id)}
          title={role.name}
          sub={roleLine(role.permissions, t)}
          onChange={() => {
            onToggle(role.id);
          }}
        />
      ))}
    </>
  );
}

const toggledId = (ids: readonly string[], id: string): string[] =>
  ids.includes(id) ? ids.filter((each) => each !== id) : [...ids, id];

/**
 * Add staff (STF-01, the prototype's `staff` and Part 12): the phone, a name if wanted, a random first password to read
 * out, and the roles. New role is a step of the sheet; Create and choose comes back with the role ticked and what was
 * typed kept.
 */
export function AddStaffSheet({
  open,
  roles,
  onClose,
  onAdded,
  onSeatFull,
}: {
  open: boolean;
  roles: readonly RoleSummary[];
  onClose: () => void;
  onAdded: (name: string) => void;
  onSeatFull: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const create = useCreateStaff();
  const createRole = useCreateRole();
  const [step, setStep] = useState<'person' | 'role'>('person');
  const [localPhone, setLocalPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<RoleDraft>(EMPTY_ROLE);
  const [roleNameError, setRoleNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep('person');
    setLocalPhone('');
    setPhoneError(null);
    setName('');
    setPassword(firstPassword.suggest());
    setRoleIds([]);
    create.reset();
    // The mutation is stable; opening the sheet is what starts it afresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function add(): void {
    const phone = bangladeshiPhone.fromLocalPart(localPhone);
    if (!bangladeshiPhone.isValid(phone)) {
      setPhoneError(t('phoneInvalid'));
      return;
    }
    setPhoneError(null);
    const trimmed = name.trim();
    create.mutate(
      { phone, password, name: trimmed === '' ? undefined : trimmed, roleIds },
      {
        onSuccess: () => {
          onAdded(trimmed === '' ? bangladeshiPhone.grouped(phone) : trimmed);
        },
        onError: (error) => {
          if (refusedForSeat(error)) onSeatFull();
        },
      },
    );
  }

  function makeRole(): void {
    const roleName = draft.name.trim();
    if (roleName === '') {
      setRoleNameError(t('roleNameNeeded'));
      return;
    }
    createRole.mutate(
      { name: roleName, permissions: draft.permissions },
      {
        onSuccess: (role) => {
          setRoleIds((current) => [...current, role.id]);
          setStep('person');
        },
      },
    );
  }

  if (step === 'role') {
    return (
      <Sheet
        open={open}
        title={t('roleNewTitle')}
        onClose={onClose}
        onBack={() => {
          setStep('person');
        }}
        footer={
          <Button wide busy={createRole.isPending} onClick={makeRole}>
            {t('roleCreatePick')}
          </Button>
        }
      >
        <RoleFields
          draft={draft}
          nameError={roleNameError}
          onChange={(next) => {
            setDraft(next);
            setRoleNameError(null);
          }}
        />
        {createRole.isError ? <Banner tone="bad">{errorText(createRole.error)}</Banner> : null}
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      title={t('staffTitle')}
      onClose={onClose}
      footer={
        <Button wide busy={create.isPending} onClick={add}>
          {t('addStaff')}
        </Button>
      }
    >
      <Field
        label={t('phoneL')}
        name="phone"
        type="tel"
        inputMode="numeric"
        autoComplete="off"
        prefix="+880"
        placeholder="1XXXXXXXXX"
        value={localPhone}
        error={phoneError}
        onChange={(event) => {
          setLocalPhone(event.target.value.replace(/[^\d\s-]/g, ''));
        }}
      />
      <Field
        label={t('nameOpt')}
        name="name"
        autoComplete="off"
        maxLength={NAME_MAX_LENGTH}
        placeholder={t('namePh')}
        value={name}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <PasswordField password={password} help={t('firstPwNote')} />
      <div className="flex flex-col gap-2">
        <span className="text-[14px] font-medium text-fg-muted">{t('rolesPick')}</span>
        {roles.length === 0 ? (
          <p className="text-[14px] text-fg-muted">{t('roleNoneSheet')}</p>
        ) : (
          <RoleChoices
            roles={roles}
            roleIds={roleIds}
            onToggle={(id) => {
              setRoleIds((current) => toggledId(current, id));
            }}
          />
        )}
        <Button
          tone="ghost"
          size="sm"
          className="self-start"
          onClick={() => {
            setDraft(EMPTY_ROLE);
            setRoleNameError(null);
            createRole.reset();
            setStep('role');
          }}
        >
          <Icon name="plus" />
          {t('createRole')}
        </Button>
      </div>
      {create.isError && !refusedForSeat(create.error) ? (
        <Banner tone="bad">{errorText(create.error)}</Banner>
      ) : null}
    </Sheet>
  );
}

/**
 * Edit staff (STF-03, the prototype's `sh-staff-edit`): the name, the phone that cannot change, the roles; then Reset
 * password and Deactivate -- or, for someone inactive, Reactivate, which needs a free seat (STF-04, STF-05, STF-13).
 * Deactivate asks over the Team page, the sheet put away, and Keep it leaves both closed (`sh-staff-deactivate`).
 */
export function EditStaffSheet({
  member,
  roles,
  seats,
  onClose,
  onDone,
  onSeatFull,
  onPasswordReset,
}: {
  member: StaffMember | null;
  roles: readonly RoleSummary[];
  seats: SeatUsage | undefined;
  onClose: () => void;
  onDone: (message: string) => void;
  onSeatFull: (name: string) => void;
  onPasswordReset: (name: string, password: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const update = useUpdateStaff();
  const reset = useResetStaffPassword();
  const [name, setName] = useState('');
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!member) return;
    setName(member.name ?? '');
    setRoleIds(member.roleIds);
    setConfirming(false);
    update.reset();
    reset.reset();
    // The mutations are stable; the person opened is what the sheet starts from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member]);

  const label = member ? personLabel(member) : '';

  function save(): void {
    if (!member) return;
    const trimmed = name.trim();
    update.mutate(
      { id: member.id, name: trimmed === '' ? null : trimmed, roleIds },
      {
        onSuccess: () => {
          onDone(t('staffSaved'));
        },
      },
    );
  }

  function setActive(active: boolean): void {
    if (!member) return;
    if (active && seatsFull(seats)) {
      onSeatFull(label);
      return;
    }
    update.mutate(
      { id: member.id, active },
      {
        onSuccess: () => {
          setConfirming(false);
          onDone(
            active ? t('stReactivated', { name: label }) : t('stDeactivated', { name: label }),
          );
        },
        onError: (error) => {
          if (refusedForSeat(error)) onSeatFull(label);
        },
      },
    );
  }

  function resetPassword(): void {
    if (!member) return;
    const password = firstPassword.suggest();
    reset.mutate(
      { id: member.id, newPassword: password },
      {
        onSuccess: () => {
          onPasswordReset(label, password);
        },
      },
    );
  }

  // Keep it, Escape or the backdrop: the question goes and the sheet stays closed, as drawn.
  function putAway(): void {
    setConfirming(false);
    onClose();
  }

  const error = update.error ?? reset.error;
  return (
    <>
      <Sheet
        open={member !== null && !confirming}
        title={t('stEditTitle')}
        onClose={onClose}
        footer={
          <Button wide busy={update.isPending && !confirming} onClick={save}>
            {t('stSaveBtn')}
          </Button>
        }
      >
        <Field
          label={t('nameOpt')}
          name="name"
          autoComplete="off"
          maxLength={NAME_MAX_LENGTH}
          placeholder={t('namePh')}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <Field
          label={t('phoneL')}
          name="phone"
          readOnly
          value={member?.phone ? bangladeshiPhone.grouped(member.phone) : ''}
          help={t('stPhoneFixed')}
        />
        <div className="flex flex-col gap-2">
          <span className="text-[14px] font-medium text-fg-muted">{t('rolesPick')}</span>
          <RoleChoices
            roles={roles}
            roleIds={roleIds}
            onToggle={(id) => {
              setRoleIds((current) => toggledId(current, id));
            }}
          />
        </div>
        <Card flush className="mt-1">
          <RowList>
            <SheetRow
              icon="key"
              title={t('stPwBtn')}
              sub={member?.mustSetPassword ? t('noPassword') : t('stPwSub')}
              onClick={resetPassword}
            />
            {member?.active === false ? (
              <SheetRow
                icon="check"
                title={t('stReactivate')}
                sub={t('stReactivateSub')}
                onClick={() => {
                  setActive(true);
                }}
              />
            ) : (
              <SheetRow
                icon="minus"
                danger
                title={t('stDeactivate')}
                sub={t('nobodyDeleted')}
                onClick={() => {
                  setConfirming(true);
                }}
              />
            )}
          </RowList>
        </Card>
        {error && !refusedForSeat(error) ? <Banner tone="bad">{errorText(error)}</Banner> : null}
      </Sheet>
      <Dialog
        open={confirming && member !== null}
        title={t('stDeactTitle', { name: label })}
        onClose={putAway}
        actions={
          <>
            <Button tone="outline" onClick={putAway}>
              {t('keep')}
            </Button>
            <Button
              tone="danger"
              busy={update.isPending}
              onClick={() => {
                setActive(false);
              }}
            >
              {t('stDeactivate')}
            </Button>
          </>
        }
      >
        {t('stDeactCons')}
      </Dialog>
    </>
  );
}

/** STF-13 (the prototype's `sh-staff-password`): the new first password, shown once, to read out or send. */
export function PasswordSheet({
  shown,
  onClose,
}: {
  shown: { name: string; password: string } | null;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  return (
    <Sheet
      open={shown !== null}
      title={t('stPwTitle')}
      onClose={onClose}
      footer={
        <Button wide onClick={onClose}>
          {t('stPwDone')}
        </Button>
      }
    >
      <p className="text-[14px] text-fg-muted">{t('stPwLead', { name: shown?.name ?? '' })}</p>
      <PasswordField password={shown?.password ?? ''} />
      <p className="text-[14px] text-fg-muted">{t('stPwNote')}</p>
    </Sheet>
  );
}
