import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { NotFoundError, ForbiddenError, ValidationError } from '../lib/errors';
import { getIO } from '../socket';

const router = Router();
router.use(authenticate);

const TASK_INCLUDE = {
  assignees: { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } },
  createdBy: { select: { id: true, name: true } },
  column: { select: { id: true, name: true, color: true } },
  project: { select: { id: true, name: true } },
  _count: { select: { comments: true, subtasks: true } },
} as const;

router.get('/project/:projectId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const tasks = await prisma.task.findMany({
    where: { projectId: req.params.projectId },
    include: TASK_INCLUDE,
    orderBy: [{ columnId: 'asc' }, { order: 'asc' }],
  });
  res.json(tasks);
}));

router.get('/my', asyncHandler(async (req: AuthRequest, res: Response) => {
  const tasks = await prisma.task.findMany({
    where: { assignees: { some: { userId: req.user!.id } } },
    include: TASK_INCLUDE,
    orderBy: { updatedAt: 'desc' },
  });
  res.json(tasks);
}));

router.get('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const task = await prisma.task.findUnique({ where: { id: req.params.id }, include: TASK_INCLUDE });
  if (!task) throw new NotFoundError('Task');
  res.json(task);
}));

router.post('/', requireRole('SUPER_ADMIN', 'MANAGER'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { title, description, priority, projectId, columnId, assigneeIds, dueDate, estimatedHours } = req.body as {
    title?: string; description?: string; priority?: string; projectId?: string;
    columnId?: string; assigneeIds?: string[]; dueDate?: string; estimatedHours?: number;
  };

  if (!title?.trim()) throw new ValidationError('Task title is required');
  if (!projectId) throw new ValidationError('Project ID is required');
  if (!columnId) throw new ValidationError('Column ID is required');

  const safeIds = Array.isArray(assigneeIds) ? assigneeIds.slice(0, 4) : [];
  const maxOrder = await prisma.task.aggregate({ where: { columnId }, _max: { order: true } });

  const task = await prisma.task.create({
    data: {
      title: title.trim(), description: description?.trim(),
      priority: (priority as any) || 'MEDIUM', projectId, columnId,
      createdById: req.user!.id,
      dueDate: dueDate ? new Date(dueDate) : null,
      estimatedHours: estimatedHours || null,
      order: (maxOrder._max.order ?? -1) + 1,
      assignees: safeIds.length > 0 ? { create: safeIds.map(uid => ({ userId: uid })) } : undefined,
    },
    include: TASK_INCLUDE,
  });

  await prisma.activityLog.create({
    data: { action: 'CREATED', entity: 'TASK', entityId: task.id, userId: req.user!.id, taskId: task.id },
  });

  for (const uid of safeIds) {
    await prisma.notification.create({
      data: { userId: uid, type: 'TASK_ASSIGNED', title: 'New task assigned', message: `You have been assigned: ${task.title}`, metadata: JSON.stringify({ taskId: task.id, projectId }) },
    });
    try { getIO().to(uid).emit('notification', { type: 'TASK_ASSIGNED', task }); } catch (_) { /* no-op */ }
  }
  getIO().to(projectId).emit('task:created', task);
  res.status(201).json(task);
}));

router.put('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const current = await prisma.task.findUnique({ where: { id: req.params.id }, include: { assignees: true } });
  if (!current) throw new NotFoundError('Task');
  if (req.user!.role === 'EMPLOYEE' && !current.assignees.some(a => a.userId === req.user!.id)) throw new ForbiddenError();

  const { title, description, priority, assigneeIds, dueDate, estimatedHours, actualHours, completedAt } = req.body as {
    title?: string; description?: string; priority?: string; assigneeIds?: string[];
    dueDate?: string | null; estimatedHours?: number; actualHours?: number; completedAt?: string | null;
  };

  await prisma.task.update({
    where: { id: req.params.id },
    data: {
      ...(title && { title: title.trim() }),
      ...(description !== undefined && { description: description?.trim() }),
      ...(priority && { priority: priority as any }),
      dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : current.dueDate,
      estimatedHours: estimatedHours !== undefined ? estimatedHours : current.estimatedHours,
      actualHours: actualHours !== undefined ? actualHours : current.actualHours,
      completedAt: completedAt !== undefined ? (completedAt ? new Date(completedAt) : null) : current.completedAt,
    },
  });

  if (Array.isArray(assigneeIds) && req.user!.role !== 'EMPLOYEE') {
    const safeIds = assigneeIds.slice(0, 4);
    const newIds = safeIds.filter(id => !current.assignees.some(a => a.userId === id));
    await prisma.taskAssignee.deleteMany({ where: { taskId: req.params.id } });
    if (safeIds.length > 0) await prisma.taskAssignee.createMany({ data: safeIds.map(uid => ({ taskId: req.params.id, userId: uid })) });
    for (const uid of newIds) {
      await prisma.notification.create({
        data: { userId: uid, type: 'TASK_ASSIGNED', title: 'Task assigned to you', message: `You have been assigned: ${title ?? current.title}`, metadata: JSON.stringify({ taskId: req.params.id }) },
      });
      try { getIO().to(uid).emit('notification', { type: 'TASK_ASSIGNED' }); } catch (_) { /* no-op */ }
    }
  }

  const task = await prisma.task.findUnique({ where: { id: req.params.id }, include: TASK_INCLUDE });
  await prisma.activityLog.create({
    data: { action: 'UPDATED', entity: 'TASK', entityId: req.params.id, userId: req.user!.id, taskId: req.params.id },
  });
  getIO().to(current.projectId).emit('task:updated', task);
  res.json(task);
}));

