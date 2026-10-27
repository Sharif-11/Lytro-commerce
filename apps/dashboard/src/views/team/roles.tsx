import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { Permission } from '@lytronix/validators';
import { useCreateRole, useDeleteRole, useRoles, useStaffList, useUpdateRole } from '@/api/staff';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { rowClass, RowList } from '@/components/ui/list-row';
import { Toast } from '@/components/ui/toast';
import { useErrorText } from '@/hooks/use-error-text';
import { useToast } from '@/hooks/use-toast';
import { allows } from '@/shell/hubs';
import { useShell } from '@/shell/shell-context';
import { ShellPage } from '@/shell/shell-page';
import type { RoleSummary } from '@/types/staff';
import { RoleFields } from './role-fields';
import { TeamChips } from './team-parts';
import { EMPTY_ROLE, roleLine, type RoleDraft } from './team-words';

const KNOWN = new Set<string>(Object.values(Permission));
const draftOf = (role: RoleSummary): RoleDraft => ({
  name: role.name,
  permissions: role.permissions.filter((each): each is Permission => KNOWN.has(each)),
});

/** The role being edited, or a new one (Create a role pressed, or a shop with no roles yet). */
type Picked = { kind: 'role'; id: string } | { kind: 'new' };

/**
 * Team, Roles (TENANT-DASHBOARD-DESIGN §7.14, the prototype's `roles`, `roles-new` and `roles-empty`): the roles, each
 * with how many hold it and what it lets them do; beside them the editor -- the name, the permissions in words, Save
 * and Delete, which waits until nobody holds the role (STF-07, STF-09, STF-10).
 */
