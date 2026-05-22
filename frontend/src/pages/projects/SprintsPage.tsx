import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Zap, Target, Trash2, Play, CheckCircle, BarChart2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import api from '../../api/client';
import { Sprint, Task } from '../../types';
import Modal from '../../components/UI/Modal';
import { useAuthStore } from '../../store/auth.store';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import Header from '../../components/Layout/Header';

const statusColors: Record<string, string> = {
  PLANNING: 'bg-gray-100 text-gray-600',
  ACTIVE: 'bg-green-100 text-green-700',
  COMPLETED: 'bg-blue-100 text-blue-700',
};

const statusIcons: Record<string, React.ReactNode> = {
  PLANNING: <Target size={13} />,
  ACTIVE: <Play size={13} />,
  COMPLETED: <CheckCircle size={13} />,
};

interface SprintForm { name: string; goal: string; startDate: string; endDate: string }

export default function SprintsPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isManager } = useAuthStore();

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedSprint, setSelectedSprint] = useState<Sprint | null>(null);
  const [activeChart, setActiveChart] = useState<'burndown' | 'velocity'>('burndown');
  const [form, setForm] = useState<SprintForm>({ name: '', goal: '', startDate: '', endDate: '' });

  const { data: sprints = [], isLoading } = useQuery<Sprint[]>({
    queryKey: ['sprints', projectId],
    queryFn: () => api.get(`/sprints/project/${projectId}`).then(r => r.data),
  });

  const { data: sprintDetail } = useQuery<Sprint & { tasks: Task[] }>({
    queryKey: ['sprint-detail', selectedSprint?.id],
    queryFn: () => api.get(`/sprints/${selectedSprint!.id}`).then(r => r.data),
    enabled: !!selectedSprint,
  });

  const { data: burndown = [] } = useQuery<{ date: string; remaining: number; ideal: number }[]>({
    queryKey: ['burndown', selectedSprint?.id],
    queryFn: () => api.get(`/sprints/${selectedSprint!.id}/burndown`).then(r => r.data),
    enabled: !!selectedSprint && activeChart === 'burndown',
  });

  const { data: velocity = [] } = useQuery<{ name: string; total: number; completed: number }[]>({
    queryKey: ['velocity', projectId],
    queryFn: () => api.get(`/sprints/project/${projectId}/velocity`).then(r => r.data),
    enabled: activeChart === 'velocity',
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/sprints', { ...form, projectId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sprints', projectId] }); setCreateOpen(false); toast.success('Sprint created'); },
    onError: () => toast.error('Failed to create sprint'),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.put(`/sprints/${id}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sprints', projectId] }); toast.success('Sprint updated'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/sprints/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sprints', projectId] }); if (selectedSprint) setSelectedSprint(null); toast.success('Sprint deleted'); },
  });

  const activeSprint = sprints.find(s => s.status === 'ACTIVE');

  return (
    <div>
      <Header title="Sprint Management" />
      <div className="p-6 space-y-6">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <button onClick={() => navigate(`/projects/${projectId}`)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800">
            <ArrowLeft size={16} /> Back to Board
          </button>
          {isManager() && (
            <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2">
              <Plus size={16} /> New Sprint
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sprint List */}
          <div className="lg:col-span-1 space-y-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">All Sprints</h2>
            {isLoading && <p className="text-sm text-gray-400">Loading...</p>}
            {sprints.length === 0 && !isLoading && (
              <div className="card text-center py-8">
                <Zap size={32} className="mx-auto text-gray-200 mb-2" />
                <p className="text-sm text-gray-400">No sprints yet</p>
              </div>
            )}
            {sprints.map(s => (
              <div key={s.id}
                onClick={() => setSelectedSprint(s)}
                className={`card cursor-pointer p-4 transition-all hover:shadow-md ${selectedSprint?.id === s.id ? 'ring-2 ring-primary-400' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`badge flex items-center gap-1 ${statusColors[s.status]}`}>
                        {statusIcons[s.status]} {s.status}
                      </span>
                    </div>
                    <p className="font-semibold text-sm truncate">{s.name}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {format(new Date(s.startDate), 'MMM d')} – {format(new Date(s.endDate), 'MMM d, yyyy')}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{s._count.tasks} tasks</p>
                  </div>
                  {isManager() && (
                    <button onClick={e => { e.stopPropagation(); deleteMutation.mutate(s.id); }}
                      className="p-1.5 hover:bg-red-50 rounded text-gray-300 hover:text-red-500 shrink-0">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                {isManager() && s.status !== 'COMPLETED' && (
                  <div className="mt-3 flex gap-2">
                    {s.status === 'PLANNING' && (
                      <button onClick={e => { e.stopPropagation(); updateStatusMutation.mutate({ id: s.id, status: 'ACTIVE' }); }}
                        className="text-xs btn-primary py-1 px-2 flex items-center gap-1" disabled={!!activeSprint && activeSprint.id !== s.id}>
                        <Play size={11} /> Start Sprint
                      </button>
                    )}
                    {s.status === 'ACTIVE' && (
                      <button onClick={e => { e.stopPropagation(); updateStatusMutation.mutate({ id: s.id, status: 'COMPLETED' }); }}
                        className="text-xs btn-secondary py-1 px-2 flex items-center gap-1">
                        <CheckCircle size={11} /> Complete
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Right panel: Charts + Tasks */}
          <div className="lg:col-span-2 space-y-4">
            {selectedSprint ? (
              <>
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-bold text-lg">{selectedSprint.name}</h2>
                      {selectedSprint.goal && <p className="text-sm text-gray-500 mt-0.5">{selectedSprint.goal}</p>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setActiveChart('burndown')}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${activeChart === 'burndown' ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        Burndown
                      </button>
                      <button onClick={() => setActiveChart('velocity')}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${activeChart === 'velocity' ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        Velocity
                      </button>
                    </div>
                  </div>

                  {activeChart === 'burndown' && (
                    <>
                      <p className="text-xs text-gray-400 mb-3">Tasks remaining vs ideal burndown</p>
                      {burndown.length > 0 ? (
                        <ResponsiveContainer width="100%" height={220}>
                          <LineChart data={burndown}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                            <Tooltip />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Line type="monotone" dataKey="remaining" stroke="#AC2660" strokeWidth={2} dot={false} name="Remaining" />
                            <Line type="monotone" dataKey="ideal" stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="5 5" dot={false} name="Ideal" />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-40 text-sm text-gray-400">
                          No data yet — sprint hasn't started or has no tasks
                        </div>
                      )}
                    </>
                  )}

                  {activeChart === 'velocity' && (
                    <>
                      <p className="text-xs text-gray-400 mb-3">Completed tasks per sprint</p>
                      {velocity.length > 0 ? (
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={velocity}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                            <Tooltip />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar dataKey="total" fill="#f4b3cb" name="Total Tasks" radius={[4,4,0,0]} />
                            <Bar dataKey="completed" fill="#AC2660" name="Completed" radius={[4,4,0,0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex items-center justify-center h-40 text-sm text-gray-400">
                          No completed sprints yet
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Task list */}
                <div className="card">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <BarChart2 size={16} className="text-primary-500" />
                    Tasks in Sprint
                    <span className="text-xs font-normal text-gray-400">({sprintDetail?.tasks?.length ?? 0})</span>
                  </h3>
                  {sprintDetail?.tasks?.length === 0 && <p className="text-sm text-gray-400">No tasks assigned to this sprint</p>}
                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {sprintDetail?.tasks?.map(t => (
                      <div key={t.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${t.completedAt ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <span className={`flex-1 text-sm ${t.completedAt ? 'line-through text-gray-400' : 'text-gray-700'}`}>{t.title}</span>
                        <span className="text-xs text-gray-400">{t.column.name}</span>
                        {t.assignees?.[0] && (
                          <div className="w-6 h-6 rounded-full bg-primary-500 text-white text-xs flex items-center justify-center font-bold shrink-0" title={t.assignees[0].user.name}>
                            {t.assignees[0].user.name.charAt(0)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="card flex flex-col items-center justify-center py-16 text-center">
                <Zap size={40} className="text-gray-200 mb-3" />
                <p className="text-gray-500 font-medium">Select a sprint</p>
                <p className="text-sm text-gray-400 mt-1">Click a sprint on the left to view its charts and tasks</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Sprint Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Sprint" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sprint Name *</label>
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Sprint 1" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Goal</label>
            <textarea className="input resize-none" rows={2} value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))} placeholder="What do you want to achieve?" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
              <input type="date" className="input" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
              <input type="date" className="input" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={() => createMutation.mutate()}
              disabled={!form.name || !form.startDate || !form.endDate || createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Sprint'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
