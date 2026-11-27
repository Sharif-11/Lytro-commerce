import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@lytronix/api-client';
import {
  CHAT_HOME_PEEK_SECONDS,
  CHAT_PHOTOS_MAX,
  CHAT_PHOTO_TYPES,
  ChatSenderKind,
  type ChatMessageView,
  type ChatView,
} from '@lytronix/validators';
import {
  CHAT_QUERY_KEY,
  chatPhotoRefused,
  useChat,
  useReadChat,
  useSendChat,
  withMessage,
} from '@/api/chat';
import { Icon } from '@/components/icon';
import { Sheet } from '@/components/ui/sheet';
import { ChatConnection } from '@/lib/chat-connection';
import { chatSound } from '@/lib/notification-sound';
import { useShell } from '@/shell/shell-context';
import { PUSH_ARRIVED } from '@/views/notifications/notification-alerts';
import { ChatThread } from './chat-thread';

const FROM_LYTRO: ReadonlySet<string> = new Set([ChatSenderKind.Lytro, ChatSenderKind.System]);
// §5.1: the button comes back this long after a scroll stops.
const SCROLL_REST_MS = 1000;
// §5.2: a tab in front plays the sound at once; one behind waits this long, so the one in front claims it first.
const BEHIND_WAITS_MS = 400;
const SOUND_CLAIM_KEY = 'lytro.chatSoundFor';

/** §5.2: one chime per message, whatever number of tabs heard it -- the tab in front's, else the first to claim it. */
function claimSound(messageId: string): boolean {
  try {
    if (window.localStorage.getItem(SOUND_CLAIM_KEY) === messageId) return false;
    window.localStorage.setItem(SOUND_CLAIM_KEY, messageId);
    return true;
  } catch {
    return true;
  }
}

function chimeFor(message: ChatMessageView): void {
  const play = (): void => {
    if (claimSound(message.id)) chatSound.alert();
  };
  if (document.visibilityState === 'visible' && document.hasFocus()) play();
  else window.setTimeout(play, BEHIND_WAITS_MS);
}

/**
 * LIVE-CHAT-PLAN §5 (LC-12, LC-13, LC-19): the shop's chat with Lytro, mounted once in the shell. A small button that
 * shows 5 seconds each time Home opens, always in Menu, and on any screen while Lytro's message is unread, with the chat
 * sound; it hides while the page scrolls. Tapping it opens the chat: a sheet on a phone, a panel on a computer. A shop
 * without the chat gets nothing at all.
 */
