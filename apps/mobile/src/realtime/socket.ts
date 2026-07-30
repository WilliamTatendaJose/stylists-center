import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@sc/shared';
import { BASE_URL } from '../api/client.js';
import { useAuthStore } from '../state/useAuthStore.js';

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

/**
 * Lazily creates (or reuses) the app-wide Socket.IO connection, authenticated
 * with the current access token via the handshake (read by the gateway's
 * `io.use` middleware). Websocket-only transport (plan §6) — no long-polling,
 * which causes duplicate-delivery on flaky mobile networks. Sockets are a
 * latency optimisation only; every consumer still treats the matching HTTP
 * GET as the source of truth and only uses socket events to know when to
 * refetch.
 */
export function getSocket(): AppSocket | null {
  const token = useAuthStore.getState().accessToken;
  if (!token) return null;

  if (socket && (socket.auth as { token?: string }).token === token) {
    return socket;
  }

  socket?.disconnect();
  socket = io(BASE_URL, {
    transports: ['websocket'],
    auth: { token },
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
