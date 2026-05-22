import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { NotFoundError, ValidationError } from '../lib/errors';
import { getIO } from '../socket';

const router = Router();
router.use(authenticate);

router.get('/project/:projectId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const columns = await prisma.column.findMany({
    where: { projectId: req.params.projectId },
    orderBy: { order: 'asc' },
    include: { _count: { select: { tasks: true } } },
  });
  res.json(columns);
}));

router.post('/', requireRole('SUPER_ADMIN', 'MANAGER'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, projectId, color } = req.body as { name?: string; projectId?: string; color?: string };
  if (!name?.trim()) throw new ValidationError('Column name is required');
  if (!projectId) throw new ValidationError('Project ID is required');

  const maxOrder = await prisma.column.aggregate({ where: { projectId }, _max: { order: true } });
  const column = await prisma.column.create({
    data: { name: name.trim(), projectId, color, order: (maxOrder._max.order ?? -1) + 1 },
  });
  getIO().to(projectId).emit('column:created', column);
  res.status(201).json(column);
}));

router.put('/:id', requireRole('SUPER_ADMIN', 'MANAGER'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, color } = req.body as { name?: string; color?: string };
  const column = await prisma.column.update({ where: { id: req.params.id }, data: { ...(name && { name }), ...(color !== undefined && { color }) } });
  getIO().to(column.projectId).emit('column:updated', column);
  res.json(column);
}));

router.delete('/:id', requireRole('SUPER_ADMIN', 'MANAGER'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const column = await prisma.column.findUnique({ where: { id: req.params.id } });
  if (!column) throw new NotFoundError('Column');

  const taskCount = await prisma.task.count({ where: { columnId: req.params.id } });
  if (taskCount > 0) throw new ValidationError('Move or delete all tasks in this column first');

  await prisma.column.delete({ where: { id: req.params.id } });
  getIO().to(column.projectId).emit('column:deleted', { id: req.params.id });
  res.json({ message: 'Column deleted' });
}));

router.patch('/reorder', requireRole('SUPER_ADMIN', 'MANAGER'), asyncHandler(async (_req: AuthRequest, res: Response) => {
  const { columns } = _req.body as { columns?: { id: string; order: number }[] };
  if (!Array.isArray(columns) || columns.length === 0) throw new ValidationError('columns array is required');

  await Promise.all(columns.map(c => prisma.column.update({ where: { id: c.id }, data: { order: c.order } })));
  res.json({ message: 'Columns reordered' });
}));

export default router;
