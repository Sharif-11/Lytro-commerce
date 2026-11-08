import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError } from '@lytronix/api-client';
import { formatTakaExact } from '@lytronix/ui';
import {
  SMS_REQUIRED_VARIABLE,
  SMS_TEMPLATE_MAX_LENGTH,
  SmsEvent,
  smsVariablesIn,
  type SmsVariable,
} from '@lytronix/validators';
import { useResetSmsTemplate, useSaveSmsSettings } from '@/api/sms';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { useErrorText } from '@/hooks/use-error-text';
import { useShell } from '@/shell/shell-context';
import type { SmsEventSetting, SmsSettings } from '@/types/sms';
import { EVENT_WORDS, fromEditor, partsOf, sampleOf, toEditor, VARIABLE_WORDS } from './sms-words';

/** A sample SMS as a customer (or the owner) reads it (Part 37's `.p37smp`). */
export function SmsSample({
  children,
  large = false,
}: {
  children: React.ReactNode;
  /** 15 px in an SMS's sheet, where it is the thing being written. */
  large?: boolean;
}): React.JSX.Element {
  return (
    <span
      dir="auto"
      className={`mt-1.5 mb-1 block rounded-[6px] border border-line bg-neutral-50 px-2 py-1.5 leading-[1.5] text-fg [overflow-wrap:anywhere] ${large ? 'text-[15px]' : 'text-[13px]'}`}
    >
      {children}
    </span>
  );
}

/**
 * An SMS's words (Part 37's `p37-sh-sms-tpl-*`, SMS-10, SMS-19): its switch, the words with each variable named rather than
 * braced, the ones it may insert, what the customer (or the owner) gets with a sample order, its characters, parts and
 * cost, and Back to Lytro's words once edited. The server refuses a template without the order number or naming what the
 * SMS can't fill, in its own words.
 */
