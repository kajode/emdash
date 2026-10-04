import { IssueStatusIndicator } from '@core/features/tasks/browser/components/issue-selector/issue-status-indicator';
import type { TaskLifecycleStatus } from '@core/primitives/tasks/api';

export const TASK_STATUS_LABELS: Record<TaskLifecycleStatus, string> = {
  review: 'In review',
  in_progress: 'In progress',
  todo: 'Todo',
  backlog: 'Backlog',
  triage: 'Triage',
  done: 'Done',
  cancelled: 'Cancelled',
  duplicate: 'Duplicate',
};

export function TaskStatusIcon({
  status,
  className,
}: {
  status: TaskLifecycleStatus;
  className?: string;
}) {
  return <IssueStatusIndicator status={status} className={className} />;
}
