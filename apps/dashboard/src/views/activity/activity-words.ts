import { ACTIVITY_GROUPS, type ActivityGroup, ActorType, AuditResult } from '@lytronix/validators';
import { formatTaka } from '@lytronix/ui';
import type { ActivityEntry } from '@/types/activity';

type T = (key: string, options?: Record<string, unknown>) => string;

/** A chip on the Activity page: everything, one group of actions, or the failures. */
export type ActivityChip = 'all' | ActivityGroup | 'failed';

/** The chips in the prototype's order, each with its label. */
export const ACTIVITY_CHIPS: readonly { chip: ActivityChip; label: string }[] = [
  { chip: 'all', label: 'all' },
  { chip: 'signIns', label: 'fSignins' },
  { chip: 'staff', label: 'fStaff' },
  { chip: 'money', label: 'fMoney' },
  { chip: 'stock', label: 'fStock' },
  { chip: 'failed', label: 'fFailed' },
];

const FAILURE: string = AuditResult.Failure;

/** True when the entry records a refused or failed attempt (AUD-03), the only result the timeline shows. */
export const isFailure = (entry: ActivityEntry): boolean => entry.result === FAILURE;

/** AUD-04: what a chip asks the server for -- its group's actions, or the failures -- so a page is never filtered locally. */
export function filterOf(chip: ActivityChip): { actions?: readonly string[]; result?: string } {
  if (chip === 'all') return {};
  if (chip === 'failed') return { result: FAILURE };
  return { actions: ACTIVITY_GROUPS[chip] };
}

// The word for an actor with no name of its own; the entry's actor type is a plain string from the server.
const ACTOR_WORDS: Partial<Record<string, string>> = {
  [ActorType.PlatformSupport]: 'actorSupport',
  [ActorType.System]: 'actorSystem',
  [ActorType.ApiKey]: 'actorKey',
};

/** AUD-08: who the entry names -- the staff member, else Lytro support, the system or a key, never an operator. */
export function actorOf(entry: ActivityEntry, t: T): string {
  if (entry.actorName) return entry.actorName;
  return t(ACTOR_WORDS[entry.actorType] ?? 'actorSomeone');
}

function summaryOf(entry: ActivityEntry): Record<string, unknown> {
  return typeof entry.summary === 'object' && entry.summary !== null
    ? (entry.summary as Record<string, unknown>)
    : {};
}

const isFigure = (value: unknown): value is string | number =>
  typeof value === 'string' || typeof value === 'number';

/** The entry's one sentence: who did what, or what a payment or a job did; the amount where the entry carries one. */
export function sentenceOf(entry: ActivityEntry, t: T): string {
  const summary = summaryOf(entry);
  const amount = isFigure(summary['amount']) ? formatTaka(String(summary['amount'])) : '';
  return t(`act.${entry.action}`, { actor: actorOf(entry, t), amount, defaultValue: entry.action });
}

/** The line under it: what the entry was about, from its summary -- a name, or a stock change from one figure to another. */
export function detailOf(entry: ActivityEntry): string | null {
  const summary = summaryOf(entry);
  const name = summary['name'];
  if (typeof name === 'string' && name.trim() !== '') return name;
  const from = summary['from'];
  const to = summary['to'];
  if (isFigure(from) && isFigure(to)) return `${String(from)} → ${String(to)}`;
  return null;
}

/** The avatar's letters: the name's first character as written, so "কামাল" gives "কা", as the prototype draws it. */
export function initialOf(name: string): string {
  const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(name.trim());
  const first = graphemes[Symbol.iterator]().next();
  return first.done ? '?' : first.value.segment.toUpperCase();
}
