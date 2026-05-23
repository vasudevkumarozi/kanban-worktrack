import { useState, useEffect } from 'react';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import api from '../../api/client';
import { Task, Column, Project } from '../../types';
import KanbanColumn from './KanbanColumn';
import TaskModal from './TaskModal';
import Modal from '../UI/Modal';
import { useAuthStore } from '../../store/auth.store';
import { getSocket } from '../../hooks/useSocket';
import toast from 'react-hot-toast';

interface Props { project: Project }

export default function KanbanBoard({ project }: Props) {
  const qc = useQueryClient();
  const { isManager } = useAuthStore();
  const [addTaskCol, setAddTaskCol] = useState<string | null>(null);
  const [addColOpen, setAddColOpen] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);

  // Always target "To Do" column (or first column as fallback)
  const todoColumn = project.columns?.find(c => c.name.toLowerCase() === 'to do') ?? project.columns?.[0];

  const { data: fetchedTasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks', project.id],
    queryFn: () => api.get(`/tasks/project/${project.id}?limit=500`).then(r => r.data.tasks ?? r.data),
  });

  useEffect(() => { setTasks(fetchedTasks); }, [fetchedTasks]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit('join:project', project.id);

    const onTaskCreated = (t: Task) => setTasks(prev => [...prev, t]);
    const onTaskUpdated = (t: Task) => setTasks(prev => prev.map(x => x.id === t.id ? t : x));
    const onTaskMoved = (t: Task) => setTasks(prev => prev.map(x => x.id === t.id ? t : x));
    const onTaskDeleted = ({ id }: { id: string }) => setTasks(prev => prev.filter(x => x.id !== id));

    socket.on('task:created', onTaskCreated);
    socket.on('task:updated', onTaskUpdated);
    socket.on('task:moved', onTaskMoved);
    socket.on('task:deleted', onTaskDeleted);

    return () => {
      socket.emit('leave:project', project.id);
      socket.off('task:created', onTaskCreated);
      socket.off('task:updated', onTaskUpdated);
      socket.off('task:moved', onTaskMoved);
      socket.off('task:deleted', onTaskDeleted);
    };
  }, [project.id]);

  const moveMutation = useMutation({
    mutationFn: ({ taskId, columnId, order }: { taskId: string; columnId: string; order: number }) =>
      api.patch(`/tasks/${taskId}/move`, { columnId, order }),
    onError: () => { qc.invalidateQueries({ queryKey: ['tasks', project.id] }); toast.error('Failed to move task'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', project.id] }),
  });

  const addColMutation = useMutation({
    mutationFn: () => api.post('/columns', { name: newColName, projectId: project.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', project.id] });
      setAddColOpen(false);
      setNewColName('');
      toast.success('Column added');
    },
  });

  const onDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    setTasks(prev => {
      const updated = prev.map(t =>
        t.id === draggableId
          ? { ...t, columnId: destination.droppableId, order: destination.index }
          : t
      );
      return updated;
    });

    moveMutation.mutate({ taskId: draggableId, columnId: destination.droppableId, order: destination.index });
  };

  const columns = project.columns || [];

  return (
    <div>
      {/* Board header toolbar */}
      <div className="flex items-center justify-between mb-5 pb-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-500">
            {tasks.length} task{tasks.length !== 1 ? 's' : ''} across {columns.length} columns
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isManager() && (
            <>
              <button
                onClick={() => setAddColOpen(true)}
                className="btn-secondary flex items-center gap-1.5 text-sm"
              >
                <Plus size={15} />
                Add Column
              </button>
              <button
                onClick={() => todoColumn && setAddTaskCol(todoColumn.id)}
                disabled={!todoColumn}
                className="btn-primary flex items-center gap-1.5 text-sm"
              >
                <Plus size={15} />
                Add Task
              </button>
            </>
          )}
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 items-start">
          {columns.map((col: Column) => {
            const colTasks = tasks
              .filter(t => t.columnId === col.id)
              .sort((a, b) => a.order - b.order);
            return (
              <KanbanColumn
                key={col.id}
                column={col}
                tasks={colTasks}
                onAddTask={() => setAddTaskCol(col.id)}
                onUpdate={() => qc.invalidateQueries({ queryKey: ['tasks', project.id] })}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
            );
          })}

          {/* Empty drop target hint at end */}
        </div>
      </DragDropContext>

      <TaskModal
        open={!!addTaskCol}
        onClose={() => setAddTaskCol(null)}
        projectId={project.id}
        columnId={addTaskCol || undefined}
        onSuccess={() => { setAddTaskCol(null); qc.invalidateQueries({ queryKey: ['tasks', project.id] }); }}
      />

      <Modal open={addColOpen} onClose={() => setAddColOpen(false)} title="Add Column" size="sm">
        <div className="space-y-4">
          <input className="input" value={newColName} onChange={e => setNewColName(e.target.value)} placeholder="Column name" />
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setAddColOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={() => addColMutation.mutate()} disabled={!newColName || addColMutation.isPending}>
              Add Column
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
