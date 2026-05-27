import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, X, Users, Plus, Trash2, Upload, FileText, Image, File, CheckSquare, Activity } from 'lucide-react';
import Modal from '../UI/Modal';
import MentionInput from '../UI/MentionInput';
import api from '../../api/client';
import { Task, User, Comment, Subtask, Attachment } from '../../types';
import { useAuthStore } from '../../store/auth.store';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

interface Props {
  open: boolean;
  onClose: () => void;
  task?: Task;
  projectId: string;
  columnId?: string;
  onSuccess: () => void;
}

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const MAX_ASSIGNEES = 4;
// All file downloads go through the authenticated API route (no public /uploads access)
const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

type Tab = 'details' | 'subtasks' | 'attachments' | 'comments' | 'activity';

interface ActivityLog {
  id: string;
  action: string;
  message: string;
  user: { id: string; name: string };
  createdAt: string;
}

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return <Image size={16} className="text-blue-500" />;
  if (mime === 'application/pdf') return <FileText size={16} className="text-red-500" />;
  return <File size={16} className="text-gray-400" />;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TaskModal({ open, onClose, task, projectId, columnId, onSuccess }: Props) {
  const qc = useQueryClient();
  const { user, isManager } = useAuthStore();
  const isEdit = !!task;
  const fileRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<Tab>('details');
  const [form, setForm] = useState({
    title: '', description: '', priority: 'MEDIUM',
    assigneeIds: [] as string[], dueDate: '', estimatedHours: '',
  });
  const [comment, setComment] = useState('');
  const [mentionedIds, setMentionedIds] = useState<string[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [newSubtaskAssignee, setNewSubtaskAssignee] = useState('');

  useEffect(() => {
    if (task) {
      setForm({
        title: task.title,
        description: task.description || '',
        priority: task.priority,
        assigneeIds: task.assignees?.map(a => a.user.id) ?? [],
        dueDate: task.dueDate ? format(new Date(task.dueDate), 'yyyy-MM-dd') : '',
        estimatedHours: task.estimatedHours?.toString() || '',
      });
    } else {
      setForm({ title: '', description: '', priority: 'MEDIUM', assigneeIds: [], dueDate: '', estimatedHours: '' });
      setActiveTab('details');
    }
  }, [task, open]);

  const { data: members = [] } = useQuery<User[]>({
    queryKey: ['project-members', projectId],
    queryFn: () => api.get(`/projects/${projectId}`).then(r => r.data.members.map((m: { user: User }) => m.user)),
    enabled: open,
  });

  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey: ['task-comments', task?.id],
    queryFn: () => api.get(`/tasks/${task!.id}/comments`).then(r => r.data),
    enabled: !!task?.id && open,
  });

  const { data: subtasks = [], refetch: refetchSubtasks } = useQuery<Subtask[]>({
    queryKey: ['subtasks', task?.id],
    queryFn: () => api.get(`/subtasks/task/${task!.id}`).then(r => r.data),
    enabled: !!task?.id && open,
  });

  const { data: attachments = [], refetch: refetchAttachments } = useQuery<Attachment[]>({
    queryKey: ['attachments', task?.id],
    queryFn: () => api.get(`/attachments/task/${task!.id}`).then(r => r.data),
    enabled: !!task?.id && open,
  });

  const { data: activityLogs = [] } = useQuery<ActivityLog[]>({
    queryKey: ['task-activity', task?.id],
    queryFn: () => api.get(`/activity/task/${task!.id}`).then(r => r.data),
    enabled: !!task?.id && open && activeTab === 'activity',
  });

  const completedSubtasks = subtasks.filter(s => s.completed).length;
  const subtaskProgress = subtasks.length > 0 ? Math.round((completedSubtasks / subtasks.length) * 100) : 0;

  const saveMutation = useMutation({
    mutationFn: () => isEdit
      ? api.put(`/tasks/${task!.id}`, { ...form, dueDate: form.dueDate || null, estimatedHours: form.estimatedHours ? parseFloat(form.estimatedHours) : null })
      : api.post('/tasks', { ...form, projectId, columnId, dueDate: form.dueDate || null, estimatedHours: form.estimatedHours ? parseFloat(form.estimatedHours) : null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks', projectId] }); toast.success(isEdit ? 'Task updated' : 'Task created'); onSuccess(); },
    onError: () => toast.error('Failed to save task'),
  });

  const commentMutation = useMutation({
    mutationFn: () => api.post(`/tasks/${task!.id}/comments`, { content: comment, mentionedUserIds: mentionedIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-comments', task?.id] });
      qc.invalidateQueries({ queryKey: ['task-activity', task?.id] });
      setComment('');
      setMentionedIds([]);
    },
  });

  const addSubtaskMutation = useMutation({
    mutationFn: () => api.post('/subtasks', { taskId: task!.id, title: newSubtask, assigneeId: newSubtaskAssignee || null }),
    onSuccess: () => { refetchSubtasks(); setNewSubtask(''); setNewSubtaskAssignee(''); qc.invalidateQueries({ queryKey: ['tasks', projectId] }); },
    onError: () => toast.error('Failed to add subtask'),
  });

  const toggleSubtaskMutation = useMutation({
    mutationFn: (s: Subtask) => api.patch(`/subtasks/${s.id}`, { completed: !s.completed }),
    onSuccess: () => { refetchSubtasks(); qc.invalidateQueries({ queryKey: ['tasks', projectId] }); },
  });

  const deleteSubtaskMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/subtasks/${id}`),
    onSuccess: () => { refetchSubtasks(); qc.invalidateQueries({ queryKey: ['tasks', projectId] }); },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('taskId', task!.id);
      return api.post('/attachments/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => { refetchAttachments(); toast.success('File uploaded'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Upload failed'),
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/attachments/${id}`),
    onSuccess: () => refetchAttachments(),
  });

  const addAssignee = (uid: string) => {
    if (!uid || form.assigneeIds.includes(uid) || form.assigneeIds.length >= MAX_ASSIGNEES) return;
    setForm(f => ({ ...f, assigneeIds: [...f.assigneeIds, uid] }));
  };
  const removeAssignee = (uid: string) => setForm(f => ({ ...f, assigneeIds: f.assigneeIds.filter(id => id !== uid) }));

  const isAssignee = task?.assignees?.some(a => a.user.id === user?.id);
  const canEdit = isManager() || isAssignee;
  const availableMembers = members.filter(m => !form.assigneeIds.includes(m.id));

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'details', label: 'Details' },
    ...(isEdit ? [
      { id: 'subtasks' as Tab, label: 'Checklist', count: subtasks.length },
      { id: 'attachments' as Tab, label: 'Files', count: attachments.length },
      { id: 'comments' as Tab, label: 'Comments', count: comments.length },
      { id: 'activity' as Tab, label: 'Activity' },
    ] : []),
  ];

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Task Details' : 'New Task'} size="lg">
      {isEdit && (
        <div className="flex gap-1 border-b mb-4 -mt-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === t.id ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label}{t.count !== undefined && t.count > 0 ? ` (${t.count})` : ''}
            </button>
          ))}
        </div>
      )}

      {/* DETAILS */}
      {activeTab === 'details' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Task title" disabled={!canEdit && isEdit} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea className="input min-h-[72px] resize-none" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" disabled={!canEdit && isEdit} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
              <Users size={14} /> Assignees
              <span className="text-xs font-normal text-gray-400">({form.assigneeIds.length}/{MAX_ASSIGNEES})</span>
            </label>
            {form.assigneeIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {form.assigneeIds.map(uid => {
                  const member = members.find(m => m.id === uid);
                  if (!member) return null;
                  return (
                    <div key={uid} className="flex items-center gap-1.5 bg-primary-50 border border-primary-200 text-primary-700 rounded-full pl-1.5 pr-1 py-0.5 text-xs font-medium">
                      <div className="w-4 h-4 rounded-full bg-primary-500 text-white flex items-center justify-center font-bold text-xs">{member.name.charAt(0)}</div>
                      {member.name}
                      {(isManager() || !isEdit) && <button onClick={() => removeAssignee(uid)} className="hover:bg-primary-100 rounded-full p-0.5 ml-0.5"><X size={11} /></button>}
                    </div>
                  );
                })}
              </div>
            )}
            {(isManager() || !isEdit) && form.assigneeIds.length < MAX_ASSIGNEES && (
              <select className="input text-sm" value="" onChange={e => addAssignee(e.target.value)}>
                <option value="">+ Add assignee...</option>
                {availableMembers.map(m => <option key={m.id} value={m.id}>{m.name} — {m.role}</option>)}
              </select>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select className="input" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} disabled={!canEdit && isEdit}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input type="date" className="input" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} disabled={!canEdit && isEdit} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Est. Hours</label>
              <input type="number" className="input" value={form.estimatedHours} onChange={e => setForm(f => ({ ...f, estimatedHours: e.target.value }))} placeholder="0" min="0" disabled={!canEdit && isEdit} />
            </div>
          </div>
          {canEdit && (
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn-primary" onClick={() => saveMutation.mutate()} disabled={!form.title || saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving...' : isEdit ? 'Update Task' : 'Create Task'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* CHECKLIST */}
      {activeTab === 'subtasks' && isEdit && (
        <div className="space-y-4">
          {subtasks.length > 0 && (
            <div>
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span className="flex items-center gap-1"><CheckSquare size={12} /> {completedSubtasks}/{subtasks.length} completed</span>
                <span className="font-semibold text-primary-600">{subtaskProgress}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-primary-500 h-2 rounded-full transition-all duration-300" style={{ width: `${subtaskProgress}%` }} />
              </div>
            </div>
          )}
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {subtasks.map(s => (
              <div key={s.id} className="flex items-center gap-3 group p-2 rounded-lg hover:bg-gray-50">
                <input type="checkbox" checked={s.completed} onChange={() => toggleSubtaskMutation.mutate(s)} className="w-4 h-4 rounded accent-primary-500 cursor-pointer" />
                <span className={`flex-1 text-sm ${s.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>{s.title}</span>
                {s.assignee && (
                  <div className="w-5 h-5 rounded-full bg-primary-400 text-white text-xs flex items-center justify-center font-bold shrink-0" title={s.assignee.name}>
                    {s.assignee.name.charAt(0)}
                  </div>
                )}
                <button onClick={() => deleteSubtaskMutation.mutate(s.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded text-gray-300 hover:text-red-500">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {subtasks.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No checklist items yet</p>}
          </div>
          {canEdit && (
            <div className="border-t pt-3 space-y-2">
              <input className="input text-sm" value={newSubtask} onChange={e => setNewSubtask(e.target.value)}
                placeholder="Add checklist item..." onKeyDown={e => e.key === 'Enter' && newSubtask.trim() && addSubtaskMutation.mutate()} />
              <div className="flex gap-2">
                <select className="input text-sm flex-1" value={newSubtaskAssignee} onChange={e => setNewSubtaskAssignee(e.target.value)}>
                  <option value="">Assign to... (optional)</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <button className="btn-primary flex items-center gap-1 text-sm px-3" onClick={() => addSubtaskMutation.mutate()} disabled={!newSubtask.trim() || addSubtaskMutation.isPending}>
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ATTACHMENTS */}
      {activeTab === 'attachments' && isEdit && (
        <div className="space-y-4">
          <div onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50 transition-all">
            <Upload size={24} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-500 font-medium">Click to upload a file</p>
            <p className="text-xs text-gray-400 mt-1">Images, PDFs, Docs, Spreadsheets — max 20 MB</p>
            <input ref={fileRef} type="file" className="hidden"
              accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadMutation.mutate(f); e.target.value = ''; }} />
          </div>
          {uploadMutation.isPending && (
            <div className="flex items-center gap-2 text-sm text-primary-600">
              <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /> Uploading...
            </div>
          )}
          <div className="space-y-2">
            {attachments.map(a => (
              <div key={a.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50 group">
                {fileIcon(a.mimeType)}
                <div className="flex-1 min-w-0">
                  <a href={`${API_BASE}/attachments/file/${a.filename}`} target="_blank" rel="noopener noreferrer"
                    className="text-sm font-medium text-gray-800 hover:text-primary-600 truncate block">{a.originalName}</a>
                  <p className="text-xs text-gray-400">{formatBytes(a.size)} · {a.uploadedBy.name} · {format(new Date(a.createdAt), 'MMM d, yyyy')}</p>
                </div>
                {a.mimeType.startsWith('image/') && (
                  <img src={`${API_BASE}/attachments/file/${a.filename}`} alt={a.originalName} className="w-10 h-10 rounded object-cover border border-gray-100 shrink-0" />
                )}
                <button onClick={() => deleteAttachmentMutation.mutate(a.id)} className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 rounded text-gray-300 hover:text-red-500 shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {attachments.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No files attached yet</p>}
          </div>
        </div>
      )}

      {/* COMMENTS */}
      {activeTab === 'comments' && isEdit && (
        <div className="space-y-3">
          <div className="space-y-3 max-h-72 overflow-y-auto">
            {comments.map(c => (
              <div key={c.id} className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-primary-500 text-white text-xs flex items-center justify-center font-bold shrink-0">{c.user.name.charAt(0)}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">{c.user.name}</span>
                    <span className="text-xs text-gray-400">{format(new Date(c.createdAt), 'MMM d, HH:mm')}</span>
                  </div>
                  <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">
                    {c.content.split(/(@\S+)/g).map((part, i) =>
                      part.startsWith('@')
                        ? <span key={i} className="text-primary-600 font-medium">{part}</span>
                        : <span key={i}>{part}</span>
                    )}
                  </p>
                </div>
              </div>
            ))}
            {comments.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No comments yet — type @ to mention a teammate</p>}
          </div>
          <div className="flex gap-2 pt-2 border-t">
            <MentionInput
              value={comment}
              onChange={(val, ids) => { setComment(val); setMentionedIds(ids); }}
              members={members}
              placeholder="Add a comment… type @ to mention"
              onSubmit={() => comment && commentMutation.mutate()}
            />
            <button className="btn-primary px-3 shrink-0" onClick={() => commentMutation.mutate()} disabled={!comment || commentMutation.isPending}>
              <Send size={16} />
            </button>
          </div>
          <p className="text-xs text-gray-400">Tip: type @ to mention a teammate and notify them instantly</p>
        </div>
      )}

      {/* ACTIVITY */}
      {activeTab === 'activity' && isEdit && (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {activityLogs.map((log, i) => (
            <div key={log.id} className="flex gap-3 group">
              <div className="flex flex-col items-center">
                <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-xs font-bold shrink-0">
                  {log.user.name.charAt(0)}
                </div>
                {i < activityLogs.length - 1 && <div className="w-px flex-1 bg-gray-100 mt-1" />}
              </div>
              <div className="pb-3 flex-1 min-w-0">
                <p className="text-sm text-gray-700">{log.message}</p>
                <p className="text-xs text-gray-400 mt-0.5">{format(new Date(log.createdAt), 'MMM d, yyyy · HH:mm')}</p>
              </div>
            </div>
          ))}
          {activityLogs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <Activity size={28} className="mb-2 text-gray-200" />
              <p className="text-sm">No activity yet</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
