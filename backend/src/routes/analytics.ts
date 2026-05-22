import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { ForbiddenError } from '../lib/errors';

const router = Router();
router.use(authenticate);

function getRange(period: string): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date();
  if (period === 'week') {
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
  } else if (period === 'month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(now.getDate() - 30);
    start.setHours(0, 0, 0, 0);
  }
  return { start, end: now };
}

router.get('/overview', requireRole('SUPER_ADMIN', 'MANAGER'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const period = (req.query.period as string) || 'month';
  const { start, end } = getRange(period);

  const [totalUsers, totalProjects, totalTasks, completedTasks, assignedInPeriod, completedInPeriod] = await Promise.all([
    prisma.user.count({ where: { isActive: true } }),
    prisma.project.count({ where: { status: 'ACTIVE' } }),
    prisma.task.count(),
    prisma.task.count({ where: { completedAt: { not: null } } }),
    prisma.task.count({ where: { createdAt: { gte: start, lte: end } } }),
    prisma.task.count({ where: { completedAt: { gte: start, lte: end } } }),
  ]);

  res.json({ totalUsers, totalProjects, totalTasks, completedTasks, assignedInPeriod, completedInPeriod, period });
}));

router.get('/employees', requireRole('SUPER_ADMIN', 'MANAGER'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const period = (req.query.period as string) || 'month';
  const { start, end } = getRange(period);

  const employees = await prisma.user.findMany({
    where: { role: 'EMPLOYEE', isActive: true },
    select: { id: true, name: true, email: true, department: true, avatar: true },
  });

  const stats = await Promise.all(employees.map(async (emp) => {
    const [totalAssigned, completedInPeriod, assignedInPeriod, overdue, byPriority] = await Promise.all([
      prisma.task.count({ where: { assignees: { some: { userId: emp.id } } } }),
      prisma.task.count({ where: { assignees: { some: { userId: emp.id } }, completedAt: { gte: start, lte: end } } }),
      prisma.task.count({ where: { assignees: { some: { userId: emp.id } }, createdAt: { gte: start, lte: end } } }),
      prisma.task.count({ where: { assignees: { some: { userId: emp.id } }, completedAt: null, dueDate: { lt: new Date() } } }),
      prisma.task.groupBy({ by: ['priority'], where: { assignees: { some: { userId: emp.id } } }, _count: true }),
    ]);
    return { ...emp, totalAssigned, completedInPeriod, assignedInPeriod, overdue, byPriority };
  }));

  res.json(stats);
}));

router.get('/employee/:userId', asyncHandler(async (req: AuthRequest, res: Response) => {
  if (req.user!.role === 'EMPLOYEE' && req.user!.id !== req.params.userId) {
    throw new ForbiddenError();
  }

  const period = (req.query.period as string) || 'month';
  const { start, end } = getRange(period);

  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const uid = req.params.userId;

  const [weekly, monthly, allTime, byColumn, recentActivity] = await Promise.all([
    Promise.all([
      prisma.task.count({ where: { assignees: { some: { userId: uid } }, createdAt: { gte: weekStart } } }),
      prisma.task.count({ where: { assignees: { some: { userId: uid } }, completedAt: { gte: weekStart } } }),
    ]),
    Promise.all([
      prisma.task.count({ where: { assignees: { some: { userId: uid } }, createdAt: { gte: monthStart } } }),
      prisma.task.count({ where: { assignees: { some: { userId: uid } }, completedAt: { gte: monthStart } } }),
    ]),
    Promise.all([
      prisma.task.count({ where: { assignees: { some: { userId: uid } } } }),
      prisma.task.count({ where: { assignees: { some: { userId: uid } }, completedAt: { not: null } } }),
    ]),
    prisma.task.groupBy({ by: ['columnId'], where: { assignees: { some: { userId: uid } } }, _count: true }),
    prisma.activityLog.findMany({
      where: { userId: uid },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { task: { select: { title: true } } },
    }),
  ]);

  res.json({
    weekly: { assigned: weekly[0], completed: weekly[1] },
    monthly: { assigned: monthly[0], completed: monthly[1] },
    allTime: { assigned: allTime[0], completed: allTime[1] },
    byColumn,
    recentActivity,
    period,
    start,
    end,
  });
}));

router.get('/daily', requireRole('SUPER_ADMIN', 'MANAGER'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const days = Math.min(parseInt(req.query.days as string) || 14, 90);
  const userId = req.query.userId as string | undefined;

  const results: { date: string; assigned: number; completed: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const start = new Date(d); start.setHours(0, 0, 0, 0);
    const end = new Date(d); end.setHours(23, 59, 59, 999);
    const userFilter = userId ? { assignees: { some: { userId } } } : {};

    const [assigned, completed] = await Promise.all([
      prisma.task.count({ where: { ...userFilter, createdAt: { gte: start, lte: end } } }),
      prisma.task.count({ where: { ...userFilter, completedAt: { gte: start, lte: end } } }),
    ]);
    results.push({ date: start.toISOString().split('T')[0], assigned, completed });
  }
  res.json(results);
}));

