import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { Button, SelectField } from '@lytronix/ui';
import {
  isNoticeLinkTarget,
  NOTICE_BODY_MAX,
  NOTICE_TITLE_MAX,
  NoticeAudienceKind,
  NoticeCategory,
  noticeLinksIn,
  NoticeSeverity,
  NoticeStatus,
  TenantState,
  type NoticeAudience,
  NoticeTemplate,
} from '@lytronix/validators';
import { useCreateNotice, useUpdateNotice } from '@/api/notices';
import { usePlans } from '@/api/plans';
import { useSearchShops, useShop } from '@/api/shops';
import { Banner } from '@/components/ui/banner';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsoleCard, ConsolePage, PageTitle, SectionTitle } from '@/components/ui/console-page';
import { StatusChip } from '@/components/ui/status-chip';
import { Switch } from '@/components/ui/switch';
import { NOTE } from '@/components/ui/sizes';
import { useToast } from '@/components/ui/use-toast';
import { fromDhakaInput, nextHourInput, toDhakaInput } from '@/lib/dhaka-time';
import { enumValue } from '@/lib/enum-value';
import { formatDay } from '@/lib/format';
import { formatSessionTime } from '@/lib/session-time';
import type { NoticeDraft, NoticeWrite, OperatorNoticeDetail } from '@/types/notices';
import type { RateHistoryEntry } from '@/types/operator';
import { rateWords } from '@/views/rates/rate-words';
import { BoardCard } from './board-card';
import { Choice, Choices } from './choice';
import { FIELD_INPUT, fieldBox } from './field-classes';
import { Counter, NoticeField } from './notice-field';
import { CATEGORIES, SEVERITIES, titleIn } from './notice-text';
import { NoticeStatusChip } from './notice-words';
import { PublishPanel } from './publish-panel';

type Language = 'bn' | 'en';
type Live = 'draft' | 'now' | 'at';
const LANGUAGES: readonly Language[] = ['bn', 'en'];
const STATES = Object.values(TenantState).filter((state) => state !== TenantState.Deleted);

/** Where the editor was opened from: a new notice (blank, a template or a rate change), a draft, or a sent one. */
export type EditorMode = 'new' | 'rate' | 'draft' | 'scheduled' | 'live';

export interface EditorStart {
  mode: EditorMode;
  notice: OperatorNoticeDetail | null;
  draft: NoticeDraft | null;
  template: NoticeTemplate | null;
  rateChange: RateHistoryEntry | null;
}

interface Form {
  titleBn: string;
  titleEn: string;
  bodyBn: string;
  bodyEn: string;
  category: NoticeCategory;
  severity: NoticeSeverity;
  audience: NoticeAudienceKind;
  planIds: string[];
  states: TenantState[];
  tenant: { id: string; name: string } | null;
  live: Live;
  publishAt: string;
  endsAt: string;
  windowStartsAt: string;
  windowEndsAt: string;
  pinned: boolean;
  requiresAck: boolean;
}

/** Where a new notice from each template starts going live: maintenance at a time, an outage or a rate change now. */
function liveFor(template: NoticeTemplate | null, mode: EditorMode): Live {
  if (mode === 'rate' || template === NoticeTemplate.Outage) return 'now';
  if (template === NoticeTemplate.Maintenance) return 'at';
  return 'draft';
}

const input = (iso: string | null): string => (iso ? toDhakaInput(iso) : '');

