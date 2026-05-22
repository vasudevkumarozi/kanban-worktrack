import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Download, Filter, RefreshCw, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import api from '../../api/client';
import Header from '../../components/Layout/Header';
import { User, Project, Priority } from '../../types';
import PriorityBadge from '../../components/UI/PriorityBadge';

interface ReportTask {
  id: string;
  title: string;
  project: string;
  column: string;
  priority: string;
  assignees: string;
  status: 'Active' | 'Completed' | 'Overdue';
  dueDate: string;
  completedAt: string;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  Completed: 'bg-green-100 text-green-700',
  Overdue: 'bg-red-100 text-red-700',
  Active: 'bg-blue-100 text-blue-700',
};

export default function ReportsPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [projectId, setProjectId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState('');
  const [status, setStatus] = useState('');
  const [generated, setGenerated] = useState(false);

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data),
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
  });

  const buildParams = () => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (projectId) p.set('projectId', projectId);
    if (assigneeId) p.set('assigneeId', assigneeId);
    if (priority) p.set('priority', priority);
    if (status) p.set('status', status);
    return p.toString();
  };

  const { data: tasks = [], isLoading, refetch } = useQuery<ReportTask[]>({
    queryKey: ['reports-data', from, to, projectId, assigneeId, priority, status],
    queryFn: () => api.get(`/analytics/reports/data?${buildParams()}`).then(r => r.data),
    enabled: generated,
  });

  const handleGenerate = () => {
    if (!generated) {
      setGenerated(true);
    } else {
      refetch();
    }
  };

  const handleClear = () => {
    setFrom(''); setTo(''); setProjectId(''); setAssigneeId('');
    setPriority(''); setStatus(''); setGenerated(false);
  };

  const exportExcel = () => {
    const rows = tasks.map(t => ({
      Task: t.title,
      Project: t.project,
      Status: t.status,
      Priority: t.priority,
      Column: t.column,
      Assignees: t.assignees || '—',
      'Due Date': t.dueDate || '—',
      'Completed Date': t.completedAt || '—',
      'Created Date': t.createdAt,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tasks Report');
    XLSX.writeFile(wb, `WorkTrack_Report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(172, 38, 96);
    doc.text('WorkTrack — Tasks Report', 40, 40);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated: ${format(new Date(), 'PPP')}   |   Total tasks: ${tasks.length}`, 40, 58);

    autoTable(doc, {
      startY: 72,
      head: [['Task', 'Project', 'Status', 'Priority', 'Assignees', 'Due Date', 'Completed', 'Created']],
      body: tasks.map(t => [
        t.title.length > 50 ? t.title.slice(0, 47) + '...' : t.title,
        t.project,
        t.status,
        t.priority,
        t.assignees || '—',
        t.dueDate || '—',
        t.completedAt || '—',
        t.createdAt,
      ]),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [172, 38, 96], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      columnStyles: {
        0: { cellWidth: 140 },
        2: { cellWidth: 60 },
        3: { cellWidth: 55 },
      },
    });

    doc.save(`WorkTrack_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const hasFilters = from || to || projectId || assigneeId || priority || status;

  return (
    <div>
      <Header title="Custom Reports" />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Custom Reports</h2>
            <p className="text-gray-500 mt-1">Filter, preview and export task data</p>
          </div>
        </div>

        {/* Filters */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-gray-600">
            <Filter size={14} />
            Filters
            {hasFilters && (
              <button onClick={handleClear} className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 font-normal">
                <X size={12} /> Clear all
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">From Date</label>
              <input type="date" className="input text-sm" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">To Date</label>
              <input type="date" className="input text-sm" value={to} onChange={e => setTo(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Project</label>
              <select className="input text-sm" value={projectId} onChange={e => setProjectId(e.target.value)}>
                <option value="">All Projects</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Assignee</label>
              <select className="input text-sm" value={assigneeId} onChange={e => setAssigneeId(e.target.value)}>
                <option value="">All Members</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Priority</label>
              <select className="input text-sm" value={priority} onChange={e => setPriority(e.target.value)}>
                <option value="">All Priorities</option>
                {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Status</label>
              <select className="input text-sm" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={handleGenerate} className="btn-primary flex items-center gap-2">
              <RefreshCw size={14} />
              Generate Report
            </button>
          </div>
        </div>

        {/* Results */}
        {generated && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText size={17} className="text-gray-400" />
                <span className="font-semibold text-gray-700">
                  {isLoading ? 'Loading...' : `${tasks.length} task${tasks.length !== 1 ? 's' : ''} found`}
                </span>
              </div>
              {!isLoading && tasks.length > 0 && (
                <div className="flex items-center gap-2">
                  <button onClick={exportExcel} className="btn-secondary flex items-center gap-1.5 text-sm">
                    <Download size={13} />
                    Excel
                  </button>
                  <button onClick={exportPDF} className="btn-primary flex items-center gap-1.5 text-sm">
                    <Download size={13} />
                    PDF
                  </button>
                </div>
              )}
            </div>

            {isLoading && (
              <div className="flex justify-center py-12">
                <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
              </div>
            )}

            {!isLoading && tasks.length === 0 && (
              <div className="flex flex-col items-center py-14 text-gray-400">
                <FileText size={42} className="mb-3 text-gray-200" />
                <p className="font-medium">No tasks match your filters</p>
                <p className="text-sm mt-1">Try adjusting the filters above</p>
              </div>
            )}

            {!isLoading && tasks.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Task', 'Project', 'Status', 'Priority', 'Assignees', 'Due Date', 'Created'].map(h => (
                        <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map(t => (
                      <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="py-2.5 px-3 font-medium max-w-xs">
                          <p className="truncate">{t.title}</p>
                          {t.column && <p className="text-xs text-gray-400">{t.column}</p>}
                        </td>
                        <td className="py-2.5 px-3 text-gray-500 max-w-[120px] truncate">{t.project}</td>
                        <td className="py-2.5 px-3">
                          <span className={`badge text-xs ${STATUS_COLORS[t.status] ?? 'bg-gray-100 text-gray-600'}`}>{t.status}</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <PriorityBadge priority={t.priority as Priority} />
                        </td>
                        <td className="py-2.5 px-3 text-gray-500 max-w-[160px] truncate">{t.assignees || '—'}</td>
                        <td className="py-2.5 px-3 text-gray-500 whitespace-nowrap">{t.dueDate || '—'}</td>
                        <td className="py-2.5 px-3 text-gray-400 whitespace-nowrap">{t.createdAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
