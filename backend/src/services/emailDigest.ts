import nodemailer from 'nodemailer';
import cron from 'node-cron';
import prisma from '../lib/prisma';

const getTransporter = () =>
  nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

const buildDigestData = async () => {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  const [completedLastWeek, overdue, totalActive, newLastWeek] = await Promise.all([
    prisma.task.count({ where: { completedAt: { gte: weekStart } } }),
    prisma.task.count({ where: { completedAt: null, dueDate: { lt: now } } }),
    prisma.task.count({ where: { completedAt: null } }),
    prisma.task.count({ where: { createdAt: { gte: weekStart } } }),
  ]);

  const topPerformersRaw = await prisma.taskAssignee.groupBy({
    by: ['userId'],
    where: { task: { completedAt: { gte: weekStart } } },
    _count: { userId: true },
    orderBy: { _count: { userId: 'desc' } },
    take: 5,
  });

  const performerUsers = await prisma.user.findMany({
    where: { id: { in: topPerformersRaw.map(p => p.userId) } },
    select: { id: true, name: true },
  });

  const topPerformers = topPerformersRaw.map(p => ({
    name: performerUsers.find(u => u.id === p.userId)?.name ?? 'Unknown',
    completed: p._count.userId,
  }));

  const projects = await prisma.project.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true },
    take: 6,
    orderBy: { name: 'asc' },
  });

  const projectHighlights = await Promise.all(projects.map(async p => {
    const [total, completed] = await Promise.all([
      prisma.task.count({ where: { projectId: p.id } }),
      prisma.task.count({ where: { projectId: p.id, completedAt: { not: null } } }),
    ]);
    return { name: p.name, total, completed, pct: total > 0 ? Math.round((completed / total) * 100) : 0 };
  }));

  return { completedLastWeek, overdue, totalActive, newLastWeek, topPerformers, projectHighlights };
};

const buildHtml = (data: Awaited<ReturnType<typeof buildDigestData>>, date: string) => `
<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;background:#f5f5f5;padding:20px">
  <div style="background:#AC2660;padding:28px 24px;border-radius:10px 10px 0 0">
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700">WorkTrack Weekly Digest</h1>
    <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:13px">Week ending ${date}</p>
  </div>
  <div style="background:#fff;padding:24px;border-radius:0 0 10px 10px;border:1px solid #e5e5e5;border-top:0">

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px">
      ${[
        { label: 'Completed Last Week', value: data.completedLastWeek, color: '#10b981' },
        { label: 'Overdue Tasks', value: data.overdue, color: data.overdue > 0 ? '#ef4444' : '#10b981' },
        { label: 'Active Tasks', value: data.totalActive, color: '#3b82f6' },
        { label: 'New Tasks Last Week', value: data.newLastWeek, color: '#8b5cf6' },
      ].map(s => `
        <div style="background:#f9f9f9;padding:16px;border-radius:8px;border:1px solid #eee">
          <p style="color:#888;font-size:11px;margin:0;text-transform:uppercase;letter-spacing:.5px">${s.label}</p>
          <p style="font-size:30px;font-weight:700;margin:6px 0 0;color:${s.color}">${s.value}</p>
        </div>
      `).join('')}
    </div>

    ${data.topPerformers.length > 0 ? `
    <div style="margin-bottom:20px">
      <h3 style="margin:0 0 12px;font-size:14px;color:#333;font-weight:600">Top Performers Last Week</h3>
      ${data.topPerformers.map((p, i) => `
        <div style="display:flex;justify-content:space-between;padding:10px 12px;background:${i % 2 === 0 ? '#f9f9f9' : '#fff'};border-radius:6px;margin-bottom:4px">
          <span style="color:#555;font-size:13px">${i + 1}. ${p.name}</span>
          <span style="color:#10b981;font-weight:700;font-size:13px">${p.completed} tasks</span>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${data.projectHighlights.length > 0 ? `
    <div>
      <h3 style="margin:0 0 12px;font-size:14px;color:#333;font-weight:600">Project Progress</h3>
      ${data.projectHighlights.map(p => `
        <div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;margin-bottom:5px">
            <span style="font-size:13px;color:#333">${p.name}</span>
            <span style="font-size:12px;color:#888">${p.completed}/${p.total} (${p.pct}%)</span>
          </div>
          <div style="height:7px;background:#f0f0f0;border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${p.pct}%;background:#AC2660;border-radius:4px"></div>
          </div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <p style="margin:24px 0 0;font-size:11px;color:#bbb;text-align:center;border-top:1px solid #f0f0f0;padding-top:16px">
      WorkTrack — Automated Weekly Digest
    </p>
  </div>
</div>
`;

export const sendWeeklyDigest = async () => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('[EmailDigest] SMTP not configured — set SMTP_USER and SMTP_PASS in .env to enable');
    return;
  }

  try {
    const data = await buildDigestData();
    const managers = await prisma.user.findMany({
      where: { role: { in: ['SUPER_ADMIN', 'MANAGER'] }, isActive: true },
      select: { email: true, name: true },
    });

    if (managers.length === 0) return;

    const transporter = getTransporter();
    const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const html = buildHtml(data, dateStr);

    for (const mgr of managers) {
      await transporter.sendMail({
        from: process.env.REPORT_FROM || `WorkTrack <${process.env.SMTP_USER}>`,
        to: mgr.email,
        subject: `WorkTrack Weekly Digest — ${dateStr}`,
        html,
      });
    }
    console.log(`[EmailDigest] Weekly digest sent to ${managers.length} manager(s)`);
  } catch (err) {
    console.error('[EmailDigest] Failed to send digest:', err);
  }
};

export const startEmailDigestCron = () => {
  // Every Monday at 8:00 AM UTC (1:30 PM IST)
  cron.schedule('0 8 * * 1', sendWeeklyDigest);
  console.log('[EmailDigest] Weekly digest cron scheduled (Mon 08:00 UTC)');
};
