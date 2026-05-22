import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@company.com' },
    update: {},
    create: {
      email: 'admin@company.com',
      password: await bcrypt.hash('admin123', 10),
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
      department: 'Management',
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager@company.com' },
    update: {},
    create: {
      email: 'manager@company.com',
      password: await bcrypt.hash('manager123', 10),
      name: 'Rahul Sharma',
      role: 'MANAGER',
      department: 'Engineering',
    },
  });

  const emp1 = await prisma.user.upsert({
    where: { email: 'emp1@company.com' },
    update: {},
    create: {
      email: 'emp1@company.com',
      password: await bcrypt.hash('emp123', 10),
      name: 'Priya Patel',
      role: 'EMPLOYEE',
      department: 'Engineering',
    },
  });

  const emp2 = await prisma.user.upsert({
    where: { email: 'emp2@company.com' },
    update: {},
    create: {
      email: 'emp2@company.com',
      password: await bcrypt.hash('emp123', 10),
      name: 'Arjun Verma',
      role: 'EMPLOYEE',
      department: 'Engineering',
    },
  });

  const project = await prisma.project.upsert({
    where: { id: 'seed-project-1' },
    update: {},
    create: {
      id: 'seed-project-1',
      name: 'Website Redesign',
      description: 'Complete redesign of company website',
      managerId: manager.id,
    },
  });

  const existingCols = await prisma.column.count({ where: { projectId: project.id } });
  if (existingCols === 0) {
    const col1 = await prisma.column.create({ data: { name: 'To Do', order: 0, color: '#6366f1', projectId: project.id } });
    const col2 = await prisma.column.create({ data: { name: 'In Progress', order: 1, color: '#f59e0b', projectId: project.id } });
    const col3 = await prisma.column.create({ data: { name: 'Review', order: 2, color: '#8b5cf6', projectId: project.id } });
    const col4 = await prisma.column.create({ data: { name: 'Done', order: 3, color: '#10b981', projectId: project.id } });

    await prisma.projectMember.createMany({
      data: [
        { projectId: project.id, userId: emp1.id },
        { projectId: project.id, userId: emp2.id },
        { projectId: project.id, userId: manager.id },
      ],
    });

    const taskDefs = [
      { title: 'Design homepage mockup', priority: 'HIGH', columnId: col1.id, assigneeIds: [emp1.id] },
      { title: 'Set up CI/CD pipeline', priority: 'MEDIUM', columnId: col2.id, assigneeIds: [emp2.id] },
      { title: 'Write unit tests', priority: 'LOW', columnId: col1.id, assigneeIds: [emp1.id, emp2.id] },
      { title: 'API integration', priority: 'HIGH', columnId: col3.id, assigneeIds: [emp2.id] },
      { title: 'Database schema design', priority: 'CRITICAL', columnId: col4.id, assigneeIds: [emp1.id], completedAt: new Date() },
    ];
    for (const t of taskDefs) {
      const { assigneeIds, ...rest } = t;
      await prisma.task.create({
        data: {
          ...rest,
          projectId: project.id,
          createdById: manager.id,
          assignees: { create: assigneeIds.map(uid => ({ userId: uid })) },
        },
      });
    }
  }

  void superAdmin; void manager; void emp1; void emp2;

  console.log('Seed complete!');
  console.log('Login credentials:');
  console.log('  Super Admin: admin@company.com / admin123');
  console.log('  Manager:     manager@company.com / manager123');
  console.log('  Employee 1:  emp1@company.com / emp123');
  console.log('  Employee 2:  emp2@company.com / emp123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
