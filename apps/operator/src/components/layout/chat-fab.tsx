import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChatSenderKind, type ChatLiveMessage } from '@lytronix/validators';
import { CHATS_QUERY_KEY, useChatWaiting } from '@/api/chats';
import { ConsoleIcon } from '@/components/ui/console-icon';
import { ChatLive, chatSound } from '@/lib/chat-live';

const FROM_SHOP: ReadonlySet<string> = new Set([ChatSenderKind.Owner, ChatSenderKind.Staff]);
const SOUND_CLAIM_KEY = 'lytro.operator.chatSoundFor';
const BEHIND_WAITS_MS = 400;

const ChatLiveContext = createContext<{ connected: boolean }>({ connected: false });

/** Whether the console's live connection is open: while it isn't, chat screens read over HTTPS every few seconds. */
export function useChatLive(): { connected: boolean } {
  return useContext(ChatLiveContext);
}

/** LC-13: one chime per message across this browser's console tabs -- the tab in front's, else the first to claim it. */
function chime(message: ChatLiveMessage): void {
  const play = (): void => {
    try {
      if (window.localStorage.getItem(SOUND_CLAIM_KEY) === message.id) return;
      window.localStorage.setItem(SOUND_CLAIM_KEY, message.id);
    } catch {
      // Without storage, each tab plays its own.
    }
    chatSound.play();
  };
  if (document.visibilityState === 'visible' && document.hasFocus()) play();
  else window.setTimeout(play, BEHIND_WAITS_MS);
}

/**
 * LIVE-CHAT-PLAN LC-4, LC-13 (the sketch's `oc-fab`): the console's live connection and, on every page but the chats',
 * a floating button with the latest waiting shop's name and the count of chats waiting for a person, with the chosen
 * sound when a shop writes. Without the AI (PR 1), every new message from a shop plays it.
 */
export function ChatLiveProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [connected, setConnected] = useState(false);
  const waiting = useChatWaiting(!connected);

  useEffect(() => {
    chatSound.wakeOn(window);
    const live = new ChatLive();
    live.connect({
      onMessage: (message) => {
        void queryClient.invalidateQueries({ queryKey: CHATS_QUERY_KEY });
        if (FROM_SHOP.has(message.senderKind)) chime(message);
      },
      onRead: () => {
        void queryClient.invalidateQueries({ queryKey: [...CHATS_QUERY_KEY, 'inbox'] });
      },
      onState: (up) => {
        setConnected(up);
        if (up) void queryClient.invalidateQueries({ queryKey: CHATS_QUERY_KEY });
      },
    });
    return () => {
      live.close();
    };
  }, [queryClient]);

  const summary = waiting.data;
  const shown = summary !== undefined && summary.waiting > 0 && !pathname.startsWith('/inbox');

  return (
    <ChatLiveContext.Provider value={{ connected }}>
      {children}
      {shown && summary.latestTenantId ? (
        <button
          type="button"
          data-testid="chat-fab"
          aria-label={t('chats.fab', { shop: summary.latestShop ?? '', count: summary.waiting })}
          className="fixed right-4 bottom-[76px] z-20 flex h-11 items-center gap-2 rounded-[22px] border-0 bg-primary pr-2 pl-3.5 text-[14px] font-semibold text-on-primary shadow-[0_6px_16px_rgba(16,32,31,0.28)] lg:right-6 lg:bottom-6"
          onClick={() => {
            void navigate({
              to: '/inbox/$tenantId',
              params: { tenantId: summary.latestTenantId ?? '' },
            });
          }}
        >
          <ConsoleIcon name="chat" size={20} />
          <span className="max-w-[160px] truncate">{summary.latestShop}</span>
          <span className="num flex h-6 min-w-6 items-center justify-center rounded-full bg-on-primary px-1.5 text-[13px] font-bold text-primary">
            {summary.waiting}
          </span>
        </button>
      ) : null}
    </ChatLiveContext.Provider>
  );
}
