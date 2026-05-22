import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, FolderKanban, Users, CheckSquare, FileUp } from 'lucide-react';
import api from '../../api/client';
import { Project } from '../../types';
import Header from '../../components/Layout/Header';
import Modal from '../../components/UI/Modal';
import ImportTasksModal from '../../components/Kanban/ImportTasksModal';
import { useAuthStore } from '../../store/auth.store';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function ProjectsPage() {
  const qc = useQueryClient();
  const { isManager } = useAuthStore();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [importProjectId, setImportProjectId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/projects', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      setCreateOpen(false);
      setForm({ name: '', description: '' });
      toast.success('Project created!');
    },
    onError: () => toast.error('Failed to create project'),
  });

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-700',
    ARCHIVED: 'bg-gray-100 text-gray-600',
    COMPLETED: 'bg-blue-100 text-blue-700',
  };

  return (
    <div>
      <Header title="Projects" />
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-gray-500">{projects.length} projects</p>
          {isManager() && (
            <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2">
              <Plus size={16} />
              New Project
            </button>
          )}
        </div>

        {isLoading && <div className="text-center py-12 text-gray-400">Loading...</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(p => (
            <div
              key={p.id}
              onClick={() => navigate(`/projects/${p.id}`)}
              className="card hover:shadow-lg hover:border-primary-200 transition-all group cursor-pointer"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-primary-100 text-primary-600 rounded-xl flex items-center justify-center text-lg font-bold">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <span className={`badge ${statusColors[p.status] || 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
              </div>

              <h3 className="font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">{p.name}</h3>
              {p.description && <p className="text-sm text-gray-400 mt-1 line-clamp-2">{p.description}</p>}

              <div className="mt-4 flex items-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1"><CheckSquare size={13} />{p._count.tasks} tasks</span>
                <span className="flex items-center gap-1"><Users size={13} />{p.members.length} members</span>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <div className="flex -space-x-2">
                  {p.members.slice(0, 4).map(m => (
                    <div key={m.user.id} className="w-7 h-7 rounded-full bg-primary-500 text-white text-xs flex items-center justify-center font-bold border-2 border-white" title={m.user.name}>
                      {m.user.name.charAt(0)}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  {isManager() && (
                    <button
                      onClick={e => { e.stopPropagation(); setImportProjectId(p.id); }}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary-600 hover:bg-primary-50 px-2 py-1 rounded-lg transition-colors"
                      title="Import tasks from spreadsheet"
                    >
                      <FileUp size={13} />
                      Import
                    </button>
                  )}
                  <span className="text-xs text-gray-400">{format(new Date(p.createdAt), 'MMM d, yyyy')}</span>
                </div>
              </div>
            </div>
          ))}

          {!isLoading && projects.length === 0 && (
            <div className="col-span-full text-center py-16 text-gray-400">
              <FolderKanban size={48} className="mx-auto mb-4 opacity-30" />
              <p className="font-medium">No projects yet</p>
              {isManager() && <p className="text-sm mt-1">Create your first project to get started</p>}
            </div>
          )}
        </div>
      </div>

      {importProjectId && (
        <ImportTasksModal
          open={!!importProjectId}
          onClose={() => setImportProjectId(null)}
          projectId={importProjectId}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['projects'] })}
        />
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Project">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Website Redesign" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea className="input min-h-[80px]" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What is this project about?" />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={() => createMutation.mutate()} disabled={!form.name || createMutation.isPending}>
              Create Project
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
