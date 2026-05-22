import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import Header from '../../components/Layout/Header';
import { Task } from '../../types';
import PriorityBadge from '../../components/UI/PriorityBadge';
import TaskModal from '../../components/Kanban/TaskModal';
import { format, isAfter } from 'date-fns';
import { CheckCircle2, Circle, Clock, Filter } from 'lucide-react';

type FilterType = 'all' | 'active' | 'completed' | 'overdue';

export default function MyTasksPage() {
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const { data: tasks = [], refetch } = useQuery<Task[]>({
    queryKey: ['my-tasks'],
    queryFn: () => api.get('/tasks/my').then(r => r.data),
  });

  const filtered = tasks.filter(t => {
    if (filter === 'active') return !t.completedAt;
    if (filter === 'completed') return !!t.completedAt;
    if (filter === 'overdue') return t.dueDate && !t.completedAt && isAfter(new Date(), new Date(t.dueDate));
    return true;
  });

  const filterBtns: { key: FilterType; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: tasks.length },
    { key: 'active', label: 'Active', count: tasks.filter(t => !t.completedAt).length },
    { key: 'completed', label: 'Completed', count: tasks.filter(t => !!t.completedAt).length },
    { key: 'overdue', label: 'Overdue', count: tasks.filter(t => t.dueDate && !t.completedAt && isAfter(new Date(), new Date(t.dueDate))).length },
  ];

  return (
    <div>
      <Header title="My Tasks" />
      <div className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <Filter size={16} className="text-gray-400" />
          {filterBtns.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f.key ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {f.label} <span className="ml-1 opacity-70">({f.count})</span>
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <CheckCircle2 size={48} className="mx-auto mb-4 opacity-30" />
            <p>No tasks found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(task => {
              const overdue = task.dueDate && !task.completedAt && isAfter(new Date(), new Date(task.dueDate));
              return (
                <div
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className="card p-4 flex items-center gap-4 cursor-pointer hover:border-primary-200 hover:shadow-md transition-all"
                >
                  <div className="shrink-0">
                    {task.completedAt
                      ? <CheckCircle2 size={20} className="text-green-500" />
                      : <Circle size={20} className="text-gray-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${task.completedAt ? 'line-through text-gray-400' : ''}`}>{task.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{task.project?.name} · {task.column?.name}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <PriorityBadge priority={task.priority} />
                    {task.dueDate && (
                      <span className={`flex items-center gap-1 text-xs ${overdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                        <Clock size={12} />
                        {format(new Date(task.dueDate), 'MMM d')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedTask && (
        <TaskModal
          open={!!selectedTask}
          onClose={() => setSelectedTask(null)}
          task={selectedTask}
          projectId={selectedTask.projectId}
          onSuccess={() => { setSelectedTask(null); refetch(); }}
        />
      )}
    </div>
  );
}
