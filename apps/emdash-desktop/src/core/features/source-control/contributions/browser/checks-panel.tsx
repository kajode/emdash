import { EmptyState } from '@emdash/ui/react/components';
import { observer } from 'mobx-react-lite';
import { getTaskPrAssociationStore } from '@core/features/source-control/api/browser/stores/task-source-control-selectors';
import { ChecksList } from '@core/features/source-control/browser/diff-view/changes-panel/components/pr-entry/checks-list';
import { getTaskStore } from '@core/features/tasks/api/browser/task-state/task-selectors';
import { useTaskViewContext } from '@core/features/tasks/contributions/browser/task-view-context';
import { selectCurrentPr } from '@root/src/core/services/pull-requests/api';

/** The CI checks of the task's current pull request, as their own sidebar tab. */
export const ChecksPanel = observer(function ChecksPanel() {
  const { projectId, taskId } = useTaskViewContext();
  const task = getTaskStore(projectId, taskId);
  const pr = task ? selectCurrentPr(getTaskPrAssociationStore(task).pullRequests) : undefined;

  if (!pr) {
    return (
      <EmptyState
        label="No pull request yet"
        description="Checks appear here once this task's branch has a pull request."
      />
    );
  }
  return (
    <div className="h-full overflow-y-auto py-2">
      <ChecksList checks={pr.checks} />
    </div>
  );
});
