import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { NotFoundError, ValidationError } from '../lib/errors';
import { getIO } from '../socket';

const router = Router();
router.use(authenticate);

const PROJECT_INCLUDE = {
  manager: { select: { id: true, name: true, email: true, avatar: true } },
  members: { include: { user: { select: { id: true, name: true, email: true, avatar: true, role: true } } } },
  columns: { orderBy: { order: 'asc' as const } },
  _count: { select: { tasks: true } },
} as const;

router.get('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const where = ['SUPER_ADMIN', 'MANAGER'].includes(req.user!.role)
    ? {}
    : { members: { some: { userId: req.user!.id } } };
  const projects = await prisma.project.findMany({ where, include: PROJECT_INCLUDE, orderBy: { createdAt: 'desc' } });
  res.json(projects);
}));

router.get('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const project = await prisma.project.findUnique({ where: { id: req.params.id }, include: PROJECT_INCLUDE });
  if (!project) throw new NotFoundError('Project');
  res.json(project);
}));

router.post('/', requireRole('SUPER_ADMIN', 'MANAGER'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, description } = req.body as { name?: string; description?: string };
  if (!name?.trim()) throw new ValidationError('Project name is required');

  const project = await prisma.project.create({
    data: {
      name: name.trim(), description: description?.trim(), managerId: req.user!.id,
      columns: { create: [
        { name: 'Backlog', order: 0, color: '#94a3b8' },
        { name: 'To Do', order: 1, color: '#6366f1' },
        { name: 'In Progress', order: 2, color: '#f59e0b' },
        { name: 'Review', order: 3, color: '#8b5cf6' },
        { name: 'Approved', order: 4, color: '#06b6d4' },
        { name: 'Done', order: 5, color: '#10b981' },
      ]},
      members: { create: { userId: req.user!.id, role: 'manager' } },
    },
    include: PROJECT_INCLUDE,
  });
  res.status(201).json(project);
}));

router.put('/:id', requireRole('SUPER_ADMIN', 'MANAGER'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, description, status } = req.body as { name?: string; description?: string; status?: string };
  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: { ...(name && { name: name.trim() }), ...(description !== undefined && { description }), ...(status && { status }) },
    include: PROJECT_INCLUDE,
  });
  res.json(project);
}));

router.delete('/:id', requireRole('SUPER_ADMIN', 'MANAGER'), asyncHandler(async (req: AuthRequest, res: Response) => {
  await prisma.project.delete({ where: { id: req.params.id } });
  res.json({ message: 'Project deleted successfully' });
}));

router.post('/:id/members', requireRole('SUPER_ADMIN', 'MANAGER'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId, role } = req.body as { userId?: string; role?: string };
  if (!userId) throw new ValidationError('User ID is required');

  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: req.params.id, userId } },
    update: { role: role || 'member' },
    create: { projectId: req.params.id, userId, role: role || 'member' },
  });
  const project = await prisma.project.findUnique({ where: { id: req.params.id }, select: { name: true } });
  await prisma.notification.create({
    data: { userId, type: 'PROJECT_ADDED', title: 'Added to project', message: `You have been added to: ${project?.name}`, metadata: JSON.stringify({ projectId: req.params.id }) },
  });
  try { getIO().to(userId).emit('notification', { type: 'PROJECT_ADDED' }); } catch (_) { /* no-op */ }
  res.json({ message: 'Member added successfully' });
}));

router.delete('/:id/members/:userId', requireRole('SUPER_ADMIN', 'MANAGER'), asyncHandler(async (req: AuthRequest, res: Response) => {
  await prisma.projectMember.delete({ where: { projectId_userId: { projectId: req.params.id, userId: req.params.userId } } });
  res.json({ message: 'Member removed successfully' });
}));

export default router;
