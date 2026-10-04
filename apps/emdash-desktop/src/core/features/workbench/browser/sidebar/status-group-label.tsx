import {
  TASK_STATUS_LABELS,
  TaskStatusIcon,
} from '@core/features/tasks/contributions/browser/task-status-label';
import type { TaskLifecycleStatus } from '@core/primitives/tasks/api';

interface SidebarStatusGroupLabelProps {
  status: TaskLifecycleStatus;
  count: number;
}

export function SidebarStatusGroupLabel({ status, count }: SidebarStatusGroupLabelProps) {
  return (
    <div className="flex h-8 items-center gap-2 pr-2 pl-8 text-sm font-medium text-foreground-tertiary">
      <TaskStatusIcon status={status} className="size-3.5" />
      <span className="min-w-0 truncate">{TASK_STATUS_LABELS[status]}</span>
      <span className="text-xs font-normal text-foreground-tertiary-passive">{count}</span>
    </div>
  );
}
