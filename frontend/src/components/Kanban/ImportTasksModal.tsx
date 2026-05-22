import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Upload, Download, FileSpreadsheet, X, CheckCircle2, AlertCircle, ChevronRight } from 'lucide-react';
import Modal from '../UI/Modal';
import api from '../../api/client';
import toast from 'react-hot-toast';

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onSuccess: () => void;
}

interface PreviewRow {
  title: string;
  description: string;
  priority: string;
  assignee: string;
  column: string;
  dueDate: string;
  estimatedHours: string;
  _valid: boolean;
  _error?: string;
}

interface ImportResult {
  created: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

// Normalise a raw row from xlsx into our preview shape
function normaliseRow(raw: Record<string, unknown>): PreviewRow {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = raw[k] ?? raw[k.toLowerCase()] ?? raw[k.toUpperCase()];
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
  };

  const title = pick('title', 'Title', 'TITLE', 'task', 'Task', 'name', 'Name', 'task_name', 'Task Name');
  const priorityRaw = pick('priority', 'Priority', 'PRIORITY').toUpperCase();
  const priority = PRIORITY_OPTIONS.includes(priorityRaw) ? priorityRaw : 'MEDIUM';
  const assignee = pick('assignee_email', 'Assignee Email', 'assignee', 'Assignee', 'assigned_to', 'Assigned To', 'email', 'Email');
  const column = pick('column', 'Column', 'status', 'Status', 'stage', 'Stage');
  const dueDate = pick('due_date', 'Due Date', 'DueDate', 'dueDate', 'deadline', 'Deadline', 'due', 'Due');
  const estimatedHours = pick('estimated_hours', 'Estimated Hours', 'hours', 'Hours');
  const description = pick('description', 'Description', 'desc', 'Desc', 'details', 'notes', 'Notes');

  return {
    title, description, priority, assignee, column, dueDate, estimatedHours,
    _valid: !!title,
    _error: !title ? 'Title is required' : undefined,
  };
}

