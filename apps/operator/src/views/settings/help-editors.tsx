import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { Button } from '@lytronix/ui';
import { bdMobileNumber, HELP_HOUR_MAX, PlatformSettingKey } from '@lytronix/validators';
import { useUpdateSetting } from '@/api/settings';
import { Consequence } from '@/components/ui/consequence';
import { InlineForm } from '@/components/ui/inline-form';
import { INLINE_FIELD, NOTE, SMALL_BUTTON } from '@/components/ui/sizes';
import { isUnset } from '@/lib/setting-shapes';
import type { PlatformSetting } from '@/types/operator';

const REFUSAL = 'text-[13px] text-danger';

function Refusal({ children }: { children: string }): React.JSX.Element {
  return (
    <div role="alert" className={REFUSAL}>
      {children}
    </div>
  );
}

/**
 * D8-68, D8-76 (Slice 8.8): one of the help line's numbers, typed in any written form and saved as 01XXXXXXXXX. A number
 * that is set can be cleared, with a reason; the panel says what that takes off which pages.
 */
export function PhoneEditor({
  setting,
  onCancel,
  onSaved,
}: {
  setting: PlatformSetting;
  onCancel: () => void;
  onSaved: (sent: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const update = useUpdateSetting();
  const set = !isUnset(setting.value);
  const [words, setWords] = useState(set ? String(setting.value) : '');
  const [reason, setReason] = useState('');
  const [refused, setRefused] = useState(false);
  const [clearing, setClearing] = useState(false);
  const label = t(`settingNames.${setting.key}`, { defaultValue: setting.key });

  const send = (value: string): void => {
    update.mutate(
      { key: setting.key, value, reason: reason.trim() },
      {
        onSuccess: () => {
          onSaved(value);
        },
      },
    );
  };
  const error = update.isError ? errorMessage(update.error, t) : null;

  if (clearing) {
    return (
      <form
        className="flex min-w-0 flex-[1_1_100%] flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (reason.trim() !== '') send('');
        }}
      >
        <Consequence tone="danger">{t('settings.clearConsequence')}</Consequence>
        <span className="flex flex-wrap items-center gap-2">
          <input
            name="reason"
            aria-label={t('common.reason')}
            placeholder={t('common.reason')}
            required
            autoFocus
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
            }}
            className={`${INLINE_FIELD} w-[220px] max-w-full`}
          />
          <Button
            type="submit"
            tone="danger"
            small
            fit
            loading={update.isPending}
            disabled={reason.trim() === ''}
            className={SMALL_BUTTON}
          >
            {t('settings.clearNumber')}
          </Button>
          <Button
            type="button"
            tone="outline"
            small
            fit
            disabled={update.isPending}
            className={SMALL_BUTTON}
            onClick={onCancel}
          >
            {t('common.cancel')}
          </Button>
        </span>
        {error ? <Refusal>{error}</Refusal> : null}
      </form>
    );
  }

  return (
    <InlineForm
      reason={reason}
      onReason={setReason}
      pending={update.isPending}
      canSave={words.trim() !== ''}
      error={error}
      onCancel={onCancel}
      onSubmit={() => {
        // D8-68: the setting takes the local form only; the operator types what they have.
        const local = bdMobileNumber(words);
        if (local === null) {
          setRefused(true);
          return;
        }
        send(local);
      }}
      extra={
        set ? (
          <Button
            type="button"
            tone="ghost"
            small
            fit
            className={`${SMALL_BUTTON} text-danger!`}
            onClick={() => {
              setClearing(true);
            }}
          >
            {t('settings.clear')}
          </Button>
        ) : null
      }
      after={
        <div className="flex flex-col gap-1.5">
          {refused ? <Refusal>{t('settings.errPhone')}</Refusal> : null}
          <div className={NOTE}>{t('settings.phoneHelp')}</div>
        </div>
      }
    >
      <input
        name="value"
        aria-label={label}
        aria-invalid={refused}
        inputMode="tel"
        placeholder="+880 1711-000000"
        value={words}
        onChange={(event) => {
          setWords(event.target.value);
          setRefused(false);
        }}
        className={`${INLINE_FIELD} mono w-[180px] max-w-full text-left ${refused ? 'border-danger!' : ''}`}
      />
    </InlineForm>
  );
}

const OPENS: string = PlatformSettingKey.HelpOpensHour;

/**
 * D8-68, D8-77 (Slice 8.8): an hour the help line opens or closes, every day in Dhaka. Closing must come after opening,
 * checked here against the other hour as saved, as the server checks it.
 */
export function HourEditor({
  setting,
  otherHour,
  onCancel,
  onSaved,
}: {
  setting: PlatformSetting;
  /** The other hour as saved: closing for the opening hour, opening for the closing one. */
  otherHour: number;
  onCancel: () => void;
  onSaved: (sent: number) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const update = useUpdateSetting();
  const [words, setWords] = useState(String(setting.value));
  const [reason, setReason] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const label = t(`settingNames.${setting.key}`, { defaultValue: setting.key });
  const opening = setting.key === OPENS;

  return (
    <InlineForm
      reason={reason}
      onReason={setReason}
      pending={update.isPending}
      canSave={words.trim() !== ''}
      error={update.isError ? errorMessage(update.error, t) : null}
      onCancel={onCancel}
      onSubmit={() => {
        const hour = Number(words.trim());
        if (!Number.isInteger(hour) || hour < 0 || hour > HELP_HOUR_MAX) {
          setRefusal(t('settings.errHour'));
          return;
        }
        if (opening ? hour >= otherHour : hour <= otherHour) {
          setRefusal(
            t(opening ? 'settings.errOpens' : 'settings.errCloses', { h: String(otherHour) }),
          );
          return;
        }
        update.mutate(
          { key: setting.key, value: hour, reason: reason.trim() },
          {
            onSuccess: () => {
              onSaved(hour);
            },
          },
        );
      }}
      after={
        <div className="flex flex-col gap-1.5">
          {refusal ? <Refusal>{refusal}</Refusal> : null}
          <div className={NOTE}>{t('settings.hourHelp')}</div>
        </div>
      }
    >
      <input
        name="value"
        aria-label={label}
        aria-invalid={refusal !== null}
        inputMode="numeric"
        value={words}
        onChange={(event) => {
          setWords(event.target.value);
          setRefusal(null);
        }}
        className={`${INLINE_FIELD} mono w-[90px] text-right ${refusal ? 'border-danger!' : ''}`}
      />
    </InlineForm>
  );
}
