export type Role = 'SUPER_ADMIN' | 'MANAGER' | 'EMPLOYEE';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type SprintStatus = 'PLANNING' | 'ACTIVE' | 'COMPLETED';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  department?: string;
  avatar?: string;
  isActive: boolean;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: string;
  managerId: string;
  manager: Pick<User, 'id' | 'name' | 'email' | 'avatar'>;
  members: { user: Pick<User, 'id' | 'name' | 'email' | 'avatar' | 'role'>; role: string }[];
  columns: Column[];
  _count: { tasks: number };
  createdAt: string;
}

export interface Column {
  id: string;
  name: string;
  order: number;
  color?: string;
  projectId: string;
}

export interface Sprint {
  id: string;
  name: string;
  goal?: string;
  startDate: string;
  endDate: string;
  status: SprintStatus;
  projectId: string;
  _count: { tasks: number };
  createdAt: string;
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  order: number;
  taskId: string;
  assigneeId?: string;
  assignee?: Pick<User, 'id' | 'name' | 'avatar'> | null;
  createdAt: string;
}

export interface Attachment {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  taskId: string;
  uploadedById: string;
  uploadedBy: Pick<User, 'id' | 'name'>;
  createdAt: string;
}

export interface TaskAssignee {
  user: Pick<User, 'id' | 'name' | 'email' | 'avatar'>;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  priority: Priority;
  dueDate?: string;
  completedAt?: string;
  estimatedHours?: number;
  actualHours?: number;
  order: number;
  columnId: string;
  column: Pick<Column, 'id' | 'name' | 'color'>;
  projectId: string;
  project: Pick<Project, 'id' | 'name'>;
  sprintId?: string;
  assignees: TaskAssignee[];
  createdById: string;
  createdBy: Pick<User, 'id' | 'name'>;
  _count: { comments: number; subtasks: number };
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  content: string;
  taskId: string;
  userId: string;
  user: Pick<User, 'id' | 'name' | 'avatar'>;
  createdAt: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  metadata?: string;
  createdAt: string;
}

export interface EmployeeStats {
  id: string;
  name: string;
  email: string;
  department?: string;
  avatar?: string;
  totalAssigned: number;
  completedInPeriod: number;
  assignedInPeriod: number;
  overdue: number;
  byPriority: { priority: string; _count: number }[];
}
