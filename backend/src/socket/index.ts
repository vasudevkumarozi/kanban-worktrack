import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';

let io: Server;

/** Minimal cookie parser — avoids adding an extra dependency to socket middleware */
function parseCookies(cookieHeader: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  }
  return out;
}

export const setupSocket = (socketIO: Server) => {
  io = socketIO;

  io.use((socket: Socket, next) => {
    // Try in-memory token passed by frontend (for cross-origin socket connections),
    // then fall back to the httpOnly accessToken cookie (same-origin connections).
    const cookies = parseCookies(socket.handshake.headers.cookie ?? '');
    const token: string | undefined =
      socket.handshake.auth?.token ?? cookies.accessToken;

    if (!token) return next(new Error('Authentication required'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string; role: string };
      (socket as any).user = decoded;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // Per-socket event rate limiting: track join:project call counts.
  // A sliding 10-second window; disconnect the socket on sustained abuse.
  interface RateBucket { count: number; resetAt: number }
  const joinBuckets = new Map<string, RateBucket>();
  const MAX_JOINS_PER_WINDOW = 20;
  const JOIN_WINDOW_MS = 10_000;

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user as { id: string; role: string };
    socket.join(user.id);

    socket.on('join:project', async (projectId: string) => {
      // ── Socket-level rate limit ───────────────────────────────────────────
      const now = Date.now();
      const bucket = joinBuckets.get(socket.id) ?? { count: 0, resetAt: now + JOIN_WINDOW_MS };
      if (now > bucket.resetAt) { bucket.count = 0; bucket.resetAt = now + JOIN_WINDOW_MS; }
      bucket.count++;
      joinBuckets.set(socket.id, bucket);
      if (bucket.count > MAX_JOINS_PER_WINDOW) {
        socket.emit('error', { code: 'RATE_LIMITED', message: 'Too many join requests' });
        socket.disconnect(true);
        return;
      }
      // ── Membership check ─────────────────────────────────────────────────
      // Managers and admins can listen to any project room
      if (user.role === 'SUPER_ADMIN' || user.role === 'MANAGER') {
        socket.join(projectId);
        return;
      }
      // Employees must be verified project members before joining
      const member = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: user.id } },
      });
      if (member) socket.join(projectId);
    });

    socket.on('leave:project', (projectId: string) => {
      socket.leave(projectId);
    });

    socket.on('disconnect', () => {
      joinBuckets.delete(socket.id);
    });
  });
};

export const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};