function startingForm(start: EditorStart): Form {
  const { notice, draft } = start;
  if (notice) {
    const audience = notice.audience;
    return {
      titleBn: notice.titleBn ?? '',
      titleEn: notice.titleEn ?? '',
      bodyBn: notice.bodyBn ?? '',
      bodyEn: notice.bodyEn ?? '',
      category: notice.category,
      severity: notice.severity,
      audience: audience.kind,
      planIds: audience.kind === NoticeAudienceKind.Plans ? audience.planIds : [],
      states: audience.kind === NoticeAudienceKind.States ? audience.states : [],
      tenant:
        audience.kind === NoticeAudienceKind.Tenant ? { id: audience.tenantId, name: '' } : null,
      live: notice.status === NoticeStatus.Draft ? 'draft' : 'at',
      publishAt: notice.publishAt ? toDhakaInput(notice.publishAt) : nextHourInput(),
      endsAt: input(notice.endsAt),
      windowStartsAt: input(notice.windowStartsAt),
      windowEndsAt: input(notice.windowEndsAt),
      pinned: notice.pinned,
      requiresAck: notice.requiresAck,
    };
  }
  // A maintenance notice leaves the board when its window closes, and stays on top until then, as the sketch draws it.
  const windowEnd = draft?.category === NoticeCategory.Maintenance ? draft.windowEndsAt : null;
  return {
    titleBn: draft?.titleBn ?? '',
    titleEn: draft?.titleEn ?? '',
    bodyBn: draft?.bodyBn ?? '',
    bodyEn: draft?.bodyEn ?? '',
    category: draft?.category ?? NoticeCategory.General,
    severity: draft?.severity ?? NoticeSeverity.Info,
    audience: NoticeAudienceKind.All,
    planIds: [],
    states: [],
    tenant: null,
    live: liveFor(start.template, start.mode),
    publishAt: nextHourInput(),
    endsAt: input(windowEnd),
    windowStartsAt: input(draft?.windowStartsAt ?? null),
    windowEndsAt: input(draft?.windowEndsAt ?? null),
    pinned: windowEnd !== null,
    requiresAck: draft?.requiresAck ?? false,
  };
}

type Problems = Partial<Record<string, string>>;

/**
 * NTC-01, NTC-16 (the server's own rules, said before sending): one language whole, a language with a title has a body
 * and the other way round, the lengths, https links, an end after the start, a window with both ends.
 */
function problemsOf(form: Form, t: TFunction): Problems {
  const problems: Problems = {};
  const words = { bn: [form.titleBn, form.bodyBn], en: [form.titleEn, form.bodyEn] } as const;
  const nothing = LANGUAGES.every((l) => !words[l][0].trim() && !words[l][1].trim());
  if (nothing) {
    problems.top = t('notices.errNone');
    problems.bn_title = t('notices.errNeedBn');
    problems.bn_body = t('notices.errNeedBn');
  }
  for (const l of LANGUAGES) {
    const [title, body] = words[l];
    const big = l === 'bn' ? 'Bn' : 'En';
    if (title.trim() && !body.trim()) problems[`${l}_body`] = t(`notices.errHalf${big}`);
    if (body.trim() && !title.trim()) problems[`${l}_title`] = t(`notices.errNoTitle${big}`);
    if (title.trim().length > NOTICE_TITLE_MAX) problems[`${l}_title`] = t('notices.errTitleLong');
    const bodyWords = [
      body.trim().length > NOTICE_BODY_MAX ? t('notices.errBodyLong') : null,
      noticeLinksIn(body).some((target) => !isNoticeLinkTarget(target))
        ? t('notices.errLink')
        : null,
    ].filter(Boolean);
    if (bodyWords.length) problems[`${l}_body`] = bodyWords.join(' ');
  }
  if (form.audience === NoticeAudienceKind.Plans && form.planIds.length === 0) {
    problems.audience = t('notices.errPlans');
  }
  if (form.audience === NoticeAudienceKind.States && form.states.length === 0) {
    problems.audience = t('notices.errStates');
  }
  if (form.audience === NoticeAudienceKind.Tenant && !form.tenant) {
    problems.audience = t('notices.errShop');
  }
  const ends = fromDhakaInput(form.endsAt);
  const goes = form.live === 'at' ? fromDhakaInput(form.publishAt) : null;
  if (ends && goes && ends <= goes) problems.endsAt = t('notices.errEnds');
  if (form.category === NoticeCategory.Maintenance) {
    const from = fromDhakaInput(form.windowStartsAt);
    const to = fromDhakaInput(form.windowEndsAt);
    if (Boolean(from) !== Boolean(to) || (from && to && to <= from)) {
      problems.window = t('notices.errWindow');
    }
  }
  return problems;
}

