import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { NotFoundError } from '../lib/errors';

const router = Router();
router.use(authenticate);

const ACTIVITY_INCLUDE = {
  user: { select: { id: true, name: true, avatar: true } },
  task: { select: { id: true, title: true } },
} as const;

const ACTION_LABELS: Record<string, string> = {
  CREATED: 'created task',
  UPDATED: 'updated task',
  MOVED: 'moved task',
  DELETED: 'deleted task',
  COMMENTED: 'commented on',
};

function buildMessage(log: {
  action: string;
  user: { name: string };
  task: { title: string } | null;
  oldValue: string | null;
  newValue: string | null;
}): string {
  const who = log.user.name;
  const task = log.task?.title ?? 'a task';

  if (log.action === 'MOVED') {
    try {
      const from = JSON.parse(log.oldValue ?? '{}').columnName ?? '?';
      const to = JSON.parse(log.newValue ?? '{}').columnName ?? '?';
      return `${who} moved "${task}" from ${from} → ${to}`;
    } catch {
      return `${who} moved "${task}"`;
    }
  }
  if (log.action === 'COMMENTED') {
    const preview = (log.newValue ?? '').slice(0, 60);
    return `${who} commented on "${task}": ${preview}${(log.newValue?.length ?? 0) > 60 ? '…' : ''}`;
  }
  return `${who} ${ACTION_LABELS[log.action] ?? log.action} "${task}"`;
}

router.get('/project/:projectId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId, action, from, to, limit = '50', offset = '0' } = req.query;

  const tasks = await prisma.task.findMany({
    where: { projectId: req.params.projectId },
    select: { id: true },
  });
  const taskIds = tasks.map(t => t.id);
  if (taskIds.length === 0) return res.json([]);

  const parsedLimit = Math.min(parseInt(String(limit)) || 50, 200);
  const parsedOffset = Math.max(parseInt(String(offset)) || 0, 0);

  const logs = await prisma.activityLog.findMany({
    where: {
      taskId: { in: taskIds },
      ...(userId ? { userId: String(userId) } : {}),
      ...(action ? { action: String(action) } : {}),
      ...(from || to ? {
        createdAt: {
          ...(from ? { gte: new Date(String(from)) } : {}),
          ...(to ? { lte: new Date(String(to)) } : {}),
        },
      } : {}),
    },
    include: ACTIVITY_INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: parsedLimit,
    skip: parsedOffset,
  });

  res.json(logs.map(log => ({ ...log, message: buildMessage(log) })));
}));

router.get('/task/:taskId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const logs = await prisma.activityLog.findMany({
    where: { taskId: req.params.taskId },
    include: ACTIVITY_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  res.json(logs.map(log => ({ ...log, message: buildMessage(log) })));
}));

router.get('/project/:projectId/members', asyncHandler(async (req: AuthRequest, res: Response) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    include: { members: { include: { user: { select: { id: true, name: true } } } } },
  });
  if (!project) throw new NotFoundError('Project');
  res.json(project.members.map(m => m.user));
}));

export default router;
