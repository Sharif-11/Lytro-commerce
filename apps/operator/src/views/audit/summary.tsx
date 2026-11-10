import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';
import { formatDay } from '@/lib/format';
import type { AuditEntry } from '@/types/records';
import { countWords, takaSigned } from '@/views/records/numbers';
import { METHOD_NAMES } from '@/views/wallets/providers';

// ADM-08, D8-11 (OPERATOR-CONSOLE-DESIGN §10f, §15): the server gives each entry its action's code and a summary whose keys
// differ by action. The console names every action and every key it knows, and writes each value as a person reads it.

// Keys that hold taka.
const MONEY_KEYS = new Set([
  'amount',
  'price',
  'credited',
  'quoted',
  'arrived',
  'amountSent',
  'creditAmount',
]);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

export type Summary = Record<string, unknown>;

export function summaryOf(entry: AuditEntry): Summary {
  const summary = entry.summary;
  return summary !== null && typeof summary === 'object' && !Array.isArray(summary)
    ? (summary as Summary)
    : {};
}

/** A summary's parts in the order the server wrote them, its reason last since it is the longest. */
export function summaryEntries(entry: AuditEntry): [string, unknown][] {
  const entries = Object.entries(summaryOf(entry));
  return [
    ...entries.filter(([key]) => key !== 'reason'),
    ...entries.filter(([key]) => key === 'reason'),
  ];
}

/** A summary's value as a person reads it: taka, a day, yes or no, or the words themselves. */
export function valueWords(key: string, value: unknown, t: TFunction): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? t('audit.yes') : t('audit.no');
  if (typeof value === 'number') {
    return MONEY_KEYS.has(key) ? takaSigned(value) : countWords(value);
  }
  if (typeof value === 'string') {
    if (MONEY_KEYS.has(key) && value.trim() !== '' && !Number.isNaN(Number(value))) {
      return takaSigned(value);
    }
    if (ISO_DAY.test(value)) {
      return formatDay(value.length === 10 ? `${value}T12:00:00+06:00` : value);
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((each) => valueWords(key, each, t)).join(', ');
  return JSON.stringify(value);
}

/** A summary key's label; one the console has no word for is shown as the server names it. */
export function keyWords(key: string, t: TFunction): string {
  return t(`audit.keys.${key}`, { defaultValue: key });
}

/** The action's name; a code the console has no word for is shown as the server writes it. */
export function actionWords(action: string, t: TFunction): string {
  return t(`audit.actions.${action}`, { defaultValue: action });
}

/** Who did it: an operator by email, Lytro by itself, or the shop's owner. */
export function whoWords(entry: AuditEntry, t: TFunction): string {
  if (entry.actorType === 'system') return t('audit.who.system');
  if (entry.actorType === 'shop_owner') return t('audit.who.owner');
  return entry.actorEmail ?? '—';
}

const joined = (parts: ReactNode[]): ReactNode[] =>
  parts.flatMap((part, index) => (index === 0 ? [part] : [' · ', part]));

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

/** The line under an action in the list: what matters about it, as the sketch writes each. */
export function lineOf(entry: AuditEntry, t: TFunction): ReactNode {
  const summary = summaryOf(entry);
  const reason = text(summary.reason);
  const withReason = (parts: ReactNode[]): ReactNode => joined(reason ? [...parts, reason] : parts);
  switch (entry.action) {
    case 'plan_extended':
      return withReason([
        `${valueWords('days', summary.days, t)} ${t('audit.days')}`,
        `${valueWords('from', summary.from, t)} → ${valueWords('to', summary.to, t)}`,
      ]);
    case 'settings_changed':
    case 'rate_changed':
      return withReason([
        <span key="change">
          <span className="mono">{text(summary.key) ?? ''}</span>:{' '}
          {valueWords('', summary.oldValue, t)} → {valueWords('', summary.newValue, t)}
        </span>,
      ]);
    case 'manual_entry_recorded':
    case 'manual_entry_reversed':
    case 'plan_payment_verified':
    case 'plan_payment_rejected':
    case 'plan_payment_credited':
    case 'balance_adjusted': {
      const trx = text(summary.transactionId);
      return withReason([
        valueWords('amount', summary.amount, t),
        ...(trx
          ? [
              <span key="trx" className="mono">
                {trx}
              </span>,
            ]
          : []),
      ]);
    }
    case 'usage_fast_spend_alerted': {
      const requests = Number(summary.requests);
      const limit = Number(summary.limit);
      return limit > 0 ? `${String(Math.round((requests / limit) * 100))}%` : null;
    }
    case 'payment_method_type_retired':
    case 'payment_method_type_retire_undone':
    case 'payment_method_type_removed': {
      const method = text(summary.method) ?? '';
      return withReason([METHOD_NAMES[method] ?? method]);
    }
    default: {
      if (reason) return reason;
      const shown = Object.entries(summary)
        .filter(([key]) => key !== 'tenantId')
        .slice(0, 3)
        .map(([key, value]) => `${keyWords(key, t)}: ${valueWords(key, value, t)}`);
      return shown.length ? joined(shown) : null;
    }
  }
}
