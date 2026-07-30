import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@sc/shared';

/**
 * The only way another module reaches the socket layer — nothing outside
 * `realtime` imports the gateway or the `Server` instance directly. Set once
 * from the gateway's `afterInit`, so this stays a no-op (never throws) if a
 * job runs before the gateway has finished booting.
 */
@Injectable()
export class SocketEmitterService {
  private server: Server<ClientToServerEvents, ServerToClientEvents> | null = null;

  setServer(server: Server<ClientToServerEvents, ServerToClientEvents>): void {
    this.server = server;
  }

  emitToUser<E extends keyof ServerToClientEvents>(
    userId: string,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void {
    this.server?.to(`user:${userId}`).emit(event, ...args);
  }

  emitToMatch<E extends keyof ServerToClientEvents>(
    matchId: string,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void {
    this.server?.to(`match:${matchId}`).emit(event, ...args);
  }

  emitToConversation<E extends keyof ServerToClientEvents>(
    conversationId: string,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void {
    this.server?.to(`conversation:${conversationId}`).emit(event, ...args);
  }
}
