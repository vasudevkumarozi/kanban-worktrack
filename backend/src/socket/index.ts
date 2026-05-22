import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

let io: Server;

export const setupSocket = (socketIO: Server) => {
  io = socketIO;

  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string; role: string };
      (socket as any).user = decoded;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user;
    socket.join(user.id);

    socket.on('join:project', (projectId: string) => {
      socket.join(projectId);
    });

    socket.on('leave:project', (projectId: string) => {
      socket.leave(projectId);
    });

    socket.on('disconnect', () => {});
  });
};

export const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};