export function TemplateSheet({
  setting,
  settings,
  readOnly,
  onClose,
}: {
  setting: SmsEventSetting;
  settings: SmsSettings;
  readOnly: boolean;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const { slug, showToast } = useShell();
  const errorText = useErrorText();
  const save = useSaveSmsSettings();
  const reset = useResetSmsTemplate();
  const name = (variable: SmsVariable): string => t(VARIABLE_WORDS[variable]);
  const [words, setWords] = useState(() => toEditor(setting.template, name));
  const [on, setOn] = useState(setting.on);
  const [problem, setProblem] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const template = fromEditor(words, name);
  const sample = sampleOf(template, settings.smsName, slug);
  const parts = partsOf(sample, settings.unitSize);
  const [title] = EVENT_WORDS[setting.event];
  const insert = (variable: SmsVariable): void => {
    const field = box.current;
    const token = `[${name(variable)}]`;
    const at = field?.selectionStart ?? words.length;
    const end = field?.selectionEnd ?? words.length;
    setWords(`${words.slice(0, at)}${token}${words.slice(end)}`);
    setProblem(null);
  };
  return (
    <Sheet
      open
      title={t('p37TplT', { e: t(title) })}
      onClose={onClose}
      footer={
        readOnly ? null : (
          <Button
            busy={save.isPending}
            onClick={() => {
              setProblem(null);
              // SMS-19 (`p37-sh-sms-tpl-keep`, `-unknown`): the server's own rules, said before anything is sent.
              if (template !== setting.template) {
                const named = smsVariablesIn(template);
                if (!named.includes(SMS_REQUIRED_VARIABLE)) {
                  setProblem(t('p37TplKeep'));
                  return;
                }
                const unknown = named.find((each) => !setting.variables.includes(each));
                if (unknown !== undefined) {
                  setProblem(
                    t('p37TplUnknown', {
                      x: unknown in VARIABLE_WORDS ? name(unknown as SmsVariable) : unknown,
                    }),
                  );
                  return;
                }
              }
              save.mutate(
                {
                  events: { [setting.event]: on },
                  ...(template !== setting.template
                    ? { templates: { [setting.event]: template } }
                    : {}),
                },
                {
                  onSuccess: () => {
                    showToast(t('p37SmsSaved'));
                    onClose();
                  },
                  onError: (error) => {
                    const fields = error instanceof ApiClientError ? error.fieldProblems() : {};
                    setProblem(
                      fields[`templates.${setting.event}`] ??
                        Object.values(fields)[0] ??
                        errorText(error),
                    );
                  },
                },
              );
            }}
          >
            {t('save')}
          </Button>
        )
      }
    >
      <p className="-mt-1 text-[14px] text-fg-muted">{t(EVENT_WORDS[setting.event][1])}</p>
      <div className="flex min-h-11 items-center gap-3">
        <span className="flex-1 text-[15px] font-medium">{t('p37TplSwitch')}</span>
        <Switch checked={on} onChange={setOn} label={t('p37TplSwitch')} disabled={readOnly} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="sms-words" className="text-[14px] font-medium text-fg-muted">
          {t('p37TplWords')}
        </label>
        <textarea
          id="sms-words"
          ref={box}
          dir="auto"
          value={words}
          readOnly={readOnly}
          maxLength={SMS_TEMPLATE_MAX_LENGTH + 60}
          onChange={(event) => {
            setWords(event.target.value);
            setProblem(null);
          }}
          className={[
            'min-h-[84px] resize-none rounded-control border bg-surface p-3 text-[16px] leading-[1.6] outline-none focus:outline-2 focus:outline-offset-1 focus:outline-focus',
            problem ? 'border-danger' : 'border-line-strong',
          ].join(' ')}
        />
        <div className="flex justify-between gap-2 text-[13px] text-fg-muted">
          <span>{t('p37TplMax')}</span>
          <span className="num">
            {Array.from(template).length} / {SMS_TEMPLATE_MAX_LENGTH}
          </span>
        </div>
        {problem ? <p className="text-[13px] font-medium text-danger">{problem}</p> : null}
      </div>
      {readOnly ? null : (
        <div>
          <div className="mb-1.5 text-[14px] font-medium text-neutral-700">{t('p37TplInsert')}</div>
          <div className="flex flex-wrap gap-1.5">
            {(setting.variables as SmsVariable[]).map((variable) => (
              <button
                key={variable}
                type="button"
                onClick={() => {
                  insert(variable);
                }}
                className="inline-flex h-[30px] items-center rounded-full border border-line-strong bg-surface px-2.5 text-[13px] font-medium text-fg-muted"
              >
                {name(variable)}
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <div className="text-[14px] font-medium text-neutral-700">
          {setting.recipient === 'owner' ? t('p37TplPreviewYou') : t('p37TplPreview')}
        </div>
        <SmsSample large>{sample}</SmsSample>
        <div className="num text-[13px] text-fg-muted">
          {t('p37TplSample')} ·{' '}
          {t('p37TplCost', {
            c: Array.from(sample).length,
            p: t('p37PartsN', { count: parts }),
            m: formatTakaExact(parts * Number(settings.rate)),
          })}
        </div>
        {setting.event === SmsEvent.OrderShipped ? (
          <div className="mt-1 text-[13px] text-fg-muted">{t('p37TplLink')}</div>
        ) : parts > 1 ? (
          <div className="mt-2">
            <Banner tone="warn">{t('p37TplTwo', { n: settings.unitSize })}</Banner>
          </div>
        ) : null}
      </div>
      {setting.edited && !readOnly ? (
        <div>
          <Button
            tone="ghost"
            size="sm"
            busy={reset.isPending}
            onClick={() => {
              reset.mutate(setting.event, {
                onSuccess: () => {
                  showToast(t('p37TplResetDone'));
                  onClose();
                },
              });
            }}
          >
            <Icon name="undo" size={18} /> {t('p37TplReset')}
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}

/** The SMS name (Part 37's `p37-sh-sms-name`, SMS-16): a shorter name fits more into one part; empty for the shop's name. */
export function NameSheet({
  settings,
  onClose,
}: {
  settings: SmsSettings;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const { slug, showToast } = useShell();
  const errorText = useErrorText();
  const save = useSaveSmsSettings();
  const [name, setName] = useState(settings.usesShopName ? '' : settings.smsName);
  const [problem, setProblem] = useState<string | null>(null);
  const shown = name.trim() || settings.shopName;
  const placed = settings.events.find((each) => each.event === SmsEvent.OrderPlaced);
  const sample = sampleOf(placed?.template ?? '', shown, slug);
  const parts = partsOf(sample, settings.unitSize);
  return (
    <Sheet
      open
      title={t('p37SmsName')}
      onClose={onClose}
      footer={
        <Button
          busy={save.isPending}
          onClick={() => {
            save.mutate(
              { smsName: name.trim() ? name.trim() : null },
              {
                onSuccess: () => {
                  showToast(t('p37SmsSaved'));
                  onClose();
                },
                onError: (error) => {
                  const fields = error instanceof ApiClientError ? error.fieldProblems() : {};
                  setProblem(fields.smsName ?? errorText(error));
                },
              },
            );
          }}
        >
          {t('save')}
        </Button>
      }
    >
      <Field
        label={t('p37SmsName')}
        value={name}
        placeholder={settings.shopName}
        onChange={(event) => {
          setName(event.target.value);
          setProblem(null);
        }}
        help={t('p37SmsNameHelp')}
        error={problem}
      />
      <div>
        <SmsSample>{sample}</SmsSample>
        <div className="num text-[13px] text-fg-muted">
          {t('p37TplCost', {
            c: Array.from(sample).length,
            p: t('p37PartsN', { count: parts }),
            m: formatTakaExact(parts * Number(settings.rate)),
          })}
        </div>
      </div>
      {name ? (
        <div>
          <Button
            tone="ghost"
            size="sm"
            onClick={() => {
              setName('');
            }}
          >
            {t('p37SmsNameBack')}
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}

/**
 * The monthly cap (Part 37's `p37-sh-sms-cap`, SMS-13): at least ৳1, the rule written out, and Remove the cap. Under ৳1
 * is refused before it is sent (`p37-sh-sms-cap-bad`).
 */
export function CapSheet({
  settings,
  cycleEnd,
  onClose,
}: {
  settings: SmsSettings;
  cycleEnd: string;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('menu');
  const { showToast } = useShell();
  const errorText = useErrorText();
  const save = useSaveSmsSettings();
  const [cap, setCap] = useState(
    settings.monthlySpendCap ? String(Number(settings.monthlySpendCap)) : '',
  );
  const [problem, setProblem] = useState<string | null>(null);
  const send = (value: number | null): void => {
    save.mutate(
      { monthlySpendCap: value },
      {
        onSuccess: () => {
          showToast(t('p37SmsSaved'));
          onClose();
        },
        onError: (error) => {
          const fields = error instanceof ApiClientError ? error.fieldProblems() : {};
          setProblem(fields.monthlySpendCap ?? errorText(error));
        },
      },
    );
  };
  return (
    <Sheet
      open
      title={t('p37MonthlyCap')}
      onClose={onClose}
      footer={
        <Button
          busy={save.isPending}
          onClick={() => {
            const value = Number(cap);
            if (!cap.trim() || !Number.isFinite(value) || value < 1) {
              setProblem(t('p37CapMin'));
              return;
            }
            send(value);
          }}
        >
          {t('save')}
        </Button>
      }
    >
      <Field
        label={t('p37MonthlyCap')}
        prefix="৳"
        inputMode="decimal"
        value={cap}
        onChange={(event) => {
          setCap(event.target.value);
          setProblem(null);
        }}
        help={t('p37CapHelp')}
        error={problem}
      />
      <p className="text-[14px] text-fg-muted">{t('p37CapRule', { d: cycleEnd })}</p>
      {settings.monthlySpendCap ? (
        <div>
          <Button
            tone="ghost"
            size="sm"
            onClick={() => {
              send(null);
            }}
          >
            {t('p37CapRemove')}
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}