function downloadTemplate() {
  const headers = [
    'title', 'description', 'priority', 'assignee_email',
    'column', 'due_date', 'estimated_hours',
  ];
  const sample = [
    'Design homepage mockup', 'Create wireframes and mockups', 'HIGH',
    'emp1@company.com', 'To Do', '2026-06-15', '8',
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
  ws['!cols'] = headers.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tasks');
  XLSX.writeFile(wb, 'worktrack_task_template.xlsx');
}

export default function ImportTasksModal({ open, onClose, projectId, onSuccess }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [fileReady, setFileReady] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');

  const { data: context } = useQuery<{ columns: { id: string; name: string }[]; members: { id: string; name: string; email: string }[] }>({
    queryKey: ['import-context', projectId],
    queryFn: () => api.get(`/import/project-context/${projectId}`).then(r => r.data),
    enabled: open,
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('projectId', projectId);
      return api.post('/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: (res) => {
      setResult(res.data);
      setStep('done');
      onSuccess();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Import failed'),
  });

  const parseFile = useCallback((file: File) => {
    setFileName(file.name);
    setFileReady(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target!.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      setPreview(rows.map(normaliseRow));
      setStep('preview');
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  };

  const reset = () => {
    setStep('upload');
    setPreview([]);
    setFileName('');
    setFileReady(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const close = () => { reset(); onClose(); };

  const validRows = preview.filter(r => r._valid);
  const invalidRows = preview.filter(r => !r._valid);

  const priorityColor: Record<string, string> = {
    LOW: 'bg-gray-100 text-gray-600',
    MEDIUM: 'bg-blue-100 text-blue-700',
    HIGH: 'bg-orange-100 text-orange-700',
    CRITICAL: 'bg-red-100 text-red-700',
  };

  return (
    <Modal open={open} onClose={close} title="Import Tasks from Spreadsheet" size="xl">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        {['Upload File', 'Preview', 'Done'].map((s, i) => {
          const cur = ['upload', 'preview', 'done'].indexOf(step);
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <ChevronRight size={14} className="text-gray-300" />}
              <span className={`font-medium ${i === cur ? 'text-primary-600' : i < cur ? 'text-green-600' : 'text-gray-400'}`}>
                {i < cur ? '✓ ' : ''}{s}
              </span>
            </div>
          );
        })}
      </div>

      {/* STEP 1 — Upload */}
      {step === 'upload' && (
        <div className="space-y-5">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700 space-y-1">
            <p className="font-semibold">Supported columns in your spreadsheet:</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 mt-2 text-xs">
              {[
                ['title / Task / Name', 'Required — task title'],
                ['description / desc / notes', 'Optional'],
                ['priority', 'LOW / MEDIUM / HIGH / CRITICAL'],
                ['assignee_email / Assignee', 'Email or full name'],
                ['column / status / stage', 'Column name in the board'],
                ['due_date / deadline', 'YYYY-MM-DD'],
                ['estimated_hours / hours', 'Number'],
              ].map(([col, hint]) => (
                <div key={col}><span className="font-medium">{col}</span> — {hint}</div>
              ))}
            </div>
          </div>

          <button
            onClick={downloadTemplate}
            className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
          >
            <Download size={16} />
            Download Template (.xlsx)
          </button>

          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${dragging ? 'border-primary-400 bg-primary-50' : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'}`}
          >
            <FileSpreadsheet size={40} className={`mx-auto mb-3 ${dragging ? 'text-primary-500' : 'text-gray-300'}`} />
            <p className="font-medium text-gray-700">Drop your file here or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">Supports .xlsx, .xls, .csv — max 10 MB</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
          </div>

          {context && (
            <div className="text-xs text-gray-400 flex gap-4">
              <span>Board columns: {context.columns.map(c => c.name).join(', ')}</span>
            </div>
          )}
        </div>
      )}

      {/* STEP 2 — Preview */}
      {step === 'preview' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileSpreadsheet size={18} className="text-green-500" />
              <span className="text-sm font-medium">{fileName}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-green-600 font-medium">{validRows.length} valid</span>
              {invalidRows.length > 0 && <span className="text-red-500 font-medium">{invalidRows.length} invalid</span>}
              <button onClick={reset} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
          </div>

          {invalidRows.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              <p className="font-medium mb-1">Rows with errors (will be skipped):</p>
              {invalidRows.map((r, i) => <p key={i} className="text-xs">Row {preview.indexOf(r) + 2}: {r._error}</p>)}
            </div>
          )}

          <div className="border rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500 w-6">#</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Title</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Priority</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Assignee</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Column</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Due Date</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-500">Hrs</th>
                    <th className="px-3 py-2 w-6"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.map((row, i) => (
                    <tr key={i} className={!row._valid ? 'bg-red-50' : 'hover:bg-gray-50'}>
                      <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2 font-medium max-w-[180px] truncate">{row.title || <span className="text-red-400 italic">missing</span>}</td>
                      <td className="px-3 py-2">
                        <span className={`badge ${priorityColor[row.priority] || 'bg-gray-100 text-gray-600'}`}>{row.priority}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate">{row.assignee || '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{row.column || 'To Do'}</td>
                      <td className="px-3 py-2 text-gray-500">{row.dueDate || '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{row.estimatedHours || '—'}</td>
                      <td className="px-3 py-2">
                        {row._valid
                          ? <CheckCircle2 size={14} className="text-green-500" />
                          : <span title={row._error}><AlertCircle size={14} className="text-red-500" /></span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {validRows.length === 0 && (
            <p className="text-sm text-red-500 text-center">No valid rows to import. Please fix your spreadsheet.</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={reset}>Back</button>
            <button
              className="btn-primary flex items-center gap-2"
              onClick={() => fileReady && importMutation.mutate(fileReady)}
              disabled={validRows.length === 0 || importMutation.isPending}
            >
              <Upload size={16} />
              {importMutation.isPending ? 'Importing...' : `Import ${validRows.length} Tasks`}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3 — Done */}
      {step === 'done' && result && (
        <div className="space-y-4 text-center py-4">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <CheckCircle2 size={36} className="text-green-500" />
          </div>
          <h3 className="text-xl font-bold">Import Complete!</h3>

          <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
            <div className="card py-3">
              <p className="text-2xl font-bold text-green-600">{result.created}</p>
              <p className="text-xs text-gray-500 mt-1">Created</p>
            </div>
            <div className="card py-3">
              <p className="text-2xl font-bold text-red-500">{result.skipped}</p>
              <p className="text-xs text-gray-500 mt-1">Skipped</p>
            </div>
            <div className="card py-3">
              <p className="text-2xl font-bold text-gray-600">{result.created + result.skipped}</p>
              <p className="text-xs text-gray-500 mt-1">Total Rows</p>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-left max-h-32 overflow-y-auto">
              <p className="text-sm font-semibold text-red-700 mb-1">Skipped rows:</p>
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600">Row {e.row}: {e.reason}</p>
              ))}
            </div>
          )}

          <div className="flex justify-center gap-3 pt-2">
            <button className="btn-secondary" onClick={() => { reset(); }}>Import Another File</button>
            <button className="btn-primary" onClick={close}>Done</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
