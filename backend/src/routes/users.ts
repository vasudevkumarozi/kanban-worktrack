import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { validate } from '../middleware/validate';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../lib/errors';
import { passwordLimiter } from '../middleware/rateLimiter';

const router = Router();
router.use(authenticate);

const SAFE_SELECT = { id: true, email: true, name: true, role: true, department: true, avatar: true, isActive: true, createdAt: true };

const createSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    role: z.enum(['SUPER_ADMIN', 'MANAGER', 'EMPLOYEE']).optional(),
    department: z.string().max(100).optional(),
  }),
});

const updateSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100).optional(),
    email: z.string().email().optional(),
    role: z.enum(['SUPER_ADMIN', 'MANAGER', 'EMPLOYEE']).optional(),
    department: z.string().max(100).nullable().optional(),
    password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  }),
});

router.get('/', asyncHandler(async (_req: AuthRequest, res: Response) => {
  const users = await prisma.user.findMany({ select: SAFE_SELECT, orderBy: { name: 'asc' } });
  res.json(users);
}));

router.get('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: SAFE_SELECT });
  if (!user) throw new NotFoundError('User');
  res.json(user);
}));

router.post('/', requireRole('SUPER_ADMIN', 'MANAGER'), validate(createSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { email, password, name, role, department } = req.body as {
    email: string; password: string; name: string; role?: string; department?: string;
  };
  const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (exists) throw new ConflictError('A user with this email already exists');

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email: email.toLowerCase(), password: hashed, name, role: (role as any) || 'EMPLOYEE', department },
    select: SAFE_SELECT,
  });
  res.status(201).json(user);
}));

router.put('/:id', requireRole('SUPER_ADMIN', 'MANAGER'), validate(updateSchema), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, role, department, email, password } = req.body as {
    name?: string; role?: string; department?: string; email?: string; password?: string;
  };
  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (role !== undefined) data.role = role;
  if (department !== undefined) data.department = department;
  if (email !== undefined) data.email = email.toLowerCase();
  if (password) data.password = await bcrypt.hash(password, 12);

  const user = await prisma.user.update({ where: { id: req.params.id }, data, select: SAFE_SELECT });
  res.json(user);
}));

router.patch('/:id/toggle-status', requireRole('SUPER_ADMIN', 'MANAGER'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const current = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!current) throw new NotFoundError('User');
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { isActive: !current.isActive },
    select: SAFE_SELECT,
  });
  res.json(user);
}));

router.patch('/:id/password', passwordLimiter, asyncHandler(async (req: AuthRequest, res: Response) => {
  const isSelf = req.user!.id === req.params.id;
  const isAdmin = ['SUPER_ADMIN', 'MANAGER'].includes(req.user!.role);
  if (!isSelf && !isAdmin) throw new ForbiddenError('You cannot change another user\'s password');

  const { password } = req.body as { password?: string };
  if (!password || password.length < 8) throw new ValidationError('Password must be at least 8 characters');

  // Update password and invalidate all active sessions by wiping refresh tokens.
  // Existing access tokens expire naturally within 15 min (acceptable window).
  await Promise.all([
    prisma.user.update({ where: { id: req.params.id }, data: { password: await bcrypt.hash(password, 12) } }),
    prisma.refreshToken.deleteMany({ where: { userId: req.params.id } }),
  ]);

  res.json({ message: 'Password updated. All other sessions have been signed out.' });
}));

router.delete('/:id', requireRole('SUPER_ADMIN', 'MANAGER'), asyncHandler(async (req: AuthRequest, res: Response) => {
  if (req.user!.id === req.params.id) throw new ForbiddenError('You cannot delete your own account');
  await prisma.user.delete({ where: { id: req.params.id } });
  res.json({ message: 'User deleted successfully' });
}));

export default router;
