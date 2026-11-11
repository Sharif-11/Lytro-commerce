import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@lytronix/ui';
import { PlatformSettingKey } from '@lytronix/validators';
import { useSettings } from '@/api/settings';
import { chipClass } from '@/components/ui/chip-class';
import { ConsolePage, PageTitle, SectionTitle } from '@/components/ui/console-page';
import { RowLines } from '@/components/ui/list-row';
import { LoadFailed } from '@/components/ui/load-failed';
import { NOTE, SMALL_BUTTON } from '@/components/ui/sizes';
import { useToast } from '@/components/ui/use-toast';
import { formatDay } from '@/lib/format';
import { SETTING_GROUPS, SETTING_SHAPES, type SettingShape } from '@/lib/setting-shapes';
import { settingWords } from '@/lib/setting-words';
import type { PlatformSetting } from '@/types/operator';
import { PricesPanel } from './prices-panel';
import { SettingEditor } from './setting-editor';
import { SettingValue } from './setting-value';
import { TimelineCard } from './timeline-card';

const groupId = (group: number): string => `settings-group-${String(group)}`;
const HELP_GROUP = 14;

function SettingRow({
  setting,
  shape,
  rows,
  editing,
  onEdit,
  onDraft,
  onDone,
}: {
  setting: PlatformSetting;
  shape: SettingShape;
  rows: readonly PlatformSetting[];
  editing: boolean;
  onEdit: () => void;
  onDraft: (words: string) => void;
  onDone: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const name = t(`settingNames.${setting.key}`, { defaultValue: setting.key });
  const saved = (sent: unknown): void => {
    toast(t('settings.saved', { name, value: settingWords(setting.key, sent, t) }));
    onDone();
  };
  // D8-60: Cloudflare's nine prices take a panel of their own; every other setting changes in its row.
  const inPanel = shape.unit === 'prices';
  return (
    <div className="flex min-h-[60px] flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-4 py-3 first:border-t-0">
      <RowLines
        wrap
        className="basis-full sm:basis-0"
        title={name}
        detail={`${setting.description}${
          setting.updatedByEmail
            ? ` · ${t('settings.updated', { d: formatDay(setting.updatedAt) })} · ${setting.updatedByEmail}`
            : ''
        }`}
      />
      {editing && !inPanel ? (
        <SettingEditor
          setting={setting}
          unit={shape.unit}
          rows={rows}
          onDraft={onDraft}
          onCancel={onDone}
          onSaved={saved}
        />
      ) : (
        <>
          <span className="ml-auto max-w-full min-w-[90px] text-right sm:ml-0">
            <SettingValue setting={setting} unit={shape.unit} />
          </span>
          <Button
            type="button"
            tone="outline"
            small
            fit
            className={SMALL_BUTTON}
            aria-label={`${t('settings.change')}: ${name}`}
            onClick={onEdit}
          >
            {t('settings.change')}
          </Button>
        </>
      )}
      {editing && inPanel ? (
        <PricesPanel setting={setting} onClose={onDone} onSaved={saved} />
      ) : null}
    </div>
  );
}

/** OPERATOR-CONSOLE-DESIGN §9: every platform value that is not a rate, in fifteen groups (v7's help line and media costs). */
export function Settings(): React.JSX.Element {
  const { t } = useTranslation();
  const settings = useSettings();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const rows = settings.data ?? [];

  /** A stage's length as the timeline draws it: what is being typed once it is a number, else what is saved. */
  const days = (key: string): number => {
    if (editing === key && draft !== null) {
      const typed = Number(draft);
      if (Number.isInteger(typed) && typed > 0) return typed;
    }
    return Number(rows.find((setting) => setting.key === key)?.value ?? 0);
  };

  const finish = (): void => {
    setEditing(null);
  };

  const group = (number: number): React.JSX.Element => (
    <section key={number} id={groupId(number)} className="flex min-w-0 scroll-mt-4 flex-col gap-2">
      <SectionTitle>{t(`settings.groups.${String(number)}`)}</SectionTitle>
      {/* D8-68: where the help line's numbers show. */}
      {number === HELP_GROUP ? (
        <div className={`${NOTE} -mt-1.5`}>{t('settings.helpNote')}</div>
      ) : null}
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        {SETTING_SHAPES.filter((shape) => shape.group === number).map((shape) => {
          const setting = rows.find((each) => each.key === shape.key);
          if (!setting) return null;
          return (
            <SettingRow
              key={shape.key}
              setting={setting}
              shape={shape}
              rows={rows}
              editing={editing === shape.key}
              onEdit={() => {
                setEditing(shape.key);
                setDraft(null);
              }}
              onDraft={setDraft}
              onDone={finish}
            />
          );
        })}
      </div>
    </section>
  );

  return (
    <ConsolePage>
      <PageTitle title={t('nav.settings')} lead={t('settings.lead')} />
      {settings.isError ? (
        <LoadFailed
          onRetry={() => {
            void settings.refetch();
          }}
        />
      ) : settings.isLoading ? (
        <section
          aria-busy="true"
          className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4"
        >
          <span className="skel w-4/5" />
          <span className="skel w-3/5" />
        </section>
      ) : (
        <>
          {/* Fifteen groups: on a phone the chips run off the edge; from 640 px they wrap (v5). */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {SETTING_GROUPS.map((number) => (
              <a key={number} href={`#${groupId(number)}`} className={chipClass(false)}>
                {t(`settings.groups.${String(number)}`)}
              </a>
            ))}
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-4">{[1, 2].map(group)}</div>
            <TimelineCard
              grace={days(PlatformSettingKey.GraceDays)}
              readOnly={days(PlatformSettingKey.ReadOnlyDays)}
              locked={days(PlatformSettingKey.LockedDays)}
              archived={days(PlatformSettingKey.ArchivedDays)}
            />
          </div>
          {SETTING_GROUPS.slice(2).map(group)}
        </>
      )}
    </ConsolePage>
  );
}
