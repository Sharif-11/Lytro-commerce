import { io, type Socket } from 'socket.io-client';
import { CHAT_SOCKET_PATH, ChatSocketEvent, type ChatMessageView } from '@lytronix/validators';

/** What the chat's live connection tells the page. */
export interface ChatConnectionEvents {
  onMessage: (message: ChatMessageView) => void;
  /** The chat was switched off for the shop (LC-2): close it. */
  onClosed: () => void;
  /** Whether the socket is open now; while it isn't, the page reads the chat over HTTPS instead. */
  onState: (connected: boolean) => void;
}

/**
 * LC-3, §6: the shop's live connection to its chat, one per tab, opened only while the shop has the chat. WebSocket only;
 * the session cookie and the shop the page names are the handshake. It reconnects by itself, and the page reads what it
 * missed when it comes back (onState).
 */
export class ChatConnection {
  private socket: Socket | null = null;

  constructor(private readonly open: typeof io = io) {}

  connect(slug: string, events: ChatConnectionEvents): void {
    this.close();
    const socket = this.open({
      path: CHAT_SOCKET_PATH,
      transports: ['websocket'],
      withCredentials: true,
      auth: { side: 'shop', shop: slug },
      reconnectionDelay: 2_000,
      reconnectionDelayMax: 30_000,
    });
    socket.on('connect', () => {
      events.onState(true);
    });
    socket.on('disconnect', () => {
      events.onState(false);
    });
    socket.on('connect_error', () => {
      events.onState(false);
    });
    socket.on(ChatSocketEvent.Message, (message: ChatMessageView) => {
      events.onMessage(message);
    });
    socket.on(ChatSocketEvent.Closed, () => {
      events.onClosed();
    });
    this.socket = socket;
  }

  close(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }
}
