import { Router, Response } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import prisma from '../lib/prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { uploadLimiter } from '../middleware/rateLimiter';
import { NotFoundError, ValidationError } from '../lib/errors';
import { getIO } from '../socket';

const router = Router();
router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.(xlsx|xls|csv)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Only .xlsx, .xls, or .csv files are allowed'));
  },
});

function pick(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const val = row[k] ?? row[k.toLowerCase()] ?? row[k.toUpperCase()];
    if (val !== undefined && val !== null && String(val).trim() !== '') return String(val).trim();
  }
  return '';
}

router.post(
  '/',
  requireRole('SUPER_ADMIN', 'MANAGER'),
  uploadLimiter,
  upload.single('file'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.file) throw new ValidationError('No file uploaded');

    const { projectId } = req.body as { projectId?: string };
    if (!projectId) throw new ValidationError('projectId is required');

    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

    if (rows.length === 0) throw new ValidationError('Spreadsheet is empty');

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { columns: { orderBy: { order: 'asc' } } },
    });
    if (!project) throw new NotFoundError('Project');

    const users = await prisma.user.findMany({ select: { id: true, name: true, email: true } });
    const todoCol = project.columns.find(c => c.name.toLowerCase() === 'to do') ?? project.columns[0];

    const results = { created: 0, skipped: 0, errors: [] as { row: number; reason: string }[] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const title = pick(row, 'title', 'Title', 'TITLE', 'task', 'Task', 'name', 'Name', 'task_name', 'Task Name');
      if (!title) {
        results.errors.push({ row: rowNum, reason: 'Title is required' });
        results.skipped++;
        continue;
      }

      const priorityRaw = pick(row, 'priority', 'Priority', 'PRIORITY').toUpperCase();
      const priority = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priorityRaw) ? priorityRaw : 'MEDIUM';

      const assigneeRaw = pick(row, 'assignee_email', 'Assignee Email', 'AssigneeEmail', 'assignee', 'Assignee', 'assigned_to', 'Assigned To', 'email', 'Email');
      let assigneeId: string | null = null;
      if (assigneeRaw) {
        const u =
          users.find(u => u.email.toLowerCase() === assigneeRaw.toLowerCase()) ??
          users.find(u => u.name.toLowerCase() === assigneeRaw.toLowerCase());
        assigneeId = u?.id ?? null;
      }

      const columnNameRaw = pick(row, 'column', 'Column', 'status', 'Status', 'stage', 'Stage');
      let columnId = todoCol.id;
      if (columnNameRaw) {
        const col = project.columns.find(c => c.name.toLowerCase() === columnNameRaw.toLowerCase());
        if (col) columnId = col.id;
      }

      let dueDate: Date | null = null;
      const dueDateRaw = pick(row, 'due_date', 'Due Date', 'DueDate', 'dueDate', 'deadline', 'Deadline', 'due', 'Due');
      if (dueDateRaw) {
        const parsed = new Date(dueDateRaw);
        if (!isNaN(parsed.getTime())) dueDate = parsed;
      } else {
        const rawVal = row['due_date'] ?? row['Due Date'] ?? row['DueDate'] ?? row['deadline'];
        if (typeof rawVal === 'number') {
          const d = XLSX.SSF.parse_date_code(rawVal);
          if (d) dueDate = new Date(d.y, d.m - 1, d.d);
        }
      }

      const estRaw = pick(row, 'estimated_hours', 'Estimated Hours', 'EstimatedHours', 'hours', 'Hours', 'est_hours', 'Est Hours');
      const estimatedHours = estRaw ? parseFloat(estRaw) || null : null;
      const description = pick(row, 'description', 'Description', 'DESCRIPTION', 'desc', 'Desc', 'details', 'Details', 'notes', 'Notes') || null;

      try {
        const maxOrder = await prisma.task.aggregate({ where: { columnId }, _max: { order: true } });
        const task = await prisma.task.create({
          data: {
            title, description, priority, columnId, projectId,
            createdById: req.user!.id, dueDate, estimatedHours,
            order: (maxOrder._max.order ?? -1) + 1,
            assignees: assigneeId ? { create: [{ userId: assigneeId }] } : undefined,
          },
          include: {
            assignees: { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } },
            createdBy: { select: { id: true, name: true } },
            column: { select: { id: true, name: true, color: true } },
            project: { select: { id: true, name: true } },
            _count: { select: { comments: true } },
          },
        });

        if (assigneeId) {
          await prisma.notification.create({
            data: {
              userId: assigneeId, type: 'TASK_ASSIGNED',
              title: 'New task assigned (bulk import)',
              message: `You have been assigned: ${title}`,
              metadata: JSON.stringify({ taskId: task.id, projectId }),
            },
          });
          try { getIO().to(assigneeId).emit('notification', { type: 'TASK_ASSIGNED', task }); } catch (_) { /* no-op */ }
        }

        getIO().to(projectId).emit('task:created', task);
        results.created++;
      } catch {
        results.errors.push({ row: rowNum, reason: 'Failed to create task' });
        results.skipped++;
      }
    }

    res.json(results);
  })
);

router.get('/project-context/:projectId', requireRole('SUPER_ADMIN', 'MANAGER'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    include: {
      columns: { orderBy: { order: 'asc' }, select: { id: true, name: true } },
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  if (!project) throw new NotFoundError('Project');
  res.json({ columns: project.columns, members: project.members.map(m => m.user) });
}));

export default router;