export function ChatLauncher(): React.JSX.Element | null {
  const { t } = useTranslation('shell');
  const { slug, showToast } = useShell();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [open, setOpen] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const [peeking, setPeeking] = useState(false);
  const read = useReadChat();
  // LC-3's fallback: without its live connection, a shop that has the chat reads it every few seconds, so Lytro's reply
  // still brings the button up on any screen. A shop without the chat never asks again.
  const known = queryClient.getQueryData<ChatView>(CHAT_QUERY_KEY)?.enabled === true;
  const chat = useChat({ poll: known && !connected });
  const enabled = chat.data?.enabled === true;
  const unread = chat.data?.unread ?? 0;
  const openRef = useRef(open);
  openRef.current = open;

  const path = location.pathname.replace(/\/+$/, '');
  const onHome = path === `/${slug}`;
  const onMenu = path === `/${slug}/menu`;

  // LC-19: every time Home opens, the button shows for five seconds.
  useEffect(() => {
    if (!onHome) return undefined;
    setPeeking(true);
    const timer = window.setTimeout(() => {
      setPeeking(false);
    }, CHAT_HOME_PEEK_SECONDS * 1000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [onHome, location.href]);

  // §5.1: hidden while the page scrolls, back a second after it stops.
  useEffect(() => {
    let rest = 0;
    const onScroll = (): void => {
      setScrolling(true);
      window.clearTimeout(rest);
      rest = window.setTimeout(() => {
        setScrolling(false);
      }, SCROLL_REST_MS);
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.clearTimeout(rest);
    };
  }, []);

  // The push's link (?chat=open) opens the chat straight away.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('chat') !== 'open') return;
    setOpen(true);
    params.delete('chat');
    const rest = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${rest ? `?${rest}` : ''}`,
    );
  }, [location.href]);

  useEffect(() => {
    chatSound.wakeOn(window);
  }, []);

  const arrived = useCallback(
    (message: ChatMessageView) => {
      const fromLytro = FROM_LYTRO.has(message.senderKind);
      queryClient.setQueryData<ChatView>(CHAT_QUERY_KEY, (current) => {
        const next = withMessage(current, message);
        if (!next || next === current || !fromLytro || openRef.current) return next;
        return { ...next, unread: next.unread + 1 };
      });
      if (!fromLytro) return;
      chimeFor(message);
      if (openRef.current) read.mutate();
    },
    [queryClient, read],
  );

  // LC-3: the live connection, only while the shop has the chat.
  useEffect(() => {
    if (!enabled) return undefined;
    const connection = new ChatConnection();
    connection.connect(slug, {
      onMessage: arrived,
      onClosed: () => {
        setOpen(false);
        void queryClient.invalidateQueries({ queryKey: CHAT_QUERY_KEY });
      },
      onState: (up) => {
        setConnected(up);
        // Back again: read what came while it was away.
        if (up) void queryClient.invalidateQueries({ queryKey: CHAT_QUERY_KEY });
      },
    });
    return () => {
      connection.close();
    };
    // `arrived` is stable for the connection's life; reconnecting for it would drop messages.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, slug, queryClient]);

  // A push arrived while the tab is open: read the chat at once.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onPush = (event: MessageEvent): void => {
      if ((event.data as { type?: string } | null)?.type === PUSH_ARRIVED) {
        void queryClient.invalidateQueries({ queryKey: CHAT_QUERY_KEY });
      }
    };
    navigator.serviceWorker.addEventListener('message', onPush);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onPush);
    };
  }, [queryClient]);

  if (!enabled) return null;
  const shown = !open && !scrolling && (unread > 0 || onMenu || (onHome && peeking));

  return (
    <>
      <button
        type="button"
        aria-label={t('chatOpen')}
        aria-hidden={!shown}
        tabIndex={shown ? 0 : -1}
        data-testid="chat-button"
        data-shown={shown}
        className={[
          'fixed right-4 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 flex size-11 items-center justify-center rounded-full border-0 bg-primary text-on-primary shadow-[0_6px_16px_rgba(16,32,31,0.28)] transition-[opacity,transform] duration-200 lg:right-6 lg:bottom-6',
          shown ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0',
        ].join(' ')}
        onClick={() => {
          setOpen(true);
          // Read first, then fetch: a fetch already on its way would bring the count back after the read mark.
          if (unread > 0) {
            read.mutate(undefined, {
              onSettled: () => {
                void chat.refetch();
              },
            });
          } else {
            void chat.refetch();
          }
        }}
      >
        <Icon name="message" size={22} />
        {unread > 0 ? (
          <span className="num absolute -top-[5px] -right-[5px] flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-page bg-danger px-[5px] text-[12px] font-bold text-white">
            {unread}
          </span>
        ) : null}
      </button>
      <ChatSheet
        open={open}
        chat={chat.data}
        page={path.slice(slug.length + 1) || '/'}
        onClose={() => {
          setOpen(false);
        }}
        onRefused={(message) => {
          showToast(message);
        }}
      />
    </>
  );
}

function ChatSheet({
  open,
  chat,
  page,
  onClose,
  onRefused,
}: {
  open: boolean;
  chat: ChatView | undefined;
  page: string;
  onClose: () => void;
  onRefused: (message: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation('shell');
  const { t: tRoot } = useTranslation();
  const send = useSendChat();
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const count = chat?.messages.length ?? 0;

  useEffect(() => {
    if (open) end.current?.scrollIntoView({ block: 'end' });
  }, [open, count]);

  const submit = (): void => {
    const body = text.trim();
    if ((body.length === 0 && photos.length === 0) || send.isPending) return;
    send.mutate(
      { body, photos, page },
      {
        onSuccess: () => {
          setText('');
          setPhotos([]);
        },
        onError: (error) => {
          onRefused(errorMessage(error, tRoot));
        },
      },
    );
  };

  return (
    <Sheet
      open={open}
      title={t('chatTitle')}
      onClose={onClose}
      footer={
        <div className="flex w-full flex-col gap-2">
          {photos.length > 0 ? (
            <div className="flex gap-2">
              {photos.map((file, at) => (
                <span key={`${file.name}-${String(at)}`} className="relative">
                  <img
                    className="size-14 rounded-lg object-cover"
                    src={URL.createObjectURL(file)}
                    alt=""
                  />
                  <button
                    type="button"
                    aria-label={t('chatPhotoRemove')}
                    className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-fg text-surface"
                    onClick={() => {
                      setPhotos(photos.filter((_, each) => each !== at));
                    }}
                  >
                    <Icon name="x" size={12} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex w-full items-center gap-2">
            <button
              type="button"
              aria-label={t('chatPhoto')}
              className="flex size-11 flex-none items-center justify-center rounded-full text-fg-muted hover:bg-surface-hover"
              onClick={() => files.current?.click()}
            >
              <Icon name="image" />
            </button>
            <input
              ref={files}
              type="file"
              accept={CHAT_PHOTO_TYPES.join(',')}
              multiple
              hidden
              onChange={(event) => {
                const chosen = Array.from(event.target.files ?? []);
                event.target.value = '';
                if (chosen.some(chatPhotoRefused)) onRefused(t('chatPhotoRefused'));
                const fine = chosen.filter((file) => !chatPhotoRefused(file));
                const all = [...photos, ...fine];
                if (all.length > CHAT_PHOTOS_MAX)
                  onRefused(t('chatPhotosMax', { count: CHAT_PHOTOS_MAX }));
                setPhotos(all.slice(0, CHAT_PHOTOS_MAX));
              }}
            />
            <input
              className="h-11 min-w-0 flex-1 rounded-full border border-line bg-field px-4 text-[15px] text-fg placeholder:text-placeholder"
              placeholder={t('chatWrite')}
              aria-label={t('chatWrite')}
              value={text}
              maxLength={2000}
              onChange={(event) => {
                setText(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            <button
              type="button"
              aria-label={t('chatSend')}
              disabled={send.isPending}
              className="flex size-11 flex-none items-center justify-center rounded-full bg-primary text-on-primary disabled:opacity-60"
              onClick={submit}
            >
              <Icon name="right" />
            </button>
          </div>
        </div>
      }
    >
      {chat ? <ChatThread chat={chat} /> : null}
      <div ref={end} />
    </Sheet>
  );
}
