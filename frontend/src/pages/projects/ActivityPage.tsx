import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Activity, Filter, User, Tag, Calendar } from 'lucide-react';
import api from '../../api/client';
import Header from '../../components/Layout/Header';
import { format } from 'date-fns';

interface ActivityLog {
  id: string;
  action: string;
  message: string;
  user: { id: string; name: string };
  task: { id: string; title: string } | null;
  createdAt: string;
}

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'CREATED', label: 'Created' },
  { value: 'UPDATED', label: 'Updated' },
  { value: 'MOVED', label: 'Moved' },
  { value: 'DELETED', label: 'Deleted' },
  { value: 'COMMENTED', label: 'Commented' },
];

const ACTION_COLORS: Record<string, string> = {
  CREATED: 'bg-green-100 text-green-700',
  UPDATED: 'bg-blue-100 text-blue-700',
  MOVED: 'bg-amber-100 text-amber-700',
  DELETED: 'bg-red-100 text-red-700',
  COMMENTED: 'bg-purple-100 text-purple-700',
};

const ACTION_DOTS: Record<string, string> = {
  CREATED: 'bg-green-500',
  UPDATED: 'bg-blue-500',
  MOVED: 'bg-amber-500',
  DELETED: 'bg-red-500',
  COMMENTED: 'bg-purple-500',
};

export default function ActivityPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const { data: members = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['activity-members', projectId],
    queryFn: () => api.get(`/activity/project/${projectId}/members`).then(r => r.data),
  });

  const params = new URLSearchParams();
  if (filterUser) params.set('userId', filterUser);
  if (filterAction) params.set('action', filterAction);
  if (filterFrom) params.set('from', filterFrom);
  if (filterTo) params.set('to', filterTo);
  params.set('limit', '100');

  const { data: logs = [], isLoading } = useQuery<ActivityLog[]>({
    queryKey: ['activity', projectId, filterUser, filterAction, filterFrom, filterTo],
    queryFn: () => api.get(`/activity/project/${projectId}?${params}`).then(r => r.data),
  });

  const hasFilters = filterUser || filterAction || filterFrom || filterTo;

  // Group by date
  const grouped: Record<string, ActivityLog[]> = {};
  logs.forEach(log => {
    const day = format(new Date(log.createdAt), 'yyyy-MM-dd');
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(log);
  });

  return (
    <div>
      <Header title="Activity Feed" />
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Back */}
        <button onClick={() => navigate(`/projects/${projectId}`)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800">
          <ArrowLeft size={16} /> Back to Board
        </button>

        {/* Filters */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-gray-600">
            <Filter size={15} /> Filters
            {hasFilters && (
              <button onClick={() => { setFilterUser(''); setFilterAction(''); setFilterFrom(''); setFilterTo(''); }}
                className="ml-auto text-xs text-primary-500 hover:underline font-normal">
                Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="flex items-center gap-1 text-xs text-gray-500 mb-1"><User size={11} /> Member</label>
              <select className="input text-sm" value={filterUser} onChange={e => setFilterUser(e.target.value)}>
                <option value="">All members</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1 text-xs text-gray-500 mb-1"><Tag size={11} /> Action</label>
              <select className="input text-sm" value={filterAction} onChange={e => setFilterAction(e.target.value)}>
                {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1 text-xs text-gray-500 mb-1"><Calendar size={11} /> From</label>
              <input type="date" className="input text-sm" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
            </div>
            <div>
              <label className="flex items-center gap-1 text-xs text-gray-500 mb-1"><Calendar size={11} /> To</label>
              <input type="date" className="input text-sm" value={filterTo} onChange={e => setFilterTo(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Feed */}
        {isLoading && (
          <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" /></div>
        )}

        {!isLoading && logs.length === 0 && (
          <div className="card flex flex-col items-center py-16 text-gray-400">
            <Activity size={40} className="mb-3 text-gray-200" />
            <p className="font-medium">No activity found</p>
            <p className="text-sm mt-1">{hasFilters ? 'Try adjusting your filters' : 'Activity will appear here as the team works'}</p>
          </div>
        )}

        {Object.entries(grouped).map(([day, dayLogs]) => (
          <div key={day}>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px flex-1 bg-gray-100" />
              <span className="text-xs font-semibold text-gray-400 px-2">
                {format(new Date(day), 'EEEE, MMMM d, yyyy')}
              </span>
              <div className="h-px flex-1 bg-gray-100" />
            </div>

            <div className="space-y-0">
              {dayLogs.map((log, i) => (
                <div key={log.id} className="flex gap-4 group">
                  <div className="flex flex-col items-center pt-1">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${ACTION_DOTS[log.action] ?? 'bg-gray-300'}`} />
                    {i < dayLogs.length - 1 && <div className="w-px flex-1 bg-gray-100 mt-1" />}
                  </div>
                  <div className="pb-4 flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      <div className="w-6 h-6 rounded-full bg-primary-500 text-white text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">
                        {log.user.name.charAt(0)}
                      </div>
                      <p className="text-sm text-gray-700 flex-1">{log.message}</p>
                      <span className={`badge text-xs shrink-0 ${ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-600'}`}>
                        {log.action}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 ml-8 mt-0.5">{format(new Date(log.createdAt), 'HH:mm')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
