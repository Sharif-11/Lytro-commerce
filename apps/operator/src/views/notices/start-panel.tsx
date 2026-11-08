import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { NoticeTemplate, PlatformAuditAction, RateKey } from '@lytronix/validators';
import { useRateHistory } from '@/api/rates';
import { useRecentChanges } from '@/api/recent-changes';
import { ActionPanel } from '@/components/ui/action-panel';
import { fromDhakaInput, toDhakaInput } from '@/lib/dhaka-time';
import { formatSessionTime } from '@/lib/session-time';
import type { RecentChange } from '@/types/operator';
import { rateWords } from '@/views/rates/rate-words';
import { CAPTION } from './board-card';
import { Choice, Choices } from './choice';
import { FIELD_INPUT, fieldBox } from './field-classes';
import { NoticeField } from './notice-field';

type Pick = 'blank' | NoticeTemplate;
const PICKS: readonly Pick[] = ['blank', ...Object.values(NoticeTemplate)];
const DAY_MS = 24 * 60 * 60 * 1000;
// How many of the latest rate changes the picker offers.
const CHANGES_SHOWN = 3;

function isRateKey(key: string | null): key is RateKey {
  return key !== null && (Object.values(RateKey) as string[]).includes(key);
}

/** A rate change as the picker offers it: the rate, its old and new values, when, and whether it has a notice. */
function ChangeChoice({
  change,
  on,
  onPick,
}: {
  change: RecentChange & { key: RateKey; rateChangeId: number };
  on: boolean;
  onPick: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const history = useRateHistory(change.key);
  const linked = history.data?.find((line) => line.id === change.rateChangeId)?.noticeId ?? null;
  const words = (value: unknown): string =>
    typeof value === 'string' || typeof value === 'number'
      ? rateWords(change.key, String(value))
      : '–';
  return (
    <Choice
      name="rate-change"
      on={on}
      label={t(`rateNames.${change.key}`)}
      help={`${t('notices.changeLine', {
        o: words(change.oldValue),
        n: words(change.newValue),
        d: formatSessionTime(change.at),
      })} · ${t(linked ? 'rates.withNotice' : 'rates.noNotice')}`}
      onPick={onPick}
    />
  );
}

/** Tomorrow's 02:00 to 04:00 in Dhaka: a quiet window to start from. */
function quietWindow(): { from: string; to: string } {
  const tomorrow = toDhakaInput(new Date(Date.now() + DAY_MS).toISOString()).slice(0, 10);
  return { from: `${tomorrow}T02:00`, to: `${tomorrow}T04:00` };
}

/**
 * NTC-12 (OPERATOR-CONSOLE-DESIGN §10c): a new notice from blank or a template, each saying what it fills. Continue
 * opens the editor, which asks the server to fill the template in both languages.
 */
export function StartPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const changes = useRecentChanges();
  const [pick, setPick] = useState<Pick>('blank');
  const [slot, setSlot] = useState(quietWindow);
  const recent = (changes.data ?? [])
    .filter(
      (change): change is RecentChange & { key: RateKey; rateChangeId: number } =>
        change.action === PlatformAuditAction.RateChanged &&
        typeof change.rateChangeId === 'number' &&
        isRateKey(change.key),
    )
    .slice(0, CHANGES_SHOWN);
  const [changeId, setChangeId] = useState<number | 'own' | null>(null);
  const chosen = changeId ?? recent[0]?.rateChangeId ?? 'own';

  function next(): void {
    if (pick === NoticeTemplate.RateChange && chosen !== 'own') {
      void navigate({ to: '/notices/new', search: { rateChange: chosen } });
      return;
    }
    if (pick === NoticeTemplate.Maintenance) {
      void navigate({
        to: '/notices/new',
        search: {
          template: pick,
          from: fromDhakaInput(slot.from) ?? undefined,
          to: fromDhakaInput(slot.to) ?? undefined,
        },
      });
      return;
    }
    void navigate({ to: '/notices/new', search: pick === 'blank' ? {} : { template: pick } });
  }

  const time = (key: 'from' | 'to', label: string) => (
    <NoticeField label={label} htmlFor={`window-${key}`}>
      <div className={fieldBox(false)}>
        <input
          id={`window-${key}`}
          type="datetime-local"
          value={slot[key]}
          onChange={(event) => {
            setSlot({ ...slot, [key]: event.target.value });
          }}
          className={FIELD_INPUT}
        />
      </div>
    </NoticeField>
  );

  return (
    <ActionPanel
      title={t('notices.new')}
      sub={t('notices.startLead')}
      onClose={onClose}
      actionLabel={t('common.continue')}
      pending={false}
      onSubmit={next}
    >
      <Choices>
        {PICKS.map((each) => (
          <Choice
            key={each}
            name="template"
            on={pick === each}
            label={t(`notices.templates.${each}`)}
            help={t(`notices.templateHelp.${each}`)}
            onPick={() => {
              setPick(each);
            }}
          >
            {each === NoticeTemplate.RateChange ? (
              <div className="mt-2 flex flex-col gap-2">
                <div className={CAPTION}>{t('notices.whichChange')}</div>
                {recent.map((change) => (
                  <ChangeChoice
                    key={change.rateChangeId}
                    change={change}
                    on={chosen === change.rateChangeId}
                    onPick={() => {
                      setChangeId(change.rateChangeId);
                    }}
                  />
                ))}
                <Choice
                  name="rate-change"
                  on={chosen === 'own'}
                  label={t('notices.ownRate')}
                  onPick={() => {
                    setChangeId('own');
                  }}
                />
              </div>
            ) : null}
            {each === NoticeTemplate.Maintenance ? (
              <div className="mt-2 flex flex-col gap-2.5">
                {time('from', t('notices.windowStart'))}
                {time('to', t('notices.windowEnd'))}
              </div>
            ) : null}
          </Choice>
        ))}
      </Choices>
    </ActionPanel>
  );
}
