import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, UserX, UserCheck, Key, Eye, EyeOff } from 'lucide-react';
import api from '../../api/client';
import { User, Role } from '../../types';
import Header from '../../components/Layout/Header';
import Modal from '../../components/UI/Modal';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const ROLES: Role[] = ['SUPER_ADMIN', 'MANAGER', 'EMPLOYEE'];
const roleColors: Record<string, string> = {
  SUPER_ADMIN: 'bg-red-100 text-red-700',
  MANAGER: 'bg-blue-100 text-blue-700',
  EMPLOYEE: 'bg-green-100 text-green-700',
};

interface UserForm { name: string; email: string; password: string; role: Role; department: string }

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [pwdUser, setPwdUser] = useState<User | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showCreatePwd, setShowCreatePwd] = useState(false);
  const [form, setForm] = useState<UserForm>({ name: '', email: '', password: '', role: 'EMPLOYEE', department: '' });

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/users', form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setCreateOpen(false); toast.success('User created'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  const updateMutation = useMutation({
    mutationFn: () => api.put(`/users/${editUser!.id}`, {
      name: form.name, email: form.email, role: form.role, department: form.department,
      ...(form.password ? { password: form.password } : {}),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setEditUser(null); toast.success('User updated'); },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/users/${id}/toggle-status`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const pwdMutation = useMutation({
    mutationFn: () => api.patch(`/users/${pwdUser!.id}/password`, { password: newPwd }),
    onSuccess: () => { setPwdUser(null); setNewPwd(''); toast.success('Password updated'); },
  });

  const openCreate = () => {
    setForm({ name: '', email: '', password: '', role: 'EMPLOYEE', department: '' });
    setShowCreatePwd(false);
    setCreateOpen(true);
  };

  const openEdit = (u: User) => {
    setForm({ name: u.name, email: u.email, password: '', role: u.role, department: u.department || '' });
    setShowCreatePwd(false);
    setEditUser(u);
  };

  return (
    <div>
      <Header title="User Management" />
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-gray-500">{users.length} users</p>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus size={16} />
            Add User
          </button>
        </div>

        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['User', 'Role', 'Department', 'Status', 'Joined', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && <tr><td colSpan={6} className="text-center py-8 text-gray-400">Loading...</td></tr>}
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary-500 text-white flex items-center justify-center font-bold text-sm">
                        {u.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{u.name}</p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${roleColors[u.role]}`}>{u.role.replace('_', ' ')}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{u.department || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{format(new Date(u.createdAt), 'MMM d, yyyy')}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(u)} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600" title="Edit">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => setPwdUser(u)} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-500" title="Reset Password">
                        <Key size={15} />
                      </button>
                      <button onClick={() => toggleMutation.mutate(u.id)} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-orange-500" title={u.isActive ? 'Deactivate' : 'Activate'}>
                        {u.isActive ? <UserX size={15} /> : <UserCheck size={15} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={createOpen || !!editUser} onClose={() => { setCreateOpen(false); setEditUser(null); }} title={editUser ? 'Edit User' : 'Add User'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input type="email" className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {editUser ? 'New Password' : 'Password *'}
                {editUser && <span className="text-xs text-gray-400 font-normal ml-1">(leave blank to keep current)</span>}
              </label>
              <div className="relative">
                <input
                  type={showCreatePwd ? 'text' : 'password'}
                  className="input pr-10"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder={editUser ? 'Enter new password to change' : '••••••••'}
                />
                <button type="button" onClick={() => setShowCreatePwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showCreatePwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as Role }))}>
                {ROLES.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <input className="input" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="e.g. Engineering" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => { setCreateOpen(false); setEditUser(null); }}>Cancel</button>
            <button
              className="btn-primary"
              onClick={() => editUser ? updateMutation.mutate() : createMutation.mutate()}
              disabled={!form.name || !form.email || (!editUser && !form.password)}
            >
              {editUser ? 'Update' : 'Create User'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!pwdUser} onClose={() => setPwdUser(null)} title="Reset Password" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Set new password for <strong>{pwdUser?.name}</strong></p>
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              className="input pr-10"
              value={newPwd}
              onChange={e => setNewPwd(e.target.value)}
              placeholder="New password"
            />
            <button type="button" onClick={() => setShowPwd(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setPwdUser(null)}>Cancel</button>
            <button className="btn-primary" onClick={() => pwdMutation.mutate()} disabled={!newPwd || pwdMutation.isPending}>Update Password</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
