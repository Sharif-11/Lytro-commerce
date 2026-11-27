import { useTranslation } from 'react-i18next';
import { Mark } from '@lytronix/ui';
import {
  ChatSenderKind,
  ChatSystemKind,
  type ChatMessageView,
  type ChatView,
} from '@lytronix/validators';
import { chatPhotoUrl } from '@/api/chat';
import { Icon } from '@/components/icon';
import { dayLabel, formatTime, groupByDay, wholeHour } from '@/lib/dates';
import { bangladeshiPhone } from '@/lib/phone';

const FROM_SHOP: ReadonlySet<string> = new Set([ChatSenderKind.Owner, ChatSenderKind.Staff]);

/** LC-5, LC-24: Lytro's WhatsApp, for anything urgent, beside its automatic lines and in the chat's top line. */
export function WhatsappLink({
  whatsapp,
  className,
}: {
  whatsapp: string | null;
  className: string;
}): React.JSX.Element | null {
  if (!whatsapp) return null;
  return (
    <a
      className={className}
      href={`https://wa.me/${bangladeshiPhone.forWhatsapp(whatsapp)}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      <Icon name="message" size={14} /> WhatsApp
    </a>
  );
}

/** LC-6: the person's name, coloured by role -- the owner in one colour, staff in another. */
function Who({ message }: { message: ChatMessageView }): React.JSX.Element {
  const { t } = useTranslation('shell');
  const owner = message.senderKind === ChatSenderKind.Owner;
  const role = owner ? t('chatOwner') : t('chatStaff');
  return (
    <span
      className={`mx-1 mb-[3px] inline-flex items-center gap-1 text-[12px] font-semibold ${owner ? 'text-brand-700' : 'text-accent-700'}`}
    >
      {message.senderName ? `${message.senderName} · ${role}` : role}
    </span>
  );
}

function Photos({ message }: { message: ChatMessageView }): React.JSX.Element {
  const { t } = useTranslation('shell');
  return (
    <>
      {message.photos.map((photo) =>
        photo.removed ? (
          <span
            key={photo.id}
            className="mb-1.5 flex items-center gap-1.5 text-[13px] italic opacity-90"
          >
            <Icon name="image" size={16} />
            {t('chatPhotoGone')}
          </span>
        ) : (
          <a key={photo.id} href={chatPhotoUrl(photo.id)} target="_blank" rel="noopener noreferrer">
            <img
              className="mb-1.5 block size-40 rounded-[10px] object-cover"
              src={chatPhotoUrl(photo.id)}
              alt=""
              loading="lazy"
            />
          </a>
        ),
      )}
    </>
  );
}

/** LC-5, LC-24: Lytro's automatic lines, in the reader's words, with the hours the console sets. */
function SystemLine({
  message,
  chat,
}: {
  message: ChatMessageView;
  chat: ChatView;
}): React.JSX.Element {
  const { t, i18n } = useTranslation('shell');
  const text =
    message.systemKind === ChatSystemKind.OffHours
      ? t('chatOffHours', {
          opens: wholeHour(chat.hours.opensHour, i18n.language),
          closes: wholeHour(chat.hours.closesHour, i18n.language),
          opensAt: wholeHour(chat.hours.opensHour, i18n.language, true),
        })
      : t('chatBusy');
  return (
    <div className="my-2.5 flex flex-wrap items-center gap-2 rounded-xl bg-info-soft px-3 py-2.5 text-[14px] text-fg">
      <Icon name="clock" size={18} />
      <span className="min-w-[180px] flex-1">{text}</span>
      <WhatsappLink
        whatsapp={chat.whatsapp}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-control-line bg-surface px-2.5 text-[13px] font-semibold text-fg"
      />
    </div>
  );
}

function Bubble({ message }: { message: ChatMessageView }): React.JSX.Element {
  const { i18n } = useTranslation('shell');
  const mine = FROM_SHOP.has(message.senderKind);
  return (
    <div
      className={`my-1.5 flex max-w-[82%] flex-col ${mine ? 'ml-auto items-end' : 'items-start'}`}
    >
      {mine ? (
        <Who message={message} />
      ) : (
        <span className="mx-1 mb-[3px] inline-flex items-center gap-1 text-[12px] font-semibold text-fg-muted">
          <Mark size={14} /> Lytro
        </span>
      )}
      <div
        className={
          mine
            ? 'rounded-[14px] rounded-br-[4px] bg-primary px-3 py-[9px] text-[15px] leading-[1.5] whitespace-pre-wrap text-on-primary'
            : 'rounded-[14px] rounded-bl-[4px] border border-line bg-neutral-50 px-3 py-[9px] text-[15px] leading-[1.5] whitespace-pre-wrap text-fg'
        }
      >
        <Photos message={message} />
        {message.body}
      </div>
      <span className="mx-1 mt-[3px] text-[11px] text-fg-muted">
        {formatTime(message.createdAt, i18n.language)}
      </span>
    </div>
  );
}

/** LC-1, LC-6, LC-8, LC-11: the chat, a day at a time, with the line saying how long messages are kept. */
/**
 * LC-11: how long messages are kept, with Lytro's WhatsApp beside it; pinned under the chat's title (the sketch's
 * `lc-chat`), so it stays in view while the messages scroll to the newest.
 */
export function ChatKeepLine({ chat }: { chat: ChatView }): React.JSX.Element {
  const { t } = useTranslation('shell');
  return (
    <div className="flex items-center gap-1.5 text-[13px] text-fg-muted">
      <Icon name="clock" size={14} />
      <span>{t('chatKeep', { count: chat.historyDays })}</span>
      <WhatsappLink
        whatsapp={chat.whatsapp}
        className="ml-auto inline-flex flex-none items-center gap-1 font-semibold text-primary"
      />
    </div>
  );
}

export function ChatThread({ chat }: { chat: ChatView }): React.JSX.Element {
  const { t } = useTranslation('shell');
  const days = groupByDay(chat.messages, (message) => message.createdAt);
  return (
    <div className="flex flex-col" data-testid="chat-thread">
      {chat.messages.length === 0 ? (
        <p className="mt-6 text-center text-[14px] text-fg-muted">{t('chatEmpty')}</p>
      ) : null}
      {days.map((day) => {
        const label = dayLabel(day.iso);
        return (
          <div key={day.key} className="flex flex-col">
            <div className="mt-3 mb-1.5 text-center text-[12px] text-fg-muted">
              {label.kind === 'today'
                ? t('chatToday')
                : label.kind === 'yesterday'
                  ? t('chatYesterday')
                  : day.key}
            </div>
            {day.items.map((message) =>
              message.senderKind === ChatSenderKind.System ? (
                <SystemLine key={message.id} message={message} chat={chat} />
              ) : (
                <Bubble key={message.id} message={message} />
              ),
            )}
          </div>
        );
      })}
    </div>
  );
}