router.patch('/:id/move', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { columnId, order } = req.body as { columnId?: string; order?: number };
  if (!columnId) throw new ValidationError('columnId is required');

  const current = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!current) throw new NotFoundError('Task');

  const [targetCol, sourceCol] = await Promise.all([
    prisma.column.findUnique({ where: { id: columnId }, select: { name: true } }),
    prisma.column.findUnique({ where: { id: current.columnId }, select: { name: true } }),
  ]);

  const task = await prisma.task.update({
    where: { id: req.params.id },
    data: { columnId, order: order ?? 0, completedAt: targetCol?.name?.toLowerCase() === 'done' ? new Date() : null },
    include: TASK_INCLUDE,
  });

  await prisma.activityLog.create({
    data: {
      action: 'MOVED', entity: 'TASK', entityId: task.id, userId: req.user!.id, taskId: task.id,
      oldValue: JSON.stringify({ columnId: current.columnId, columnName: sourceCol?.name }),
      newValue: JSON.stringify({ columnId, columnName: targetCol?.name }),
    },
  });
  getIO().to(task.projectId).emit('task:moved', task);
  res.json(task);
}));

router.delete('/:id', requireRole('SUPER_ADMIN', 'MANAGER'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const task = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!task) throw new NotFoundError('Task');
  await prisma.task.delete({ where: { id: req.params.id } });
  await prisma.activityLog.create({
    data: { action: 'DELETED', entity: 'TASK', entityId: req.params.id, userId: req.user!.id },
  });
  getIO().to(task.projectId).emit('task:deleted', { id: req.params.id });
  res.json({ message: 'Task deleted successfully' });
}));

router.get('/:id/comments', asyncHandler(async (req: AuthRequest, res: Response) => {
  const comments = await prisma.comment.findMany({
    where: { taskId: req.params.id },
    include: { user: { select: { id: true, name: true, avatar: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json(comments);
}));

router.post('/:id/comments', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { content, mentionedUserIds } = req.body as { content?: string; mentionedUserIds?: string[] };
  if (!content?.trim()) throw new ValidationError('Comment content is required');

  const comment = await prisma.comment.create({
    data: { content: content.trim(), taskId: req.params.id, userId: req.user!.id },
    include: { user: { select: { id: true, name: true, avatar: true } } },
  });

  const task = await prisma.task.findUnique({ where: { id: req.params.id }, select: { projectId: true, title: true } });
  await prisma.activityLog.create({
    data: { action: 'COMMENTED', entity: 'TASK', entityId: req.params.id, userId: req.user!.id, taskId: req.params.id, newValue: content.slice(0, 200) },
  });

  const safeIds = Array.isArray(mentionedUserIds) ? mentionedUserIds : [];
  for (const uid of safeIds) {
    if (uid === req.user!.id) continue;
    await prisma.notification.create({
      data: { userId: uid, type: 'MENTION', title: 'You were mentioned', message: `${req.user!.email} mentioned you in: ${task?.title ?? 'a task'}`, metadata: JSON.stringify({ taskId: req.params.id, projectId: task?.projectId }) },
    });
    try { getIO().to(uid).emit('notification', { type: 'MENTION', comment }); } catch (_) { /* no-op */ }
  }

  if (task) getIO().to(task.projectId).emit('comment:created', { taskId: req.params.id, comment });
  res.status(201).json(comment);
}));

export default router;
