import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import { Button } from '@lytronix/ui';
import {
  CHAT_QUICK_REPLIES_MAX,
  CHAT_QUICK_REPLY_BODY_MAX,
  CHAT_QUICK_REPLY_TITLE_MAX,
  PlatformSettingKey,
} from '@lytronix/validators';
import {
  useOrderQuickReplies,
  useQuickReplies,
  useRemoveQuickReply,
  useSaveQuickReply,
  type QuickReply,
} from '@/api/chats';
import { useSettings } from '@/api/settings';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ConsoleCard, ConsolePage, PageTitle, SectionTitle } from '@/components/ui/console-page';
import { LoadFailed } from '@/components/ui/load-failed';
import { useToast } from '@/components/ui/use-toast';
import { CHAT_GROUP, SETTING_SHAPES } from '@/lib/setting-shapes';
import { SettingRow } from './index';

/** "9 AM – 10 PM": the help line's hours, which the chat keeps too (LC-24). */
function hourWords(hour: number): string {
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(twelve)} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** A quick reply being written: a new one (`id` null) or one already on the list. */
interface Draft {
  id: string | null;
  title: string;
  body: string;
}

function QuickReplyForm({
  draft,
  onCancel,
  onSaved,
}: {
  draft: Draft;
  onCancel: () => void;
  onSaved: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const save = useSaveQuickReply();
  const [title, setTitle] = useState(draft.title);
  const [body, setBody] = useState(draft.body);
  const ready = title.trim() !== '' && body.trim() !== '';
  return (
    <form
      className="flex flex-col gap-2 border-t border-line px-4 py-3 first:border-t-0"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        save.mutate(
          { id: draft.id, title: title.trim(), body: body.trim() },
          {
            onSuccess: () => {
              toast(t('chatSettings.quickSaved'));
              onSaved();
            },
            onError: (error) => {
              toast(errorMessage(error, t));
            },
          },
        );
      }}
    >
      <label className="flex flex-col gap-1 text-[13px] font-semibold">
        {t('chatSettings.quickTitle')}
        <input
          value={title}
          maxLength={CHAT_QUICK_REPLY_TITLE_MAX}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
          className="h-10 rounded-control border border-line-strong bg-surface px-3 text-[14px] font-normal"
          autoFocus
        />
      </label>
      <label className="flex flex-col gap-1 text-[13px] font-semibold">
        {t('chatSettings.quickBody')}
        <textarea
          value={body}
          maxLength={CHAT_QUICK_REPLY_BODY_MAX}
          rows={3}
          onChange={(event) => {
            setBody(event.target.value);
          }}
          className="rounded-control border border-line-strong bg-surface px-3 py-2 text-[14px] font-normal"
        />
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" tone="outline" small fit onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" small fit disabled={!ready || save.isPending}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}

