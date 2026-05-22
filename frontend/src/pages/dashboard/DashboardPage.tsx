import { useQuery } from '@tanstack/react-query';
import { CheckCircle, Clock, AlertCircle, FolderKanban, Users, TrendingUp, CalendarClock } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useAuthStore } from '../../store/auth.store';
import Header from '../../components/Layout/Header';
import { Task, Project } from '../../types';
import PriorityBadge from '../../components/UI/PriorityBadge';
import { format } from 'date-fns';

interface DashboardData {
  dueToday: number;
  overdue: number;
  completedThisWeek: number;
  completedThisMonth: number;
  totalUsers: number;
  totalProjects: number;
  projectsProgress: { id: string; name: string; total: number; completed: number; pct: number }[];
  workload: { id: string; name: string; department?: string; activeTasks: number }[];
}

interface TrendPoint {
  date: string;
  created: number;
  completed: number;
}

const workloadColor = (n: number) => {
  if (n === 0) return 'border-gray-100 bg-gray-50';
  if (n <= 3) return 'border-green-200 bg-green-50';
  if (n <= 7) return 'border-amber-200 bg-amber-50';
  return 'border-red-200 bg-red-50';
};

const workloadTextColor = (n: number) => {
  if (n === 0) return 'text-gray-400';
  if (n <= 3) return 'text-green-700';
  if (n <= 7) return 'text-amber-700';
  return 'text-red-700';
};

