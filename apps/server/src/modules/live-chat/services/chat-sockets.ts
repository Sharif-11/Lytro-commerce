import type { IncomingMessage, Server as HttpServer } from 'node:http';
import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Server, type Socket } from 'socket.io';
import { CHAT_SOCKET_PATH, CHAT_SOCKETS_PER_PERSON, ChatSocketEvent } from '@lytronix/validators';
import { EDGE_HEADER } from '../../../common/guards/tenant.guard';
import { EdgeSecret } from '../../../common/guards/edge-secret';
import { headerValue } from '../../../common/http';
import { serverRoleOf } from '../../../config/server-role';
import { SessionService } from '../../identity/services/session.service';
import { ShopMemberships } from '../../identity/services/shop-memberships';
import { OperatorAuthService } from '../../operator/services/operator-auth.service';
import { ChatBus, type ChatEvent } from './chat-bus';
import { ChatFeature } from './chat-feature';

const SHOP_ROOM = (tenantId: string): string => `shop:${tenantId}`;
const LYTRO_ROOM = 'lytro';
// LC-3, §6: a ping every 25 seconds keeps an idle socket under Cloudflare's 100-second limit.
const PING_INTERVAL_MS = 25_000;
const PING_TIMEOUT_MS = 20_000;

/** Who a socket belongs to, settled at the handshake. */
interface SocketOwner {
  side: 'shop' | 'lytro';
  tenantId: string | null;
  person: string;
}

/**
 * LC-3, §6: the chat's live connection, one Socket.IO server per process that answers HTTP, at CHAT_SOCKET_PATH under
 * Caddy's /api proxy. WebSocket only (no long polling, which would need sticky sessions across two API containers and
 * their workers); a browser that can't open one reads the chat over HTTPS instead. The socket only tells: every write
 * goes over HTTPS with its CSRF token. A handshake is the session's own -- the shop's cookie and the shop it names, or
 * Lytro's console session -- from an allowed origin and through Caddy. It never holds a database connection: it waits
 * on ChatBus, and the one check it makes at the handshake is a short read.
 */
@Injectable()
export class ChatSockets implements OnApplicationBootstrap, OnApplicationShutdown {
  private io: Server | null = null;
  /** LC-3: this process's sockets per person, oldest first; a fourth closes the oldest. */
  private readonly byPerson = new Map<string, Socket[]>();

  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
    @Inject(SessionService)
    private readonly sessions: Pick<SessionService, 'resolve' | 'originAllowed'>,
    @Inject(ShopMemberships) private readonly memberships: Pick<ShopMemberships, 'ofSlug'>,
    @Inject(OperatorAuthService)
    private readonly operators: Pick<OperatorAuthService, 'resolve' | 'originAllowed'>,
    @Inject(EdgeSecret) private readonly edgeSecret: Pick<EdgeSecret, 'matches'>,
    @Inject(ChatFeature) private readonly feature: Pick<ChatFeature, 'on'>,
    @Inject(ChatBus) private readonly bus: Pick<ChatBus, 'listen'>,
  ) {}

  onApplicationBootstrap(): void {
    // D9-11: the job worker answers its health check only; browsers reach the API processes.
    if (serverRoleOf(process.env) === 'worker') return;
    const httpServer = this.adapterHost.httpAdapter.getHttpServer() as HttpServer | undefined;
    if (!httpServer) return;
    const io = new Server(httpServer, {
      path: CHAT_SOCKET_PATH,
      transports: ['websocket'],
      serveClient: false,
      pingInterval: PING_INTERVAL_MS,
      pingTimeout: PING_TIMEOUT_MS,
      maxHttpBufferSize: 1024,
      allowRequest: (request, answer) => {
        answer(null, this.edgeSecret.matches(request.headers[EDGE_HEADER]));
      },
    });
    io.use((socket, next) => {
      this.admit(socket)
        .then((owner) => {
          if (owner === null) {
            next(new Error('not_allowed'));
            return;
          }
          socket.data = owner;
          next();
        })
        .catch(() => {
          next(new Error('not_allowed'));
        });
    });
    io.on('connection', (socket) => {
      this.joined(socket);
    });
    this.bus.listen((event) => {
      this.tell(event);
    });
    this.io = io;
  }

  async onApplicationShutdown(): Promise<void> {
    const io = this.io;
    this.io = null;
    if (io) await io.close();
  }

  /** The handshake: the shop side's session, shop and switch; or Lytro's console session. */
  private async admit(socket: Socket): Promise<SocketOwner | null> {
    const request: IncomingMessage = socket.request;
    const cookie = headerValue(request.headers.cookie);
    const origin = headerValue(request.headers.origin);
    const auth = socket.handshake.auth as { side?: unknown; shop?: unknown };
    if (auth.side === 'lytro') {
      if (!this.operators.originAllowed(origin)) return null;
      const session = await this.operators.resolve(cookie);
      return session ? { side: 'lytro', tenantId: null, person: `o:${session.operatorId}` } : null;
    }
    if (typeof auth.shop !== 'string' || auth.shop.length === 0) return null;
    if (!this.sessions.originAllowed(origin)) return null;
    const session = await this.sessions.resolve(cookie);
    if (!session) return null;
    const membership = await this.memberships.ofSlug(session, auth.shop.trim().toLowerCase());
    if (membership === null) return null;
    if (!(await this.feature.on(membership.tenant.id))) return null;
    return {
      side: 'shop',
      tenantId: membership.tenant.id,
      person: `u:${membership.tenant.id}:${membership.userId ?? 'owner'}:${session.subscriberId}`,
    };
  }

  private joined(socket: Socket): void {
    const owner = socket.data as SocketOwner;
    void socket.join(owner.side === 'lytro' ? LYTRO_ROOM : SHOP_ROOM(owner.tenantId ?? ''));
    const open = this.byPerson.get(owner.person) ?? [];
    open.push(socket);
    while (open.length > CHAT_SOCKETS_PER_PERSON) open.shift()?.disconnect(true);
    this.byPerson.set(owner.person, open);
    socket.on('disconnect', () => {
      const left = (this.byPerson.get(owner.person) ?? []).filter((each) => each.id !== socket.id);
      if (left.length === 0) this.byPerson.delete(owner.person);
      else this.byPerson.set(owner.person, left);
    });
  }

  /** One event from any process, to this process's sockets that should hear it. */
  private tell(event: ChatEvent): void {
    const io = this.io;
    if (!io) return;
    switch (event.type) {
      case 'message':
        io.to(SHOP_ROOM(event.tenantId)).emit(ChatSocketEvent.Message, event.message);
        io.to(LYTRO_ROOM).emit(ChatSocketEvent.Message, {
          ...event.message,
          tenantId: event.tenantId,
          shopName: event.shopName,
        });
        return;
      case 'read':
        io.to(LYTRO_ROOM).emit(ChatSocketEvent.Read, { tenantId: event.tenantId });
        return;
      case 'closed':
        io.to(SHOP_ROOM(event.tenantId)).emit(ChatSocketEvent.Closed, {});
        io.in(SHOP_ROOM(event.tenantId)).disconnectSockets(true);
        return;
    }
  }

  /** How many sockets this process holds, for the tests. */
  get open(): number {
    return this.io?.of('/').sockets.size ?? 0;
  }
}