/** LC-10: Lytro's own quick replies, in the order the composer offers them; dragged by their grip, or moved by key. */
function QuickReplies(): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const replies = useQuickReplies();
  const remove = useRemoveQuickReply();
  const order = useOrderQuickReplies();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const items = replies.data ?? [];

  const move = (from: number, to: number): void => {
    if (to < 0 || to >= items.length || from === to) return;
    const ids = items.map((each) => each.id);
    const [taken] = ids.splice(from, 1);
    if (taken === undefined) return;
    ids.splice(to, 0, taken);
    order.mutate(ids, {
      onError: (error) => {
        toast(errorMessage(error, t));
      },
    });
  };

  const row = (reply: QuickReply, at: number): React.JSX.Element =>
    draft?.id === reply.id ? (
      <QuickReplyForm
        key={reply.id}
        draft={draft}
        onCancel={() => {
          setDraft(null);
        }}
        onSaved={() => {
          setDraft(null);
        }}
      />
    ) : (
      <div
        key={reply.id}
        data-testid="quick-reply-row"
        onDragOver={(event) => {
          if (dragging !== null) event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (dragging === null) return;
          move(
            items.findIndex((each) => each.id === dragging),
            at,
          );
          setDragging(null);
        }}
        className="flex min-h-[60px] items-center gap-3 border-t border-line px-4 py-2.5 first:border-t-0"
      >
        <button
          type="button"
          draggable
          aria-label={t('chatSettings.move', { title: reply.title })}
          title={t('chatSettings.moveHint')}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move';
            setDragging(reply.id);
          }}
          onDragEnd={() => {
            setDragging(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              move(at, at - 1);
            } else if (event.key === 'ArrowDown') {
              event.preventDefault();
              move(at, at + 1);
            }
          }}
          className="grid size-8 flex-none cursor-grab place-items-center rounded-control text-neutral-700 hover:bg-neutral-100"
        >
          <ConsoleIcon name="grip" size={16} />
        </button>
        <span className="flex min-w-0 flex-auto flex-col">
          <b className="text-[14px] font-semibold">{reply.title}</b>
          <span className="truncate text-[13px] text-fg-muted">{reply.body}</span>
        </span>
        <button
          type="button"
          aria-label={t('chatSettings.edit', { title: reply.title })}
          onClick={() => {
            setDraft({ id: reply.id, title: reply.title, body: reply.body });
          }}
          className="grid size-9 flex-none place-items-center rounded-control text-neutral-700 hover:bg-neutral-100"
        >
          <ConsoleIcon name="edit" size={16} />
        </button>
        <button
          type="button"
          aria-label={t('chatSettings.remove', { title: reply.title })}
          disabled={remove.isPending}
          onClick={() => {
            remove.mutate(reply.id, {
              onSuccess: () => {
                toast(t('chatSettings.quickRemoved', { title: reply.title }));
              },
              onError: (error) => {
                toast(errorMessage(error, t));
              },
            });
          }}
          className="grid size-9 flex-none place-items-center rounded-control text-neutral-700 hover:bg-neutral-100"
        >
          <ConsoleIcon name="trash" size={16} />
        </button>
      </div>
    );

  return (
    <ConsoleCard className="p-0!">
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4">
        <div className="min-w-0">
          <SectionTitle>{t('chats.quick')}</SectionTitle>
          <div className="mt-0.5 text-[13px] text-fg-muted">{t('chatSettings.quickLead')}</div>
        </div>
        <Button
          type="button"
          tone="outline"
          small
          fit
          disabled={draft !== null || items.length >= CHAT_QUICK_REPLIES_MAX}
          onClick={() => {
            setDraft({ id: null, title: '', body: '' });
          }}
        >
          <ConsoleIcon name="plus" size={14} />
          {t('chatSettings.quickNew')}
        </Button>
      </div>
      <div className="mt-3 border-t border-line">
        {replies.isError ? (
          <div className="p-4">
            <LoadFailed
              onRetry={() => {
                void replies.refetch();
              }}
            />
          </div>
        ) : (
          <>
            {items.map(row)}
            {draft?.id === null ? (
              <QuickReplyForm
                draft={draft}
                onCancel={() => {
                  setDraft(null);
                }}
                onSaved={() => {
                  setDraft(null);
                }}
              />
            ) : null}
            {items.length === 0 && draft === null && !replies.isLoading ? (
              <div className="px-4 py-4 text-[14px] text-fg-muted">{t('chats.quickNone')}</div>
            ) : null}
          </>
        )}
      </div>
    </ConsoleCard>
  );
}

/**
 * LIVE-CHAT-PLAN (`oc-settings-chat`): the chat's hours (the help line's, LC-24), its four rules -- each changed with
 * the reason the audit log keeps, as on Settings -- and Lytro's quick replies (LC-10).
 */
export function ChatSettings(): React.JSX.Element {
  const { t } = useTranslation();
  const settings = useSettings();
  const [editing, setEditing] = useState<string | null>(null);
  const rows = settings.data ?? [];
  const hour = (key: string): number =>
    Number(rows.find((setting) => setting.key === key)?.value ?? 0);

  return (
    <ConsolePage>
      <PageTitle title={t('chatSettings.title')} lead={t('chatSettings.lead')} />
      {settings.isError ? (
        <LoadFailed
          onRetry={() => {
            void settings.refetch();
          }}
        />
      ) : (
        <ConsoleCard className="p-0!">
          <div className="px-4 pt-4">
            <SectionTitle>{t('chatSettings.rules')}</SectionTitle>
          </div>
          <div className="mt-2 flex min-h-[60px] flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-4 py-3">
            <span className="flex min-w-0 flex-auto flex-col">
              <b className="text-[14px] font-semibold">{t('chatSettings.hours')}</b>
              <span className="text-[13px] text-fg-muted">{t('chatSettings.hoursHint')}</span>
            </span>
            {settings.isLoading ? (
              <span className="skel w-24" />
            ) : (
              <span className="text-[14px] font-semibold">
                {hourWords(hour(PlatformSettingKey.HelpOpensHour))} –{' '}
                {hourWords(hour(PlatformSettingKey.HelpClosesHour))}
              </span>
            )}
            <Link
              to="/settings"
              hash="settings-group-14"
              className="text-[13px] font-semibold text-primary"
            >
              {t('chatSettings.hoursChange')}
            </Link>
          </div>
          {SETTING_SHAPES.filter((shape) => shape.group === CHAT_GROUP).map((shape) => {
            const setting = rows.find((each) => each.key === shape.key);
            if (!setting) return null;
            return (
              <div key={shape.key} className="border-t border-line">
                <SettingRow
                  setting={setting}
                  shape={shape}
                  rows={rows}
                  editing={editing === shape.key}
                  onEdit={() => {
                    setEditing(shape.key);
                  }}
                  onDraft={() => undefined}
                  onDone={() => {
                    setEditing(null);
                  }}
                />
              </div>
            );
          })}
        </ConsoleCard>
      )}
      <QuickReplies />
    </ConsolePage>
  );
}
