import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart2, TrendingUp, Clock, CheckCircle, User } from 'lucide-react';
import api from '../../api/client';
import Header from '../../components/Layout/Header';
import { EmployeeStats } from '../../types';
import { format } from 'date-fns';

type Period = 'week' | 'month' | 'all';

interface DailyPoint { date: string; assigned: number; completed: number }

function DailyChart({ data, userId }: { data: DailyPoint[]; userId?: string }) {
  const maxVal = Math.max(...data.map(d => Math.max(d.assigned, d.completed)), 1);

  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-1 min-w-max h-40 px-2">
        {data.map(d => (
          <div key={d.date} className="flex flex-col items-center gap-0.5 group">
            <div className="relative flex items-end gap-0.5 h-32">
              <div
                className="w-4 bg-primary-400 rounded-t transition-all group-hover:bg-primary-500"
                style={{ height: `${(d.assigned / maxVal) * 100}%`, minHeight: d.assigned > 0 ? '4px' : '0' }}
                title={`Assigned: ${d.assigned}`}
              />
              <div
                className="w-4 bg-emerald-400 rounded-t transition-all group-hover:bg-emerald-500"
                style={{ height: `${(d.completed / maxVal) * 100}%`, minHeight: d.completed > 0 ? '4px' : '0' }}
                title={`Completed: ${d.completed}`}
              />
            </div>
            <span className="text-xs text-gray-400 rotate-45 origin-left translate-y-3 translate-x-1 whitespace-nowrap">
              {format(new Date(d.date), 'MMM d')}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-8 px-2">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-primary-400" /><span className="text-xs text-gray-500">Assigned</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-emerald-400" /><span className="text-xs text-gray-500">Completed</span></div>
      </div>
    </div>
  );
}

const priorityColors: Record<string, string> = {
  LOW: 'bg-gray-400',
  MEDIUM: 'bg-blue-400',
  HIGH: 'bg-orange-400',
  CRITICAL: 'bg-red-500',
};

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <div className="card">
      <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center mb-3`}>
        <Icon size={20} />
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function ProgressBar({ value, max, color = 'bg-primary-500' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-10 text-right">{pct}%</span>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [period, setPeriod] = useState<Period>('month');
  const [expandedEmp, setExpandedEmp] = useState<string | null>(null);
  const [dailyDays, setDailyDays] = useState(14);
  const [dailyUser, setDailyUser] = useState('');

  const { data: overview } = useQuery({
    queryKey: ['analytics-overview', period],
    queryFn: () => api.get(`/analytics/overview?period=${period}`).then(r => r.data),
  });

  const { data: employees = [], isLoading } = useQuery<EmployeeStats[]>({
    queryKey: ['analytics-employees', period],
    queryFn: () => api.get(`/analytics/employees?period=${period}`).then(r => r.data),
  });

  const { data: empDetail } = useQuery({
    queryKey: ['analytics-employee', expandedEmp, period],
    queryFn: () => api.get(`/analytics/employee/${expandedEmp}?period=${period}`).then(r => r.data),
    enabled: !!expandedEmp,
  });

  const { data: dailyData = [] } = useQuery<DailyPoint[]>({
    queryKey: ['analytics-daily', dailyDays, dailyUser],
    queryFn: () => api.get(`/analytics/daily?days=${dailyDays}${dailyUser ? `&userId=${dailyUser}` : ''}`).then(r => r.data),
  });

  const periods: { key: Period; label: string }[] = [
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'all', label: 'All Time' },
  ];

  return (
    <div>
      <Header title="Analytics" />
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-2">
          {periods.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${period === p.key ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Day-wise chart */}
        <div className="card">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="text-lg font-semibold">Day-wise Task Activity</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                className="input py-1 text-sm w-auto"
                value={dailyUser}
                onChange={e => setDailyUser(e.target.value)}
              >
                <option value="">All Employees</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              {[7, 14, 30, 60].map(d => (
                <button
                  key={d}
                  onClick={() => setDailyDays(d)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${dailyDays === d ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
          {dailyData.every(d => d.assigned === 0 && d.completed === 0) ? (
            <p className="text-sm text-gray-400 text-center py-8">No task activity in this period</p>
          ) : (
            <DailyChart data={dailyData} />
          )}
        </div>

        {overview && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard label="Active Users" value={overview.totalUsers} icon={User} color="bg-blue-50 text-blue-600" />
            <StatCard label="Active Projects" value={overview.totalProjects} icon={BarChart2} color="bg-primary-50 text-primary-600" />
            <StatCard label="Total Tasks" value={overview.totalTasks} icon={CheckCircle} color="bg-green-50 text-green-600" />
            <StatCard label="Completed" value={overview.completedTasks} icon={TrendingUp} color="bg-emerald-50 text-emerald-600" />
            <StatCard label={`Assigned (${period})`} value={overview.assignedInPeriod} icon={Clock} color="bg-orange-50 text-orange-600" />
            <StatCard label={`Completed (${period})`} value={overview.completedInPeriod} icon={CheckCircle} color="bg-teal-50 text-teal-600" />
          </div>
        )}

        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Employee Performance</h2>
          {isLoading && <div className="text-center py-8 text-gray-400">Loading...</div>}
          <div className="space-y-3">
            {employees.map(emp => {
              const completionRate = emp.assignedInPeriod > 0 ? Math.round((emp.completedInPeriod / emp.assignedInPeriod) * 100) : 0;
              const isExpanded = expandedEmp === emp.id;

              return (
                <div key={emp.id} className="border border-gray-100 rounded-xl overflow-hidden">
                  <button
                    className="w-full p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left"
                    onClick={() => setExpandedEmp(isExpanded ? null : emp.id)}
                  >
                    <div className="w-10 h-10 rounded-full bg-primary-500 text-white flex items-center justify-center font-bold shrink-0">
                      {emp.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{emp.name}</p>
                        <span className="text-xs text-gray-400">{emp.department || 'No dept.'}</span>
                      </div>
                      <ProgressBar value={emp.completedInPeriod} max={emp.assignedInPeriod} />
                    </div>
                    <div className="grid grid-cols-4 gap-6 text-center shrink-0">
                      {[
                        { label: 'Assigned', value: emp.assignedInPeriod, color: 'text-blue-600' },
                        { label: 'Completed', value: emp.completedInPeriod, color: 'text-green-600' },
                        { label: 'Overdue', value: emp.overdue, color: 'text-red-600' },
                        { label: 'Rate', value: `${completionRate}%`, color: completionRate >= 70 ? 'text-green-600' : completionRate >= 40 ? 'text-orange-500' : 'text-red-600' },
                      ].map(stat => (
                        <div key={stat.label}>
                          <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
                          <p className="text-xs text-gray-400">{stat.label}</p>
                        </div>
                      ))}
                    </div>
                  </button>

                  {isExpanded && empDetail && (
                    <div className="p-4 bg-gray-50 border-t grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white rounded-lg p-4 border">
                        <h4 className="text-sm font-semibold mb-3">Weekly Stats</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Assigned this week</span>
                            <span className="font-medium">{empDetail.weekly.assigned}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Completed this week</span>
                            <span className="font-medium text-green-600">{empDetail.weekly.completed}</span>
                          </div>
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-4 border">
                        <h4 className="text-sm font-semibold mb-3">Monthly Stats</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Assigned this month</span>
                            <span className="font-medium">{empDetail.monthly.assigned}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Completed this month</span>
                            <span className="font-medium text-green-600">{empDetail.monthly.completed}</span>
                          </div>
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-4 border">
                        <h4 className="text-sm font-semibold mb-3">All-Time</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Total assigned</span>
                            <span className="font-medium">{empDetail.allTime.assigned}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Total completed</span>
                            <span className="font-medium text-green-600">{empDetail.allTime.completed}</span>
                          </div>
                        </div>
                      </div>

                      {emp.byPriority.length > 0 && (
                        <div className="bg-white rounded-lg p-4 border col-span-full">
                          <h4 className="text-sm font-semibold mb-3">Tasks by Priority</h4>
                          <div className="flex gap-4 flex-wrap">
                            {emp.byPriority.map(({ priority, _count }) => (
                              <div key={priority} className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${priorityColors[priority] || 'bg-gray-400'}`} />
                                <span className="text-sm text-gray-600">{priority}</span>
                                <span className="text-sm font-bold">{_count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {empDetail.recentActivity.length > 0 && (
                        <div className="bg-white rounded-lg p-4 border col-span-full">
                          <h4 className="text-sm font-semibold mb-3">Recent Activity</h4>
                          <div className="space-y-2">
                            {empDetail.recentActivity.slice(0, 5).map((log: any) => (
                              <div key={log.id} className="flex items-center gap-2 text-sm">
                                <span className={`badge text-xs ${log.action === 'CREATED' ? 'bg-green-100 text-green-700' : log.action === 'MOVED' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                  {log.action}
                                </span>
                                <span className="text-gray-600 truncate">{log.task?.title || log.entityId}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!isLoading && employees.length === 0 && (
              <p className="text-center py-8 text-gray-400">No employee data available</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
