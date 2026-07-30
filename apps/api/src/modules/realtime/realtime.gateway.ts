import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@sc/shared';
import type { Env } from '../../config/env';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { SocketEmitterService } from './socket-emitter.service';
import { getMatchRequestDto } from '../matching/mappers';

interface SocketData {
  userId: string;
}

/**
 * Websocket-only transport (plan §6) — long-polling on flaky mobile networks
 * causes duplicate-delivery pain, and sockets here are a latency
 * optimisation only: the client always refetches the relevant HTTP resource
 * on reconnect (`match.subscribe`'s ack, or a plain GET), so a dropped event
 * is never the only way truth reaches the client.
 *
 * Rooms: `user:{id}` (joined here, right after JWT auth), `match:{id}`
 * (joined via `match.subscribe`). `@socket.io/redis-adapter` makes both work
 * across replicas, which the uptime NFR requires (≥2 instances).
 */
@Injectable()
@WebSocketGateway({ transports: ['websocket'], cors: { origin: '*' } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server<ClientToServerEvents, ServerToClientEvents>;

  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly socketEmitter: SocketEmitterService,
  ) {}

  afterInit(server: Server<ClientToServerEvents, ServerToClientEvents>): void {
    const redisUrl = this.config.get('REDIS_URL', { infer: true });
    const pubClient = new Redis(redisUrl);
    const subClient = pubClient.duplicate();
    server.adapter(createAdapter(pubClient, subClient));
    this.socketEmitter.setServer(server);

    server.use((socket, next) => {
      this.authenticate(socket)
        .then(() => {
          next();
        })
        .catch(() => {
          next(new Error('unauthorized'));
        });
    });

    this.logger.log('Socket.IO gateway initialised (redis adapter attached)');
  }

  private async authenticate(socket: Socket): Promise<void> {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) throw new Error('missing token');
    const user = await this.authService.verifyAccessToken(token);
    (socket.data as SocketData).userId = user.id;
  }

  handleConnection(socket: Socket): void {
    const { userId } = socket.data as SocketData;
    if (userId) {
      void socket.join(`user:${userId}`);
    }
  }

  /** Joins `match:{matchId}` and acks with the match's current state — covers the case where the request was created via HTTP just before the socket connected (plan §6). */
  @SubscribeMessage('match.subscribe')
  async onMatchSubscribe(
    @MessageBody() payload: { matchId: string },
    @ConnectedSocket() socket: Socket,
  ) {
    await socket.join(`match:${payload.matchId}`);
    return getMatchRequestDto(this.prisma, payload.matchId);
  }

  /** Joins `conversation:{conversationId}` — so `message.created`/`message.typing` reach this socket. */
  @SubscribeMessage('conversation.subscribe')
  async onConversationSubscribe(
    @MessageBody() payload: { conversationId: string },
    @ConnectedSocket() socket: Socket,
  ): Promise<void> {
    await socket.join(`conversation:${payload.conversationId}`);
  }

  @SubscribeMessage('message.typing')
  onTyping(@MessageBody() payload: { conversationId: string }, @ConnectedSocket() socket: Socket): void {
    const { userId } = socket.data as SocketData;
    socket.to(`conversation:${payload.conversationId}`).emit('message.typing', { ...payload, userId });
  }
}
