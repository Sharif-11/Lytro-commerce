import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Mark } from '@lytronix/ui';
import { errorMessage } from '@lytronix/api-client';
import {
  CHAT_PHOTO_MAX_BYTES,
  CHAT_PHOTO_TYPES,
  CHAT_PHOTOS_MAX,
  ChatSenderKind,
  ChatSystemKind,
  type ChatInboxItem,
  type ChatMessageView,
} from '@lytronix/validators';
import {
  chatPhotoUrl,
  useChatDetail,
  useChatInbox,
  useChatRead,
  useChatReply,
  useQuickReplies,
  type ChatDetail,
} from '@/api/chats';
import { useChatLive } from '@/components/layout/chat-fab';
import { Chip, Chips } from '@/components/ui/chips';
import { ConsoleCard, ConsolePage, PageTitle, SectionTitle } from '@/components/ui/console-page';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { LoadFailed } from '@/components/ui/load-failed';
import { useToast } from '@/components/ui/use-toast';
import { ShopStateChip } from '@/views/shops/shop-state-chip';

const FROM_SHOP: ReadonlySet<string> = new Set([ChatSenderKind.Owner, ChatSenderKind.Staff]);

function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
}

function timeOf(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language === 'bn' ? 'en-GB' : 'en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Dhaka',
  }).format(new Date(iso));
}

/** LC-6: a shop person's name, coloured by role -- the owner in one colour, staff in another. */
function Who({ name, owner }: { name: string | null; owner: boolean }): React.JSX.Element {
  const { t } = useTranslation();
  const role = owner ? t('chats.owner') : t('chats.staff');
  return (
    <span className={`text-[12px] font-semibold ${owner ? 'text-brand-700' : 'text-accent-700'}`}>
      {name ? `${name} · ${role}` : role}
    </span>
  );
}

