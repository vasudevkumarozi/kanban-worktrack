import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { uploadLimiter } from '../middleware/rateLimiter';
import { NotFoundError, ValidationError, ForbiddenError } from '../lib/errors';

const router = Router();
router.use(authenticate);

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp|pdf|doc|docx|xls|xlsx|csv|txt|zip|mp4|mp3)$/i;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_EXTENSIONS.test(file.originalname)) cb(null, true);
    else cb(new Error('File type not allowed'));
  },
});

// Authenticated file download — replaces the public /uploads static directory.
// Employees must belong to the task's project; managers can access any file.
router.get('/file/:filename', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { filename } = req.params;

  // Block path traversal attempts
  if (!filename || /[/\\.]\./.test(filename) || filename.includes('..')) {
    res.status(400).json({ error: 'Invalid filename', code: 'BAD_REQUEST' });
    return;
  }

  const attachment = await prisma.attachment.findFirst({
    where: { filename },
    include: {
      task: {
        include: {
          project: { include: { members: { select: { userId: true } } } },
        },
      },
    },
  });
  if (!attachment) throw new NotFoundError('Attachment');

  // Employees must be project members to download
  if (req.user!.role === 'EMPLOYEE') {
    const isMember = attachment.task.project.members.some(m => m.userId === req.user!.id);
    if (!isMember) throw new ForbiddenError();
  }

  const filePath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) throw new NotFoundError('File not found on disk');

  res.setHeader('Content-Type', attachment.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${attachment.originalName}"`);
  res.sendFile(filePath);
}));

router.get('/task/:taskId', asyncHandler(async (req: AuthRequest, res: Response) => {
  const attachments = await prisma.attachment.findMany({
    where: { taskId: req.params.taskId },
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(attachments);
}));

router.post('/upload', uploadLimiter, upload.single('file'), asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) throw new ValidationError('No file uploaded');
  const { taskId } = req.body as { taskId?: string };
  if (!taskId) throw new ValidationError('taskId is required');

  const attachment = await prisma.attachment.create({
    data: {
      taskId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      url: `/uploads/${req.file.filename}`,
      uploadedById: req.user!.id,
    },
    include: { uploadedBy: { select: { id: true, name: true } } },
  });
  res.status(201).json(attachment);
}));

router.delete('/:id', asyncHandler(async (req: AuthRequest, res: Response) => {
  const attachment = await prisma.attachment.findUnique({ where: { id: req.params.id } });
  if (!attachment) throw new NotFoundError('Attachment');

  // Employees can only delete their own uploads; managers/admins can delete any
  if (req.user!.role === 'EMPLOYEE' && attachment.uploadedById !== req.user!.id) {
    throw new ForbiddenError();
  }

  const filePath = path.join(UPLOAD_DIR, attachment.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  await prisma.attachment.delete({ where: { id: req.params.id } });
  res.json({ message: 'Attachment deleted' });
}));

export default router;