function audienceOf(form: Form): NoticeAudience {
  switch (form.audience) {
    case NoticeAudienceKind.Plans:
      return { kind: NoticeAudienceKind.Plans, planIds: form.planIds };
    case NoticeAudienceKind.States:
      return { kind: NoticeAudienceKind.States, states: form.states };
    case NoticeAudienceKind.Tenant:
      return { kind: NoticeAudienceKind.Tenant, tenantId: form.tenant?.id ?? '' };
    default:
      return { kind: NoticeAudienceKind.All };
  }
}

const words = (text: string): string | null => (text.trim() === '' ? null : text.trim());

/** What the server is sent: the whole notice, its go-live time left out of an edit to a live one. */
function writeOf(form: Form, publishAt: string | null | undefined, rateChangeId: number | null) {
  const maintenance = form.category === NoticeCategory.Maintenance;
  const write: NoticeWrite = {
    titleBn: words(form.titleBn),
    titleEn: words(form.titleEn),
    bodyBn: words(form.bodyBn),
    bodyEn: words(form.bodyEn),
    category: form.category,
    severity: form.severity,
    audience: audienceOf(form),
    endsAt: fromDhakaInput(form.endsAt),
    pinned: form.pinned,
    requiresAck: form.requiresAck,
    windowStartsAt: maintenance ? fromDhakaInput(form.windowStartsAt) : null,
    windowEndsAt: maintenance ? fromDhakaInput(form.windowEndsAt) : null,
    rateChangeId,
  };
  if (publishAt !== undefined) write.publishAt = publishAt;
  return write;
}

/** A plan or a state, picked or not, as the sketch's tags draw them. */
function TagToggle({
  on,
  onToggle,
  children,
}: {
  on: boolean;
  onToggle: () => void;
  children: string;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={`inline-flex h-[26px] items-center rounded-full px-[9px] text-[13px] font-medium ${
        on ? 'bg-brand-100 text-brand-800' : 'bg-neutral-100 text-neutral-700'
      }`}
    >
      {children}
    </button>
  );
}

function toggled<T>(list: readonly T[], each: T): T[] {
  return list.includes(each) ? list.filter((item) => item !== each) : [...list, each];
}

/** The one shop a notice is for: a search, and the shops it finds. */
function ShopPicker({
  chosen,
  onChoose,
}: {
  chosen: { id: string; name: string } | null;
  onChoose: (shop: { id: string; name: string }) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [typed, setTyped] = useState<string | null>(null);
  // A notice saved for one shop names it by id; its name comes from the shop's page.
  const known = useShop(chosen?.id ?? '', Boolean(chosen && !chosen.name));
  const shown = typed ?? (chosen?.name || known.data?.shopName || '');
  const shops = useSearchShops(typed?.trim() ?? '');
  const found = (shops.data?.pages[0]?.entries ?? []).slice(0, 5);
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      <div className={`${fieldBox(false)} h-10 min-h-10`}>
        <span className="pl-3 text-fg-subtle">
          <ConsoleIcon name="search" />
        </span>
        <input
          type="search"
          aria-label={t('notices.findShop')}
          placeholder={t('notices.findShop')}
          value={shown}
          onChange={(event) => {
            setTyped(event.target.value);
          }}
          className={FIELD_INPUT}
        />
      </div>
      {typed?.trim() && typed !== chosen?.name
        ? found.map((shop) => (
            <button
              key={shop.id}
              type="button"
              onClick={() => {
                onChoose({ id: shop.id, name: shop.shopName });
                setTyped(shop.shopName);
              }}
              className="flex min-w-0 flex-col rounded-lg border border-line bg-surface px-3 py-2 text-left"
            >
              <span className="truncate text-[14px] font-medium">{shop.shopName}</span>
              <span className="truncate text-[12px] text-fg-muted">{shop.slug}.lytro.app</span>
            </button>
          ))
        : null}
    </div>
  );
}

/** A Dhaka time field. */
function TimeField({
  id,
  label,
  value,
  onChange,
  help,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  help?: string;
  error?: string;
}): React.JSX.Element {
  return (
    <NoticeField label={label} htmlFor={id} help={help} error={error}>
      <div className={fieldBox(Boolean(error))}>
        <input
          id={id}
          type="datetime-local"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          className={FIELD_INPUT}
        />
      </div>
    </NoticeField>
  );
}

