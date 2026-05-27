import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { validate } from '../middleware/validate';
import { authLimiter, refreshLimiter } from '../middleware/rateLimiter';
import { NotFoundError, UnauthorizedError, ForbiddenError } from '../lib/errors';
import logger from '../lib/logger';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const router = Router();

const ACCESS_TTL_MS  = 15 * 60 * 1000;          // 15 minutes
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required'),
  }),
});

const googleSchema = z.object({
  body: z.object({ credential: z.string().min(1, 'Google credential is required') }),
});

// ── Cookie helpers ────────────────────────────────────────────────────────────

function cookieOpts(maxAgeMs: number) {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? 'strict' : 'lax') as 'strict' | 'lax',
    maxAge: maxAgeMs,
    path: '/',
  };
}

/**
 * Creates a new access token + refresh token pair.
 * Sets both as httpOnly cookies and returns the access token string
 * (in-memory value for socket.io auth — NOT stored in localStorage).
 */
async function issueTokens(
  user: { id: string; role: string; email: string },
  res: Response,
): Promise<string> {
  // Short-lived JWT for API auth (sent via httpOnly cookie on every request)
  const accessToken = jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' },
  );

  // Long-lived opaque token stored in DB (rotated on every refresh)
  const rawRefresh = randomBytes(64).toString('hex');
  await prisma.refreshToken.create({
    data: {
      token: rawRefresh,
      userId: user.id,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });

  res.cookie('accessToken',  accessToken, cookieOpts(ACCESS_TTL_MS));
  res.cookie('refreshToken', rawRefresh,  cookieOpts(REFRESH_TTL_MS));

  return accessToken;
}

function clearAuthCookies(res: Response) {
  res.clearCookie('accessToken',  { path: '/' });
  res.clearCookie('refreshToken', { path: '/' });
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.post('/login', authLimiter, validate(loginSchema), asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !user.isActive) throw new UnauthorizedError('Invalid credentials');

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    logger.warn('Failed login attempt', { email });
    throw new UnauthorizedError('Invalid credentials');
  }

  const accessToken = await issueTokens(user, res);

  logger.info('User logged in', { userId: user.id, role: user.role });
  const { password: _, ...safe } = user;
  // accessToken also returned in body so the frontend can pass it to socket.io
  // (socket.io cannot read httpOnly cookies, so we keep an in-memory copy)
  res.json({ user: safe, accessToken });
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
      data: {
        email: payload.email,
        name: payload.name || payload.email.split('@')[0],
        password: '',
        role: 'EMPLOYEE',
        avatar: payload.picture ?? null,
        isActive: true,
      },
    });
    logger.info('New user via Google SSO', { email: payload.email });
  }
  if (!user.isActive) throw new ForbiddenError('Account is disabled');

  const accessToken = await issueTokens(user, res);
  const { password: _, ...safe } = user;
  res.json({ user: safe, accessToken });
}));

// Silently refresh the access token using the refresh token cookie.
// Called automatically by the frontend interceptor on any 401.
router.post('/refresh', refreshLimiter, asyncHandler(async (req: Request, res: Response) => {
  const rawRefresh = (req as any).cookies?.refreshToken;
  if (!rawRefresh) throw new UnauthorizedError('No refresh token');

  const stored = await prisma.refreshToken.findUnique({
    where: { token: rawRefresh },
    include: { user: { select: { id: true, role: true, email: true, isActive: true } } },
  });

  if (!stored || stored.expiresAt < new Date() || !stored.user.isActive) {
    clearAuthCookies(res);
    throw new UnauthorizedError('Session expired — please log in again');
  }

  // Rotate: delete old token and issue a fresh pair
  await prisma.refreshToken.delete({ where: { id: stored.id } });
  const accessToken = await issueTokens(stored.user, res);

  res.json({ accessToken });
}));

router.post('/logout', asyncHandler(async (req: Request, res: Response) => {
  const rawRefresh = (req as any).cookies?.refreshToken;
  if (rawRefresh) {
    await prisma.refreshToken.deleteMany({ where: { token: rawRefresh } }).catch(() => {});
  }
  clearAuthCookies(res);
  res.json({ message: 'Logged out' });
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
