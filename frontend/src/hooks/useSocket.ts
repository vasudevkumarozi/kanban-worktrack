import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/auth.store';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? '/';

let socketInstance: Socket | null = null;

export const useSocket = () => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    // accessToken is the in-memory short-lived JWT (not from localStorage).
    // It is required for cross-origin socket.io connections.
    // Same-origin connections also fall back to the httpOnly cookie automatically.
    if (!accessToken) return;

    if (!socketInstance) {
      socketInstance = io(SOCKET_URL, {
        auth: { token: accessToken }, // for cross-origin; server also reads cookie
        withCredentials: true,
        transports: ['websocket'],
      });
    }
    socketRef.current = socketInstance;
    return () => {};
  }, [accessToken]);

  return socketRef.current;
};

export const getSocket = () => socketInstance;

export const disconnectSocket = () => {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
};