/**
 * NTC-01, NTC-08, NTC-12, NTC-13 (OPERATOR-CONSOLE-DESIGN §10c): a notice written in both languages beside a preview of
 * the board, then what it is and who and when. A page, not a panel: it is long, and a half-written notice mustn't close
 * with a stray tap.
 */
export function NoticeEditor({ start }: { start: EditorStart }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const plans = usePlans();
  const create = useCreateNotice();
  const update = useUpdateNotice();
  const { mode, notice } = start;
  const [form, setForm] = useState<Form>(() => startingForm(start));
  const [language, setLanguage] = useState<Language>(() =>
    !form.titleBn && form.titleEn ? 'en' : 'bn',
  );
  const [shown, setShown] = useState<Problems>({});
  const [publishing, setPublishing] = useState(false);
  const saving = notice ? update : create;
  const rateChangeId = notice?.rateChangeId ?? start.draft?.rateChangeId ?? null;
  const change = start.rateChange;
  const isLive = mode === 'live';
  const set = (patch: Partial<Form>): void => {
    setForm({ ...form, ...patch });
  };

  const title = language === 'bn' ? form.titleBn : form.titleEn;
  const body = language === 'bn' ? form.bodyBn : form.bodyEn;
  const errorOf = (field: 'title' | 'body'): string | undefined => shown[`${language}_${field}`];
  const serverError = saving.isError ? errorMessage(saving.error, t) : null;

  function done(saved: { id: string }, word: string): void {
    toast(word);
    if (mode === 'rate' && change) {
      void navigate({ to: '/rates', search: { history: change.key } });
      return;
    }
    void navigate({ to: '/notices/$id', params: { id: saved.id } });
  }

  function send(write: NoticeWrite, onSaved: (saved: { id: string }) => void): void {
    if (notice) update.mutate({ id: notice.id, ...write }, { onSuccess: onSaved });
    else create.mutate(write, { onSuccess: onSaved });
  }

  function checked(): boolean {
    const problems = problemsOf(form, t);
    setShown(problems);
    return Object.keys(problems).length === 0;
  }

  function saveDraft(): void {
    if (!checked()) return;
    send(writeOf(form, null, rateChangeId), () => {
      toast(t('notices.draftToast'));
      void navigate({ to: '/notices' });
    });
  }

  function saveLive(): void {
    if (!checked() || !notice) return;
    send(writeOf(form, undefined, rateChangeId), (saved) => {
      done(saved, t('notices.savedLiveToast'));
    });
  }

  const goesAt = form.live === 'at' ? fromDhakaInput(form.publishAt) : null;

  function publish(): void {
    const at = form.live === 'now' ? new Date().toISOString() : goesAt;
    send(writeOf(form, at, rateChangeId), (saved) => {
      setPublishing(false);
      if (mode === 'rate') done(saved, t('notices.publishedRateToast'));
      else if (form.live === 'now') done(saved, t('notices.publishedToast'));
      else done(saved, t('notices.scheduledToast', { d: formatSessionTime(at ?? '') }));
    });
  }

  const tab = (each: Language): React.JSX.Element => {
    const whole = each === 'bn' ? form.titleBn && form.bodyBn : form.titleEn && form.bodyEn;
    const bad = Object.keys(shown).some((key) => key.startsWith(`${each}_`));
    return (
      <button
        key={each}
        type="button"
        aria-pressed={language === each}
        onClick={() => {
          setLanguage(each);
        }}
        className={`inline-flex h-[34px] flex-none items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap ${
          language === each
            ? 'border-ink bg-ink text-white'
            : 'border-line bg-surface text-neutral-700'
        }`}
      >
        {each === 'bn' ? 'বাংলা' : 'English'}{' '}
        {bad ? (
          <span className="font-bold text-danger">!</span>
        ) : whole ? (
          <ConsoleIcon name="check" size={14} />
        ) : (
          <span
            className={`inline-flex h-[18px] items-center rounded-full px-1.5 text-[12px] font-semibold ${
              language === each ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-700'
            }`}
          >
            {t('notices.emptyLanguage')}
          </span>
        )}
      </button>
    );
  };

  const otherEmpty = language === 'en' ? !form.titleBn : !form.titleEn;
  const shownTitle = titleIn(form, language);
  const shownBody =
    (language === 'bn' ? form.bodyBn || form.bodyEn : form.bodyEn || form.bodyBn) || '';

  const wordsCard = (
    <ConsoleCard>
      <SectionTitle>{t('notices.words')}</SectionTitle>
      <div className="mt-2 mb-3 flex gap-2">{LANGUAGES.map(tab)}</div>
      <div className="flex flex-col gap-3.5">
        <NoticeField
          label={t('notices.title')}
          htmlFor="notice-title"
          counter={
            <Counter
              count={title.trim().length}
              max={NOTICE_TITLE_MAX}
              bad={Boolean(errorOf('title'))}
            />
          }
          error={errorOf('title')}
        >
          <div className={fieldBox(Boolean(errorOf('title')))}>
            <input
              id="notice-title"
              value={title}
              onChange={(event) => {
                set(
                  language === 'bn'
                    ? { titleBn: event.target.value }
                    : { titleEn: event.target.value },
                );
              }}
              className={FIELD_INPUT}
            />
          </div>
        </NoticeField>
        <NoticeField
          label={t('notices.body')}
          htmlFor="notice-body"
          counter={
            <Counter
              count={body.trim().length}
              max={NOTICE_BODY_MAX}
              bad={Boolean(errorOf('body'))}
            />
          }
          help={t('notices.format')}
          error={errorOf('body')}
        >
          <div className={fieldBox(Boolean(errorOf('body')))}>
            <textarea
              id="notice-body"
              rows={7}
              value={body}
              onChange={(event) => {
                set(
                  language === 'bn'
                    ? { bodyBn: event.target.value }
                    : { bodyEn: event.target.value },
                );
              }}
              className={`${FIELD_INPUT} min-h-[180px] resize-y leading-[1.5]`}
            />
          </div>
        </NoticeField>
        <div className={NOTE}>
          {otherEmpty && (form.titleBn || form.titleEn)
            ? t(language === 'en' ? 'notices.noBangla' : 'notices.noEnglish')
            : t('notices.oneLanguage')}
        </div>
      </div>
    </ConsoleCard>
  );

  const previewCard = (
    <ConsoleCard>
      <SectionTitle>{t('notices.preview')}</SectionTitle>
      <div className="mt-1 mb-3 text-[13px] leading-[1.5] text-fg-muted">
        {t(language === 'bn' ? 'notices.previewBn' : 'notices.previewEn')}
      </div>
      <div className="flex flex-col gap-2">
        {shownTitle ? (
          <BoardCard
            title={shownTitle}
            body={shownBody}
            severity={form.severity}
            category={form.category}
            pinned={form.pinned}
            editedAt={notice?.editedAt ?? null}
            publishAt={notice?.publishAt ?? goesAt}
          />
        ) : (
          <div className={NOTE}>{t('notices.missingLanguage')}</div>
        )}
      </div>
    </ConsoleCard>
  );

  const kindCard = (
    <ConsoleCard>
      <SectionTitle>{t('notices.kindCard')}</SectionTitle>
      <div className="mt-2 flex flex-col gap-3.5">
        <SelectField
          label={t('notices.category')}
          name="category"
          value={form.category}
          onChange={(event) => {
            set({ category: enumValue(CATEGORIES, event.target.value, form.category) });
          }}
        >
          {CATEGORIES.map((each) => (
            <option key={each} value={each}>
              {t(`notices.categories.${each}`)}
            </option>
          ))}
        </SelectField>
        <NoticeField label={t('notices.severity')}>
          <Choices>
            {SEVERITIES.map((each) => (
              <Choice
                key={each}
                name="severity"
                on={form.severity === each}
                label={t(`notices.severities.${each}`)}
                help={t(`notices.severityHelp.${each}`)}
                onPick={() => {
                  set({ severity: each });
                }}
              />
            ))}
          </Choices>
        </NoticeField>
      </div>
    </ConsoleCard>
  );

  const audienceChoice = (kind: NoticeAudienceKind, extra?: React.ReactNode) => (
    <Choice
      name="audience"
      on={form.audience === kind}
      label={t(`notices.audienceKinds.${kind}`)}
      onPick={() => {
        set({ audience: kind });
      }}
    >
      {extra}
    </Choice>
  );

  const whoCard = (
    <ConsoleCard>
      <SectionTitle>{t('notices.whoCard')}</SectionTitle>
      <div className="mt-2 flex flex-col gap-3.5">
        <NoticeField
          label={t('notices.audience')}
          help={t('notices.audienceHelp')}
          error={shown.audience}
        >
          <Choices>
            {audienceChoice(NoticeAudienceKind.All)}
            {audienceChoice(
              NoticeAudienceKind.Plans,
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(plans.data ?? []).map((plan) => (
                  <TagToggle
                    key={plan.id}
                    on={form.planIds.includes(plan.id)}
                    onToggle={() => {
                      set({ planIds: toggled(form.planIds, plan.id) });
                    }}
                  >
                    {plan.name}
                  </TagToggle>
                ))}
              </div>,
            )}
            {audienceChoice(
              NoticeAudienceKind.States,
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {STATES.map((state) => (
                  <TagToggle
                    key={state}
                    on={form.states.includes(state)}
                    onToggle={() => {
                      set({ states: toggled(form.states, state) });
                    }}
                  >
                    {t(`states.${state}`)}
                  </TagToggle>
                ))}
              </div>,
            )}
            {audienceChoice(
              NoticeAudienceKind.Tenant,
              <ShopPicker
                chosen={form.tenant}
                onChoose={(tenant) => {
                  set({ tenant });
                }}
              />,
            )}
          </Choices>
        </NoticeField>
        {isLive ? (
          <NoticeField label={t('notices.goesLive')}>
            <div className="flex min-h-11 items-center rounded-control border border-control-line bg-neutral-50 px-3 py-2.5 text-[14px] whitespace-normal text-fg-muted">
              {t('notices.liveFixed', { d: formatSessionTime(notice?.publishAt ?? '') })}
            </div>
          </NoticeField>
        ) : (
          <NoticeField label={t('notices.goesLive')} help={t('notices.liveHelp')}>
            <Choices>
              {(['draft', 'now', 'at'] as const).map((each) => (
                <Choice
                  key={each}
                  name="live"
                  on={form.live === each}
                  label={t(
                    each === 'draft'
                      ? 'notices.liveDraft'
                      : each === 'now'
                        ? 'notices.liveNow'
                        : 'notices.liveAt',
                  )}
                  onPick={() => {
                    set({ live: each });
                  }}
                >
                  {each === 'at' ? (
                    <div className={`${fieldBox(false)} mt-1.5`}>
                      <input
                        type="datetime-local"
                        aria-label={t('notices.liveAt')}
                        value={form.publishAt}
                        onChange={(event) => {
                          set({ publishAt: event.target.value });
                        }}
                        className={FIELD_INPUT}
                      />
                    </div>
                  ) : null}
                </Choice>
              ))}
            </Choices>
          </NoticeField>
        )}
        <TimeField
          id="notice-ends"
          label={t('notices.ends')}
          value={form.endsAt}
          onChange={(endsAt) => {
            set({ endsAt });
          }}
          help={t('notices.endsHelp')}
          error={shown.endsAt}
        />
        {form.category === NoticeCategory.Maintenance ? (
          <NoticeField
            label={t('notices.window')}
            help={t('notices.windowHelp')}
            error={shown.window}
          >
            <div className="flex flex-col gap-2">
              <TimeField
                id="window-starts"
                label={t('notices.windowStart')}
                value={form.windowStartsAt}
                onChange={(windowStartsAt) => {
                  set({ windowStartsAt });
                }}
              />
              <TimeField
                id="window-ends"
                label={t('notices.windowEnd')}
                value={form.windowEndsAt}
                onChange={(windowEndsAt) => {
                  set({ windowEndsAt });
                }}
              />
            </div>
          </NoticeField>
        ) : null}
        <Switch
          checked={form.pinned}
          onChange={(pinned) => {
            set({ pinned });
          }}
          label={t('notices.pin')}
          showLabel
        />
        <div className="flex flex-col gap-1">
          <Switch
            checked={form.requiresAck}
            onChange={(requiresAck) => {
              set({ requiresAck });
            }}
            label={t('notices.ack')}
            showLabel
          />
          <div className="text-[13px] leading-[1.5] text-fg-muted">{t('notices.ackHelp')}</div>
        </div>
      </div>
    </ConsoleCard>
  );

  const editing = mode === 'live' || mode === 'draft' || mode === 'scheduled';
  const crumb = editing ? titleIn(notice ?? form, i18n.language) : t('notices.new');
  const actions = isLive ? (
    <>
      <Button
        type="button"
        tone="outline"
        small
        fit
        className="flex-[1_1_auto] sm:flex-none"
        onClick={() => {
          void navigate({ to: '/notices/$id', params: { id: notice?.id ?? '' } });
        }}
      >
        {t('common.cancel')}
      </Button>
      <Button
        type="button"
        small
        fit
        loading={saving.isPending}
        className="flex-[1_1_auto] sm:flex-none"
        onClick={saveLive}
      >
        {t('notices.saveChanges')}
      </Button>
    </>
  ) : form.live === 'draft' ? (
    <Button
      type="button"
      small
      fit
      loading={saving.isPending}
      className="flex-[1_1_auto] sm:flex-none"
      onClick={saveDraft}
    >
      {t('notices.saveDraft')}
    </Button>
  ) : (
    <>
      <Button
        type="button"
        tone="outline"
        small
        fit
        disabled={saving.isPending}
        className="flex-[1_1_auto] sm:flex-none"
        onClick={saveDraft}
      >
        {t('notices.saveDraft')}
      </Button>
      <Button
        type="button"
        small
        fit
        className="flex-[1_1_auto] sm:flex-none"
        onClick={() => {
          if (checked()) setPublishing(true);
        }}
      >
        {form.live === 'now' ? t('notices.publish') : t('notices.schedule')}
      </Button>
    </>
  );

  return (
    <ConsolePage>
      <div className="flex items-center gap-1.5 text-[13px] text-fg-muted">
        <Link to="/notices" className="text-primary">
          {t('nav.notices')}
        </Link>
        <ConsoleIcon name="chev" />
        <span className="min-w-0 truncate">{crumb}</span>
      </div>
      <PageTitle
        title={editing ? t('notices.editTitle') : t('notices.new')}
        lead={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <NoticeStatusChip status={isLive ? NoticeStatus.Live : NoticeStatus.Draft} />
            {start.template ? (
              <StatusChip tone="mute" plain>
                {t('notices.fromTemplate', { t: t(`notices.templates.${start.template}`) })}
              </StatusChip>
            ) : null}
          </span>
        }
        actions={actions}
      />
      {Object.keys(shown).length || serverError ? (
        <Banner tone="bad" icon="warn">
          <b className="font-semibold">{t('notices.errBanner')}</b>
          {shown.top || serverError ? <div>{shown.top ?? serverError}</div> : null}
        </Banner>
      ) : null}
      {mode === 'rate' && change ? (
        <Banner tone="info" icon="info">
          {t('notices.rateBanner', {
            d: formatDay(change.changedAt),
            r: t(`rateNames.${change.key}`),
            o: change.oldValue === null ? '–' : rateWords(change.key, change.oldValue),
            n: rateWords(change.key, change.newValue),
          })}
        </Banner>
      ) : null}
      {isLive ? (
        <Banner tone="warn" icon="warn">
          {t('notices.liveBanner')}
        </Banner>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {wordsCard}
          {previewCard}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {kindCard}
          {whoCard}
        </div>
      </div>
      {publishing ? (
        <PublishPanel
          title={titleIn(form, i18n.language)}
          audience={audienceOf(form)}
          severity={form.severity}
          publishAt={form.live === 'now' ? null : goesAt}
          windowEndsAt={
            form.category === NoticeCategory.Maintenance ? fromDhakaInput(form.windowEndsAt) : null
          }
          pending={saving.isPending}
          error={serverError}
          onClose={() => {
            setPublishing(false);
          }}
          onConfirm={publish}
        />
      ) : null}
    </ConsolePage>
  );
}
