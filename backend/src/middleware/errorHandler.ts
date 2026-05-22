import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { AppError } from '../lib/errors';
import logger from '../lib/logger';

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.issues.map((e) => ({ field: e.path.map(String).join('.'), message: e.message })),
    });
    return;
  }

  // Operational app errors
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(err.message, { stack: err.stack, path: req.path, method: req.method });
    }
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }

  // Multer errors (file upload)
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File exceeds the 20 MB limit' : err.message;
    res.status(400).json({ error: message, code: 'UPLOAD_ERROR' });
    return;
  }

  // Multer custom fileFilter errors
  if (err instanceof Error && err.message.includes('not allowed')) {
    res.status(400).json({ error: err.message, code: 'UPLOAD_ERROR' });
    return;
  }

  // Prisma known request errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'A record with that value already exists', code: 'CONFLICT' });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Record not found', code: 'NOT_FOUND' });
      return;
    }
    logger.error('Prisma error', { code: err.code, meta: err.meta, path: req.path });
    res.status(500).json({ error: 'Database error', code: 'DB_ERROR' });
    return;
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    logger.warn('Prisma validation error', { path: req.path });
    res.status(400).json({ error: 'Invalid data provided', code: 'DB_VALIDATION_ERROR' });
    return;
  }

  // Unknown / unexpected errors
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  logger.error('Unhandled error', { message, stack, path: req.path, method: req.method });

  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : message,
    code: 'INTERNAL_ERROR',
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    error: `Route ${req.method} ${req.path} not found`,
    code: 'NOT_FOUND',
  });
};
