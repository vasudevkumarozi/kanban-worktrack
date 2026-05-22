import { useState } from 'react';
import { Draggable } from '@hello-pangea/dnd';
import { MessageSquare, Calendar, Clock, Pencil, Trash2, CheckSquare } from 'lucide-react';
import { Task } from '../../types';
import PriorityBadge from '../UI/PriorityBadge';
import { format, isAfter } from 'date-fns';
import { useAuthStore } from '../../store/auth.store';
import TaskModal from './TaskModal';

interface Props {
  task: Task;
  index: number;
  onUpdate: () => void;
  onDelete?: (id: string) => void;
}

export default function TaskCard({ task, index, onUpdate, onDelete }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const { isManager } = useAuthStore();
  const overdue = task.dueDate && !task.completedAt && isAfter(new Date(), new Date(task.dueDate));
  const subtaskTotal = task._count?.subtasks ?? 0;

  return (
    <>
      <Draggable draggableId={task.id} index={index}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className={`bg-white rounded-xl border p-3 shadow-sm cursor-grab active:cursor-grabbing transition-shadow group
              ${snapshot.isDragging ? 'shadow-lg ring-2 ring-primary-400' : 'hover:shadow-md'}
              ${overdue ? 'border-red-200' : 'border-gray-100'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-gray-900 leading-snug flex-1">{task.title}</p>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button onClick={() => setEditOpen(true)} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600">
                  <Pencil size={12} />
                </button>
                {isManager() && onDelete && (
                  <button onClick={() => onDelete(task.id)} className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500">
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>

            <div className="mt-2">
              <PriorityBadge priority={task.priority} />
            </div>

            {task.description && (
              <p className="text-xs text-gray-400 mt-2 line-clamp-2">{task.description}</p>
            )}

            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {task.assignees?.length > 0 && (
                  <div className="flex -space-x-1.5">
                    {task.assignees.slice(0, 4).map(a => (
                      <div
                        key={a.user.id}
                        className="w-6 h-6 rounded-full bg-primary-500 text-white text-xs flex items-center justify-center font-bold border-2 border-white"
                        title={a.user.name}
                      >
                        {a.user.name.charAt(0).toUpperCase()}
                      </div>
                    ))}
                  </div>
                )}
                {task._count.comments > 0 && (
                  <span className="flex items-center gap-0.5 text-xs text-gray-400">
                    <MessageSquare size={12} />
                    {task._count.comments}
                  </span>
                )}
                {subtaskTotal > 0 && (
                  <span className="flex items-center gap-0.5 text-xs text-gray-400">
                    <CheckSquare size={12} />
                    {subtaskTotal}
                  </span>
                )}
                {task.estimatedHours && (
                  <span className="flex items-center gap-0.5 text-xs text-gray-400">
                    <Clock size={12} />
                    {task.estimatedHours}h
                  </span>
                )}
              </div>
              {task.dueDate && (
                <span className={`flex items-center gap-0.5 text-xs ${overdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                  <Calendar size={12} />
                  {format(new Date(task.dueDate), 'MMM d')}
                </span>
              )}
            </div>
          </div>
        )}
      </Draggable>

      <TaskModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        task={task}
        projectId={task.projectId}
        onSuccess={() => { setEditOpen(false); onUpdate(); }}
      />
    </>
  );
}