function InboxRow({
  item,
  selected,
}: {
  item: ChatInboxItem;
  selected: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <Link
      to="/inbox/$tenantId"
      params={{ tenantId: item.tenantId }}
      data-testid="chat-row"
      className={`flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0 hover:bg-surface-hover ${selected ? 'bg-brand-50' : ''}`}
    >
      <span className="flex size-9 flex-none items-center justify-center rounded-full bg-neutral-100 text-[14px] font-semibold">
        {item.shopName.slice(0, 1)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <b className="min-w-0 truncate text-[15px]">{item.shopName}</b>
          {item.planName ? (
            <span className="flex-none rounded-md border border-line px-1.5 text-[12px] whitespace-nowrap text-fg-muted">
              {item.planName}
            </span>
          ) : null}
          {item.waitingSince ? (
            <span className="inline-flex flex-none items-center gap-1 text-[12px] font-semibold whitespace-nowrap text-warning">
              <ConsoleIcon name="clock" size={14} />
              {t('chats.minutes', { count: minutesSince(item.waitingSince) })}
            </span>
          ) : null}
        </span>
        <span
          className={`truncate text-[14px] ${item.unread > 0 ? 'font-semibold' : 'text-fg-muted'}`}
        >
          {item.lastPreview}
        </span>
      </span>
      {item.unread > 0 ? (
        <span className="num flex h-6 min-w-6 items-center justify-center rounded-full bg-danger px-1.5 text-[12px] font-bold text-white">
          {item.unread}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * The sketch's `oc-inbox`: every shop's chat, or only those waiting for a reply, with their counts. The AI's own filters
 * (drafts to approve, answered by the AI) come with it in PR 2.
 */
function InboxList({ selected }: { selected: string | null }): React.JSX.Element {
  const { t } = useTranslation();
  const { connected } = useChatLive();
  const inbox = useChatInbox(!connected);
  const [onlyWaiting, setOnlyWaiting] = useState(false);
  if (inbox.isError) return <LoadFailed onRetry={() => void inbox.refetch()} />;
  const all = inbox.data ?? [];
  const waiting = all.filter((item) => item.waitingSince !== null);
  const items = onlyWaiting ? waiting : all;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Chips>
        <Chip
          on={!onlyWaiting}
          count={all.length}
          onClick={() => {
            setOnlyWaiting(false);
          }}
        >
          {t('chats.filterAll')}
        </Chip>
        <Chip
          on={onlyWaiting}
          count={waiting.length}
          onClick={() => {
            setOnlyWaiting(true);
          }}
        >
          {t('chats.filterWaiting')}
        </Chip>
      </Chips>
      <section className="min-w-0 overflow-hidden rounded-card border border-line bg-surface">
        {items.length === 0 && !inbox.isLoading ? (
          <p className="px-4 py-6 text-center text-[14px] text-fg-muted">
            {onlyWaiting ? t('chats.noneWaiting') : t('chats.empty')}
          </p>
        ) : null}
        {items.map((item) => (
          <InboxRow key={item.tenantId} item={item} selected={item.tenantId === selected} />
        ))}
      </section>
    </div>
  );
}

/** The sketch's `oc-inbox`: one chat per shop, newest first. */
export function ChatsPage(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <ConsolePage>
      <PageTitle title={t('chats.title')} lead={t('chats.lead')} />
      <InboxList selected={null} />
    </ConsolePage>
  );
}

function SystemLine({ message }: { message: ChatMessageView }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="my-2 self-center rounded-xl bg-info-soft px-3 py-2 text-[13px] text-fg">
      {message.systemKind === ChatSystemKind.OffHours
        ? t('chats.offHoursSent')
        : t('chats.busySent')}
    </div>
  );
}

function Message({ message }: { message: ChatMessageView }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  if (message.senderKind === ChatSenderKind.System) return <SystemLine message={message} />;
  const shop = FROM_SHOP.has(message.senderKind);
  const owner = message.senderKind === ChatSenderKind.Owner;
  return (
    <div
      className={`my-1.5 flex max-w-[82%] flex-col ${shop ? 'items-start' : 'ml-auto items-end'}`}
    >
      {shop ? (
        <Who name={message.senderName} owner={owner} />
      ) : (
        <span className="text-[12px] font-semibold text-fg-muted">{t('chats.you')}</span>
      )}
      <div
        className={
          shop
            ? 'mt-[3px] rounded-[14px] rounded-bl-[4px] border border-line bg-neutral-50 px-3 py-2 text-[15px] leading-[1.5] whitespace-pre-wrap'
            : 'mt-[3px] rounded-[14px] rounded-br-[4px] bg-primary px-3 py-2 text-[15px] leading-[1.5] whitespace-pre-wrap text-on-primary'
        }
      >
        {message.photos.map((photo) =>
          photo.removed ? (
            <span key={photo.id} className="mb-1.5 flex items-center gap-1.5 text-[13px] italic">
              <ConsoleIcon name="image" size={16} />
              {t('chats.photoGone')}
            </span>
          ) : (
            <a
              key={photo.id}
              href={chatPhotoUrl(photo.id)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                className="mb-1.5 block size-40 rounded-[10px] object-cover"
                src={chatPhotoUrl(photo.id)}
                alt=""
              />
            </a>
          ),
        )}
        {message.body}
      </div>
      <span className="mt-[3px] text-[11px] text-fg-muted">
        {timeOf(message.createdAt, i18n.language)}
      </span>
    </div>
  );
}

function Composer({
  tenantId,
  disabled,
}: {
  tenantId: string;
  disabled: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const reply = useChatReply(tenantId);
  const quick = useQuickReplies();
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [quickOpen, setQuickOpen] = useState(false);
  const files = useRef<HTMLInputElement>(null);
  const send = (): void => {
    const body = text.trim();
    if ((body.length === 0 && photos.length === 0) || reply.isPending) return;
    reply.mutate(
      { body, photos },
      {
        onSuccess: () => {
          setText('');
          setPhotos([]);
        },
        onError: (error) => {
          toast(errorMessage(error, t));
        },
      },
    );
  };
  return (
    <div className="relative border-t border-line p-3">
      {quickOpen ? (
        <div
          className="absolute right-3 bottom-[64px] left-3 z-10 max-h-72 overflow-auto rounded-card border border-line bg-surface shadow-lg"
          data-testid="quick-replies"
        >
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <b className="text-[14px]">{t('chats.quick')}</b>
            <Link to="/settings/chat" className="text-[13px] font-semibold text-primary">
              {t('chats.quickEdit')}
            </Link>
          </div>
          {(quick.data ?? []).map((each) => (
            <button
              key={each.id}
              type="button"
              className="flex w-full flex-col items-start gap-0.5 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-surface-hover"
              onClick={() => {
                setText(each.body);
                setQuickOpen(false);
              }}
            >
              <b className="text-[14px]">{each.title}</b>
              <span className="line-clamp-2 text-[13px] text-fg-muted">{each.body}</span>
            </button>
          ))}
          {(quick.data ?? []).length === 0 ? (
            <p className="px-3 py-3 text-[13px] text-fg-muted">{t('chats.quickNone')}</p>
          ) : null}
        </div>
      ) : null}
      {photos.length > 0 ? (
        <div className="mb-2 flex gap-2">
          {photos.map((file, at) => (
            <img
              key={`${file.name}-${String(at)}`}
              className="size-12 rounded-lg object-cover"
              src={URL.createObjectURL(file)}
              alt=""
            />
          ))}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-[14px] font-semibold"
          onClick={() => {
            setQuickOpen(!quickOpen);
          }}
        >
          <ConsoleIcon name="bolt" size={16} />
          {t('chats.quick')}
        </button>
        <button
          type="button"
          aria-label={t('chats.photo')}
          disabled={disabled}
          className="flex size-10 items-center justify-center rounded-lg hover:bg-surface-hover"
          onClick={() => files.current?.click()}
        >
          <ConsoleIcon name="image" />
        </button>
        <input
          ref={files}
          type="file"
          hidden
          multiple
          accept={CHAT_PHOTO_TYPES.join(',')}
          onChange={(event) => {
            const chosen = Array.from(event.target.files ?? []).filter(
              (file) =>
                (CHAT_PHOTO_TYPES as readonly string[]).includes(file.type) &&
                file.size <= CHAT_PHOTO_MAX_BYTES,
            );
            event.target.value = '';
            setPhotos([...photos, ...chosen].slice(0, CHAT_PHOTOS_MAX));
          }}
        />
        <input
          className="h-10 min-w-0 flex-1 rounded-full border border-line bg-field px-4 text-[15px]"
          placeholder={t('chats.write')}
          aria-label={t('chats.write')}
          value={text}
          disabled={disabled}
          maxLength={2000}
          onChange={(event) => {
            setText(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />
        <button
          type="button"
          aria-label={t('chats.send')}
          disabled={disabled || reply.isPending}
          className="flex size-10 items-center justify-center rounded-lg bg-primary text-on-primary disabled:opacity-60"
          onClick={send}
        >
          <ConsoleIcon name="send" size={18} />
        </button>
      </div>
    </div>
  );
}

function Context({ detail }: { detail: ChatDetail }): React.JSX.Element {
  const { t, i18n } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <ConsoleCard>
        <SectionTitle>{t('chats.shop')}</SectionTitle>
        <dl className="mt-2 flex flex-col gap-2 text-[14px]">
          <div className="flex justify-between gap-2">
            <dt className="text-fg-muted">{t('chats.plan')}</dt>
            <dd className="font-semibold">
              {detail.shop.planName ?? '—'}
              {detail.shop.periodEnd
                ? ` · ${t('chats.until', { date: new Intl.DateTimeFormat(i18n.language === 'bn' ? 'en-GB' : 'en-US', { day: 'numeric', month: 'short', timeZone: 'Asia/Dhaka' }).format(new Date(detail.shop.periodEnd)) })}`
                : ''}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-fg-muted">{t('chats.state')}</dt>
            <dd>
              <ShopStateChip state={detail.shop.state} />
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-fg-muted">{t('chats.balance')}</dt>
            <dd className="num font-semibold">৳{detail.shop.balance}</dd>
          </div>
          {detail.lastPage ? (
            <div className="flex justify-between gap-2">
              <dt className="text-fg-muted">{t('chats.wasOn')}</dt>
              <dd className="font-mono text-[13px]">{detail.lastPage}</dd>
            </div>
          ) : null}
        </dl>
        <Link
          to="/shops/$id"
          params={{ id: detail.shop.tenantId }}
          className="mt-3 inline-flex items-center gap-1 text-[14px] font-semibold text-primary"
        >
          {t('chats.openShop')} <ConsoleIcon name="arrow" size={16} />
        </Link>
      </ConsoleCard>
      <ConsoleCard>
        <SectionTitle>{t('chats.errors')}</SectionTitle>
        {detail.errors.length === 0 ? (
          <p className="mt-2 text-[14px] text-fg-muted">{t('chats.noErrors')}</p>
        ) : (
          detail.errors.map((each) => (
            <div key={each.createdAt} className="mt-2 flex items-center gap-2 text-[14px]">
              <span className="num rounded-full bg-danger-soft px-2 text-[12px] font-semibold text-danger">
                {each.status}
              </span>
              <span className="truncate">
                {each.method} {each.route ?? ''} · {timeOf(each.createdAt, i18n.language)}
              </span>
            </div>
          ))
        )}
      </ConsoleCard>
      <ConsoleCard>
        <SectionTitle>{t('chats.people')}</SectionTitle>
        <div className="mt-2 flex flex-col gap-1.5">
          {detail.people.map((person) => (
            <Who key={person.id} name={person.name} owner={person.owner} />
          ))}
        </div>
      </ConsoleCard>
    </div>
  );
}

/** The sketch's `oc-chat`: the inbox beside one chat, with the shop beside it (LC-9). */
export function ChatPage({ tenantId }: { tenantId: string }): React.JSX.Element {
  const { t } = useTranslation();
  const { connected } = useChatLive();
  const detail = useChatDetail(tenantId, !connected);
  const read = useChatRead(tenantId);
  const end = useRef<HTMLDivElement>(null);
  const count = detail.data?.messages.length ?? 0;

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
    if (count > 0) read.mutate();
    // Reading marks the chat read once per new message, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, tenantId]);

  if (detail.isError)
    return (
      <ConsolePage>
        <LoadFailed onRetry={() => void detail.refetch()} />
      </ConsolePage>
    );
  const data = detail.data;
  return (
    <div className="grid min-h-full gap-4 p-4 lg:grid-cols-[320px_minmax(0,1fr)_300px] lg:p-6">
      <div className="hidden lg:block">
        <InboxList selected={tenantId} />
      </div>
      <section className="flex min-h-[520px] min-w-0 flex-col rounded-card border border-line bg-surface">
        {data ? (
          <>
            <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <Link
                to="/shops/$id"
                params={{ id: data.shop.tenantId }}
                className="inline-flex items-center gap-1 text-[17px] font-bold text-primary underline-offset-2 hover:underline"
                data-testid="chat-shop-link"
              >
                {data.shop.shopName} <ConsoleIcon name="arrow" size={16} />
              </Link>
              {data.shop.planName ? (
                <span className="rounded-md border border-line px-1.5 text-[12px] text-fg-muted">
                  {data.shop.planName}
                </span>
              ) : null}
              <ShopStateChip state={data.shop.state} />
              {/* On its own line under the shop's name, as the sketch draws it. */}
              <span className="basis-full text-[13px] text-fg-muted">
                {t('chats.keep', { count: data.historyDays })}
              </span>
            </header>
            <div className="flex min-h-0 flex-1 flex-col overflow-auto px-4 py-3">
              {data.messages.map((message) => (
                <Message key={message.id} message={message} />
              ))}
              <div ref={end} />
            </div>
            {data.feature.on ? null : (
              <p className="border-t border-line px-4 py-2 text-[13px] text-fg-muted">
                {t('chats.off')}
              </p>
            )}
            <Composer tenantId={tenantId} disabled={!data.feature.on} />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <Mark size={40} />
          </div>
        )}
      </section>
      {data ? <Context detail={data} /> : null}
    </div>
  );
}
