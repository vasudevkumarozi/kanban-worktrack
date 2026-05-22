import { Priority } from '../../types';

const config: Record<Priority, { label: string; classes: string }> = {
  LOW: { label: 'Low', classes: 'bg-gray-100 text-gray-600' },
  MEDIUM: { label: 'Medium', classes: 'bg-blue-100 text-blue-700' },
  HIGH: { label: 'High', classes: 'bg-orange-100 text-orange-700' },
  CRITICAL: { label: 'Critical', classes: 'bg-red-100 text-red-700' },
};

export default function PriorityBadge({ priority }: { priority: Priority }) {
  const { label, classes } = config[priority] || config.MEDIUM;
  return <span className={`badge ${classes}`}>{label}</span>;
}
