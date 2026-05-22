import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { NotFoundError, ValidationError } from '../lib/errors';
import { eachDayOfInterval, format, isBefore } from 'date-fns';

const router = Router();
router.use(authenticate);

const SPRINT_INCLUDE = {
  _count: { select: { tasks: true } },
} as const;

router.get('/project/:projectId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const sprints = await prisma.sprint.findMany({
    where: { projectId: req.params.projectId },
    include: SPRINT_INCLUDE,
    orderBy: { startDate: 'desc' },
  });
  res.json(sprints);
}));

router.get('/project/:projectId/velocity', asyncHandler(async (req: AuthRequest, res: Response) => {
  const sprints = await prisma.sprint.findMany({
    where: { projectId: req.params.projectId, status: 'COMPLETED' },
    include: SPRINT_INCLUDE,
    orderBy: { startDate: 'asc' },
  });

  const data = await Promise.all(sprints.map(async s => {
    const completed = await prisma.task.count({ where: { sprintId: s.id, completedAt: { not: null } } });
    return { name: s.name, total: s._count.tasks, completed };
  }));

  res.json(data);
}));

router.get('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const sprint = await prisma.sprint.findUnique({
    where: { id: req.params.id },
    include: {
      tasks: {
        include: {
          assignees: { include: { user: { select: { id: true, name: true, avatar: true } } } },
          column: { select: { id: true, name: true } },
          _count: { select: { subtasks: true, comments: true } },
        },
        orderBy: { order: 'asc' },
      },
      ...SPRINT_INCLUDE,
    },
  });
  if (!sprint) throw new NotFoundError('Sprint');
  res.json(sprint);
}));

router.get('/:id/burndown', asyncHandler(async (req: AuthRequest, res: Response) => {
  const sprint = await prisma.sprint.findUnique({ where: { id: req.params.id } });
  if (!sprint) throw new NotFoundError('Sprint');

  const tasks = await prisma.task.findMany({ where: { sprintId: sprint.id } });
  const total = tasks.length;
  if (total === 0) return res.json([]);

  const start = sprint.startDate;
  const end = isBefore(sprint.endDate, new Date()) ? sprint.endDate : new Date();
  const days = eachDayOfInterval({ start, end });
  const totalDays = eachDayOfInterval({ start: sprint.startDate, end: sprint.endDate }).length;

  const data = days.map((day, i) => {
    const dayEnd = new Date(day.getTime() + 86400000);
    const completed = tasks.filter(t => t.completedAt && isBefore(new Date(t.completedAt), dayEnd)).length;
    const ideal = Math.max(0, total - Math.round((total / (totalDays - 1 || 1)) * i));
    return { date: format(day, 'MMM d'), remaining: total - completed, ideal };
  });

  res.json(data);
}));

router.post('/', requireRole('SUPER_ADMIN', 'MANAGER'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { projectId, name, goal, startDate, endDate } = req.body as {
    projectId?: string; name?: string; goal?: string; startDate?: string; endDate?: string;
  };
  if (!projectId) throw new ValidationError('Project ID is required');
  if (!name?.trim()) throw new ValidationError('Sprint name is required');
  if (!startDate) throw new ValidationError('Start date is required');
  if (!endDate) throw new ValidationError('End date is required');

  const sprint = await prisma.sprint.create({
    data: { projectId, name: name.trim(), goal, startDate: new Date(startDate), endDate: new Date(endDate) },
    include: SPRINT_INCLUDE,
  });
  res.status(201).json(sprint);
}));

router.put('/:id', requireRole('SUPER_ADMIN', 'MANAGER'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, goal, startDate, endDate, status } = req.body as {
    name?: string; goal?: string; startDate?: string; endDate?: string; status?: string;
  };
  const sprint = await prisma.sprint.update({
    where: { id: req.params.id },
    data: {
      ...(name && { name }),
      ...(goal !== undefined && { goal }),
      ...(startDate && { startDate: new Date(startDate) }),
      ...(endDate && { endDate: new Date(endDate) }),
      ...(status && { status }),
    },
    include: SPRINT_INCLUDE,
  });
  res.json(sprint);
}));

router.patch('/:id/tasks', requireRole('SUPER_ADMIN', 'MANAGER'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { taskId, action } = req.body as { taskId?: string; action?: 'add' | 'remove' };
  if (!taskId) throw new ValidationError('taskId is required');
  if (!action || !['add', 'remove'].includes(action)) throw new ValidationError('action must be "add" or "remove"');

  await prisma.task.update({
    where: { id: taskId },
    data: { sprintId: action === 'add' ? req.params.id : null },
  });
  res.json({ message: 'Task sprint updated' });
}));

router.delete('/:id', requireRole('SUPER_ADMIN', 'MANAGER'), asyncHandler(async (req: AuthRequest, res: Response) => {
  await prisma.task.updateMany({ where: { sprintId: req.params.id }, data: { sprintId: null } });
  await prisma.sprint.delete({ where: { id: req.params.id } });
  res.json({ message: 'Sprint deleted' });
}));

export default router;
