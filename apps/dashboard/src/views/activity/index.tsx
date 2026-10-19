import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActorType, AuditAction, AuditResult } from '@lytronix/validators';
import { useActivityList } from '@/api/activity';
import { errorMessage } from '@/api/error-message';
import { useMe } from '@/api/me';
import { Button } from '@/components/ui/button';
import { Chip, Tag } from '@/components/ui/chip';
import { EmptyLine, Page, PageHeader } from '@/components/ui/fields';
import { Icon } from '@/components/ui/icon';
import { ErrorBanner } from '@/components/ui/notice';
import { Sheet } from '@/components/ui/sheet';
import { TextField } from '@/components/ui/text-field';
import { dayLabel, formatDate, formatTime, groupByDay } from '@/lib/dates';
import type { ActivityEntry } from '@/types/activity';

/** The action groups the chips offer; the API filters one action, so a group narrows on the client. */
const GROUPS: { key: string; actions: string[] }[] = [
  { key: 'all', actions: [] },
  {
    key: 'signIns',
    actions: [
      AuditAction.SignIn,
      AuditAction.SignInFailed,
      AuditAction.SignOut,
      AuditAction.PasswordChanged,
      AuditAction.PasswordReset,
    ],
  },
  {
    key: 'staffRoles',
    actions: [
      AuditAction.StaffCreated,
      AuditAction.StaffUpdated,
      AuditAction.StaffDeactivated,
      AuditAction.StaffReactivated,
      AuditAction.RoleCreated,
      AuditAction.RoleUpdated,
      AuditAction.RoleDeleted,
    ],
  },
  { key: 'failed', actions: [] },
];

const SYSTEM: string = ActorType.System;
const PLATFORM: string = ActorType.PlatformSupport;
const FAILURE: string = AuditResult.Failure;

/**
 * Activity (AUD-04/08): one sentence per entry built from actor, action and target, grouped by day, with a
 * red avatar only on failure. Actor chips come from the loaded entries; the date range opens a sheet.
 */
