import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  TASK_STATUS_LABELS,
  TaskStatusIcon,
} from '@core/features/tasks/contributions/browser/task-status-label';
import type { TaskLifecycleStatus } from '@core/primitives/tasks/api';

interface SidebarStatusGroupLabelProps {
  status: TaskLifecycleStatus;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}

export function SidebarStatusGroupLabel({
  status,
  count,
  collapsed,
  onToggle,
}: SidebarStatusGroupLabelProps) {
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  return (
    <button
      type="button"
      aria-expanded={!collapsed}
      className="group/status flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[15px] font-semibold text-foreground hover:bg-background-tertiary-1"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onToggle}
    >
      <TaskStatusIcon status={status} className="size-4" />
      <span className="min-w-0 truncate">{TASK_STATUS_LABELS[status]}</span>
      <Chevron
        className={
          collapsed
            ? 'size-3.5 text-foreground-tertiary-passive'
            : 'size-3.5 text-foreground-tertiary-passive opacity-0 group-hover/status:opacity-100'
        }
      />
      {collapsed && (
        <span className="text-xs font-normal text-foreground-tertiary-passive">{count}</span>
      )}
    </button>
  );
}
