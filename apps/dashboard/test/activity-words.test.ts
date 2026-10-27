import { describe, expect, it } from 'vitest';
import { ACTIVITY_GROUPS, ActorType, AuditAction, AuditResult } from '@lytronix/validators';
import bn from '../src/i18n/locales/menu/bn.json';
import en from '../src/i18n/locales/menu/en.json';
import { initialOf } from '../src/lib/initial';
import type { ActivityEntry } from '../src/types/activity';
import {
  ACTIVITY_CHIPS,
  actorOf,
  detailOf,
  filterOf,
  isFailure,
  sentenceOf,
} from '../src/views/activity/activity-words';

// The key and its values, so the wording is checked without the dictionary.
const t = (key: string, options?: Record<string, unknown>): string => {
  if (!options) return key;
  const values = { ...options };
  delete values['defaultValue'];
  return `${key} ${JSON.stringify(values)}`;
};

function entryOf(given: Partial<ActivityEntry>): ActivityEntry {
  return {
    id: '1',
    tenantId: 't',
    actorType: ActorType.User,
    actorId: 'u-1',
    actorName: 'কামাল',
    action: AuditAction.SignIn,
    targetType: null,
    targetId: null,
    result: AuditResult.Success,
    summary: null,
    createdAt: '2026-10-27T05:50:00.000Z',
    ...given,
  };
}

describe('Activity chips', () => {
  it('come in the prototype’s order, one for each group between All and Failed', () => {
    expect(ACTIVITY_CHIPS.map((each) => each.chip)).toEqual([
      'all',
      'signIns',
      'staff',
      'money',
      'stock',
      'failed',
    ]);
    expect(Object.keys(ACTIVITY_GROUPS).sort()).toEqual(['money', 'signIns', 'staff', 'stock']);
  });

  it('ask the server for a group’s actions or the failures, and All for nothing in particular (AUD-04)', () => {
    expect(filterOf('all')).toEqual({});
    expect(filterOf('failed')).toEqual({ result: AuditResult.Failure });
    expect(filterOf('money')).toEqual({ actions: ACTIVITY_GROUPS.money });
  });
});

describe('an entry’s words', () => {
  it('name the staff member, else Lytro support, the system, a key or someone (AUD-08)', () => {
    expect(actorOf(entryOf({}), t)).toBe('কামাল');
    expect(actorOf(entryOf({ actorName: null, actorType: ActorType.PlatformSupport }), t)).toBe(
      'actorSupport',
    );
    expect(actorOf(entryOf({ actorName: null, actorType: ActorType.System }), t)).toBe(
      'actorSystem',
    );
    expect(actorOf(entryOf({ actorName: null, actorType: ActorType.ApiKey }), t)).toBe('actorKey');
    expect(actorOf(entryOf({ actorName: null }), t)).toBe('actorSomeone');
  });

  it('give the action’s sentence with who did it and the amount it carries', () => {
    expect(sentenceOf(entryOf({}), t)).toBe('act.sign_in {"actor":"কামাল","amount":""}');
    expect(
      sentenceOf(
        entryOf({ action: AuditAction.BalanceToppedUp, summary: { amount: '500.00' } }),
        t,
      ),
    ).toBe('act.balance_topped_up {"actor":"কামাল","amount":"৳500"}');
  });

  it('say what the entry was about: a name, else a change from one figure to another', () => {
    expect(detailOf(entryOf({ summary: { name: 'সিল্ক শাড়ি', price: '4200.00' } }))).toBe(
      'সিল্ক শাড়ি',
    );
    expect(detailOf(entryOf({ summary: { name: ' ', from: '7', to: '4' } }))).toBe('7 → 4');
    expect(detailOf(entryOf({ summary: { from: 7 } }))).toBeNull();
    expect(detailOf(entryOf({ summary: null }))).toBeNull();
  });

  it('mark a failure only', () => {
    expect(isFailure(entryOf({ result: AuditResult.Failure }))).toBe(true);
    expect(isFailure(entryOf({}))).toBe(false);
  });

  it('take the first letter as written for the avatar, a Bangla one with its vowel sign', () => {
    expect(initialOf('কামাল')).toBe('কা');
    expect(initialOf(' rumana')).toBe('R');
    expect(initialOf('')).toBe('?');
  });
});

describe('the Activity sentences', () => {
  it('cover every action in both languages, with the same values in each', () => {
    const values = (sentence: string): string[] =>
      [...sentence.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1] ?? '').sort();
    for (const action of Object.values(AuditAction)) {
      const bangla = (bn.act as Record<string, string | undefined>)[action];
      const english = (en.act as Record<string, string | undefined>)[action];
      expect(bangla, action).toBeTypeOf('string');
      expect(english, action).toBeTypeOf('string');
      expect(values(bangla ?? ''), action).toEqual(values(english ?? ''));
      for (const value of values(english ?? ''))
        expect(['actor', 'amount'], action).toContain(value);
    }
  });
});
