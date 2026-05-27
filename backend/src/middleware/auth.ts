import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import logger from '../lib/logger';

export interface AuthRequest extends Request {
  user?: { id: string; role: string; email: string };
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  // Prefer httpOnly cookie; fall back to Authorization header for API clients / Postman
  const token =
    (req as any).cookies?.accessToken ??
    req.headers.authorization?.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Authentication token required', code: 'UNAUTHORIZED' });
    return;
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET!) as { id: string; role: string; email: string };
    next();
  } catch {
    logger.warn('Invalid JWT attempt', { ip: req.ip, path: req.path });
    res.status(401).json({ error: 'Invalid or expired token', code: 'UNAUTHORIZED' });
  }
};

export const requireRole = (...roles: string[]) =>
  (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' });
      return;
    }
    next();
  };
