import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, UserPlus, Trash2, FileUp, Zap, Activity } from 'lucide-react';
import api from '../../api/client';
import { Project, User } from '../../types';
import Header from '../../components/Layout/Header';
import KanbanBoard from '../../components/Kanban/KanbanBoard';
import Modal from '../../components/UI/Modal';
import ImportTasksModal from '../../components/Kanban/ImportTasksModal';
import { useAuthStore } from '../../store/auth.store';
import toast from 'react-hot-toast';

export default function ProjectBoard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isManager, isAdmin } = useAuthStore();
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ['project', id],
    queryFn: () => api.get(`/projects/${id}`).then(r => r.data),
  });

  const { data: allUsers = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
    enabled: addMemberOpen,
  });

  const addMemberMutation = useMutation({
    mutationFn: () => api.post(`/projects/${id}/members`, { userId: selectedUserId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', id] });
      setAddMemberOpen(false);
      toast.success('Member added');
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => api.delete(`/projects/${id}/members/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', id] }),
  });

  const deleteProjectMutation = useMutation({
    mutationFn: () => api.delete(`/projects/${id}`),
    onSuccess: () => { navigate('/projects'); toast.success('Project deleted'); },
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" /></div>;
  if (!project) return <div className="p-6 text-red-500">Project not found</div>;

  const nonMembers = allUsers.filter(u => !project.members.find(m => m.user.id === u.id));

  return (
    <div>
      <Header />
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/projects')} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{project.name}</h1>
            {project.description && <p className="text-sm text-gray-400 mt-0.5">{project.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2 mr-2">
              {project.members.slice(0, 5).map(m => (
                <div key={m.user.id} className="w-8 h-8 rounded-full bg-primary-500 text-white text-sm flex items-center justify-center font-bold border-2 border-white" title={m.user.name}>
                  {m.user.name.charAt(0)}
                </div>
              ))}
              {project.members.length > 5 && (
                <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 text-xs flex items-center justify-center font-bold border-2 border-white">
                  +{project.members.length - 5}
                </div>
              )}
            </div>
            {isManager() && (
              <>
                <button onClick={() => navigate(`/projects/${id}/activity`)} className="btn-secondary flex items-center gap-1.5 text-sm">
                  <Activity size={15} />
                  Activity
                </button>
                <button onClick={() => navigate(`/projects/${id}/sprints`)} className="btn-secondary flex items-center gap-1.5 text-sm">
                  <Zap size={15} />
                  Sprints
                </button>
                <button onClick={() => setImportOpen(true)} className="btn-secondary flex items-center gap-1.5 text-sm">
                  <FileUp size={15} />
                  Import Tasks
                </button>
                <button onClick={() => setAddMemberOpen(true)} className="btn-secondary flex items-center gap-1.5 text-sm">
                  <UserPlus size={15} />
                  Add Member
                </button>
                {isAdmin() && (
                  <button onClick={() => { if (confirm('Delete project?')) deleteProjectMutation.mutate(); }} className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg">
                    <Trash2 size={18} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <KanbanBoard project={project} />
      </div>

      <Modal open={addMemberOpen} onClose={() => setAddMemberOpen(false)} title="Add Team Member">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Select User</label>
            <select className="input" value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)}>
              <option value="">Choose a user...</option>
              {nonMembers.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">Current Members</h3>
            <div className="space-y-2">
              {project.members.map(m => (
                <div key={m.user.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary-500 text-white text-xs flex items-center justify-center font-bold">
                      {m.user.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{m.user.name}</p>
                      <p className="text-xs text-gray-400">{m.user.role}</p>
                    </div>
                  </div>
                  {isManager() && m.user.role !== 'MANAGER' && (
                    <button onClick={() => removeMemberMutation.mutate(m.user.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setAddMemberOpen(false)}>Close</button>
            <button className="btn-primary" onClick={() => addMemberMutation.mutate()} disabled={!selectedUserId || addMemberMutation.isPending}>
              Add Member
            </button>
          </div>
        </div>
      </Modal>

      {id && (
        <ImportTasksModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          projectId={id}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['tasks', id] })}
        />
      )}
    </div>
  );
}
