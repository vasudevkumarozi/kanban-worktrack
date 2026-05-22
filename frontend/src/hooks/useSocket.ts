import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/auth.store';

let socketInstance: Socket | null = null;

export const useSocket = () => {
  const token = useAuthStore((s) => s.token);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) return;
    if (!socketInstance) {
      socketInstance = io('/', { auth: { token }, transports: ['websocket'] });
    }
    socketRef.current = socketInstance;
    return () => {};
  }, [token]);

  return socketRef.current;
};

export const getSocket = () => socketInstance;

export const disconnectSocket = () => {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
};
