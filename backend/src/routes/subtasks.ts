import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { ValidationError } from '../lib/errors';

const router = Router();
router.use(authenticate);

const SUBTASK_INCLUDE = {
  assignee: { select: { id: true, name: true, avatar: true } },
} as const;

router.get('/task/:taskId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const subtasks = await prisma.subtask.findMany({
    where: { taskId: req.params.taskId },
    include: SUBTASK_INCLUDE,
    orderBy: { order: 'asc' },
  });
  res.json(subtasks);
}));

router.post('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { taskId, title, assigneeId } = req.body as { taskId?: string; title?: string; assigneeId?: string };
  if (!taskId) throw new ValidationError('Task ID is required');
  if (!title?.trim()) throw new ValidationError('Subtask title is required');

  const max = await prisma.subtask.aggregate({ where: { taskId }, _max: { order: true } });
  const subtask = await prisma.subtask.create({
    data: { taskId, title: title.trim(), assigneeId: assigneeId || null, order: (max._max.order ?? -1) + 1 },
    include: SUBTASK_INCLUDE,
  });
  res.status(201).json(subtask);
}));

router.patch('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { title, completed, assigneeId } = req.body as { title?: string; completed?: boolean; assigneeId?: string | null };
  const subtask = await prisma.subtask.update({
    where: { id: req.params.id },
    data: {
      ...(title !== undefined && { title: title.trim() }),
      ...(completed !== undefined && { completed }),
      ...(assigneeId !== undefined && { assigneeId: assigneeId || null }),
    },
    include: SUBTASK_INCLUDE,
  });
  res.json(subtask);
}));

router.delete('/:id', asyncHandler(async (_req: AuthRequest, res: Response) => {
  await prisma.subtask.delete({ where: { id: _req.params.id } });
  res.json({ message: 'Subtask deleted' });
}));

export default router;