export default function DashboardPage() {
  const { user, isManager } = useAuthStore();

  const { data: myTasks = [] } = useQuery<Task[]>({
    queryKey: ['my-tasks'],
    queryFn: () => api.get('/tasks/my').then(r => r.data),
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data),
  });

  const { data: dashData } = useQuery<DashboardData>({
    queryKey: ['analytics-dashboard'],
    queryFn: () => api.get('/analytics/dashboard').then(r => r.data),
    enabled: isManager(),
  });

  const { data: trendRaw = [] } = useQuery<TrendPoint[]>({
    queryKey: ['analytics-trend'],
    queryFn: () => api.get('/analytics/completion-trend?days=30').then(r => r.data),
    enabled: isManager(),
  });

  const activeTasks = myTasks.filter(t => !t.completedAt);
  const completedThisWeek = myTasks.filter(t => {
    if (!t.completedAt) return false;
    const ws = new Date(); ws.setDate(ws.getDate() - ws.getDay()); ws.setHours(0, 0, 0, 0);
    return new Date(t.completedAt) >= ws;
  });
  const overdueTasks = myTasks.filter(t => t.dueDate && !t.completedAt && new Date(t.dueDate) < new Date());

  const trendData = trendRaw.map(d => ({
    ...d,
    label: format(new Date(d.date + 'T00:00:00'), 'MMM d'),
  }));

  return (
    <div>
      <Header title="Dashboard" />
      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Welcome back, {user?.name?.split(' ')[0]} 👋</h2>
          <p className="text-gray-500 mt-1">Here's what's happening today</p>
        </div>

        {/* ── Manager Advanced Dashboard ── */}
        {isManager() && dashData && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: 'Due Today', value: dashData.dueToday, icon: CalendarClock, color: 'bg-blue-50 text-blue-600', ring: dashData.dueToday > 0 },
                { label: 'Overdue', value: dashData.overdue, icon: AlertCircle, color: 'bg-red-50 text-red-600', ring: dashData.overdue > 0 },
                { label: 'Done This Week', value: dashData.completedThisWeek, icon: CheckCircle, color: 'bg-green-50 text-green-600', ring: false },
                { label: 'Done This Month', value: dashData.completedThisMonth, icon: TrendingUp, color: 'bg-emerald-50 text-emerald-600', ring: false },
                { label: 'Active Projects', value: dashData.totalProjects, icon: FolderKanban, color: 'bg-primary-50 text-primary-600', ring: false },
                { label: 'Active Users', value: dashData.totalUsers, icon: Users, color: 'bg-purple-50 text-purple-600', ring: false },
              ].map(stat => (
                <div key={stat.label} className={`card ${stat.ring ? 'ring-2 ring-red-200' : ''}`}>
                  <div className={`w-10 h-10 rounded-xl ${stat.color} flex items-center justify-center mb-3`}>
                    <stat.icon size={20} />
                  </div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Completion Trend */}
            <div className="card">
              <h3 className="font-semibold mb-0.5">Task Completion Trend — Last 30 Days</h3>
              <p className="text-xs text-gray-400 mb-4">Daily tasks created vs completed</p>
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={trendData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v, i) => i % 6 === 0 ? v : ''}
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend iconType="circle" iconSize={8} />
                  <Line type="monotone" dataKey="created" stroke="#6366f1" strokeWidth={2} dot={false} name="Created" />
                  <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={2} dot={false} name="Completed" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Project Progress */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Project Progress</h3>
                  <Link to="/projects" className="text-xs text-primary-500 hover:underline">View all</Link>
                </div>
                {dashData.projectsProgress.length === 0
                  ? <p className="text-sm text-gray-400">No active projects</p>
                  : <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
                    {dashData.projectsProgress.map(p => (
                      <div key={p.id}>
                        <div className="flex items-center justify-between text-sm mb-1.5">
                          <Link to={`/projects/${p.id}`} className="font-medium hover:text-primary-600 truncate max-w-[200px]">{p.name}</Link>
                          <span className="text-gray-400 text-xs shrink-0 ml-2">{p.completed}/{p.total}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-primary-500 rounded-full transition-all duration-500" style={{ width: `${p.pct}%` }} />
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{p.pct}% complete</p>
                      </div>
                    ))}
                  </div>
                }
              </div>

              {/* Team Workload */}
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Team Workload</h3>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />≤3</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />4–7</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />8+</span>
                  </div>
                </div>
                {dashData.workload.length === 0
                  ? <p className="text-sm text-gray-400">No team members</p>
                  : <div className="space-y-2 max-h-72 overflow-y-auto">
                    {dashData.workload.map(u => (
                      <div key={u.id} className={`flex items-center justify-between p-2.5 rounded-lg border ${workloadColor(u.activeTasks)}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-primary-500 text-white text-xs flex items-center justify-center font-bold shrink-0">
                            {u.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className={`text-sm font-medium truncate ${workloadTextColor(u.activeTasks)}`}>{u.name}</p>
                            {u.department && <p className="text-xs text-gray-400 truncate">{u.department}</p>}
                          </div>
                        </div>
                        <div className="shrink-0 ml-3 text-right">
                          <span className={`text-xl font-bold ${workloadTextColor(u.activeTasks)}`}>{u.activeTasks}</span>
                          <p className="text-xs text-gray-400">active</p>
                        </div>
                      </div>
                    ))}
                  </div>
                }
              </div>
            </div>
          </>
        )}

        {/* ── Employee Dashboard ── */}
        {!isManager() && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div className="card">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3"><Clock size={20} /></div>
                <p className="text-2xl font-bold">{activeTasks.length}</p>
                <p className="text-xs text-gray-500 mt-1">Active Tasks</p>
              </div>
              <div className="card">
                <div className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center mb-3"><CheckCircle size={20} /></div>
                <p className="text-2xl font-bold">{completedThisWeek.length}</p>
                <p className="text-xs text-gray-500 mt-1">Done This Week</p>
              </div>
              <div className="card">
                <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center mb-3"><AlertCircle size={20} /></div>
                <p className="text-2xl font-bold">{overdueTasks.length}</p>
                <p className="text-xs text-gray-500 mt-1">Overdue</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="card">
                <h3 className="font-semibold mb-4">My Active Tasks</h3>
                {activeTasks.length === 0
                  ? <p className="text-sm text-gray-400">No active tasks — you're all caught up!</p>
                  : <div className="space-y-3">
                    {activeTasks.slice(0, 6).map(task => {
                      const isOverdue = task.dueDate && !task.completedAt && new Date(task.dueDate) < new Date();
                      return (
                        <div key={task.id} className={`flex items-center gap-3 p-3 rounded-lg ${isOverdue ? 'bg-red-50' : 'bg-gray-50'}`}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{task.title}</p>
                            <p className="text-xs text-gray-400">{task.project?.name}</p>
                          </div>
                          <PriorityBadge priority={task.priority} />
                          {task.dueDate && (
                            <span className={`text-xs shrink-0 ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                              {format(new Date(task.dueDate), 'MMM d')}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                }
              </div>

              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">My Projects ({projects.length})</h3>
                  <Link to="/projects" className="text-xs text-primary-500 hover:underline">View all</Link>
                </div>
                {projects.length === 0
                  ? <p className="text-sm text-gray-400">No projects yet</p>
                  : <div className="space-y-3">
                    {projects.slice(0, 5).map(p => (
                      <Link key={p.id} to={`/projects/${p.id}`} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                        <div className="w-8 h-8 bg-primary-100 text-primary-600 rounded-lg flex items-center justify-center text-sm font-bold shrink-0">
                          {p.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.name}</p>
                          <p className="text-xs text-gray-400">{p._count.tasks} tasks · {p.members.length} members</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                }
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
