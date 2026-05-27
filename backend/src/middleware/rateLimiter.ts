import rateLimit, { Options } from 'express-rate-limit';
import { Request } from 'express';

/**
 * Key generator for authenticated routes.
 * Uses the logged-in user's ID so each user gets their own bucket —
 * prevents a shared office NAT from exhausting limits for everyone.
 * Falls back to IP for unauthenticated requests.
 */
const userKey = (req: Request): string =>
  (req as any).user?.id ?? req.ip ?? 'anonymous';

/** Options shared across all limiters */
const sharedOpts: Partial<Options> = {
  standardHeaders: true,  // Return RateLimit-* headers (RFC 6585)
  legacyHeaders: false,   // Don't return deprecated X-RateLimit-* headers
};

/**
 * Brute-force protection on /auth/login and /auth/google.
 * IP-based (user isn't authenticated yet).
 * Only failed requests count — successful logins don't consume quota.
 */
export const authLimiter = rateLimit({
  ...sharedOpts,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Try again in 15 minutes.', code: 'RATE_LIMITED' },
});

/**
 * Refresh token endpoint protection.
 * A healthy client refreshes at most once per 15 min (access token TTL).
 * 30/hour is generous — covers edge cases like quick tab open/close cycles.
 * IP-based because the refresh cookie identifies the user, not a JWT.
 */
export const refreshLimiter = rateLimit({
  ...sharedOpts,
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  message: { error: 'Too many token refresh requests. Try again later.', code: 'RATE_LIMITED' },
});

/**
 * Global API rate limit — broad protection before authentication runs.
 * IP-based (req.user not yet available at global middleware level).
 */
export const apiLimiter = rateLimit({
  ...sharedOpts,
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  message: { error: 'Too many requests. Please slow down.', code: 'RATE_LIMITED' },
});

/**
 * Write operations: task create/update/delete, comments, etc.
 * Per-user so power users don't impact others.
 * 60/min = 1 write/second sustained — enough for any real workflow.
 */
export const writeLimiter = rateLimit({
  ...sharedOpts,
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  keyGenerator: userKey,
  message: { error: 'Too many write requests. Please slow down.', code: 'RATE_LIMITED' },
});

/**
 * File uploads — per user.
 * 20/min is enough for bulk uploads; prevents storage abuse.
 */
export const uploadLimiter = rateLimit({
  ...sharedOpts,
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: userKey,
  message: { error: 'Too many uploads. Please wait a moment.', code: 'RATE_LIMITED' },
});

/**
 * Heavy analytics aggregations — per user.
 * These are expensive DB operations; 30/min is still very responsive for dashboards.
 */
export const analyticsLimiter = rateLimit({
  ...sharedOpts,
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: userKey,
  message: { error: 'Too many analytics requests. Please slow down.', code: 'RATE_LIMITED' },
});

/**
 * Password change — strict per-user limit.
 * Only failed attempts count; 5 failures/hour before lockout.
 */
export const passwordLimiter = rateLimit({
  ...sharedOpts,
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  keyGenerator: userKey,
  skipSuccessfulRequests: true,
  message: { error: 'Too many password change attempts. Try again in an hour.', code: 'RATE_LIMITED' },
});
