import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { TextArea } from '@lytronix/ui';
import {
  AiProvider,
  DEFAULT_HELP_CLOSES_HOUR,
  DEFAULT_HELP_OPENS_HOUR,
  isPrintedLine,
  isVatBin,
  isVatRate,
  OrderLimitMode,
  PlatformSettingKey,
  VAT_SELLER_ADDRESS_MAX,
  VAT_SELLER_NAME_MAX,
} from '@lytronix/validators';
import { useUpdateSetting } from '@/api/settings';
import { Banner } from '@/components/ui/banner';
import { InlineForm } from '@/components/ui/inline-form';
import { INLINE_FIELD, NOTE } from '@/components/ui/sizes';
import type { SettingUnit } from '@/lib/setting-shapes';
import { COUNTED } from '@/lib/setting-words';
import type { PlatformSetting } from '@/types/operator';
import { HourEditor, PhoneEditor } from './help-editors';

function startingWords(setting: PlatformSetting): string {
  const { value } = setting;
  if (Array.isArray(value)) return value.join('\n');
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** Whether a counted setting's words are a whole number of 1 or more, as the server takes them. */
function wholeAndPositive(words: string): boolean {
  const value = Number(words.trim());
  return words.trim() !== '' && Number.isInteger(value) && value >= 1;
}

const HELP = 'text-[13px] leading-[1.5] text-fg-muted';
// D7-39: lowering it deletes older notifications in every shop that night.
const RETENTION: string = PlatformSettingKey.NotificationRetentionDays;
const OPENS: string = PlatformSettingKey.HelpOpensHour;
const CLOSES: string = PlatformSettingKey.HelpClosesHour;
// D9-14 (Slice 9.9): limited mode divides by a whole number from 2 to 10 (the server's own check).
const DIVISOR_MIN = 2;
const DIVISOR_MAX = 10;
const VAT_ADDRESS: string = PlatformSettingKey.VatSellerAddress;
const VAT_UNITS: readonly SettingUnit[] = ['vatBin', 'vatRate', 'vatText'];

/** Slice 9.9 (D9-7): whether a VAT setting's words are what the server takes -- or empty, which clears it. */
function vatWordsFit(words: string, unit: SettingUnit, key: string): boolean {
  const typed = words.trim();
  if (typed === '') return true;
  if (unit === 'vatBin') return isVatBin(typed);
  if (unit === 'vatRate') return isVatRate(typed);
  const max = key === VAT_ADDRESS ? VAT_SELLER_ADDRESS_MAX : VAT_SELLER_NAME_MAX;
  return isPrintedLine(typed, max);
}

/** What goes to the server: a number, the words typed, or the list a setting holds one to a line. */
function valueToSend(words: string, unit: SettingUnit): number | string | string[] {
  if (unit === 'list') {
    return words
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
  }
  if (
    unit === 'choice' ||
    unit === 'text' ||
    unit === 'email' ||
    unit === 'version' ||
    unit === 'ai' ||
    unit === 'model' ||
    // D9-7: the VAT settings are text, the rate too ("15"), and empty clears one.
    VAT_UNITS.includes(unit)
  ) {
    return words.trim();
  }
  return Number(words);
}

/**
 * OPERATOR-CONSOLE-DESIGN §9: a setting changed in its row, with the reason that goes on the audit log. The sender list
 * takes one to a line, the order limit a choice of two, and a version warns when it should change.
 */
export function SettingEditor({
  setting,
  unit,
  rows = [],
  onDraft,
  onCancel,
  onSaved,
}: {
  setting: PlatformSetting;
  unit: SettingUnit;
  /** Every setting as saved: the help line's other hour, which the one being changed is checked against (D8-77). */
  rows?: readonly PlatformSetting[];
  onDraft: (words: string) => void;
  onCancel: () => void;
  onSaved: (sent: number | string | string[]) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const update = useUpdateSetting();
  const [words, setWords] = useState(() => startingWords(setting));
  const [reason, setReason] = useState('');
  // v5: a counted value that isn't a whole number of 1 or more is refused here, under the field.
  const [refused, setRefused] = useState(false);
  const counted = COUNTED.includes(unit);
  const label = t(`settingNames.${setting.key}`, { defaultValue: setting.key });

  function change(next: string): void {
    setWords(next);
    setRefused(false);
    onDraft(next);
  }

  const vat = VAT_UNITS.includes(unit);
  const shared = {
    reason,
    onReason: setReason,
    pending: update.isPending,
    // D9-7: a VAT setting saved empty is cleared, which turns VAT off on new invoices.
    canSave: vat || words.trim() !== '',
    error: update.isError ? errorMessage(update.error, t) : null,
    onCancel,
    onSubmit: () => {
      if (counted && !wholeAndPositive(words)) {
        setRefused(true);
        return;
      }
      const divisor = Number(words.trim());
      if (unit === 'divisor' && (divisor < DIVISOR_MIN || divisor > DIVISOR_MAX)) {
        setRefused(true);
        return;
      }
      if (vat && !vatWordsFit(words, unit, setting.key)) {
        setRefused(true);
        return;
      }
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

  if (unit === 'phone') {
    return <PhoneEditor setting={setting} onCancel={onCancel} onSaved={onSaved} />;
  }
  if (unit === 'hour') {
    const opening = setting.key === OPENS;
    const other = rows.find((each) => each.key === (opening ? CLOSES : OPENS));
    const otherHour =
      typeof other?.value === 'number'
        ? other.value
        : opening
          ? DEFAULT_HELP_CLOSES_HOUR
          : DEFAULT_HELP_OPENS_HOUR;
    return (
      <HourEditor setting={setting} otherHour={otherHour} onCancel={onCancel} onSaved={onSaved} />
    );
  }
  if (unit === 'email') {
    return (
      <InlineForm {...shared} after={<div className={HELP}>{t('settings.emailNote')}</div>}>
        <input
          name="value"
          type="email"
          aria-label={label}
          value={words}
          onChange={(event) => {
            change(event.target.value);
          }}
          className={`${INLINE_FIELD} w-[220px] max-w-full text-left`}
        />
      </InlineForm>
    );
  }
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
  if (unit === 'ai') {
    return (
      <InlineForm {...shared} after={<div className={HELP}>{t('settings.providerHelp')}</div>}>
        <select
          name="value"
          aria-label={label}
          value={words}
          onChange={(event) => {
            change(event.target.value);
          }}
          className={`${INLINE_FIELD} h-11 w-[180px] max-w-full`}
        >
          {Object.values(AiProvider).map((provider) => (
            <option key={provider} value={provider}>
              {t(`settings.aiProviders.${provider}`)}
            </option>
          ))}
        </select>
      </InlineForm>
    );
  }
  if (unit === 'model') {
    return (
      <InlineForm
        {...shared}
        before={
          <Banner tone="warn" icon="warn">
            {t('settings.modelWarn')}
          </Banner>
        }
      >
        <input
          name="value"
          aria-label={label}
          value={words}
          onChange={(event) => {
            change(event.target.value);
          }}
          className={`${INLINE_FIELD} mono w-[240px] max-w-full text-left`}
        />
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
  if (vat) {
    const help =
      unit === 'vatBin'
        ? t('settings.vatBinHelp')
        : unit === 'vatRate'
          ? t('settings.vatRateHelp')
          : t('settings.vatClearHelp');
    const bad =
      unit === 'vatBin'
        ? t('settings.vatBinBad')
        : unit === 'vatRate'
          ? t('settings.vatRateBad')
          : t('settings.vatTextBad');
    const width =
      unit === 'vatText' ? 'w-[320px]' : unit === 'vatBin' ? 'mono w-[190px]' : 'mono w-[90px]';
    return (
      <InlineForm
        {...shared}
        after={
          refused ? (
            <div role="alert" className="text-[14px] text-danger">
              {bad}
            </div>
          ) : (
            <div className="text-[14px] leading-[1.5] text-neutral-700">{help}</div>
          )
        }
      >
        <input
          name="value"
          aria-label={label}
          aria-invalid={refused}
          inputMode={unit === 'vatRate' ? 'decimal' : 'text'}
          placeholder={unit === 'vatBin' ? '123456789-0101' : unit === 'vatRate' ? '15' : undefined}
          value={words}
          onChange={(event) => {
            change(event.target.value);
          }}
          className={`${INLINE_FIELD} ${width} max-w-full text-left ${refused ? 'border-danger!' : ''}`}
        />
      </InlineForm>
    );
  }
  const after = refused ? (
    <div role="alert" className="text-[13px] text-danger">
      {unit === 'divisor' ? t('settings.factorBad') : t('settings.errWhole')}
    </div>
  ) : unit === 'divisor' ? (
    <div className="text-[14px] leading-[1.5] text-neutral-700">{t('settings.factorHelp')}</div>
  ) : setting.key === RETENTION ? (
    <div className={HELP}>{t('settings.retentionNote')}</div>
  ) : undefined;
  return (
    <InlineForm {...shared} after={after}>
      <input
        name="value"
        aria-label={label}
        aria-invalid={refused}
        inputMode={unit === 'text' ? 'text' : 'numeric'}
        value={words}
        onChange={(event) => {
          change(event.target.value);
        }}
        className={`${INLINE_FIELD} mono ${unit === 'usd' ? 'w-[90px]' : 'w-[110px]'} text-right ${refused ? 'border-danger!' : ''}`}
      />
    </InlineForm>
  );
}
