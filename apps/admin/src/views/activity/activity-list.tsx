import { useTranslation } from 'react-i18next';
import { ActorType, AuditResult } from '@lytronix/validators';
import type { ActivityEntry } from '@/types/activity';
import { actionLabelKey } from '@/views/activity/action-options';

interface ActivityListProps {
  entries: ActivityEntry[];
}

// Widened to `string`, matching ActivityEntry.actorType/result's own plain-string fields (types/activity.ts's
// deliberate structural duplicate of the server's view) — comparing the real enum type against those would
// be an unsafe enum comparison the server-side code never risks, since it reads these off its own typed enum.
const SYSTEM_ACTOR_TYPE: string = ActorType.System;
const PLATFORM_SUPPORT_ACTOR_TYPE: string = ActorType.PlatformSupport;
const FAILURE_RESULT: string = AuditResult.Failure;

function actorLabel(entry: ActivityEntry, t: (key: string) => string): string {
  if (entry.actorName !== null) return entry.actorName;
  if (entry.actorType === PLATFORM_SUPPORT_ACTOR_TYPE)
    return t('activity.actorFallback.platformSupport');
  if (entry.actorType === SYSTEM_ACTOR_TYPE) return t('activity.actorFallback.system');
  // A "user" actor with no resolved name/id — e.g. a failed sign-in attempt for a phone number that never
  // matched an account, so there's no staff row to name. Not the system, not platform support — unknown.
  return t('activity.actorFallback.unknown');
}

function ResultBadge({ result }: { result: string }): React.JSX.Element {
  const { t } = useTranslation();
  const failed = result === FAILURE_RESULT;
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${
        failed ? 'border-red-200 text-red-600' : 'border-brand-500 text-brand-700'
      }`}
    >
      {failed ? t('activity.result.failure') : t('activity.result.success')}
    </span>
  );
}

function formatTimestamp(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-BD', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

/** One feed, not a mobile-card/desktop-table split like Staff/Roles — log entries read the same way at any
    width (CourierLogs.jsx's own layout, the closest analog in the reference dashboard), unlike tabular
    records that benefit from columns on a wide screen. */
export function ActivityList({ entries }: ActivityListProps): React.JSX.Element {
  const { t, i18n } = useTranslation();

  if (entries.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">{t('activity.noneYet')}</p>;
  }

  return (
    <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm">
      {entries.map((entry) => {
        const labelKey = actionLabelKey(entry.action);
        return (
          <div key={entry.id} className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">
                {labelKey ? t(labelKey) : entry.action}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{actorLabel(entry, t)}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {formatTimestamp(entry.createdAt, i18n.language)}
              </p>
            </div>
            <ResultBadge result={entry.result} />
          </div>
        );
      })}
    </div>
  );
}
