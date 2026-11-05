import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { TextArea } from '@lytronix/ui';
import { OrderLimitMode } from '@lytronix/validators';
import { useUpdateSetting } from '@/api/settings';
import { Banner } from '@/components/ui/banner';
import { InlineForm } from '@/components/ui/inline-form';
import { INLINE_FIELD, NOTE } from '@/components/ui/sizes';
import type { SettingUnit } from '@/lib/setting-shapes';
import type { PlatformSetting } from '@/types/operator';

function startingWords(setting: PlatformSetting): string {
  const { value } = setting;
  if (Array.isArray(value)) return value.join('\n');
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** What goes to the server: a number, the words typed, or the list a setting holds one to a line. */
function valueToSend(words: string, unit: SettingUnit): number | string | string[] {
  if (unit === 'list') {
    return words
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
  }
  if (unit === 'choice' || unit === 'text' || unit === 'version') return words.trim();
  return Number(words);
}

/**
 * OPERATOR-CONSOLE-DESIGN §9: a setting changed in its row, with the reason that goes on the audit log. The sender list
 * takes one to a line, the order limit a choice of two, and a version warns when it should change.
 */
export function SettingEditor({
  setting,
  unit,
  onDraft,
  onCancel,
  onSaved,
}: {
  setting: PlatformSetting;
  unit: SettingUnit;
  onDraft: (words: string) => void;
  onCancel: () => void;
  onSaved: (sent: number | string | string[]) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const update = useUpdateSetting();
  const [words, setWords] = useState(() => startingWords(setting));
  const [reason, setReason] = useState('');
  const label = t(`settingNames.${setting.key}`, { defaultValue: setting.key });

  function change(next: string): void {
    setWords(next);
    onDraft(next);
  }

  const shared = {
    reason,
    onReason: setReason,
    pending: update.isPending,
    canSave: words.trim() !== '',
    error: update.isError ? errorMessage(update.error, t) : null,
    onCancel,
    onSubmit: () => {
      const value = valueToSend(words, unit);
      update.mutate(
        { key: setting.key, value, reason: reason.trim() },
        {
          onSuccess: () => {
            onSaved(value);
          },
        },
      );
    },
  };

  if (unit === 'list') {
    return (
      <InlineForm {...shared} block>
        <TextArea
          label={label}
          name="value"
          value={words}
          onChange={(event) => {
            change(event.target.value);
          }}
        />
        <div className={NOTE}>{t('settings.sendersHelp')}</div>
      </InlineForm>
    );
  }
  if (unit === 'choice') {
    return (
      <InlineForm {...shared}>
        <select
          name="value"
          aria-label={label}
          value={words}
          onChange={(event) => {
            change(event.target.value);
          }}
          className={`${INLINE_FIELD} h-11 max-w-full`}
        >
          {Object.values(OrderLimitMode).map((mode) => (
            <option key={mode} value={mode}>
              {t(`settings.orderLimit.${mode}`)}
            </option>
          ))}
        </select>
      </InlineForm>
    );
  }
  if (unit === 'version') {
    return (
      <InlineForm {...shared} block>
        <Banner tone="warn" icon="warn">
          {t('settings.versionWarn')}
        </Banner>
        <input
          name="value"
          aria-label={label}
          value={words}
          onChange={(event) => {
            change(event.target.value);
          }}
          className={`${INLINE_FIELD} mono w-[140px] text-right`}
        />
      </InlineForm>
    );
  }
  return (
    <InlineForm {...shared}>
      <input
        name="value"
        aria-label={label}
        inputMode={unit === 'text' ? 'text' : 'numeric'}
        value={words}
        onChange={(event) => {
          change(event.target.value);
        }}
        className={`${INLINE_FIELD} mono w-[110px] text-right`}
      />
    </InlineForm>
  );
}
