import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { validate } from '../middleware/validate';
import { authLimiter } from '../middleware/rateLimiter';
import { NotFoundError, UnauthorizedError, ForbiddenError } from '../lib/errors';
import logger from '../lib/logger';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const router = Router();

const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required'),
  }),
});

const googleSchema = z.object({
  body: z.object({ credential: z.string().min(1, 'Google credential is required') }),
});

router.post('/login', authLimiter, validate(loginSchema), asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !user.isActive) throw new UnauthorizedError('Invalid credentials');

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    logger.warn('Failed login attempt', { email });
    throw new UnauthorizedError('Invalid credentials');
  }

  const token = jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' },
  );

  logger.info('User logged in', { userId: user.id, role: user.role });
  const { password: _, ...safe } = user;
  res.json({ token, user: safe });
}));

router.post('/google', authLimiter, validate(googleSchema), asyncHandler(async (req: Request, res: Response) => {
  const { credential } = req.body as { credential: string };

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    throw new UnauthorizedError('Invalid Google token');
  }

  if (!payload?.email) throw new UnauthorizedError('No email in Google token');
  if (!payload.email.endsWith('@ozi.in')) throw new ForbiddenError('Access restricted to @ozi.in accounts only');

  let user = await prisma.user.findUnique({ where: { email: payload.email } });
  if (!user) {
    user = await prisma.user.create({
      data: { email: payload.email, name: payload.name || payload.email.split('@')[0], password: '', role: 'EMPLOYEE', avatar: payload.picture ?? null, isActive: true },
    });
    logger.info('New user via Google SSO', { email: payload.email });
  }
  if (!user.isActive) throw new ForbiddenError('Account is disabled');

  const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, process.env.JWT_SECRET!, { expiresIn: '7d' });
  const { password: _, ...safe } = user;
  res.json({ token, user: safe });
}));

router.get('/me', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, name: true, role: true, department: true, avatar: true, isActive: true, createdAt: true },
  });
  if (!user) throw new NotFoundError('User');
  res.json(user);
}));

export default router;
