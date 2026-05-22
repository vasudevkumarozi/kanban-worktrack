import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useSocket } from '../../hooks/useSocket';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getSocket } from '../../hooks/useSocket';

export default function AppLayout() {
  useSocket();
  const qc = useQueryClient();

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onNotif = (data: { type: string; task?: { title: string } }) => {
      if (data.type === 'TASK_ASSIGNED') {
        toast.success(`New task assigned: ${data.task?.title || 'a task'}`);
      }
      qc.invalidateQueries({ queryKey: ['notifications'] });
    };

    socket.on('notification', onNotif);
    return () => { socket.off('notification', onNotif); };
  }, [qc]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