export function Activity(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const me = useMe();
  const [actorId, setActorId] = useState<string | null>(null);
  const [group, setGroup] = useState('all');
  const [dates, setDates] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [datesOpen, setDatesOpen] = useState(false);
  const [draft, setDraft] = useState(dates);

  const list = useActivityList({
    actorId: actorId ?? undefined,
    dateFrom: dates.from || undefined,
    dateTo: dates.to || undefined,
  });
  const loaded = (list.data?.pages ?? []).flatMap((page) => page.entries);
  const selected = GROUPS.find((option) => option.key === group) ?? GROUPS[0];
  const entries = loaded.filter((entry) => {
    if (!selected || selected.key === 'all') return true;
    if (selected.key === 'failed') return entry.result === FAILURE;
    return selected.actions.includes(entry.action);
  });
  const actors = new Map<string, string>();
  for (const entry of loaded) {
    if (entry.actorId && entry.actorName && !actors.has(entry.actorId)) {
      actors.set(entry.actorId, entry.actorName);
    }
  }
  const groups = groupByDay(entries, (entry) => entry.createdAt);

  function heading(iso: string): string {
    const label = dayLabel(iso);
    if (label.kind === 'today') return t('dates.today');
    if (label.kind === 'yesterday') return t('dates.yesterday');
    return formatDate(label.iso, i18n.language);
  }

  return (
    <Page narrow>
      <PageHeader
        title={t('activity.title')}
        lead={t('activity.lead', { plan: me.data?.tenant?.planName ?? t('plan.state.trial') })}
      />
      {actors.size > 0 ? (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
          <Chip
            selected={actorId === null}
            className="shrink-0 min-h-10!"
            onClick={() => {
              setActorId(null);
            }}
          >
            {t('activity.everyone')}
          </Chip>
          {[...actors.entries()].map(([id, name]) => (
            <Chip
              key={id}
              selected={actorId === id}
              className="shrink-0 min-h-10!"
              onClick={() => {
                setActorId(id);
              }}
            >
              {name}
            </Chip>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {GROUPS.map((option) => (
            <Chip
              key={option.key}
              selected={group === option.key}
              className="min-h-10!"
              onClick={() => {
                setGroup(option.key);
              }}
            >
              {t(`activity.groups.${option.key}`)}
            </Chip>
          ))}
        </div>
        <Button
          type="button"
          tone="outline"
          fit
          className="min-h-10! px-3! text-[14px]!"
          onClick={() => {
            setDraft(dates);
            setDatesOpen(true);
          }}
        >
          <Icon name="calendar" size={16} />
          {dates.from || dates.to ? t('balance.datesSet') : t('balance.dates')}
        </Button>
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
        {list.isLoading ? <EmptyLine>{t('common.loading')}</EmptyLine> : null}
        {list.isError ? (
          <div className="p-4">
            <ErrorBanner message={errorMessage(list.error, t)} />
          </div>
        ) : null}
        {list.data && entries.length === 0 ? <EmptyLine>{t('activity.noneYet')}</EmptyLine> : null}
        {groups.map((day) => (
          <div key={day.key}>
            <p className="border-t border-line bg-neutral-50 px-4 pt-2.5 pb-1 text-[12px] font-bold text-neutral-700 first:border-t-0">
              {heading(day.iso)}
            </p>
            {day.items.map((entry) => (
              <Row key={entry.id} entry={entry} language={i18n.language} />
            ))}
          </div>
        ))}
        {list.hasNextPage ? (
          <div className="flex justify-center border-t border-line p-2">
            <Button
              type="button"
              tone="ghost"
              fit
              loading={list.isFetchingNextPage}
              onClick={() => {
                void list.fetchNextPage();
              }}
            >
              {t('balance.showEarlier')}
            </Button>
          </div>
        ) : null}
      </div>

      <Sheet
        open={datesOpen}
        title={t('balance.dates')}
        onClose={() => {
          setDatesOpen(false);
        }}
        footer={
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              tone="outline"
              onClick={() => {
                setDates({ from: '', to: '' });
                setDatesOpen(false);
              }}
            >
              {t('balance.clearDates')}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setDates(draft);
                setDatesOpen(false);
              }}
            >
              {t('balance.applyDates')}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          <TextField
            label={t('balance.dateFrom')}
            name="dateFrom"
            type="date"
            value={draft.from}
            onChange={(event) => {
              setDraft((current) => ({ ...current, from: event.target.value }));
            }}
          />
          <TextField
            label={t('balance.dateTo')}
            name="dateTo"
            type="date"
            value={draft.to}
            onChange={(event) => {
              setDraft((current) => ({ ...current, to: event.target.value }));
            }}
          />
        </div>
      </Sheet>
    </Page>
  );
}

function summaryDetail(summary: unknown): string | null {
  if (typeof summary !== 'object' || summary === null) return null;
  const record = summary as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of ['name', 'phone', 'reason', 'note']) {
    const value = record[key];
    if (typeof value === 'string' && value !== '') parts.push(value);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

function Row({ entry, language }: { entry: ActivityEntry; language: string }): React.JSX.Element {
  const { t } = useTranslation();
  const failed = entry.result === FAILURE;
  const system = entry.actorType === SYSTEM;
  const platform = entry.actorType === PLATFORM;
  const actor = platform
    ? t('activity.actor.platformSupport')
    : system
      ? t('activity.actor.system')
      : (entry.actorName ?? t('activity.actor.unknown'));
  const target = entry.targetId ? entry.targetId.slice(0, 8) : '';
  const sentence = t(`activity.sentence.${entry.action}`, { defaultValue: entry.action, target });
  const detail = summaryDetail(entry.summary);

  return (
    <div className="flex items-start gap-3 border-t border-line px-4 py-2.5">
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${
          failed
            ? 'bg-danger-soft text-danger'
            : system || platform
              ? 'bg-neutral-100 text-neutral-700'
              : 'bg-brand-100 text-brand-800'
        }`}
      >
        {platform ? (
          <Icon name="signal" size={14} />
        ) : system ? (
          '⚙'
        ) : (
          actor.slice(0, 1).toUpperCase()
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] text-ink">
          <b>{actor}</b> {sentence}{' '}
          {failed ? <Tag tone="danger">{t('activity.failed')}</Tag> : null}
        </p>
        {detail ? <p className="text-[13px] text-neutral-700">{detail}</p> : null}
      </div>
      <time className="num shrink-0 pt-1 text-[12px] text-neutral-700">
        {formatTime(entry.createdAt, language)}
      </time>
    </div>
  );
}