export function RolesView(): React.JSX.Element {
  const { t } = useTranslation('menu');
  const errorText = useErrorText();
  const { slug, viewer } = useShell();
  const canManage = allows(viewer, [Permission.StaffManage]);
  const roles = useRoles();
  const staff = useStaffList();
  const create = useCreateRole();
  const update = useUpdateRole();
  const remove = useDeleteRole();
  const toast = useToast();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [draft, setDraft] = useState<RoleDraft>(EMPTY_ROLE);
  const [nameError, setNameError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [heldBy, setHeldBy] = useState<number | null>(null);

  const list = roles.data ?? [];
  const role = picked?.kind === 'role' ? list.find((each) => each.id === picked.id) : undefined;
  // The first role is open until another is picked; with none, the editor waits for the first.
  const current: Picked | null =
    picked && (picked.kind === 'new' || role)
      ? picked
      : list[0]
        ? { kind: 'role', id: list[0].id }
        : roles.isSuccess
          ? { kind: 'new' }
          : null;
  const currentRole =
    current?.kind === 'role' ? list.find((each) => each.id === current.id) : undefined;
  const currentKey = current?.kind === 'role' ? current.id : current?.kind;

  useEffect(() => {
    setDraft(currentRole ? draftOf(currentRole) : EMPTY_ROLE);
    setNameError(null);
    create.reset();
    update.reset();
    // The draft starts again only when another role (or a new one) is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);

  function open(next: Picked): void {
    setPicked(next);
  }

  function save(): void {
    const name = draft.name.trim();
    if (name === '') {
      setNameError(t('roleNameNeeded'));
      return;
    }
    const input = { name, permissions: draft.permissions };
    if (currentRole) {
      update.mutate(
        { id: currentRole.id, ...input },
        {
          onSuccess: () => {
            toast.show(t('roleSaved'));
          },
        },
      );
      return;
    }
    create.mutate(input, {
      onSuccess: (made) => {
        open({ kind: 'role', id: made.id });
        toast.show(t('roleCreated', { name: made.name }));
      },
    });
  }

  function deleteRole(): void {
    if (!currentRole) return;
    remove.mutate(currentRole.id, {
      onSuccess: () => {
        setDeleting(false);
        setPicked(null);
        toast.show(t('roleDeleted'));
      },
      onError: (error) => {
        setDeleting(false);
        if (error instanceof ApiClientError && error.code === 'conflict') {
          setHeldBy(Number(error.details.holders ?? currentRole.holders));
        }
      },
    });
  }

  const error = create.error ?? update.error ?? remove.error;
  return (
    <ShellPage
      sectionChips
      actions={
        canManage ? (
          <Button
            size="sm"
            onClick={() => {
              open({ kind: 'new' });
            }}
          >
            <Icon name="plus" />
            {t('createRole')}
          </Button>
        ) : undefined
      }
    >
      <TeamChips
        slug={slug}
        current="roles"
        people={staff.data?.staff.length}
        roles={roles.data?.length}
      />
      {roles.isError ? <Banner tone="bad">{errorText(roles.error)}</Banner> : null}
      {roles.isSuccess ? (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-6">
          {list.length > 0 ? (
            <Card flush>
              <RowList>
                {list.map((each) => (
                  <button
                    key={each.id}
                    type="button"
                    aria-current={currentRole?.id === each.id ? 'true' : undefined}
                    className={`${rowClass} items-start! ${currentRole?.id === each.id ? 'bg-primary-soft' : ''}`}
                    onClick={() => {
                      open({ kind: 'role', id: each.id });
                    }}
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[16px] font-medium">{each.name}</span>
                      <span className="text-[14px] text-fg-muted">
                        {[t('holders', { count: each.holders }), roleLine(each.permissions, t)]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <Icon name="right" />
                  </button>
                ))}
              </RowList>
            </Card>
          ) : (
            <Card flush>
              <EmptyState icon="users">{t('roleNone')}</EmptyState>
            </Card>
          )}
          {current ? (
            <Card className="flex flex-col gap-2.5">
              <RoleFields
                draft={draft}
                nameError={nameError}
                readOnly={!canManage}
                onChange={(next) => {
                  setDraft(next);
                  setNameError(null);
                }}
              />
              {error && !(error instanceof ApiClientError && error.code === 'conflict') ? (
                <Banner tone="bad">{errorText(error)}</Banner>
              ) : null}
              {canManage ? (
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {currentRole ? (
                    <>
                      <Button size="sm" busy={update.isPending} onClick={save}>
                        {t('save')}
                      </Button>
                      <Button
                        size="sm"
                        tone="outline"
                        disabled={currentRole.holders > 0}
                        onClick={() => {
                          setDeleting(true);
                        }}
                      >
                        {currentRole.holders > 0
                          ? `${t('roleDelete')} · ${t('holders', { count: currentRole.holders })}`
                          : t('roleDelete')}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" busy={create.isPending} onClick={save}>
                        {t('roleCreateBtn')}
                      </Button>
                      {list.length > 0 ? (
                        <Button
                          size="sm"
                          tone="outline"
                          onClick={() => {
                            setPicked(null);
                          }}
                        >
                          {t('roleCancel')}
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </Card>
          ) : null}
        </div>
      ) : null}

      <Dialog
        open={deleting}
        title={t('roleDelTitle', { role: currentRole?.name ?? '' })}
        onClose={() => {
          setDeleting(false);
        }}
        actions={
          <>
            <Button
              tone="outline"
              onClick={() => {
                setDeleting(false);
              }}
            >
              {t('keep')}
            </Button>
            <Button tone="danger" busy={remove.isPending} onClick={deleteRole}>
              {t('roleDelete')}
            </Button>
          </>
        }
      >
        {t('roleDelLead')}
      </Dialog>
      <Dialog
        open={heldBy !== null}
        title={t('roleDelTitle', { role: currentRole?.name ?? '' })}
        onClose={() => {
          setHeldBy(null);
        }}
        actions={
          <Button
            onClick={() => {
              setHeldBy(null);
            }}
          >
            {t('done')}
          </Button>
        }
      >
        {t('roleDelUsed', { count: heldBy ?? 0 })}
      </Dialog>
      <Toast message={toast.message} />
    </ShellPage>
  );
}