router.get('/project/:projectId', requireRole('SUPER_ADMIN', 'MANAGER'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const period = (req.query.period as string) || 'month';
  const { start, end } = getRange(period);

  const [totalTasks, completedTasks, assignedInPeriod, completedInPeriod, byPriority, byMember] = await Promise.all([
    prisma.task.count({ where: { projectId: req.params.projectId } }),
    prisma.task.count({ where: { projectId: req.params.projectId, completedAt: { not: null } } }),
    prisma.task.count({ where: { projectId: req.params.projectId, createdAt: { gte: start, lte: end } } }),
    prisma.task.count({ where: { projectId: req.params.projectId, completedAt: { gte: start, lte: end } } }),
    prisma.task.groupBy({ by: ['priority'], where: { projectId: req.params.projectId }, _count: true }),
    prisma.taskAssignee.groupBy({ by: ['userId'], where: { task: { projectId: req.params.projectId } }, _count: true }),
  ]);

  res.json({ totalTasks, completedTasks, assignedInPeriod, completedInPeriod, byPriority, byMember });
}));

router.get('/dashboard', requireRole('SUPER_ADMIN', 'MANAGER'), asyncHandler(async (_req: AuthRequest, res: Response) => {
  const today = new Date();
  const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay()); weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(today); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const [dueToday, overdue, completedThisWeek, completedThisMonth, totalUsers, totalProjects] = await Promise.all([
    prisma.task.count({ where: { completedAt: null, dueDate: { gte: todayStart, lt: todayEnd } } }),
    prisma.task.count({ where: { completedAt: null, dueDate: { lt: todayStart } } }),
    prisma.task.count({ where: { completedAt: { gte: weekStart } } }),
    prisma.task.count({ where: { completedAt: { gte: monthStart } } }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.project.count({ where: { status: 'ACTIVE' } }),
  ]);

  const projects = await prisma.project.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const projectsProgress = await Promise.all(projects.map(async (p) => {
    const [total, completed] = await Promise.all([
      prisma.task.count({ where: { projectId: p.id } }),
      prisma.task.count({ where: { projectId: p.id, completedAt: { not: null } } }),
    ]);
    return { id: p.id, name: p.name, total, completed, pct: total > 0 ? Math.round((completed / total) * 100) : 0 };
  }));

  const workloadRaw = await prisma.taskAssignee.groupBy({
    by: ['userId'],
    where: { task: { completedAt: null } },
    _count: { userId: true },
  });

  const allUsers = await prisma.user.findMany({
    where: { isActive: true, role: { in: ['EMPLOYEE', 'MANAGER'] } },
    select: { id: true, name: true, department: true },
    orderBy: { name: 'asc' },
  });

  const workload = allUsers.map(u => ({
    ...u,
    activeTasks: workloadRaw.find(w => w.userId === u.id)?._count.userId ?? 0,
  })).sort((a, b) => b.activeTasks - a.activeTasks);

  res.json({ dueToday, overdue, completedThisWeek, completedThisMonth, totalUsers, totalProjects, projectsProgress, workload });
}));

router.get('/completion-trend', requireRole('SUPER_ADMIN', 'MANAGER'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const days = Math.min(parseInt(req.query.days as string) || 30, 90);
  const projectId = req.query.projectId as string | undefined;

  const results: { date: string; created: number; completed: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const start = new Date(d); start.setHours(0, 0, 0, 0);
    const end = new Date(d); end.setHours(23, 59, 59, 999);
    const where = projectId ? { projectId } : {};

    const [created, completed] = await Promise.all([
      prisma.task.count({ where: { ...where, createdAt: { gte: start, lte: end } } }),
      prisma.task.count({ where: { ...where, completedAt: { gte: start, lte: end } } }),
    ]);
    results.push({ date: start.toISOString().split('T')[0], created, completed });
  }
  res.json(results);
}));

router.get('/reports/data', requireRole('SUPER_ADMIN', 'MANAGER'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { from, to, assigneeId, projectId, priority, status } = req.query;

  const where: Record<string, unknown> = {};
  if (from || to) {
    const createdAt: Record<string, Date> = {};
    if (from) createdAt.gte = new Date(from as string);
    if (to) { const d = new Date(to as string); d.setHours(23, 59, 59, 999); createdAt.lte = d; }
    where.createdAt = createdAt;
  }
  if (assigneeId) where.assignees = { some: { userId: assigneeId as string } };
  if (projectId) where.projectId = projectId as string;
  if (priority) where.priority = priority as string;
  if (status === 'completed') where.completedAt = { not: null };
  if (status === 'active') where.completedAt = null;
  if (status === 'overdue') { where.completedAt = null; where.dueDate = { lt: new Date() }; }

  const tasks = await prisma.task.findMany({
    where,
    select: {
      id: true, title: true, priority: true, completedAt: true, dueDate: true, createdAt: true,
      project: { select: { name: true } },
      column: { select: { name: true } },
      assignees: { select: { user: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  });

  const now = new Date();
  res.json(tasks.map(t => ({
    id: t.id,
    title: t.title,
    project: t.project?.name ?? '',
    column: t.column?.name ?? '',
    priority: t.priority,
    assignees: t.assignees.map((a: { user: { name: string } }) => a.user.name).join(', '),
    status: t.completedAt ? 'Completed' : (t.dueDate && new Date(t.dueDate) < now ? 'Overdue' : 'Active'),
    dueDate: t.dueDate ? new Date(t.dueDate).toISOString().split('T')[0] : '',
    completedAt: t.completedAt ? new Date(t.completedAt).toISOString().split('T')[0] : '',
    createdAt: new Date(t.createdAt).toISOString().split('T')[0],
  })));
}));

export default router;
