import { Droppable } from '@hello-pangea/dnd';
import { Plus } from 'lucide-react';
import { Column, Task } from '../../types';
import TaskCard from './TaskCard';
import { useAuthStore } from '../../store/auth.store';

interface Props {
  column: Column;
  tasks: Task[];
  onAddTask: () => void;
  onUpdate: () => void;
  onDelete: (id: string) => void;
}

export default function KanbanColumn({ column, tasks, onAddTask, onUpdate, onDelete }: Props) {
  const { isManager } = useAuthStore();

  return (
    <div className="flex-shrink-0 w-72">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: column.color || '#AC2660' }} />
          <h3 className="text-sm font-semibold text-gray-700">{column.name}</h3>
          <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 font-medium">{tasks.length}</span>
        </div>
        {isManager() && (
          <button onClick={onAddTask} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-primary-500 transition-colors">
            <Plus size={16} />
          </button>
        )}
      </div>

      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`min-h-[200px] rounded-xl p-2 space-y-2 transition-colors ${snapshot.isDraggingOver ? 'bg-primary-50 ring-2 ring-primary-200' : 'bg-gray-100'}`}
          >
            {tasks.map((task, index) => (
              <TaskCard key={task.id} task={task} index={index} onUpdate={onUpdate} onDelete={onDelete} />
            ))}
            {provided.placeholder}
            {tasks.length === 0 && !snapshot.isDraggingOver && (
              <div className="flex flex-col items-center justify-center h-20 text-gray-400 text-xs">
                <p>No tasks</p>
              </div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
}
